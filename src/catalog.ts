import type { Leaf, WriteChange } from './page-agent.js';

export const SECTIONS = ['amp', 'booster', 'mod', 'fx', 'delay', 'delay2', 'reverb', 'ns', 'eq', 'eq2', 'solo', 'pedalfx', 'other'] as const;

const AMP_TYPES = ['ACOUSTIC', 'CLEAN', 'PUSHED', 'CRUNCH', 'LEAD', 'BROWN'];
const BOOSTER_TYPES = ['MID BOOST', 'CLEAN BOOST', 'TREBLE BOOST', 'CRUNCH OD', 'NATURAL OD', 'WARM OD', 'FAT DS', 'METAL DS', 'OCT FUZZ', 'BLUES DRIVE', 'OVERDRIVE', 'T-SCREAM', 'TURBO OD', 'DISTORTION', 'RAT', 'GUV DS', 'DST+', 'METAL ZONE', "'60S FUZZ", 'MUFF FUZZ', 'HM-2', 'METAL CORE', 'CENTA OD'];
const MODFX_TYPES = ['T.WAH', 'AUTO WAH', 'PEDAL WAH', 'COMP', 'LIMITER', 'GRAPHIC EQ', 'PARAMETRIC EQ', 'GUITAR SIM', 'SLOW GEAR', 'WAVE SYNTH', 'OCTAVE', 'PITCH SHIFTER', 'HARMONIST', 'AC.PROCESSOR', 'PHASER', 'FLANGER', 'TREMOLO', 'ROTARY', 'UNI-V', 'SLICER', 'VIBRATO', 'RING MOD', 'HUMANIZER', 'CHORUS', 'AC.GUITAR SIM', 'PHASER 90E', 'FLANGER 117E', 'WAH 95E', 'DC-30', 'HEAVY OCTAVE', 'PEDAL BEND'];
const DELAY_TYPES = ['DIGITAL', 'PAN', 'STEREO', 'ANALOG', 'TAPE ECHO', 'REVERSE', 'MODULATE', 'SDE-3000'];
const REVERB_TYPES = ['PLATE', 'ROOM', 'HALL', 'SPRING', 'MODULATE'];

export const ENUMS: Record<string, readonly string[]> = {
  'amp.type': AMP_TYPES,
  'booster.type': BOOSTER_TYPES,
  'mod.type': MODFX_TYPES,
  'fx.type': MODFX_TYPES,
  'delay.type': DELAY_TYPES,
  'delay2.type': DELAY_TYPES,
  'reverb.type': REVERB_TYPES,
};

export const DETAIL_GROUP: Record<string, string> = {
  'T.WAH': 'twah', 'AUTO WAH': 'awah', 'PEDAL WAH': 'pedalwah', 'COMP': 'comp', 'LIMITER': 'limiter',
  'GRAPHIC EQ': 'geq', 'PARAMETRIC EQ': 'peq', 'GUITAR SIM': 'guitarsim', 'SLOW GEAR': 'slowgear',
  'WAVE SYNTH': 'wavesynth', 'OCTAVE': 'octave', 'PITCH SHIFTER': 'pitchshift', 'HARMONIST': 'harmonist',
  'AC.PROCESSOR': 'acprocess', 'PHASER': 'phaser', 'FLANGER': 'flanger', 'TREMOLO': 'tremolo', 'ROTARY': 'rotary',
  'UNI-V': 'univ', 'SLICER': 'slicer', 'VIBRATO': 'vibrato', 'RING MOD': 'ringmod', 'HUMANIZER': 'humanizer',
  'CHORUS': '2x2chorus', 'AC.GUITAR SIM': 'acsim', 'PHASER 90E': 'ephaser', 'FLANGER 117E': 'eflanger',
  'WAH 95E': 'ewah', 'DC-30': 'dc30', 'HEAVY OCTAVE': 'heavyoctave', 'PEDAL BEND': 'bend',
};

export interface Param {
  key: string; section: string; pid: string; name: string; min: number; max: number;
  options?: readonly string[]; boolean?: boolean; detailGroup?: string;
}

interface Source { section: string; bid: string; prefix: string }

// colors: PATCH%COLOR offsets 0 booster, 1 mod, 2 fx, 3 delay, 4 reverb (0..2 = green/red/yellow)
function sources(c: number[]): Source[] {
  return [
    { section: 'amp', bid: 'PATCH%AMP', prefix: 'PRMID_PATCH_AMP_' },
    { section: 'booster', bid: `PATCH%BOOSTER(${c[0] + 1})`, prefix: 'PRMID_PATCH_BOOSTER_' },
    { section: 'mod', bid: `PATCH%FX(${c[1] + 1})`, prefix: 'PRMID_PATCH_FX_' },
    { section: 'mod', bid: `PATCH%FX_DETAIL(${c[1] + 1})`, prefix: 'PRMID_PATCH_FX_DETAIL_' },
    { section: 'fx', bid: `PATCH%FX(${c[2] + 4})`, prefix: 'PRMID_PATCH_FX_' },
    { section: 'fx', bid: `PATCH%FX_DETAIL(${c[2] + 4})`, prefix: 'PRMID_PATCH_FX_DETAIL_' },
    { section: 'delay', bid: `PATCH%DELAY(${c[3] + 1})`, prefix: 'PRMID_PATCH_DELAY_' },
    { section: 'delay2', bid: `PATCH%DELAY(${c[4] + 4})`, prefix: 'PRMID_PATCH_DELAY_' },
    { section: 'reverb', bid: `PATCH%REVERB(${c[4] + 1})`, prefix: 'PRMID_PATCH_REVERB_' },
    { section: 'ns', bid: 'PATCH%NS', prefix: 'PRMID_PATCH_NS_' },
    { section: 'eq', bid: 'PATCH%EQ_EACH(1)', prefix: 'PRMID_PATCH_EQ_EACH_' },
    { section: 'eq', bid: 'PATCH%EQ_PEQ(1)', prefix: 'PRMID_PATCH_EQ_' },
    { section: 'eq', bid: 'PATCH%EQ_GE10(1)', prefix: 'PRMID_PATCH_EQ_' },
    { section: 'eq2', bid: 'PATCH%EQ_EACH(2)', prefix: 'PRMID_PATCH_EQ_EACH_' },
    { section: 'eq2', bid: 'PATCH%EQ_PEQ(2)', prefix: 'PRMID_PATCH_EQ_' },
    { section: 'eq2', bid: 'PATCH%EQ_GE10(2)', prefix: 'PRMID_PATCH_EQ_' },
    { section: 'solo', bid: 'PATCH%SOLO_COM', prefix: 'PRMID_PATCH_SOLO_COM_' },
    { section: 'solo', bid: 'PATCH%SOLO_EQ', prefix: 'PRMID_PATCH_SOLO_' },
    { section: 'solo', bid: 'PATCH%SOLO_DELAY', prefix: 'PRMID_PATCH_SOLO_' },
    { section: 'pedalfx', bid: 'PATCH%PEDALFX_COM', prefix: 'PRMID_PATCH_PEDALFX_COM_' },
    { section: 'pedalfx', bid: 'PATCH%PEDALFX', prefix: 'PRMID_PATCH_PEDALFX_' },
    { section: 'other', bid: 'PATCH%OTHER', prefix: 'PRMID_PATCH_OTHER_' },
  ];
}

const SWITCHES: Record<string, string> = {
  'booster.on': 'PRMID_PATCH_SW_BOOSTER_SW',
  'mod.on': 'PRMID_PATCH_SW_MOD_SW',
  'fx.on': 'PRMID_PATCH_SW_FX_SW',
  'delay.on': 'PRMID_PATCH_SW_DELAY_SW',
  'delay2.on': 'PRMID_PATCH_SW_DELAY2_SW',
  'reverb.on': 'PRMID_PATCH_SW_REVERB_SW',
};

function isBoolean(leaf: Leaf, key: string): boolean {
  return leaf.min === 0 && leaf.max === 1 && (key.endsWith('.on') || key.endsWith('_sw') || key.endsWith('.sw'));
}

export function buildParams(leaves: Leaf[], colors: number[]): Param[] {
  const out: Param[] = [];
  const push = (key: string, section: string, l: Leaf, detailGroup?: string) => {
    const p: Param = { key, section, pid: l.pid, name: l.name, min: l.min, max: l.max };
    if (ENUMS[key]) p.options = ENUMS[key];
    if (isBoolean(l, key)) p.boolean = true;
    if (detailGroup) p.detailGroup = detailGroup;
    out.push(p);
  };
  for (const s of sources(colors)) {
    for (const l of leaves) {
      if (l.bid !== s.bid || !l.name.startsWith(s.prefix)) continue;
      const rest = l.name.slice(s.prefix.length).toLowerCase();
      const group = s.prefix === 'PRMID_PATCH_FX_DETAIL_' ? rest.split('_')[0] : undefined;
      push(`${s.section}.${rest}`, s.section, l, group);
    }
  }
  for (const [key, name] of Object.entries(SWITCHES)) {
    const l = leaves.find(x => x.bid === 'PATCH%SW' && x.name === name);
    if (l) push(key, key.split('.')[0], l);
  }
  return out;
}

/** Drops MOD/FX detail params that belong to a type other than the one currently selected. */
export function activeOnly(params: Param[], values: Record<string, number>): Param[] {
  const active: Record<string, string | undefined> = {};
  for (const section of ['mod', 'fx']) {
    const t = params.find(p => p.key === `${section}.type`);
    const label = t && values[t.pid] !== undefined ? ENUMS[t.key][values[t.pid]] : undefined;
    active[section] = label ? DETAIL_GROUP[label] : undefined;
  }
  return params.filter(p => !p.detailGroup || p.detailGroup === active[p.section]);
}

export class CatalogError extends Error {
  constructor(public problems: string[]) { super(problems.join('\n')); }
}

function toNumber(p: Param, raw: unknown, problems: string[]): number | undefined {
  if (typeof raw === 'boolean') {
    if (!p.boolean) { problems.push(`${p.key}: expects a number, not a boolean`); return; }
    return raw ? 1 : 0;
  }
  if (typeof raw === 'string' && p.options) {
    const i = p.options.findIndex(o => o.toLowerCase() === raw.trim().toLowerCase());
    if (i < 0) { problems.push(`${p.key}: unknown option "${raw}". Options: ${p.options.join(', ')}`); return; }
    return i;
  }
  if (typeof raw !== 'number') { problems.push(`${p.key}: expects a number${p.options ? ' or option name' : ''}`); return; }
  if (!Number.isInteger(raw)) { problems.push(`${p.key}: must be an integer`); return; }
  if (raw < p.min || raw > p.max) { problems.push(`${p.key}: ${raw} is out of range ${p.min}..${p.max}`); return; }
  return raw;
}

export function resolveChanges(params: Param[], changes: Record<string, unknown>): (WriteChange & { key: string })[] {
  const problems: string[] = [];
  const out: (WriteChange & { key: string })[] = [];
  for (const [rawKey, raw] of Object.entries(changes)) {
    const matches = rawKey.startsWith('PRMID_')
      ? params.filter(x => x.name === rawKey)
      : params.filter(x => x.key === rawKey.toLowerCase());
    if (matches.length > 1) { problems.push(`${rawKey}: ambiguous, use one of ${matches.map(m => m.key).join(', ')}`); continue; }
    const p = matches[0];
    if (!p) { problems.push(`${rawKey}: unknown key`); continue; }
    const value = toNumber(p, raw, problems);
    if (value !== undefined) out.push({ key: p.key, pid: p.pid, value });
  }
  if (problems.length) throw new CatalogError(problems);
  return out;
}

export function describe(params: Param[], values: Record<string, number>): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of params) {
    const v = values[p.pid];
    if (v === undefined) continue;
    out[p.key] = p.options ? (p.options[v] ?? v) : p.boolean ? v === 1 : v;
  }
  return out;
}
