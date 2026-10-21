import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { evaluateInBts } from './cdp.js';

export const BTS_EXE = 'C:\\Program Files (x86)\\BOSS\\BOSS TONE STUDIO for KATANA Gen 3\\BOSS TONE STUDIO for KATANA Gen 3.exe';
const IMAGE = 'BOSS TONE STUDIO for KATANA Gen 3.exe';

export interface LaunchDeps {
  exists(): boolean;
  isRunning(): Promise<boolean>;
  start(): void;
  reachable(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
}
export interface LaunchResult { ok: boolean; message: string }

/**
 * Parses `tasklist /FO CSV /NH` output and decides whether `image` is among the
 * running processes. The first CSV field of each line is the (quoted) image name;
 * tasklist's default TABLE format truncates it to 25 chars, so CSV is required for
 * an exact match. When nothing is running, tasklist prints an `INFO: ...` line.
 */
export function isImageListed(csvStdout: string, image: string): boolean {
  const target = image.toLowerCase();
  return csvStdout
    .split(/\r?\n/)
    .some(line => {
      const match = /^"([^"]*)"/.exec(line.trim());
      return !!match && match[1].toLowerCase() === target;
    });
}

const defaultDeps: LaunchDeps = {
  exists: () => existsSync(BTS_EXE),
  async isRunning() {
    const { stdout } = await promisify(execFile)('tasklist', ['/FI', `IMAGENAME eq ${IMAGE}`, '/FO', 'CSV', '/NH']);
    return isImageListed(stdout, IMAGE);
  },
  start() {
    // The env var is a fallback for machines where the per-app policy is not installed.
    const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' };
    const child = spawn(BTS_EXE, [], { detached: true, stdio: 'ignore', env });
    child.on('error', () => {}); // avoid an unhandled 'error' event crashing the MCP process
    child.unref();
  },
  reachable: async () => {
    // Readiness means the page scripts are loaded, not just that the socket accepts a connection.
    try {
      return await evaluateInBts<boolean>('typeof Parameter !== "undefined" && typeof AddressMap !== "undefined"');
    } catch {
      return false;
    }
  },
  sleep: ms => new Promise(r => setTimeout(r, ms)),
};

export async function launch(deps: LaunchDeps = defaultDeps, timeoutMs = 20000): Promise<LaunchResult> {
  if (await deps.reachable()) return { ok: true, message: 'BOSS TONE STUDIO is already open and reachable.' };
  let isRunning: boolean;
  try {
    isRunning = await deps.isRunning();
  } catch {
    isRunning = false;
  }
  if (isRunning) {
    return {
      ok: false,
      message: 'BOSS TONE STUDIO is running without the debug port. Close BOSS TONE STUDIO and call katana_launch again ' +
        '(or run scripts/Enable-KatanaClaude.ps1 once so it always opens with the port).',
    };
  }
  if (!deps.exists()) {
    return { ok: false, message: `BOSS TONE STUDIO was not found at ${BTS_EXE}. Install it or check the path.` };
  }
  try {
    deps.start();
  } catch (err) {
    return { ok: false, message: `Could not start BOSS TONE STUDIO: ${(err as Error).message}` };
  }
  const step = 500;
  for (let elapsed = 0; elapsed < timeoutMs; ) {
    const toSleep = Math.min(step, timeoutMs - elapsed);
    await deps.sleep(toSleep);
    elapsed += toSleep;
    if (await deps.reachable()) return { ok: true, message: 'BOSS TONE STUDIO started.' };
  }
  return { ok: false, message: `BOSS TONE STUDIO was started but did not become reachable within ${timeoutMs / 1000}s.` };
}
