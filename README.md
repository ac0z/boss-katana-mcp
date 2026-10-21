# katana-claude

Claude Code MCP server + skill for BOSS KATANA Gen 3. Describe a tone; Claude sets the parameters through the original
BOSS TONE STUDIO app, and the app's UI shows every change live.

## Setup
1. `npm install; npm run build` (PowerShell 5.1: `&&` is not available, so this uses `;`; in Git Bash `npm install && npm run build` also works)
2. `powershell -File scripts/Enable-KatanaClaude.ps1` (opens the WebView2 debug port for BOSS TONE STUDIO only; undo with `Disable-KatanaClaude.ps1`)
3. From `D:\IMPORTRADER`: `claude mcp add katana -s local -- node D:/IMPORTRADER/repos/katana-claude/dist/index.js`
4. Link the skill: junction `D:\IMPORTRADER\.claude\skills\katana-tone` → `skill/katana-tone`

## How it works
The MCP connects to BOSS TONE STUDIO's page over CDP (127.0.0.1:9222), sets values with the app's own `Parameter.setValue`
(which sends SysEx DT1 to the amp) and replays the same DT1 into the app's MIDI-in handler so the knobs redraw.
Edits stay in the amp's edit buffer until you press WRITE.

## Security
`scripts/Enable-KatanaClaude.ps1` sets a per-app WebView2 policy, so BOSS TONE STUDIO always opens its DevTools debug
port on `127.0.0.1:9222` — not just while this MCP server is attached. While BOSS TONE STUDIO is open, any local
process (any user, any program) can connect to that port and drive the app the same way this server does. The port
is also a shared, well-known default, so it can clash with another tool that expects to use 9222 for its own
debugging. Run `scripts/Disable-KatanaClaude.ps1` to remove the policy and restart BOSS TONE STUDIO when you don't
need the MCP server.

## Tests
`npm test` (needs BOSS TONE STUDIO installed; reads its scripts from %LOCALAPPDATA%). `npm run test:e2e` with the app open.
