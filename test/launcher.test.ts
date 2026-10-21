import { expect, it, vi } from 'vitest';
import { isImageListed, launch, type LaunchDeps } from '../src/launcher.js';

function deps(o: Partial<LaunchDeps>): LaunchDeps {
  return {
    exists: () => true,
    isRunning: async () => false,
    start: vi.fn(),
    reachable: async () => false,
    portOpen: async () => false,
    sleep: async () => {},
    ...o,
  };
}

const IMAGE = 'BOSS TONE STUDIO for KATANA Gen 3.exe';

it('isImageListed matches the full CSV image name case-insensitively', () => {
  const csv = '"BOSS TONE STUDIO for KATANA Gen 3.exe","6888","Console","1","28,612 K"';
  expect(isImageListed(csv, IMAGE)).toBe(true);
  expect(isImageListed(csv.toLowerCase(), IMAGE)).toBe(true);
});

it('isImageListed returns false for the "no tasks" INFO line', () => {
  expect(isImageListed('INFO: No tasks are running which match the specified criteria.', IMAGE)).toBe(false);
});

it('isImageListed returns false for a different image', () => {
  const csv = '"notepad.exe","1234","Console","1","1,000 K"';
  expect(isImageListed(csv, IMAGE)).toBe(false);
});

it('isImageListed returns false for a TABLE-style truncated name', () => {
  const table = 'BOSS TONE STUDIO for KATA     6888 Console                    1     28,612 K';
  expect(isImageListed(table, IMAGE)).toBe(false);
});

it('does nothing when BTS is already reachable', async () => {
  const d = deps({ reachable: async () => true });
  expect(await launch(d)).toEqual({ ok: true, message: 'BOSS TONE STUDIO is already open and reachable.' });
  expect(d.start).not.toHaveBeenCalled();
});

it('refuses to kill a BTS that runs without the debug port', async () => {
  const d = deps({ isRunning: async () => true, portOpen: async () => false });
  const r = await launch(d);
  expect(r.ok).toBe(false);
  expect(r.message).toContain('Close BOSS TONE STUDIO and call katana_launch again');
  expect(d.start).not.toHaveBeenCalled();
});

it('polls for script load (not start) when BTS is running and the port is already open', async () => {
  let n = 0;
  const d = deps({ isRunning: async () => true, portOpen: async () => true, reachable: async () => ++n >= 2 });
  const r = await launch(d);
  expect(r).toEqual({ ok: true, message: 'BOSS TONE STUDIO is open and ready.' });
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

it('does not throw out of launch when tasklist (isRunning) fails', async () => {
  const d = deps({ isRunning: async () => { throw new Error('tasklist failed'); } });
  const r = await launch(d);
  expect(r.ok).toBe(false);
  // isRunning failing is treated as "not running", so launch proceeds to start().
  expect(d.start).toHaveBeenCalled();
});

it('times out at a non-multiple timeout without over-sleeping', async () => {
  let totalSlept = 0;
  const d = deps({ sleep: async (ms: number) => { totalSlept += ms; } });
  const r = await launch(d, 700);
  expect(r.ok).toBe(false);
  expect(totalSlept).toBeLessThanOrEqual(700);
  expect(r.message).toContain('0.7s');
});

it('counts real time spent inside reachable() toward the timeout budget (wall-clock, no real timers)', async () => {
  let clock = 0;
  let reachableCalls = 0;
  const d = deps({
    now: () => clock,
    sleep: async () => {}, // instant: no real delay
    reachable: async () => {
      reachableCalls++;
      clock += 6000; // each reachable() call "costs" 6s of wall time
      return false;
    },
  });
  const r = await launch(d, 20000);
  expect(r.ok).toBe(false);
  // Without wall-clock accounting, 20000ms / 500ms step would allow 40 polls (41 calls incl.
  // the initial check); with reachable() time counted, the budget is exhausted after a handful.
  expect(reachableCalls).toBeLessThanOrEqual(5);
});

it('reports ok:false without starting when the exe is missing', async () => {
  const d = deps({ exists: () => false });
  const r = await launch(d);
  expect(r).toEqual({
    ok: false,
    message: 'BOSS TONE STUDIO was not found at C:\\Program Files (x86)\\BOSS\\BOSS TONE STUDIO for KATANA Gen 3\\BOSS TONE STUDIO for KATANA Gen 3.exe. Install it or check the path.',
  });
  expect(d.start).not.toHaveBeenCalled();
});

it('reports ok:false with the error message when start() throws', async () => {
  const d = deps({ start: () => { throw new Error('access denied'); } });
  const r = await launch(d);
  expect(r).toEqual({ ok: false, message: 'Could not start BOSS TONE STUDIO: access denied' });
});
