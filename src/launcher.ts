import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { btsReachable } from './cdp.js';

export const BTS_EXE = 'C:\\Program Files (x86)\\BOSS\\BOSS TONE STUDIO for KATANA Gen 3\\BOSS TONE STUDIO for KATANA Gen 3.exe';
const IMAGE = 'BOSS TONE STUDIO for KATANA Gen 3.exe';

export interface LaunchDeps {
  isRunning(): Promise<boolean>;
  start(): void;
  reachable(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
}
export interface LaunchResult { ok: boolean; message: string }

const defaultDeps: LaunchDeps = {
  async isRunning() {
    const { stdout } = await promisify(execFile)('tasklist', ['/FI', `IMAGENAME eq ${IMAGE}`, '/NH']);
    return stdout.includes(IMAGE);
  },
  start() {
    // The env var is a fallback for machines where the per-app policy is not installed.
    const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' };
    spawn(BTS_EXE, [], { detached: true, stdio: 'ignore', env }).unref();
  },
  reachable: () => btsReachable(),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
};

export async function launch(deps: LaunchDeps = defaultDeps, timeoutMs = 20000): Promise<LaunchResult> {
  if (await deps.reachable()) return { ok: true, message: 'BOSS TONE STUDIO is already open and reachable.' };
  if (await deps.isRunning()) {
    return {
      ok: false,
      message: 'BOSS TONE STUDIO is running without the debug port. Close BOSS TONE STUDIO and call katana_launch again ' +
        '(or run scripts/Enable-KatanaClaude.ps1 once so it always opens with the port).',
    };
  }
  deps.start();
  for (let waited = 0; waited < timeoutMs; waited += 500) {
    await deps.sleep(500);
    if (await deps.reachable()) return { ok: true, message: 'BOSS TONE STUDIO started.' };
  }
  return { ok: false, message: `BOSS TONE STUDIO was started but did not become reachable within ${timeoutMs / 1000}s.` };
}
