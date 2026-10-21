import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

export const BTS_HTML = join(process.env.LOCALAPPDATA ?? '', 'Roland', 'BOSS TONE STUDIO for KATANA Gen 3', 'html');
export const btsInstalled = existsSync(join(BTS_HTML, 'js', 'common', 'parameter.js'));

const FILES = [
  'js/utilities/constant.js',
  'js/utilities/converter.js',
  'js/config/address_map.js',
  'js/config/editor_setting.js',
  'js/config/librarian_setting.js',
  'js/config/product_setting.js',
  'js/common/midi_controller.js',
  'js/common/parameter.js',
];

export interface Sandbox {
  run<T = unknown>(code: string): T;
  incoming(msg: string): void;
  sent: string[];
}

/** Loads BTS's own parameter/MIDI scripts into an isolated vm context, like the WebView page. */
export function createSandbox(): Sandbox {
  const sent: string[] = [];
  const midi = {
    event: {} as { message?: (msg: string, ts: number) => void },
    send: (msg: string) => { sent.push(msg); },
  };
  const win: Record<string, unknown> = {
    console, setTimeout,
    setInterval: () => 0, // keep MIDIController's queue from draining
    navigator: { language: 'en' },
    $native: { midi },
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of FILES) vm.runInContext(readFileSync(join(BTS_HTML, f), 'utf8'), ctx, { filename: f });
  return {
    run: <T>(code: string) => vm.runInContext(code, ctx) as T,
    incoming: (msg: string) => midi.event.message!(msg, 0),
    sent,
  };
}

export function readBtsFile(rel: string): string {
  return readFileSync(join(BTS_HTML, rel), 'utf8');
}
