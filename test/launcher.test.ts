import { expect, it, vi } from 'vitest';
import { launch, type LaunchDeps } from '../src/launcher.js';

function deps(o: Partial<LaunchDeps>): LaunchDeps {
  return { isRunning: async () => false, start: vi.fn(), reachable: async () => false, sleep: async () => {}, ...o };
}

it('does nothing when BTS is already reachable', async () => {
  const d = deps({ reachable: async () => true });
  expect(await launch(d)).toEqual({ ok: true, message: 'BOSS TONE STUDIO is already open and reachable.' });
  expect(d.start).not.toHaveBeenCalled();
});

it('refuses to kill a BTS that runs without the debug port', async () => {
  const d = deps({ isRunning: async () => true });
  const r = await launch(d);
  expect(r.ok).toBe(false);
  expect(r.message).toContain('Close BOSS TONE STUDIO and call katana_launch again');
  expect(d.start).not.toHaveBeenCalled();
});

it('starts BTS and waits until the page is reachable', async () => {
  let n = 0;
  const d = deps({ reachable: async () => ++n >= 3 });
  expect(await launch(d)).toEqual({ ok: true, message: 'BOSS TONE STUDIO started.' });
  expect(d.start).toHaveBeenCalledOnce();
});

it('times out when the page never appears', async () => {
  const d = deps({});
  const r = await launch(d, 1000);
  expect(r.ok).toBe(false);
  expect(r.message).toContain('did not become reachable');
});
