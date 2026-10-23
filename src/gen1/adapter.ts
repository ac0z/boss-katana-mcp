import { GEN1_PARAMETERS, parameter, validateWrite } from './parameters.js';
import { decodeData, encodeData, encodeRead, Gen1Error, identityRequest, verifyIdentity } from './protocol.js';

export interface MidiPorts { inputs: string[]; outputs: string[] }
export interface MidiConnection {
  exchange(message: readonly number[], timeoutMs: number): Promise<number[]>;
  send(message: readonly number[]): Promise<void>;
  close(): Promise<void>;
}
export interface MidiBackend {
  list(): Promise<MidiPorts>;
  open(input: number, output: number): Promise<MidiConnection>;
}
export interface Gen1Options {
  hardwareEnabled?: boolean;
  modelConfirmed?: boolean;
  allowWrites?: boolean;
  lowMasterConfirmed?: boolean;
  timeoutMs?: number;
}

export function selectPorts(ports: MidiPorts): { input: number; output: number } {
  const matches = (names: string[]) => names.flatMap((n, i) => n.toUpperCase() === 'KATANA' ? [i] : []);
  const inputs = matches(ports.inputs), outputs = matches(ports.outputs);
  if (inputs.length !== 1 || outputs.length !== 1)
    throw new Gen1Error('Expected exactly one KATANA input/output pair. Check USB, driver and close Tone Studio.');
  return { input: inputs[0], output: outputs[0] };
}

/** Transport-independent Gen 1 contract; deliberately separate from BTS's UI/PID contract. */
export interface Gen1Adapter {
  status(): object;
  listParams(): object;
  discover(): Promise<object>;
  connect(): Promise<object>;
  disconnect(): Promise<object>;
  read(key: string, research?: boolean): Promise<object>;
  write(key: string, value: number): Promise<object>;
}

export class Gen1MidiAdapter implements Gen1Adapter {
  private connection?: MidiConnection;
  private tail: Promise<unknown> = Promise.resolve();
  private locked = false;
  private readonly options: Readonly<Gen1Options>;
  private readonly timeoutMs: number;

  constructor(private readonly backend: MidiBackend, options: Gen1Options = {}) {
    this.options = Object.freeze({ ...options });
    this.timeoutMs = options.timeoutMs ?? 2000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 10000)
      throw new Gen1Error('timeoutMs must be an integer in 100..10000.');
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.tail.then(action);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private gate(): void {
    if (!this.options.hardwareEnabled) throw new Gen1Error('Gen 1 hardware disabled. Set KATANA_GEN1_ENABLE_HARDWARE=1 explicitly.');
    if (this.locked) throw new Gen1Error('Gen 1 session locked after uncertain I/O. Inspect amp state, reconnect USB and restart server; no automatic retry.');
  }

  status(): object {
    return { backend: 'gen1-midi', experimental: true, hardwareEnabled: !!this.options.hardwareEnabled,
      connected: !!this.connection, locked: this.locked, modelConfirmedByOperator: !!this.options.modelConfirmed,
      firmware: 'unknown', volumeWrites: false, writesEnabled: !!this.options.allowWrites && !!this.options.lowMasterConfirmed,
      warning: 'Cached connection state; physical liveness is checked by explicit I/O. MIDI identity cannot prove KATANA-50 submodel.' };
  }

  listParams(): object {
    return GEN1_PARAMETERS.map(p => ({ ...p, encoding: 'unsigned 7-bit big-endian',
      range: null, writable: p.key === 'TemporaryGain' ? 'experimental raw 95..96 with opt-in and readback' : false }));
  }

  discover(): Promise<object> {
    return this.serial(async () => { this.gate(); const ports = await this.backend.list();
      return { ports, candidate: selectPorts(ports), modelVerified: false }; });
  }

  connect(): Promise<object> {
    return this.serial(async () => {
      this.gate();
      if (!this.options.modelConfirmed)
        throw new Gen1Error('Confirm the physical KATANA-50 Gen 1 label with KATANA_GEN1_MODEL_CONFIRMED=1.');
      if (this.connection) return this.status();
      const ports = selectPorts(await this.backend.list());
      try {
        this.connection = await this.backend.open(ports.input, ports.output);
        verifyIdentity(await this.exchange(identityRequest()));
        return this.status();
      } catch (e) { return this.fault(e); }
    });
  }

  disconnect(): Promise<object> {
    return this.serial(async () => {
      try { await this.close(); return this.status(); }
      catch (e) { return this.fault(e); }
    });
  }

  read(key: string, research = false): Promise<object> {
    // Reject invalid requests before any I/O, including implicit research access.
    const p = parameter(key, research);
    return this.serial(async () => {
      this.requireConnection();
      try { return { key, raw: await this.readRaw(p.address, p.length), research: p.research,
        atomicSnapshot: false, hardwareVerifiedImplementation: false }; }
      catch (e) { return this.fault(e); }
    });
  }

  write(key: string, value: number): Promise<object> {
    const p = validateWrite(key, value);
    return this.serial(async () => {
      this.requireConnection();
      if (!this.options.allowWrites || !this.options.lowMasterConfirmed)
        throw new Gen1Error('Writes disabled. Explicit KATANA_GEN1_ALLOW_WRITES=1 and KATANA_GEN1_LOW_MASTER_CONFIRMED=1 required.');
      try {
        const before = await this.readRaw(p.address, p.length);
        if (before !== 95 && before !== 96)
          throw new Gen1Error('Current gain is outside evidenced 95..96 window; no DT1 sent.');
        if (before !== value) await this.connection!.send(encodeData(p.address, [value]));
        const after = await this.readRaw(p.address, p.length);
        if (after !== value) throw new Gen1Error('Readback mismatch: amp state uncertain; no automatic rollback or retry.');
        return { key, before, raw: after, readbackVerified: true, experimental: true, savedToPatch: false };
      } catch (e) { return this.fault(e); }
    });
  }

  private requireConnection(): void {
    this.gate();
    if (!this.connection) throw new Gen1Error('Gen 1 disconnected. Use katana_gen1_connect explicitly.');
  }

  private async exchange(message: number[]): Promise<number[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Also bound injected backends; a late resolution cannot clear the fault latch.
      return await Promise.race([this.connection!.exchange(message, this.timeoutMs),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Gen1Error('MIDI response timeout; retry unsafe.')), this.timeoutMs); })]);
    } finally { clearTimeout(timer); }
  }

  private async readRaw(address: readonly number[], length: number): Promise<number> {
    return decodeData(await this.exchange(encodeRead(address, length)), address, length);
  }

  private async close(): Promise<void> {
    const current = this.connection;
    this.connection = undefined;
    await current?.close();
  }

  private async fault(e: unknown): Promise<never> {
    this.locked = true;
    let cleanup = '';
    try { await this.close(); } catch { cleanup = ' MIDI cleanup also failed.'; }
    throw new Gen1Error(`${e instanceof Error ? e.message : String(e)}${cleanup} Session locked; inspect device state before USB reconnect and server restart.`);
  }
}
