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

  it('reports status', () => {
    const sb = createSandbox();
    expect(sb.run(agentCall('status'))).toEqual({ connected: false, patchName: 'KATANA', colors: [0, 0, 0, 0, 0] });
  });
});
