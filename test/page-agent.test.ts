import { describe, expect, it } from 'vitest';
import { agentCall, type Leaf, PAGE_AGENT_SOURCE } from '../src/page-agent.js';
import { btsInstalled, createSandbox } from './bts-sandbox.js';

describe.skipIf(!btsInstalled)('page agent', () => {
  it('is idempotent', () => {
    const sb = createSandbox();
    sb.run(PAGE_AGENT_SOURCE);
    sb.run('window.__katanaClaude.marker = 1');
    sb.run(PAGE_AGENT_SOURCE);
    expect(sb.run('window.__katanaClaude.marker')).toBe(1);
  });

  it('replaces a stale page agent left by an older version', () => {
    const sb = createSandbox();
    sb.run("window.__katanaClaude = { v: 'old' }");
    sb.run(PAGE_AGENT_SOURCE);
    expect(sb.run('typeof window.__katanaClaude.index')).toBe('function');
  });

  it('indexes PATCH leaves with byte offsets as pid suffix', () => {
    const sb = createSandbox();
    const leaves = sb.run<Leaf[]>(agentCall('index'));
    const vol = leaves.find(l => l.bid === 'PATCH%AMP' && l.name === 'PRMID_PATCH_AMP_VOLUME');
    expect(vol).toMatchObject({ pid: 'PATCH%AMP%1', min: 0, max: 100, ofs: 0 });
    expect(leaves.some(l => l.bid === 'PATCH%BOOSTER(3)' && l.name === 'PRMID_PATCH_BOOSTER_DRIVE')).toBe(true);
    expect(leaves.some(l => l.name === 'PRMID_PATCH_COM_NAME')).toBe(false); // string param excluded
    expect(leaves.every(l => l.bid.startsWith('PATCH%'))).toBe(true);
  });

  it('reads values', () => {
    const sb = createSandbox();
    expect(sb.run(agentCall('read', ['PATCH%AMP%1', 'PATCH%AMP%7']))).toEqual({ 'PATCH%AMP%1': 50, 'PATCH%AMP%7': 1 });
  });

  it('writes: queues DT1 for the amp, updates UI observers, sends nothing extra', () => {
    const sb = createSandbox();
    sb.run('globalThis.__seen = []; Parameter.addObserver({ notify: (b, f, t) => __seen.push([b, f, t]) })');
    const out = sb.run(agentCall('write', [{ pid: 'PATCH%AMP%1', value: 12 }]));
    expect(out).toEqual({ 'PATCH%AMP%1': 12 });
    expect(sb.run('JSON.stringify(__seen)')).toBe('[["PATCH%AMP",1,2]]');
    expect(sb.run('MIDIController.fifoIsEmpty()')).toBe(false); // DT1 to amp queued
    expect(sb.sent).toEqual([]); // nothing echoed synchronously
  });

  it('writes multi-byte values with offset (delay time 4 nibbles, reverb time ofs -1)', () => {
    const sb = createSandbox();
    const out = sb.run(agentCall('write', [
      { pid: 'PATCH%DELAY(1)%1', value: 1234 },
      { pid: 'PATCH%REVERB(1)%2', value: 75 },
    ]));
    expect(out).toEqual({ 'PATCH%DELAY(1)%1': 1234, 'PATCH%REVERB(1)%2': 75 });
    expect(sb.run('Parameter.paramSet["PATCH%DELAY(1)"].slice(1, 5).join("")')).toBe('00040D02');
  });

  it.each([
    ['PATCH%DELAY(1)%1', 1234], // 4-byte value
    ['PATCH%REVERB(1)%2', 75], // negative ofs
  ] as const)('mirrors to the UI exactly the DT1 frame queued for the amp (%s)', (pid, value) => {
    const sb = createSandbox();
    // Wrap the real MIDIController-installed handler so the UI-mirror frame is captured too.
    sb.run(
      'globalThis.__mirrored = []; ' +
      'var __orig = $native.midi.event.message; ' +
      '$native.midi.event.message = function (m, t) { globalThis.__mirrored.push(m); return __orig(m, t); };',
    );
    sb.run(agentCall('write', [{ pid, value }]));
    const mirrored = sb.run<string[]>('globalThis.__mirrored');
    expect(mirrored).toHaveLength(1);
    sb.tick(); // drains MIDIController's queue into sb.sent
    expect(sb.sent).toHaveLength(1);
    expect(mirrored[0]).toBe(sb.sent[0]);
  });

  it('reports status', () => {
    const sb = createSandbox();
    expect(sb.run(agentCall('status'))).toEqual({ connected: false, patchName: 'KATANA', colors: [0, 0, 0, 0, 0] });
  });
});

/** Stubs the BTS connect globals the sandbox does not load (jQuery DOM, util storage, controllers). */
function connectSandbox(o: { visible?: string[]; initialized?: boolean; stored?: boolean; inputs?: string[] } = {}) {
  const sb = createSandbox();
  const names = o.inputs ?? ['KATANA3'];
  sb.run(`
    globalThis.__calls = [];
    var __visible = ${JSON.stringify(o.visible ?? ['device-connect-select-dialog'])};
    var __eps = ${JSON.stringify(names)}.map(function (n) { return { MIDIDeviceNameKey: n, MIDIEntityNameKey: n, MIDIEndpointUIDKey: n + '-uid' }; });
    $native.midi.input = { endpoints: function () { return __eps; } };
    $native.midi.output = { endpoints: function () { return __eps; } };
    window.$ = function (sel) { return { is: function () { return __visible.indexOf(sel.slice(1)) >= 0; } }; };
    window.util = { readStorage: function () { return { input: ${o.stored ? '{}' : 'null'} }; } };
    window.popup_close = function (id) { __calls.push('close ' + id); };
    window.btsDOMController = { closeConnectingPage: function () { __calls.push('closeConnectingPage'); } };
    var __inputs = [];
    window.midiConnectionController = {
      setInputs: function (v) { __inputs = v; }, setOutputs: function () {}, getInputs: function () { return __inputs; },
      getHasInitialized: function () { return ${o.initialized ?? false}; },
      updateHasInitialized: function () { __calls.push('updateHasInitialized'); },
      _getMatchedOutput: function (i) { return i; },
      connectMIDI: function (i) { __calls.push('connectMIDI ' + i.MIDIEndpointUIDKey); },
    };`);
  return sb;
}

describe.skipIf(!btsInstalled)('page agent connect', () => {
  it('answers the "Connect with" dialog like its OK button, with the KATANA input', () => {
    const sb = connectSandbox();
    expect(sb.run(agentCall('connect'))).toEqual({ started: true, device: 'KATANA3' });
    const calls = sb.run<string[]>('__calls');
    expect(calls).toContain('close device-connect-select-dialog');
    expect(calls.slice(-3)).toEqual(['closeConnectingPage', 'updateHasInitialized', 'connectMIDI KATANA3-uid']);
  });

  it('does nothing when the amp is already connected', () => {
    const sb = connectSandbox();
    sb.run('window.currentMIDIConnect = {}');
    expect(sb.run(agentCall('connect'))).toEqual({ started: false, already: true });
    expect(sb.run('__calls')).toEqual([]);
  });

  it.each([
    ['BTS has not finished starting up', { visible: [], initialized: false }],
    ['a connect is already under way', { visible: [], initialized: true, stored: true }],
  ])('waits when %s', (_, o) => {
    const sb = connectSandbox(o);
    expect(sb.run(agentCall('connect'))).toEqual({ started: false, pending: true });
    expect(sb.run('__calls')).toEqual([]);
  });

  it('connects after the user picked offline mode (initialized, nothing stored, no dialog)', () => {
    const sb = connectSandbox({ visible: [], initialized: true });
    expect(sb.run(agentCall('connect'))).toMatchObject({ started: true });
  });

  it('connects from the "disconnected" dialog even with a stale stored device', () => {
    const sb = connectSandbox({ visible: ['disconnected-midi-connect-dialog'], initialized: true, stored: true });
    expect(sb.run(agentCall('connect'))).toMatchObject({ started: true });
  });

  it.each([
    [[], 'No KATANA MIDI device is listed'],
    [['KATANA3', 'KATANA3 (2)'], 'More than one KATANA'],
  ])('leaves the dialog to the user when the inputs are %j', (inputs, reason) => {
    const sb = connectSandbox({ inputs: ['Microsoft GS Wavetable Synth', ...inputs] });
    expect(sb.run<{ reason: string }>(agentCall('connect')).reason).toContain(reason);
    expect(sb.run('__calls')).toEqual([]);
  });
});
