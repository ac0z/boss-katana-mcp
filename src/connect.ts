import type { BtsClient } from './bts.js';

export interface ConnectResult { ampConnected: boolean; patchName: string; message?: string }
export interface WaitDeps { sleep(ms: number): Promise<void>; now(): number }

const realWait: WaitDeps = { sleep: ms => new Promise(r => setTimeout(r, ms)), now: Date.now };

/**
 * Connects BTS to the KATANA if it is not connected, and waits until BTS has finished its
 * handshake and loaded the amp's patch (it only marks the device connected after that).
 * Never throws for a failed connect; the reason goes in `message`.
 */
export async function connectAndWait(bts: BtsClient, timeoutMs = 15000, wait: WaitDeps = realWait): Promise<ConnectResult> {
  const deadline = wait.now() + timeoutMs;
  for (;;) {
    const st = await bts.status();
    if (st.connected) return { ampConnected: true, patchName: st.patchName };
    // Asking again is safe: connect() reports pending while a connect is under way.
    const r = await bts.connect();
    if (r.reason) return { ampConnected: false, patchName: st.patchName, message: r.reason };
    if (wait.now() >= deadline) {
      return {
        ampConnected: false,
        patchName: st.patchName,
        message: `The KATANA did not connect within ${timeoutMs / 1000}s. Check BOSS TONE STUDIO for an error dialog.`,
      };
    }
    await wait.sleep(500);
  }
}
