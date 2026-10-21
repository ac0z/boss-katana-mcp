# katana-claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code MCP server + skill that reads and sets BOSS KATANA Gen 3 parameters through the original BOSS TONE STUDIO (BTS) app, with the BTS UI updating live.

**Architecture:** Node/TypeScript stdio MCP server. Per tool call it opens a Chrome DevTools Protocol (CDP) WebSocket to BTS's WebView2 page on 127.0.0.1:9222 and evaluates a small idempotent in-page agent (`window.__katanaClaude`) that uses BTS's own globals (`AddressMap`, `Parameter`, `$native.midi`). Writes go to the amp via `Parameter.setValue` and are mirrored into BTS's incoming-MIDI path so UI observers redraw. Friendly keys (`amp.volume`, `booster.type`) are mapped to BTS parameter IDs in Node.

**Tech Stack:** Node 24 (global `WebSocket`, `fetch`), TypeScript 5, `@modelcontextprotocol/sdk` 1.32.1 (v1 API, zod raw shapes), `zod` 4, `vitest` 4, PowerShell 5.1 for registry scripts.

**Spec:** `docs/superpowers/specs/2026-10-21-katana-claude-design.md`

## Global Constraints

- Works with the original, unmodified BTS install: `C:\Program Files (x86)\BOSS\BOSS TONE STUDIO for KATANA Gen 3\BOSS TONE STUDIO for KATANA Gen 3.exe`. Never edit BTS files or the exe.
- Roland's files are never copied into this repo. Tests read them from `%LOCALAPPDATA%\Roland\BOSS TONE STUDIO for KATANA Gen 3\html\` and skip when absent.
- Debug port enabled by per-app WebView2 policy: `HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`, value name `BOSS TONE STUDIO for KATANA Gen 3.exe`, data `--remote-debugging-port=9222`.
- v1 edits only the `PATCH` edit buffer. No writes to `PATCH(1..10)`, `SYSTEM`, `TEMP`, `COMMAND`.
- Invalid key / enum label / out-of-range value → reject, never clamp. `katana_set` writes nothing if any change is invalid.
- Runtime deps limited to `@modelcontextprotocol/sdk` and `zod`. No `ws`, no `chrome-remote-interface`.
- Commits: short English subject, no `Co-Authored-By`, no session links. Author must be `Doğa Koçak <doga_kocak0623@hotmail.com>` (check `git config user.email` before the first commit).
- Tests: vitest. No other test libraries.
- MCP and skill registered locally on `D:\IMPORTRADER` only (no global/user scope).

## Verified facts (2026-10-21, BTS appVersion 1.1.0 build 26)

Do not re-derive; these were checked against the live app:
- BTS page URL: `file:///C:/Users/<user>/AppData/Local/Roland/BOSS%20TONE%20STUDIO%20for%20KATANA%20Gen%203/html/index.html`. A second CDP target (bosstoneexchange.com) exists.
- The per-app policy above opens port 9222 when BTS is started normally.
- `Parameter.value(pid,size,ofs)`, `Parameter.setValue(pid,size,ofs,value)`, `Parameter.getblock(bid).addr`, `Parameter.paramSet[bid]` (array of 2-char hex strings), `_7bitize`, `hex2`, `STX`, `ROLAND`, `DT1`, `EOX`, `ProductSetting.deviceId` (`"10"`), `ProductSetting.modelId` (`"010507"`), `INTEGER1x1`=65536, `INTEGER1x7`=65542, `INTEGER2x4`=65543, `INTEGER4x4`=65544 are all globals in the page.
- Feeding `F0 41 10 01 05 07 12 20 00 06 01 37 22 F7` (volume=55) to `$native.midi.event.message(msg, 0)` set `Parameter.value("PATCH%AMP%1")` to 55, the VOLUME knob showed 55, and no MIDI was sent out.
- `window.currentMIDIConnect` is `null` when no amp is connected.
- `PATCH%COLOR` offsets: 0 booster, 1 mod, 2 fx, 3 delay, 4 reverb (0=green,1=red,2=yellow). Variation blocks: booster `BOOSTER(c+1)`, mod `FX(c+1)`/`FX_DETAIL(c+1)`, fx `FX(c+4)`/`FX_DETAIL(c+4)`, delay `DELAY(c+1)`, delay2 `DELAY(c+4)` (assumed to follow the reverb color, verified in Task 8), reverb `REVERB(c+1)`.
- Amp type values: 0 ACOUSTIC, 1 CLEAN, 2 PUSHED, 3 CRUNCH, 4 LEAD, 5 BROWN (value 1 lit CLEAN in UI).
- Loading these BTS files in a Node `vm` context works with stubs `{ setInterval: () => 0, navigator: { language: 'en' }, $native: { midi: { event: {}, send } } }`, in order: `js/utilities/constant.js`, `js/utilities/converter.js`, `js/config/address_map.js`, `js/config/editor_setting.js`, `js/config/librarian_setting.js`, `js/config/product_setting.js`, `js/common/midi_controller.js`, `js/common/parameter.js`.

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, .gitignore, README.md
src/
  page-agent.ts   PAGE_AGENT_SOURCE string + agentCall(method, args) expression builder
  catalog.ts      enum tables, Leaf/Param types, buildParams, resolveChanges, describe
  cdp.ts          pickTarget, evaluateInBts (one-shot CDP session), BtsUnavailableError
  bts.ts          BtsClient interface + CdpBts implementation (status/index/read/write)
  launcher.ts     launch() with injectable deps
  tools.ts        registerKatanaTools(server, deps) — the 5 MCP tools
  index.ts        stdio entry
test/
  bts-sandbox.ts  loads real BTS scripts into a vm context (helper, not a test)
  page-agent.test.ts, catalog.test.ts, cdp.test.ts, launcher.test.ts, tools.test.ts
  e2e.test.ts     opt-in (KATANA_E2E=1) against the running app
scripts/
  Enable-KatanaClaude.ps1, Disable-KatanaClaude.ps1
skill/katana-tone/SKILL.md
```

---

### Task 1: Scaffold + BTS sandbox

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `test/bts-sandbox.ts`, `test/sandbox.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `createSandbox(): Sandbox` with `run<T>(code: string): T`, `incoming(msg: string): void`, `sent: string[]`; `btsInstalled: boolean`; `BTS_HTML: string`.

- [ ] **Step 1: Create project files**

`package.json`:
```json
{
  "name": "katana-claude",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "katana-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:e2e": "powershell -NoProfile -Command \"$env:KATANA_E2E='1'; npx vitest run test/e2e.test.ts\""
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.32.1",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  },
  "engines": { "node": ">=24" }
}
```
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 30000 } });
```

`.gitignore` (replace contents):
```
node_modules/
dist/
```

- [ ] **Step 2: Install**

Run: `npm install` in `D:\IMPORTRADER\repos\katana-claude`
Expected: exits 0, `node_modules/@modelcontextprotocol/sdk` exists.

- [ ] **Step 3: Write the sandbox helper**

`test/bts-sandbox.ts`:
```ts
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
```

- [ ] **Step 4: Write the sandbox test**

`test/sandbox.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { btsInstalled, createSandbox } from './bts-sandbox.js';

describe.skipIf(!btsInstalled)('BTS sandbox', () => {
  it('loads Parameter with factory defaults', () => {
    const sb = createSandbox();
    expect(sb.run('Parameter.value("PATCH%AMP%1", INTEGER1x7, 0)')).toBe(50);
  });

  it('routes an incoming DT1 into Parameter and notifies observers', () => {
    const sb = createSandbox();
    sb.run('globalThis.__seen = []; Parameter.addObserver({ notify: (b, f, t) => __seen.push([b, f, t]) })');
    sb.incoming('F0411001050712200006013722F7'); // PATCH%AMP volume = 55
    expect(sb.run('Parameter.value("PATCH%AMP%1", INTEGER1x7, 0)')).toBe(55);
    expect(sb.run('JSON.stringify(__seen)')).toBe('[["PATCH%AMP",1,2]]');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/sandbox.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore test/bts-sandbox.ts test/sandbox.test.ts
git commit -m "Scaffold project and BTS script sandbox for tests"
```

---

### Task 2: In-page agent

**Files:**
- Create: `src/page-agent.ts`, `test/page-agent.test.ts`

**Interfaces:**
- Consumes: `createSandbox` (Task 1).
- Produces:
  - `PAGE_AGENT_SOURCE: string` — idempotent IIFE that installs `window.__katanaClaude`.
  - `agentCall(method: 'index' | 'read' | 'write' | 'status', arg?: unknown): string` — a JS expression that installs the agent if needed and returns the method result.
  - Shapes returned by the agent (also exported as TS types):
    ```ts
    export interface Leaf { bid: string; pid: string; name: string; size: number; ofs: number; min: number; max: number }
    export interface AgentStatus { connected: boolean; patchName: string; colors: number[] }
    export interface WriteChange { pid: string; value: number }
    ```
    `index(): Leaf[]` (integer params of every `PATCH%<block>`), `read(pids: string[]): Record<string, number>`, `write(changes: WriteChange[]): Record<string, number>` (read-back), `status(): AgentStatus`.

- [ ] **Step 1: Write the failing test**

`test/page-agent.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { agentCall, type Leaf, PAGE_AGENT_SOURCE } from '../src/page-agent.js';
import { btsInstalled, createSandbox } from './bts-sandbox.js';

describe.skipIf(!btsInstalled)('page agent', () => {
  it('is idempotent', () => {
    const sb = createSandbox();
    sb.run(PAGE_AGENT_SOURCE);
    sb.run('window.__katanaClaude.marker = 1');
    sb.run(PAGE_AGENT_SOURCE);
    expect(sb.run('window.__katanaClaude.marker')).toBe(1);
  });

  it('indexes PATCH leaves with byte offsets as pid suffix', () => {
    const sb = createSandbox();
    const leaves = sb.run<Leaf[]>(agentCall('index'));
    const vol = leaves.find(l => l.bid === 'PATCH%AMP' && l.name === 'PRMID_PATCH_AMP_VOLUME');
    expect(vol).toMatchObject({ pid: 'PATCH%AMP%1', min: 0, max: 100, ofs: 0 });
    expect(leaves.some(l => l.bid === 'PATCH%BOOSTER(3)' && l.name === 'PRMID_PATCH_BOOSTER_DRIVE')).toBe(true);
    expect(leaves.some(l => l.name === 'PRMID_PATCH_COM_NAME')).toBe(false); // string param excluded
    expect(leaves.every(l => l.bid.startsWith('PATCH%'))).toBe(true);
  });

  it('reads values', () => {
    const sb = createSandbox();
    expect(sb.run(agentCall('read', ['PATCH%AMP%1', 'PATCH%AMP%7']))).toEqual({ 'PATCH%AMP%1': 50, 'PATCH%AMP%7': 1 });
  });

  it('writes: queues DT1 for the amp, updates UI observers, sends nothing extra', () => {
    const sb = createSandbox();
    sb.run('globalThis.__seen = []; Parameter.addObserver({ notify: (b, f, t) => __seen.push([b, f, t]) })');
    const out = sb.run(agentCall('write', [{ pid: 'PATCH%AMP%1', value: 12 }]));
    expect(out).toEqual({ 'PATCH%AMP%1': 12 });
    expect(sb.run('JSON.stringify(__seen)')).toBe('[["PATCH%AMP",1,2]]');
    expect(sb.run('MIDIController.fifoIsEmpty()')).toBe(false); // DT1 to amp queued
    expect(sb.sent).toEqual([]); // nothing echoed synchronously
  });

  it('writes multi-byte values with offset (delay time 4 nibbles, reverb time ofs -1)', () => {
    const sb = createSandbox();
    const out = sb.run(agentCall('write', [
      { pid: 'PATCH%DELAY(1)%1', value: 1234 },
      { pid: 'PATCH%REVERB(1)%2', value: 75 },
    ]));
    expect(out).toEqual({ 'PATCH%DELAY(1)%1': 1234, 'PATCH%REVERB(1)%2': 75 });
    expect(sb.run('Parameter.paramSet["PATCH%DELAY(1)"].slice(1, 5).join("")')).toBe('00040D02');
  });

  it('reports status', () => {
    const sb = createSandbox();
    expect(sb.run(agentCall('status'))).toEqual({ connected: false, patchName: 'KATANA', colors: [0, 0, 0, 0, 0] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/page-agent.test.ts`
Expected: FAIL — cannot find module `../src/page-agent.js`.

- [ ] **Step 3: Implement**

`src/page-agent.ts`:
```ts
export interface Leaf { bid: string; pid: string; name: string; size: number; ofs: number; min: number; max: number }
export interface AgentStatus { connected: boolean; patchName: string; colors: number[] }
export interface WriteChange { pid: string; value: number }

/**
 * Runs inside the BTS WebView page (plain ES5-ish JS, no imports).
 * Uses BTS globals: AddressMap, Parameter, $native, _7bitize, hex2, STX, ROLAND, DT1, EOX,
 * ProductSetting, INTEGER* size constants, currentMIDIConnect.
 */
export const PAGE_AGENT_SOURCE = String.raw`(function () {
  if (window.__katanaClaude && window.__katanaClaude.v === 1) return;
  var leaves = null, byPid = {};

  function bytesOf(size) {
    if (size === INTEGER2x4 || size === INTEGER2x7) return 2;
    if (size === INTEGER4x4) return 4;
    return 1;
  }

  function index() {
    if (leaves) return leaves;
    leaves = [];
    var root = new AddressMap().root;
    var patch = root.filter(function (b) { return b.name === 'PATCH'; })[0];
    patch.child.forEach(function (blk) {
      var bid = 'PATCH%' + blk.name;
      blk.child.forEach(function (p) {
        if (p.size < INTEGER1x1) return; // string params (patch name)
        var leaf = { bid: bid, pid: bid + '%' + p.addr, name: p.name, size: p.size, ofs: p.ofs, min: p.min, max: p.max };
        leaves.push(leaf);
        byPid[leaf.pid] = leaf;
      });
    });
    return leaves;
  }

  function leafOf(pid) {
    index();
    var l = byPid[pid];
    if (!l) throw new Error('unknown pid ' + pid);
    return l;
  }

  function read(pids) {
    var out = {};
    pids.forEach(function (pid) { var l = leafOf(pid); out[pid] = Parameter.value(pid, l.size, l.ofs); });
    return out;
  }

  // Replays the bytes now in Parameter's buffer as an incoming DT1, so BTS redraws the UI.
  function mirrorToUi(l) {
    var off = parseInt(l.pid.split('%').pop(), 10);
    var data = Parameter.paramSet[l.bid].slice(off, off + bytesOf(l.size)).join('');
    var addr = _7bitize(Parameter.getblock(l.bid).addr + off).toString(16).toUpperCase();
    while (addr.length < 8) addr = '0' + addr;
    var sum = 0, body = addr + data;
    for (var i = 0; i < body.length; i += 2) sum += parseInt(body.substr(i, 2), 16);
    var msg = STX + ROLAND + ProductSetting.deviceId + ProductSetting.modelId + DT1 + body + hex2((128 - (sum % 128)) & 0x7f) + EOX;
    $native.midi.event.message(msg, 0);
  }

  function write(changes) {
    var ls = changes.map(function (c) { return leafOf(c.pid); });
    changes.forEach(function (c, i) {
      Parameter.setValue(c.pid, ls[i].size, ls[i].ofs, c.value); // DT1 to the amp
      mirrorToUi(ls[i]);
    });
    return read(changes.map(function (c) { return c.pid; }));
  }

  function status() {
    var name = Parameter.paramSet['PATCH%COM'].map(function (h) { return String.fromCharCode(parseInt(h, 16)); }).join('').trim();
    var colors = [0, 1, 2, 3, 4].map(function (i) { return Parameter.value('PATCH%COLOR%' + i, INTEGER1x7, 0); });
    return { connected: window.currentMIDIConnect != null, patchName: name, colors: colors };
  }

  window.__katanaClaude = { v: 1, index: index, read: read, write: write, status: status };
})();`;

export function agentCall(method: 'index' | 'read' | 'write' | 'status', arg?: unknown): string {
  const args = arg === undefined ? '' : JSON.stringify(arg);
  return `${PAGE_AGENT_SOURCE}\nwindow.__katanaClaude.${method}(${args})`;
}
```

Note for the implementer: in the sandbox `window.currentMIDIConnect` is `undefined`, which `!= null` treats as disconnected — same as the live app's `null`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/page-agent.test.ts`
Expected: 6 passed. If the multi-byte test fails on `'00040D02'`, print `Parameter.paramSet["PATCH%DELAY(1)"]` and compare with `Parameter.convToHexArray(1234, INTEGER4x4)`; the agent must not change how `setValue` encodes.

- [ ] **Step 5: Commit**

```bash
git add src/page-agent.ts test/page-agent.test.ts
git commit -m "Add in-page agent: index, read, write with UI mirror, status"
```

---

### Task 3: Catalog (friendly keys, enums, variations, validation)

**Files:**
- Create: `src/catalog.ts`, `test/catalog.test.ts`

**Interfaces:**
- Consumes: `Leaf`, `WriteChange` from `src/page-agent.ts`; sandbox (tests only).
- Produces:
  ```ts
  export const SECTIONS: readonly string[]; // ['amp','booster','mod','fx','delay','delay2','reverb','ns','eq','solo','pedalfx','other']
  export const ENUMS: Record<string, readonly string[]>; // keyed by friendly key: 'amp.type','booster.type','mod.type','fx.type','delay.type','delay2.type','reverb.type'
  export interface Param { key: string; section: string; pid: string; name: string; min: number; max: number; options?: readonly string[]; boolean?: boolean }
  export function buildParams(leaves: Leaf[], colors: number[]): Param[];
  export class CatalogError extends Error { problems: string[] }
  export function resolveChanges(params: Param[], changes: Record<string, unknown>): (WriteChange & { key: string })[]; // throws CatalogError
  export function describe(params: Param[], values: Record<string, number>): Record<string, number | string | boolean>;
  ```

- [ ] **Step 1: Write the failing test**

`test/catalog.test.ts`:
```ts
import { describe as group, expect, it } from 'vitest';
import { buildParams, CatalogError, describe, ENUMS, resolveChanges } from '../src/catalog.js';
import { agentCall, type Leaf } from '../src/page-agent.js';
import { btsInstalled, createSandbox, readBtsFile } from './bts-sandbox.js';

const leaves = btsInstalled ? createSandbox().run<Leaf[]>(agentCall('index')) : [];
const green = [0, 0, 0, 0, 0];

group.skipIf(!btsInstalled)('catalog', () => {
  it('maps amp keys', () => {
    const p = buildParams(leaves, green).find(x => x.key === 'amp.volume');
    expect(p).toMatchObject({ pid: 'PATCH%AMP%1', min: 0, max: 100, section: 'amp' });
  });

  it('picks the variation block from PATCH%COLOR', () => {
    const red = buildParams(leaves, [1, 2, 1, 2, 1]);
    expect(red.find(x => x.key === 'booster.drive')!.pid).toBe('PATCH%BOOSTER(2)%1');
    expect(red.find(x => x.key === 'mod.type')!.pid).toBe('PATCH%FX(3)%0');
    expect(red.find(x => x.key === 'fx.type')!.pid).toBe('PATCH%FX(5)%0');
    expect(red.find(x => x.key === 'delay.time')!.pid).toBe('PATCH%DELAY(3)%1');
    expect(red.find(x => x.key === 'delay2.time')!.pid).toBe('PATCH%DELAY(5)%1');
    expect(red.find(x => x.key === 'reverb.type')!.pid).toBe('PATCH%REVERB(2)%0');
  });

  it('exposes on/off switches as booleans', () => {
    const p = buildParams(leaves, green);
    expect(p.find(x => x.key === 'booster.on')).toMatchObject({ pid: 'PATCH%SW%0', boolean: true });
    expect(p.find(x => x.key === 'delay2.on')).toMatchObject({ pid: 'PATCH%SW%4', boolean: true });
  });

  it('exposes MOD/FX detail params and EQ under prefixed keys', () => {
    const keys = buildParams(leaves, green).map(x => x.key);
    expect(keys.some(k => k.startsWith('mod.2x2chorus_'))).toBe(true);
    expect(keys.some(k => k.startsWith('fx.harmonist_'))).toBe(true);
    expect(keys).toContain('eq.peq_low_gain');
    expect(keys).toContain('eq.ge10_31hz');
    expect(keys).toContain('ns.threshold');
    expect(keys).toContain('other.chain');
  });

  it('enum sizes match the parameter ranges', () => {
    const p = buildParams(leaves, green);
    for (const [key, labels] of Object.entries(ENUMS)) {
      expect(labels.length, key).toBe(p.find(x => x.key === key)!.max + 1);
    }
  });

  it('booster/modfx/delay/reverb labels match BTS resource.js lists', () => {
    const res = readBtsFile('js/config/resource.js');
    for (const key of ['booster.type', 'mod.type', 'delay.type', 'reverb.type']) {
      expect(res, key).toContain(`{ text: "${ENUMS[key].join(', ')}" }`);
    }
  });

  it('resolves values, enum labels and booleans', () => {
    const p = buildParams(leaves, green);
    expect(resolveChanges(p, { 'amp.volume': 12, 'booster.type': 'blues drive', 'booster.on': true, 'amp.type': 'Lead' }))
      .toEqual([
        { key: 'amp.volume', pid: 'PATCH%AMP%1', value: 12 },
        { key: 'booster.type', pid: 'PATCH%BOOSTER(1)%0', value: 9 },
        { key: 'booster.on', pid: 'PATCH%SW%0', value: 1 },
        { key: 'amp.type', pid: 'PATCH%AMP%7', value: 4 },
      ]);
  });

  it('accepts raw PRMID names on the active variation', () => {
    const p = buildParams(leaves, [2, 0, 0, 0, 0]);
    expect(resolveChanges(p, { PRMID_PATCH_BOOSTER_DRIVE: 80 })).toEqual([{ key: 'booster.drive', pid: 'PATCH%BOOSTER(3)%1', value: 80 }]);
  });

  it('rejects all invalid changes together, never clamps', () => {
    const p = buildParams(leaves, green);
    try {
      resolveChanges(p, { 'amp.volume': 101, 'amp.nope': 1, 'booster.type': 'klon', 'amp.gain': 10.5 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogError);
      const msg = (e as CatalogError).problems.join('\n');
      expect(msg).toContain('amp.volume: 101 is out of range 0..100');
      expect(msg).toContain('amp.nope: unknown key');
      expect(msg).toContain('booster.type: unknown option "klon"');
      expect(msg).toContain('amp.gain: must be an integer');
    }
  });

  it('describes values with labels and booleans', () => {
    const p = buildParams(leaves, green).filter(x => ['amp.type', 'amp.volume', 'booster.on'].includes(x.key));
    expect(describe(p, { 'PATCH%AMP%7': 1, 'PATCH%AMP%1': 50, 'PATCH%SW%0': 0 }))
      .toEqual({ 'amp.type': 'CLEAN', 'amp.volume': 50, 'booster.on': false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/catalog.test.ts`
Expected: FAIL — cannot find module `../src/catalog.js`.

- [ ] **Step 3: Implement**

`src/catalog.ts`:
```ts
import type { Leaf, WriteChange } from './page-agent.js';

export const SECTIONS = ['amp', 'booster', 'mod', 'fx', 'delay', 'delay2', 'reverb', 'ns', 'eq', 'solo', 'pedalfx', 'other'] as const;

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

export interface Param {
  key: string; section: string; pid: string; name: string; min: number; max: number;
  options?: readonly string[]; boolean?: boolean;
}

interface Source { section: string; bid: string; prefix: string; keyPrefix?: string }

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
    { section: 'solo', bid: 'PATCH%SOLO_COM', prefix: 'PRMID_PATCH_SOLO_COM_' },
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
  const push = (key: string, section: string, l: Leaf) => {
    const p: Param = { key, section, pid: l.pid, name: l.name, min: l.min, max: l.max };
    if (ENUMS[key]) p.options = ENUMS[key];
    if (isBoolean(l, key)) p.boolean = true;
    out.push(p);
  };
  for (const s of sources(colors)) {
    for (const l of leaves) {
      if (l.bid !== s.bid || !l.name.startsWith(s.prefix)) continue;
      push(`${s.section}.${l.name.slice(s.prefix.length).toLowerCase()}`, s.section, l);
    }
  }
  for (const [key, name] of Object.entries(SWITCHES)) {
    const l = leaves.find(x => x.bid === 'PATCH%SW' && x.name === name);
    if (l) push(key, key.split('.')[0], l);
  }
  return out;
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
    const p = rawKey.startsWith('PRMID_')
      ? params.find(x => x.name === rawKey)
      : params.find(x => x.key === rawKey.toLowerCase());
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/catalog.test.ts`
Expected: all pass. If `enum sizes match` fails for a key, the label table is wrong for Gen 3 — fix the table from the live UI (open the type dropdown in BTS), do not change the test.

- [ ] **Step 5: Commit**

```bash
git add src/catalog.ts test/catalog.test.ts
git commit -m "Add parameter catalog: friendly keys, enums, variations, validation"
```

---

### Task 4: CDP client and BTS client

**Files:**
- Create: `src/cdp.ts`, `src/bts.ts`, `test/cdp.test.ts`

**Interfaces:**
- Consumes: `agentCall`, `Leaf`, `AgentStatus`, `WriteChange` (Task 2).
- Produces:
  ```ts
  // cdp.ts
  export interface CdpTarget { type: string; url: string; webSocketDebuggerUrl?: string }
  export class BtsUnavailableError extends Error {}
  export function pickTarget(list: CdpTarget[]): CdpTarget | undefined;
  export function evaluateInBts<T>(expression: string, port?: number): Promise<T>; // throws BtsUnavailableError
  export function btsReachable(port?: number): Promise<boolean>;
  // bts.ts
  export interface BtsClient {
    status(): Promise<AgentStatus>;
    index(): Promise<Leaf[]>;
    read(pids: string[]): Promise<Record<string, number>>;
    write(changes: WriteChange[]): Promise<Record<string, number>>;
  }
  export function createCdpBts(port?: number): BtsClient;
  ```

- [ ] **Step 1: Write the failing test**

`test/cdp.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cdp.test.ts`
Expected: FAIL — cannot find module `../src/cdp.js`.

- [ ] **Step 3: Implement**

`src/cdp.ts`:
```ts
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
```

`src/bts.ts`:
```ts
import { evaluateInBts } from './cdp.js';
import { agentCall, type AgentStatus, type Leaf, type WriteChange } from './page-agent.js';

export interface BtsClient {
  status(): Promise<AgentStatus>;
  index(): Promise<Leaf[]>;
  read(pids: string[]): Promise<Record<string, number>>;
  write(changes: WriteChange[]): Promise<Record<string, number>>;
}

export function createCdpBts(port = 9222): BtsClient {
  let leaves: Leaf[] | undefined; // the address map is static per BTS version
  return {
    status: () => evaluateInBts(agentCall('status'), port),
    index: async () => (leaves ??= await evaluateInBts<Leaf[]>(agentCall('index'), port)),
    read: pids => evaluateInBts(agentCall('read', pids), port),
    write: changes => evaluateInBts(agentCall('write', changes), port),
  };
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run test/cdp.test.ts` → 2 passed.
Run: `npx tsc -p tsconfig.json --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/cdp.ts src/bts.ts test/cdp.test.ts
git commit -m "Add CDP one-shot evaluate and BTS client"
```

---

### Task 5: Launcher

**Files:**
- Create: `src/launcher.ts`, `test/launcher.test.ts`

**Interfaces:**
- Consumes: `btsReachable` (Task 4).
- Produces:
  ```ts
  export const BTS_EXE: string;
  export interface LaunchDeps { isRunning(): Promise<boolean>; start(): void; reachable(): Promise<boolean>; sleep(ms: number): Promise<void> }
  export interface LaunchResult { ok: boolean; message: string }
  export function launch(deps?: LaunchDeps, timeoutMs?: number): Promise<LaunchResult>;
  ```

- [ ] **Step 1: Write the failing test**

`test/launcher.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/launcher.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`src/launcher.ts`:
```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/launcher.test.ts` → 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/launcher.ts test/launcher.test.ts
git commit -m "Add BTS launcher with debug port"
```

---

### Task 6: MCP tools and server entry

**Files:**
- Create: `src/tools.ts`, `src/index.ts`, `test/tools.test.ts`

**Interfaces:**
- Consumes: `BtsClient` (Task 4), `buildParams`, `resolveChanges`, `describe`, `CatalogError`, `SECTIONS` (Task 3), `launch`, `LaunchResult` (Task 5), `BtsUnavailableError` (Task 4).
- Produces:
  ```ts
  export interface ToolDeps { bts: BtsClient; launch(): Promise<LaunchResult> }
  export interface ToolResult { content: { type: 'text'; text: string }[]; isError?: boolean }
  export function createHandlers(deps: ToolDeps): {
    status(): Promise<ToolResult>;
    get(args: { sections?: string[] }): Promise<ToolResult>;
    set(args: { changes: Record<string, unknown> }): Promise<ToolResult>;
    listParams(args: { section: string }): Promise<ToolResult>;
    launch(): Promise<ToolResult>;
  };
  export function registerKatanaTools(server: McpServer, deps: ToolDeps): void;
  ```
  Every handler returns JSON text (`JSON.stringify(obj, null, 2)`); errors return `isError: true` with a plain message.

- [ ] **Step 1: Write the failing test**

`test/tools.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BtsClient } from '../src/bts.js';
import { BtsUnavailableError } from '../src/cdp.js';
import { agentCall, type Leaf, type WriteChange } from '../src/page-agent.js';
import { createHandlers } from '../src/tools.js';
import { btsInstalled, createSandbox } from './bts-sandbox.js';

/** BtsClient backed by the real BTS scripts in a vm sandbox. */
function sandboxBts(connected = true): BtsClient & { sb: ReturnType<typeof createSandbox> } {
  const sb = createSandbox();
  if (connected) sb.run('window.currentMIDIConnect = {}');
  return {
    sb,
    status: async () => sb.run(agentCall('status')),
    index: async () => sb.run<Leaf[]>(agentCall('index')),
    read: async (pids: string[]) => sb.run(agentCall('read', pids)),
    write: async (c: WriteChange[]) => sb.run(agentCall('write', c)),
  };
}
const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const noLaunch = async () => ({ ok: true, message: '' });

describe.skipIf(!btsInstalled)('tools', () => {
  it('get returns friendly values for requested sections', async () => {
    const h = createHandlers({ bts: sandboxBts(), launch: noLaunch });
    const out = json(await h.get({ sections: ['amp'] }));
    expect(out.amp).toMatchObject({ 'amp.type': 'CLEAN', 'amp.volume': 50 });
    expect(out.booster).toBeUndefined();
  });

  it('set writes, reads back and reports', async () => {
    const bts = sandboxBts();
    const h = createHandlers({ bts, launch: noLaunch });
    const out = json(await h.set({ changes: { 'amp.volume': 12, 'booster.type': 'BLUES DRIVE' } }));
    expect(out.applied).toEqual({ 'amp.volume': 12, 'booster.type': 'BLUES DRIVE' });
    expect(out.warnings).toEqual([]);
    expect(bts.sb.run('Parameter.value("PATCH%AMP%1", INTEGER1x7, 0)')).toBe(12);
  });

  it('set writes nothing when any change is invalid', async () => {
    const bts = sandboxBts();
    const h = createHandlers({ bts, launch: noLaunch });
    const r = await h.set({ changes: { 'amp.volume': 12, 'amp.gain': 500 } });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('amp.gain: 500 is out of range 0..100');
    expect(bts.sb.run('Parameter.value("PATCH%AMP%1", INTEGER1x7, 0)')).toBe(50);
  });

  it('set warns when no amp is connected', async () => {
    const h = createHandlers({ bts: sandboxBts(false), launch: noLaunch });
    const out = json(await h.set({ changes: { 'amp.volume': 20 } }));
    expect(out.warnings[0]).toContain('No KATANA is connected');
  });

  it('list_params shows ranges and options', async () => {
    const h = createHandlers({ bts: sandboxBts(), launch: noLaunch });
    const out = json(await h.listParams({ section: 'reverb' }));
    expect(out.find((p: { key: string }) => p.key === 'reverb.type').options).toContain('SPRING');
  });

  it('turns BtsUnavailableError into a readable tool error', async () => {
    const down: BtsClient = {
      status: async () => { throw new BtsUnavailableError('BOSS TONE STUDIO is not reachable'); },
      index: async () => [], read: async () => ({}), write: async () => ({}),
    };
    const r = await createHandlers({ bts: down, launch: noLaunch }).status();
    expect(r).toEqual({ isError: true, content: [{ type: 'text', text: 'BOSS TONE STUDIO is not reachable' }] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL — cannot find module `../src/tools.js`.

- [ ] **Step 3: Implement handlers and registration**

`src/tools.ts`:
```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { BtsClient } from './bts.js';
import { buildParams, CatalogError, describe, type Param, resolveChanges, SECTIONS } from './catalog.js';
import { BtsUnavailableError } from './cdp.js';
import type { LaunchResult } from './launcher.js';

export interface ToolDeps { bts: BtsClient; launch(): Promise<LaunchResult> }
export interface ToolResult { content: { type: 'text'; text: string }[]; isError?: boolean }

const ok = (obj: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (text: string): ToolResult => ({ isError: true, content: [{ type: 'text', text }] });
const COLOR = ['green', 'red', 'yellow'];

async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try { return await fn(); } catch (e) {
    if (e instanceof BtsUnavailableError || e instanceof CatalogError) return fail(e.message);
    throw e;
  }
}

export function createHandlers({ bts, launch }: ToolDeps) {
  async function params(): Promise<{ list: Param[]; connected: boolean; patchName: string; colors: number[] }> {
    const st = await bts.status();
    return { list: buildParams(await bts.index(), st.colors), ...st };
  }

  return {
    status: () => guard(async () => {
      const st = await bts.status();
      const names = ['booster', 'mod', 'fx', 'delay', 'reverb'];
      return ok({
        reachable: true,
        ampConnected: st.connected,
        patchName: st.patchName,
        activeVariation: Object.fromEntries(names.map((n, i) => [n, COLOR[st.colors[i]] ?? st.colors[i]])),
      });
    }),

    get: ({ sections }: { sections?: string[] }) => guard(async () => {
      const { list } = await params();
      const wanted = sections?.length ? list.filter(p => sections.includes(p.section)) : list;
      const values = await bts.read(wanted.map(p => p.pid));
      const out: Record<string, Record<string, unknown>> = {};
      for (const p of wanted) (out[p.section] ??= {});
      for (const [k, v] of Object.entries(describe(wanted, values))) out[k.split('.')[0]][k] = v;
      return ok(out);
    }),

    set: ({ changes }: { changes: Record<string, unknown> }) => guard(async () => {
      const { list, connected } = await params();
      const resolved = resolveChanges(list, changes); // throws before anything is written
      const back = await bts.write(resolved.map(({ pid, value }) => ({ pid, value })));
      const touched = list.filter(p => resolved.some(r => r.pid === p.pid));
      return ok({
        applied: describe(touched, back),
        warnings: connected ? [] : ['No KATANA is connected: BOSS TONE STUDIO shows the change, but the amp did not receive it.'],
      });
    }),

    listParams: ({ section }: { section: string }) => guard(async () => {
      const { list } = await params();
      return ok(list.filter(p => p.section === section)
        .map(({ key, min, max, options, boolean }) => ({ key, min, max, ...(options && { options }), ...(boolean && { boolean }) })));
    }),

    launch: () => guard(async () => {
      const r = await launch();
      return r.ok ? ok(r) : fail(r.message);
    }),
  };
}

export function registerKatanaTools(server: McpServer, deps: ToolDeps): void {
  const h = createHandlers(deps);
  const section = z.enum(SECTIONS);

  server.registerTool('katana_status', {
    description: 'Check that BOSS TONE STUDIO is reachable, whether a KATANA Gen 3 is connected, the current patch name and which variation (green/red/yellow) each effect shows.',
  }, () => h.status());

  server.registerTool('katana_launch', {
    description: 'Open BOSS TONE STUDIO with the debug port if it is not open yet, and wait until it is reachable.',
  }, () => h.launch());

  server.registerTool('katana_get', {
    description: 'Read the current tone from BOSS TONE STUDIO as friendly keys (amp.volume, booster.type, ...). Effects show the active variation.',
    inputSchema: { sections: z.array(section).optional().describe('Limit to these sections; omit for all') },
  }, args => h.get(args));

  server.registerTool('katana_set', {
    description: 'Set one or more parameters live (edit buffer, not saved to a patch). The BOSS TONE STUDIO UI updates immediately. ' +
      'Keys like amp.volume, amp.type ("LEAD"), booster.on (true/false), delay.time; use katana_list_params for ranges. All-or-nothing validation, no clamping.',
    inputSchema: { changes: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).describe('{ "amp.volume": 12, "booster.type": "BLUES DRIVE" }') },
  }, args => h.set(args));

  server.registerTool('katana_list_params', {
    description: 'List the keys of one section with their ranges and option names (for MOD/FX this includes every effect type\'s detail parameters).',
    inputSchema: { section },
  }, args => h.listParams(args));
}
```

`src/index.ts`:
```ts
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCdpBts } from './bts.js';
import { launch } from './launcher.js';
import { registerKatanaTools } from './tools.js';

const server = new McpServer({ name: 'katana', version: '0.1.0' });
registerKatanaTools(server, { bts: createCdpBts(), launch: () => launch() });
await server.connect(new StdioServerTransport());
```

- [ ] **Step 4: Run tests, type-check, build**

Run: `npx vitest run` → all suites pass.
Run: `npm run build` → `dist/index.js` exists, no TS errors. If `registerTool` rejects the raw shape types, wrap each `inputSchema` in nothing else — the 1.32.1 signature accepts `ZodRawShapeCompat`; check `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` before changing approach.

- [ ] **Step 5: Smoke the stdio server**

Run (Git Bash):
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | timeout 5 node dist/index.js
```
Expected: a `tools/list` response listing `katana_status`, `katana_launch`, `katana_get`, `katana_set`, `katana_list_params`.

- [ ] **Step 6: Commit**

```bash
git add src/tools.ts src/index.ts test/tools.test.ts
git commit -m "Add MCP tools and stdio server"
```

---

### Task 7: Debug-port scripts, registration, skill

**Files:**
- Create: `scripts/Enable-KatanaClaude.ps1`, `scripts/Disable-KatanaClaude.ps1`, `skill/katana-tone/SKILL.md`, `README.md`

**Interfaces:**
- Consumes: built `dist/index.js` (Task 6).
- Produces: registry policy value; MCP server `katana` registered in local scope for `D:\IMPORTRADER`; skill reachable at `D:\IMPORTRADER\.claude\skills\katana-tone`.

- [ ] **Step 1: Write the scripts**

`scripts/Enable-KatanaClaude.ps1`:
```powershell
# Opens the WebView2 debug port (127.0.0.1:9222) for BOSS TONE STUDIO for KATANA Gen 3 only.
# Takes effect the next time BOSS TONE STUDIO starts.
$key  = 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$name = 'BOSS TONE STUDIO for KATANA Gen 3.exe'
New-Item -Path $key -Force | Out-Null
New-ItemProperty -Path $key -Name $name -Value '--remote-debugging-port=9222' -PropertyType String -Force | Out-Null
Write-Output "Enabled. Restart BOSS TONE STUDIO if it is open."
```

`scripts/Disable-KatanaClaude.ps1`:
```powershell
$key  = 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$name = 'BOSS TONE STUDIO for KATANA Gen 3.exe'
if (Test-Path $key) { Remove-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue }
Write-Output "Disabled. Restart BOSS TONE STUDIO if it is open."
```

- [ ] **Step 2: Verify the scripts**

Run (PowerShell): `powershell -NoProfile -File scripts/Disable-KatanaClaude.ps1; reg query "HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments"`
Expected: the BTS value is absent.
Run: `powershell -NoProfile -File scripts/Enable-KatanaClaude.ps1; reg query "HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments"`
Expected: `BOSS TONE STUDIO for KATANA Gen 3.exe    REG_SZ    --remote-debugging-port=9222`.

- [ ] **Step 3: Write the skill**

`skill/katana-tone/SKILL.md`:
```markdown
---
name: katana-tone
description: Use when the user describes a guitar tone or asks to change BOSS KATANA Gen 3 amp/effect settings ("volume 12 yap", "80'ler hard rock lead", "biraz daha parlak", "delay ekle"). Drives the katana MCP tools; BOSS TONE STUDIO shows every change live.
---

# KATANA tone

Tools: `katana_status`, `katana_launch`, `katana_get`, `katana_set`, `katana_list_params` (MCP server `katana`).

## Workflow
1. `katana_status`. If it errors as not reachable → `katana_launch`, then `katana_status` again.
2. `katana_get` (all sections, or the ones you will touch).
3. Decide the change. Relative requests ("biraz daha", "less gain") are relative to step 2's values.
   Need a detail parameter (chorus rate, harmonist interval, ...)? `katana_list_params` for that section first.
4. One `katana_set` with every change together.
5. Reply in 2–4 lines: what changed (old → new) and why. If `warnings` says no amp is connected, say so.

## Rules
- Changes are live edits of the current patch. They are not saved; tell the user to press WRITE in BOSS TONE STUDIO (or on the amp) to keep them. Never claim it is saved.
- Effects edit the variation the panel currently shows (green/red/yellow, see `katana_status`).
- Turning an effect on: set both `<section>.on: true` and its type/levels.
- Values are integers within the listed range; types by name (`"amp.type": "LEAD"`, `"booster.type": "T-SCREAM"`).
- Keep volume changes moderate unless asked; never jump `amp.volume` by more than 20 in one step without the user asking.

## Section keys
amp (type, gain, volume, bass, middle, treble, presence, resonance, preamp_variation, poweramp_variation) ·
booster (on, type, drive, bottom, tone, effect_level, direct_mix, solo_sw, solo_level) ·
mod / fx (on, type, + `<type>_<param>` details) · delay / delay2 (on, type, time ms, feedback, high_cut, effect_level, direct_level, mod_rate, mod_depth) ·
reverb (on, type, time, pre_delay, low_cut, high_cut, density, effect_level, direct_level, spring_color) ·
ns (sw, threshold, release) · eq (sw, type, position, peq_*, ge10_*) · solo · pedalfx · other (chain, cabinet_resonance, master_key)

## Types
- Amp: ACOUSTIC, CLEAN, PUSHED, CRUNCH, LEAD, BROWN
- Booster: MID BOOST, CLEAN BOOST, TREBLE BOOST, CRUNCH OD, NATURAL OD, WARM OD, FAT DS, METAL DS, OCT FUZZ, BLUES DRIVE, OVERDRIVE, T-SCREAM, TURBO OD, DISTORTION, RAT, GUV DS, DST+, METAL ZONE, '60S FUZZ, MUFF FUZZ, HM-2, METAL CORE, CENTA OD
- MOD/FX: T.WAH, AUTO WAH, PEDAL WAH, COMP, LIMITER, GRAPHIC EQ, PARAMETRIC EQ, GUITAR SIM, SLOW GEAR, WAVE SYNTH, OCTAVE, PITCH SHIFTER, HARMONIST, AC.PROCESSOR, PHASER, FLANGER, TREMOLO, ROTARY, UNI-V, SLICER, VIBRATO, RING MOD, HUMANIZER, CHORUS, AC.GUITAR SIM, PHASER 90E, FLANGER 117E, WAH 95E, DC-30, HEAVY OCTAVE, PEDAL BEND
- Delay: DIGITAL, PAN, STEREO, ANALOG, TAPE ECHO, REVERSE, MODULATE, SDE-3000
- Reverb: PLATE, ROOM, HALL, SPRING, MODULATE

## Starting points (then adjust by ear with the user)
| Style | Amp | Gain | B/M/T | Booster | Mod/FX | Delay | Reverb |
|---|---|---|---|---|---|---|---|
| Clean jazz | CLEAN | 20 | 60/50/35 | off | off | off | ROOM 25 |
| Funk clean | CLEAN | 30 | 45/55/65 | off | COMP | off | ROOM 15 |
| Blues | CRUNCH | 45 | 55/60/50 | BLUES DRIVE drive 40 | off | ANALOG 350ms fb 20 lvl 25 | SPRING 30 |
| Classic rock | CRUNCH | 60 | 55/60/60 | T-SCREAM drive 30 | off | ANALOG 400ms lvl 20 | ROOM 25 |
| 80s hard rock lead | LEAD | 70 | 55/55/65 | T-SCREAM drive 20, tone +10 | CHORUS light | DIGITAL 450ms fb 30 lvl 30 | HALL 35 |
| Modern metal rhythm | BROWN | 75 | 60/40/60 | T-SCREAM drive 0, level high | off | off | ROOM 10, ns.sw on threshold 40 |
| Ambient | CLEAN | 25 | 50/50/55 | off | CHORUS | DIGITAL 600ms fb 50 lvl 40 + delay2 REVERSE | HALL 60 |
```

- [ ] **Step 4: Register MCP and link the skill (local to D:\IMPORTRADER)**

Run (from `D:\IMPORTRADER`):
```bash
claude mcp add katana -s local -- node D:/IMPORTRADER/repos/katana-claude/dist/index.js
claude mcp list
```
Expected: `katana` listed and connected.

Run (PowerShell):
```powershell
New-Item -ItemType Junction -Path 'D:\IMPORTRADER\.claude\skills\katana-tone' -Target 'D:\IMPORTRADER\repos\katana-claude\skill\katana-tone'
```
Expected: `D:\IMPORTRADER\.claude\skills\katana-tone\SKILL.md` readable.

- [ ] **Step 5: Write README**

`README.md`:
```markdown
# katana-claude

Claude Code MCP server + skill for BOSS KATANA Gen 3. Describe a tone; Claude sets the parameters through the original
BOSS TONE STUDIO app, and the app's UI shows every change live.

## Setup
1. `npm install && npm run build`
2. `powershell -File scripts/Enable-KatanaClaude.ps1` (opens the WebView2 debug port for BOSS TONE STUDIO only; undo with `Disable-KatanaClaude.ps1`)
3. From `D:\IMPORTRADER`: `claude mcp add katana -s local -- node D:/IMPORTRADER/repos/katana-claude/dist/index.js`
4. Link the skill: junction `D:\IMPORTRADER\.claude\skills\katana-tone` → `skill/katana-tone`

## How it works
The MCP connects to BOSS TONE STUDIO's page over CDP (127.0.0.1:9222), sets values with the app's own `Parameter.setValue`
(which sends SysEx DT1 to the amp) and replays the same DT1 into the app's MIDI-in handler so the knobs redraw.
Edits stay in the amp's edit buffer until you press WRITE.

## Tests
`npm test` (needs BOSS TONE STUDIO installed; reads its scripts from %LOCALAPPDATA%). `npm run test:e2e` with the app open.
```

- [ ] **Step 6: Commit**

```bash
git add scripts skill README.md
git commit -m "Add debug-port scripts, katana-tone skill and README"
```

---

### Task 8: End-to-end against the live app

**Files:**
- Create: `test/e2e.test.ts`

**Interfaces:**
- Consumes: `createCdpBts` (Task 4), `createHandlers` (Task 6), `launch` (Task 5).

- [ ] **Step 1: Write the opt-in e2e test**

`test/e2e.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createCdpBts } from '../src/bts.js';
import { launch } from '../src/launcher.js';
import { createHandlers } from '../src/tools.js';

const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe.skipIf(process.env.KATANA_E2E !== '1')('live BOSS TONE STUDIO', () => {
  it('launches or finds BTS', async () => {
    expect((await launch()).ok).toBe(true);
  });

  it('changes amp.volume by one and restores it', async () => {
    const h = createHandlers({ bts: createCdpBts(), launch: () => launch() });
    const before = json(await h.get({ sections: ['amp'] })).amp['amp.volume'] as number;
    const next = before === 100 ? 99 : before + 1;
    try {
      expect(json(await h.set({ changes: { 'amp.volume': next } })).applied['amp.volume']).toBe(next);
      expect(json(await h.get({ sections: ['amp'] })).amp['amp.volume']).toBe(next);
    } finally {
      await h.set({ changes: { 'amp.volume': before } });
    }
  });
});
```

- [ ] **Step 2: Run against the live app**

Precondition: `scripts/Enable-KatanaClaude.ps1` applied; BTS closed or opened normally after enabling.
Run: `npm run test:e2e`
Expected: 2 passed.

- [ ] **Step 3: Visual check (UI sync + delay2 color assumption)**

With BTS open, run in Claude Code (session started in `D:\IMPORTRADER`):
1. "volume'ü 12 yap" → VOLUME knob shows 12. Then "volume'ü 50 yap" to restore.
2. In BTS click the REVERB variation to red. Ask Claude "delay2 time'ı 600 yap". Open DLY2 in BTS: the red DELAY2 shows 600. If instead green or another color changed, change `delay2` in `src/catalog.ts` `sources()` to use `c[3]` (delay color), update the `picks the variation block` test expectation for `delay2.time` accordingly, rerun `npm test`, rebuild.
3. Restore what you changed.

- [ ] **Step 4: Commit**

```bash
git add test/e2e.test.ts
git commit -m "Add opt-in live e2e test"
```

- [ ] **Step 5: Manual acceptance with the user**

Ask the user to try one natural-language tone request (e.g. "80'ler hard rock lead tonu ver") with the amp connected, and confirm both the amp sound and the BTS UI changed.
```

