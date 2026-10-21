# katana-claude — Design

Date: 2026-10-21
Status: approved in conversation, pending spec review

## Goal

Describe a guitar tone to Claude Code in natural language ("80s hard rock lead",
"volume 12 yap") and have Claude set the BOSS KATANA Gen 3 parameters, with the
running BOSS TONE STUDIO (BTS) app showing every change live — the same knob
moves in the UI as if the user had turned it.

The BTS UI itself is not modified.

## Findings this design relies on

Observed on BTS for KATANA Gen 3, appVersion 1.1.0, bundle `B_26`:

- The exe is a ~450 KB WebView2 shell. The whole UI is an HTML/JS bundle stored
  as PE resource `ZHTML/BUNDLE`, extracted once to
  `%LOCALAPPDATA%\Roland\BOSS TONE STUDIO for KATANA Gen 3\html\` and loaded
  from there as `file:///…/html/index.html` (confirmed via DevTools target list).
- Launching the exe with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
  exposes a Chrome DevTools Protocol (CDP) endpoint on 127.0.0.1:9222. The BTS
  page is the target whose URL starts with `file:///` and ends `/html/index.html`.
  A second target (bosstoneexchange.com) also exists and must be ignored.
- `js/common/parameter.js` exports `window.Parameter`:
  - `Parameter.value(pid, size, ofs)` reads a value.
  - `Parameter.setValue(pid, size, ofs, value)` writes the in-page buffer and
    sends a Roland SysEx DT1 to the amp via `MIDIController.dt1`. It does **not**
    notify UI observers.
  - Its private `_receiver` handles incoming DT1: updates the buffer and calls
    every observer's `notify(bid, from, to)`, which redraws the UI.
- `js/common/midi_controller.js` exports `window.MIDIController` and routes
  incoming MIDI from `$native.midi.event.message(msg, timestamp)` to receivers,
  including `Parameter`'s `_receiver`.
- `js/config/address_map.js` defines `AddressMap` (global constructor): 1034
  parameters, each with `addr`, `size`, `ofs`, `min`, `max`, `name`
  (e.g. `PRMID_PATCH_AMP_VOLUME`, 0–100). `pid` format is
  `<block path joined by %>%<offset>`, e.g. `PATCH%AMP%1`.
- Root blocks: `PATCH` (0x20000000) is the edit buffer of the current patch;
  `PATCH(1..10)` are stored patches; `SYSTEM`, `TEMP`, `COMMAND` also exist.
- Variation blocks: `BOOSTER(1..3)`, `FX(1..3)` (MOD), `FX(4..6)` (FX),
  `DELAY(1..3)`, `DELAY(4..6)` (DELAY2), `REVERB(1..3)`, selected by
  `PATCH%COLOR` (0 = green, 1 = red, 2 = yellow) — see
  `ktn_mk2_model.js` TypeConverter table.
- `js/config/resource.js` holds the display names for enum values
  (amp types, booster types, MOD/FX types, delay types, reverb types).

## Architecture

```
Claude Code ──stdio──▶ katana-mcp (Node 24, TypeScript)
                          │ CDP over WebSocket, 127.0.0.1:9222
                          ▼
                     BTS WebView2 page ── window.Parameter / MIDIController
                          │ USB MIDI (owned by BTS)
                          ▼
                       KATANA Gen 3
```

Repo: `D:\IMPORTRADER\repos\katana-claude`

```
src/
  cdp.ts          CDP client: find BTS target, Runtime.evaluate with JSON in/out
  page-agent.ts   JS source injected into the page (resolve, read, write, sync UI)
  catalog.ts      friendly name ⇄ PRMID mapping, enum label tables, variation logic
  tools.ts        MCP tool definitions and handlers
  index.ts        MCP stdio server entry
skill/katana-tone/SKILL.md   tone knowledge + workflow for Claude
scripts/Start-Katana.ps1     launcher with debug port
test/                        vitest unit + opt-in e2e smoke
```

Only Node built-ins plus `@modelcontextprotocol/sdk` and `zod`. Node 24's global
`WebSocket` is used for CDP; no `chrome-remote-interface`.

## Units

### cdp.ts
- `connect()`: GET `http://127.0.0.1:9222/json/list`, pick the page target whose
  `url` starts with `file:///` and ends with `/html/index.html`; open its
  `webSocketDebuggerUrl`.
- `evaluate<T>(expression)`: `Runtime.evaluate` with `returnByValue: true`,
  `awaitPromise: true`; throws on `exceptionDetails`.
- Reconnects on each tool call if the socket is closed (app restarted).

### page-agent.ts
A single self-contained JS function string, installed once per page load as
`window.__katanaClaude` (re-installed if missing). Runs inside BTS. Responsibilities:
- `index()`: walk `new AddressMap().root` and return
  `{ pid, name, size, ofs, min, max }` for every leaf under `PATCH` (edit buffer)
  and the `PATCH%COLOR` block.
- `read(pids)`: `Parameter.value(pid, size, ofs)` for each.
- `write(changes)`: for each `{pid, value}`:
  1. `Parameter.setValue(pid, size, ofs, value)` → DT1 to amp.
  2. Build the identical DT1 SysEx string and pass it to the app's own incoming
     handler `$native.midi.event.message(msg, 0)` so `_receiver` updates the
     buffer and notifies UI observers.
  Returns the read-back values.
- `status()`: whether a MIDI device is connected (from the app's connection
  state), current patch name (`PATCH%COM` name field).

Step 2 is the UI-sync mechanism. Implementation must verify early (first plan
task, against the running app) that feeding the DT1 into the incoming path both
redraws the knob and does not echo a second DT1 out to the amp. If it does not
redraw, fallback: call the editor's refresh for the affected block (to be located
in `common/editor.js` / `ktn_mk2_model.js`).

### catalog.ts
- Friendly keys → PRMID names, scoped to what a tone needs:
  `amp.{type,gain,volume,bass,middle,treble,presence,resonance,preamp_variation,poweramp_variation}`,
  `booster.{on,type,drive,bottom,tone,effect_level,direct_mix}`,
  `mod.{on,type,…}`, `fx.{on,type,…}`, `delay.{on,type,time,feedback,effect_level,…}`,
  `delay2.*`, `reverb.{on,type,time,effect_level,…}`, `ns.*`, `eq.*`, `chain`.
  The exact per-effect detail parameters (FX_DETAIL blocks) are derived from
  `address_map.js` names at runtime rather than hand-listed.
- Enum labels: amp type, booster type, MOD/FX type, delay type, reverb type taken
  from the `resource.js` lists, matched case-insensitively ("blues drive" →
  index 9).
- Variation: for booster/mod/fx/delay/delay2/reverb, read `PATCH%COLOR` and pick
  the matching `(n)` block so edits land on the variation the UI is showing.
- Raw escape hatch: any key starting with `PRMID_` is accepted as-is.

### tools.ts (MCP tools)
| Tool | Input | Output |
|---|---|---|
| `katana_status` | — | app reachable, amp connected, patch name, active colors |
| `katana_get` | optional `blocks[]` | current tone in friendly keys with enum labels |
| `katana_set` | `{ changes: { key: value } }` | applied values (read back) + warnings |
| `katana_list_params` | `block` | keys, ranges, enum options for that block |

`katana_set` validates every change before writing any; on one invalid change,
nothing is written (all-or-nothing at validation level).

### skill/katana-tone
- Trigger: user describes a tone or asks to change amp/effect settings.
- Workflow: `katana_status` → `katana_get` → decide changes → one `katana_set`
  → short summary of what changed and why.
- Contains a compact tone cookbook (amp type / gain / EQ / booster / mod / delay /
  reverb starting points per genre) and the KATANA type lists.
- Relative requests ("biraz daha parlak") are applied relative to `katana_get`.

### scripts/Start-Katana.ps1
Sets `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` for the
child process only and starts the BTS exe. Optional desktop shortcut creation.
If BTS is already running without the port, tell the user to close it first.

## Error handling

- Port closed / no BTS target → "BTS is not running with the debug port; start it
  with Start-Katana.ps1".
- Amp not connected → still allow UI edits, return a warning that the amp did not
  receive them.
- Unknown key, unknown enum label, out-of-range value → reject with the valid
  range/options; never clamp silently.
- Page reloaded → agent re-installed transparently.

## Out of scope (v1)

- Writing to stored patches (`PATCH(1..10)`), patch selection, librarian, Tone
  Exchange.
- SYSTEM block (global EQ, line out, MIDI settings).
- Direct MIDI without BTS.
- Any change to BTS files or the exe.

## Testing

- Unit (vitest): catalog resolution, enum matching, variation selection, value
  validation and DT1 string building — run against the real `address_map.js` /
  `resource.js` read from the installed BTS folder in `%LOCALAPPDATA%` (loaded in
  a `vm` context; tests skip if BTS is not installed). Roland's files are never
  copied into this repo.
- E2E smoke (opt-in, `KATANA_E2E=1`): with BTS running via the launcher, read
  `amp.volume`, set it to value±1, read back through `Parameter.value`, restore.
- Manual acceptance: "volume'ü 12 yap" in Claude Code → the VOLUME knob in BTS
  shows 12 and the amp's volume changes.
