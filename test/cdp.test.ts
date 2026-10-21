import { expect, it } from 'vitest';
import { pickTarget } from '../src/cdp.js';

const bts = { type: 'page', url: 'file:///C:/Users/x/AppData/Local/Roland/BOSS%20TONE%20STUDIO%20for%20KATANA%20Gen%203/html/index.html', webSocketDebuggerUrl: 'ws://a' };
const btx = { type: 'page', url: 'https://bosstoneexchange.com/gear/katana_gen_3/', webSocketDebuggerUrl: 'ws://b' };

it('picks the BTS file:// page and ignores Tone Exchange', () => {
  expect(pickTarget([btx, bts])).toBe(bts);
});

it('returns undefined when BTS is not among the targets', () => {
  expect(pickTarget([btx])).toBeUndefined();
  expect(pickTarget([{ ...bts, type: 'iframe' }])).toBeUndefined();
});
