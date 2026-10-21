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
