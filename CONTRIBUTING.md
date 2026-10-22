# Contributing

Thanks for wanting to help! Issues and pull requests are welcome, big or small.

## Where help is welcome

- **Other KATANA models.** Only the KATANA-50 EX Gen 3 has been tested. Reports from other Gen 3 amps are useful
  even when everything works.
- **Tone recipes.** The starting points in [`skill/katana-tone/SKILL.md`](skill/katana-tone/SKILL.md) can always
  get better: new styles, better values, clearer explanations.
- **Skill evals.** [`skill/katana-tone/evals/`](skill/katana-tone/evals) holds test cases for the skill (a prompt
  plus graders). New cases for tricky requests are welcome.
- **Other agents.** If you use the server with an MCP client other than Claude Code, Codex CLI or Gemini CLI, a
  short setup note for the README helps the next person.
- **macOS.** BOSS TONE STUDIO also exists for macOS; the server is Windows-only today (launcher, debug-port policy).

Issues labelled [`good first issue`](https://github.com/dogakocak/boss-katana-mcp/labels/good%20first%20issue) are
a good place to start.

## Setup

You need Windows, Node.js 24+, and BOSS TONE STUDIO for KATANA Gen 3 installed and **started at least once**, so
its UI bundle is extracted to `%LOCALAPPDATA%\Roland\BOSS TONE STUDIO for KATANA Gen 3\html\`.

```powershell
npm install
npm run build
npm test
```

- `npm test` runs the unit tests. They load BOSS TONE STUDIO's installed scripts into a sandbox, so no amp is
  needed, but the app must be installed.
- `npm run test:e2e` runs against a running BOSS TONE STUDIO with an amp connected. It moves `amp.volume` of the
  current patch by one step and sets it back.

Never copy Roland's files into the repository; tests always read them from the local installation.

## Pull requests

- Keep a PR to one change, and say in the description how you tested it (unit tests, on a real amp, which CLI).
- Run `npm run build` and `npm test` before opening it.
- Commit messages: short, in English, imperative (`Add chorus rate to the catalog`).
- README images are generated: change `assets/src/build.py` and run `python assets/src/build.py` (Pillow +
  Microsoft Edge) rather than editing the PNGs.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
