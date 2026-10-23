# Gen 1 contribution validation

Date: 2026-10-23 (Europe/Istanbul). Windows, Node v24.14.1, Vitest v4.1.12.
Base: upstream/main `56b6d13786be00e31db650c3923bf047726f5ad9`.
Branch: `feat/katana-gen1-support`.

| Check | Result | Evidence / limits |
| --- | --- | --- |
| Baseline build | PASS | Before source changes |
| Baseline test suite | PASS / SKIPPED | 21 passed; 49 skipped |
| `npm run build` | PASS | Final source compiled without diagnostics |
| `npm test` | PASS / SKIPPED | 116 passed; 49 skipped, 165 total |
| `npm run test:gen1` | PASS | 95 offline tests across three files |
| Original runnable Gen 3 tests | PASS | Same 21 original tests pass |
| Gen 3 installed-BTS sandbox | SKIPPED | 48 tests; Gen 3 UI assets absent |
| Gen 3 live e2e | SKIPPED | 1 test; hardware/write opt-in not enabled |
| New Gen 3 mocked/default registration regression | PASS | Included in backend tests |
| Gen 1 physical reads/writes/reconnect | SKIPPED | No device I/O performed |
| Historical local evidence verification | PASS | Offline verifier rechecked 23 transactions / 20 addresses / 46 audit records; SHA-256 AE5F5663418DFB1493230CAF6752FFB19B629B9E7F270869A139FA8517725239 |
| `npm audit --omit=dev` | PASS | Zero reported known vulnerabilities |
| `git diff --check` | PASS | No whitespace errors |
| Source/dependency license review | PASS with scope limit | MIT upstream, MIT native library/RtMidi, MIT native helper dependencies and 0BSD tslib; unlicensed local source not copied; no Roland assets copied |
| Security diff scan | PENDING | Separate review follows the implementation commits |

No skipped tests are counted as successful. No Gen 1 hardware compatibility is
established by passing mocks or the old TONEFORGE evidence. Tests use only fake
backends; real native MIDI import/driver operation was not exercised.

`musicplayer` started with all project files untracked, no remotes and no tracked
diff. The new checkout started clean. The 24 consulted source/evidence hashes
are retained in `gen1-source-manifest.json` for later read-only comparison.

## Changed files

- Added `src/gen1/{protocol,parameters,adapter,native-midi,tools}.ts`.
- Added `src/backend.ts`; changed only startup routing in `src/index.ts`.
- Added `test/gen1.test.ts`, `test/gen1-native.test.ts`, `test/backend.test.ts`.
- Updated `package.json` and its lockfile for the optional MIDI dependency and test script.
- Updated README and added Gen 1 architecture, compatibility, test-plan, source
  manifest, validation and unsubmitted PR-description documents.

No existing Gen 3 source module other than the entry-point registration changed.
