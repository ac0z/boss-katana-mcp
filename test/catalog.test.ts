import { describe as group, expect, it } from 'vitest';
import { activeOnly, buildParams, CatalogError, describe, DETAIL_GROUP, ENUMS, resolveChanges } from '../src/catalog.js';
import { agentCall, type Leaf } from '../src/page-agent.js';
import { btsInstalled, createSandbox, readBtsFile } from './bts-sandbox.js';

const leaves = btsInstalled ? createSandbox().run<Leaf[]>(agentCall('index')) : [];
const green = [0, 0, 0, 0, 0];

group.skipIf(!btsInstalled)('catalog', () => {
  it('maps amp keys', () => {
    const p = buildParams(leaves, green).find(x => x.key === 'amp.volume');
    expect(p).toMatchObject({ pid: 'PATCH%AMP%1', min: 0, max: 100, section: 'amp' });
  });

  it('picks the variation block from PATCH%COLOR', () => {
    const red = buildParams(leaves, [1, 2, 1, 2, 1]);
    expect(red.find(x => x.key === 'booster.drive')!.pid).toBe('PATCH%BOOSTER(2)%1');
    expect(red.find(x => x.key === 'mod.type')!.pid).toBe('PATCH%FX(3)%0');
    expect(red.find(x => x.key === 'fx.type')!.pid).toBe('PATCH%FX(5)%0');
    expect(red.find(x => x.key === 'delay.time')!.pid).toBe('PATCH%DELAY(3)%1');
    expect(red.find(x => x.key === 'delay2.time')!.pid).toBe('PATCH%DELAY(5)%1');
    expect(red.find(x => x.key === 'reverb.type')!.pid).toBe('PATCH%REVERB(2)%0');
  });

  it('exposes on/off switches as booleans', () => {
    const p = buildParams(leaves, green);
    expect(p.find(x => x.key === 'booster.on')).toMatchObject({ pid: 'PATCH%SW%0', boolean: true });
    expect(p.find(x => x.key === 'delay2.on')).toMatchObject({ pid: 'PATCH%SW%4', boolean: true });
  });

  it('exposes MOD/FX detail params and EQ under prefixed keys', () => {
    const keys = buildParams(leaves, green).map(x => x.key);
    expect(keys.some(k => k.startsWith('mod.2x2chorus_'))).toBe(true);
    expect(keys.some(k => k.startsWith('fx.harmonist_'))).toBe(true);
    expect(keys).toContain('eq.peq_low_gain');
    expect(keys).toContain('eq.ge10_31hz');
    expect(keys).toContain('ns.threshold');
    expect(keys).toContain('other.chain');
  });

  it('DETAIL_GROUP covers every MOD/FX type and every FX_DETAIL group', () => {
    expect(Object.keys(DETAIL_GROUP).sort()).toEqual([...ENUMS['mod.type']].sort());
    const groups = new Set(buildParams(leaves, green).filter(p => p.detailGroup).map(p => p.detailGroup));
    expect([...groups].sort()).toEqual(Object.values(DETAIL_GROUP).sort());
  });

  it('activeOnly keeps only the active MOD/FX type details', () => {
    const p = buildParams(leaves, green);
    const typePid = p.find(x => x.key === 'mod.type')!.pid;
    const kept = activeOnly(p, { [typePid]: ENUMS['mod.type'].indexOf('CHORUS') });
    const modDetails = kept.filter(x => x.section === 'mod' && x.detailGroup);
    expect(modDetails.length).toBeGreaterThan(0);
    expect(modDetails.every(x => x.detailGroup === '2x2chorus')).toBe(true);
    expect(kept.some(x => x.key === 'mod.type')).toBe(true);
  });

  it('enum sizes match the parameter ranges', () => {
    const p = buildParams(leaves, green);
    for (const [key, labels] of Object.entries(ENUMS)) {
      expect(labels.length, key).toBe(p.find(x => x.key === key)!.max + 1);
    }
  });

  it('booster/modfx/delay/reverb labels match BTS resource.js lists', () => {
    const res = readBtsFile('js/config/resource.js');
    for (const key of ['booster.type', 'mod.type', 'delay.type', 'reverb.type']) {
      expect(res, key).toContain(`{ text: "${ENUMS[key].join(', ')}" }`);
    }
  });

  it('resolves values, enum labels and booleans', () => {
    const p = buildParams(leaves, green);
    expect(resolveChanges(p, { 'amp.volume': 12, 'booster.type': 'blues drive', 'booster.on': true, 'amp.type': 'Lead' }))
      .toEqual([
        { key: 'amp.volume', pid: 'PATCH%AMP%1', value: 12 },
        { key: 'booster.type', pid: 'PATCH%BOOSTER(1)%0', value: 9 },
        { key: 'booster.on', pid: 'PATCH%SW%0', value: 1 },
        { key: 'amp.type', pid: 'PATCH%AMP%7', value: 4 },
      ]);
  });

  it('accepts raw PRMID names on the active variation', () => {
    const p = buildParams(leaves, [2, 0, 0, 0, 0]);
    expect(resolveChanges(p, { PRMID_PATCH_BOOSTER_DRIVE: 80 })).toEqual([{ key: 'booster.drive', pid: 'PATCH%BOOSTER(3)%1', value: 80 }]);
  });

  it('rejects PRMID names shared by several sections as ambiguous', () => {
    const p = buildParams(leaves, green);
    expect(() => resolveChanges(p, { PRMID_PATCH_FX_TYPE: 3 })).toThrow('PRMID_PATCH_FX_TYPE: ambiguous, use one of mod.type, fx.type');
  });

  it('rejects all invalid changes together, never clamps', () => {
    const p = buildParams(leaves, green);
    try {
      resolveChanges(p, { 'amp.volume': 101, 'amp.nope': 1, 'booster.type': 'klon', 'amp.gain': 10.5 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogError);
      const msg = (e as CatalogError).problems.join('\n');
      expect(msg).toContain('amp.volume: 101 is out of range 0..100');
      expect(msg).toContain('amp.nope: unknown key');
      expect(msg).toContain('booster.type: unknown option "klon"');
      expect(msg).toContain('amp.gain: must be an integer');
    }
  });

  it('describes values with labels and booleans', () => {
    const p = buildParams(leaves, green).filter(x => ['amp.type', 'amp.volume', 'booster.on'].includes(x.key));
    expect(describe(p, { 'PATCH%AMP%7': 1, 'PATCH%AMP%1': 50, 'PATCH%SW%0': 0 }))
      .toEqual({ 'amp.type': 'CLEAN', 'amp.volume': 50, 'booster.on': false });
  });
});
