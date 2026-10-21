export interface CdpTarget { type: string; url: string; webSocketDebuggerUrl?: string }

export class BtsUnavailableError extends Error {}

const NOT_RUNNING =
  'BOSS TONE STUDIO is not reachable on the debug port. Open it with katana_launch, ' +
  'or run scripts/Enable-KatanaClaude.ps1 once and reopen BOSS TONE STUDIO.';

export function pickTarget(list: CdpTarget[]): CdpTarget | undefined {
  return list.find(t => t.type === 'page' && t.url.startsWith('file:///') && t.url.endsWith('/html/index.html'));
}

async function listTargets(port: number): Promise<CdpTarget[]> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
    return (await res.json()) as CdpTarget[];
  } catch {
    throw new BtsUnavailableError(NOT_RUNNING);
  }
}

export async function btsReachable(port = 9222): Promise<boolean> {
  try { return pickTarget(await listTargets(port)) !== undefined; } catch { return false; }
}

/** Opens a one-shot CDP session to the BTS page, evaluates, closes. */
export async function evaluateInBts<T>(expression: string, port = 9222): Promise<T> {
  const target = pickTarget(await listTargets(port));
  if (!target?.webSocketDebuggerUrl) throw new BtsUnavailableError(NOT_RUNNING);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new BtsUnavailableError(NOT_RUNNING)), { once: true });
    });
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), 10000);
      ws.addEventListener('message', ev => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id !== 1) return;
        clearTimeout(timer);
        if (msg.error) return reject(new Error(`CDP error: ${msg.error.message}`));
        const r = msg.result;
        if (r.exceptionDetails) {
          return reject(new Error(`BTS page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`));
        }
        resolve(r.result.value as T);
      });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
  } finally {
    ws.close();
  }
}
