import { Gen1Error } from './protocol.js';

export interface Gen1Parameter {
  readonly key: string;
  readonly address: readonly number[];
  readonly length: number;
  readonly research: boolean;
}

// Independent read evidence only. Raw PANEL codes are not active DSP controls.
const panel = ['AmpType', 'PanelGain', 'Volume', 'Bass', 'Middle', 'Treble',
  'Presence', 'BoosterMod', 'DelayFx', 'Reverb'];
const research: [string, number[], number][] = [
  ['DelayTime', [0x60, 0, 5, 0x62], 2],
  ['DelayFeedback', [0x60, 0, 5, 0x64], 1],
  ['ReverbLevel', [0x60, 0, 6, 0x18], 1],
  ['NoiseSuppressorOn', [0x60, 0, 6, 0x63], 1],
  ['NoiseSuppressorThreshold', [0x60, 0, 6, 0x64], 1],
  ['EqLowGain', [0x60, 0, 1, 0x32], 1],
  ['Fx1PhaserRate', [0x60, 0, 2, 0x76], 1],
  ['Fx1PhaserDepth', [0x60, 0, 2, 0x77], 1],
  ['SignalChainPattern', [0x60, 0, 0x12, 0], 1],
];
export const GEN1_PARAMETERS: readonly Gen1Parameter[] = Object.freeze([
  ...panel.map((key, i) => ({ key, address: [0, 0, 4, 0x20 + i], length: 1, research: false })),
  { key: 'TemporaryGain', address: [0x60, 0, 0, 0x52], length: 1, research: false },
  ...research.map(([key, address, length]) => ({ key, address, length, research: true })),
].map(p => Object.freeze({ ...p, address: Object.freeze(p.address) })));

export function parameter(key: string, explicitResearch = false): Gen1Parameter {
  const found = GEN1_PARAMETERS.find(p => p.key === key);
  if (!found) throw new Gen1Error(`Unknown Gen 1 parameter: ${key}. Use katana_gen1_list_params.`);
  if (found.research && !explicitResearch)
    throw new Gen1Error(`${key} requires explicitResearch=true; raw context-dependent research value.`);
  return found;
}

export function validateWrite(key: string, value: number): Gen1Parameter {
  const p = parameter(key, true);
  // No inferred 0..100 range, volume ceiling, NS1 workflow, patch or system writes.
  if (key !== 'TemporaryGain')
    throw new Gen1Error(`${key} is read-only. Volume writes are disabled: no evidenced safe limit.`);
  if (!Number.isInteger(value) || (value !== 95 && value !== 96))
    throw new Gen1Error('TemporaryGain supports only the observed experimental raw window 95..96.');
  return p;
}
