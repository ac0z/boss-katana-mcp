# PR draft — not submitted

Title: **Add experimental KATANA-50 Gen 1 MIDI backend with explicit hardware gates**

## What changed

The server previously depended on Gen 3 BTS's WebView2/PID model, so it could not
use the operator's original KATANA-50 directly. This change adds a separately
selected `KATANA_BACKEND=gen1` MIDI path with seven `katana_gen1_*` tools while
preserving the default six Gen 3 tools and all existing Gen 3 implementations.

The Gen 1 adapter discovers a unique KATANA port pair, checks the observed Roland
identity plus operator model attestation, and reads 20 source-evidenced raw
parameters (9 require explicit research intent). Strict SysEx/checksum/response
validation, command serialization, a timeout fault latch and opt-in temporary
gain 95/96 write/readback infrastructure are included. Hardware is disabled by
default; physical writes require additional startup opt-ins. Volume, effects,
patch save and firmware writes are blocked.

The optional MIT native MIDI dependency is lazy-loaded. Local C#/PowerShell or
Roland code is not copied. Source references, hashes, compatibility limits and a
separate hardware plan are documented.

## How it was tested

- [x] `npm run build` — PASS, Node 24.14.1 on Windows.
- [x] `npm test` — 116 PASS, 49 SKIPPED (48 BTS sandbox; 1 hardware e2e).
- [x] `npm run test:gen1` — 95 PASS; pure vectors, mock transport/native classes,
  concurrent commands, readback failures, late replies and actual MCP SDK calls.
- [x] `npm audit --omit=dev` — zero known vulnerabilities at validation time.
- [x] Original runnable Gen 3 tests remain passing; default tool registration and
  status/connect are also checked with a mock BTS client.
- [ ] Tried on a real amp — **NOT RUN**. No port opened or hardware test executed.
- [ ] Full installed-BTS Gen 3 sandbox and physical regression — **SKIPPED**.

Security review outcome and final validation evidence are in
[`gen1-validation.md`](gen1-validation.md).

## Known limitations

Experimental and hardware-unverified. Observed identity and USB PID do not prove
the 50 submodel; operator confirmation is required. Firmware and full ranges are
unknown. PANEL codes are not active DSP settings, and reads are not atomic patch
snapshots. Gain support is restricted to one observed raw pair and leaves the
requested temporary value in place; it is not the local project's restore test.
Readback cannot distinguish a same-address unsolicited DT1 from a solicited reply.
Fragmented SysEx, cross-process ownership and driver-hang behavior need hardware
qualification. An uncertain transaction locks the session until USB reconnect and
server restart, with no retry or automatic recovery write.

This draft is prepared for operator review. No upstream PR has been opened.
