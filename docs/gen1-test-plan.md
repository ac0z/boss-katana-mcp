# Gen 1 test plan

## Automated offline checks

Run `npm run build` and `npm test`. All new tests inject in-memory backends or
native constructors and never import/open a real MIDI device. Existing Gen 3 e2e
remains opt-in; **do not run `npm run test:e2e` as part of this plan**: it writes
amp volume. Do not set `KATANA_E2E=1` during offline checks.

`test/gen1.test.ts` covers captured RQ1/DT1 vectors and checksum edge cases,
integer/7-bit/size validation, exact device/model/address/length matching,
identity rejection, raw two-byte decoding, all 20 permitted reads, explicit
research gating, volume/effect write rejection and the gain 95/96 window.
Mock integrations cover default-disabled I/O, missing model attestation,
ambiguous/missing ports, unsupported identity, readback mismatch, unplug errors,
timeout/late replies, queued command rejection, concurrent command serialization,
clean reconnect and irreversible fault lock. No full patch or firmware test exists.

`test/gen1-native.test.ts` injects native classes to cover enumeration cleanup,
partial-open failure, SysEx configuration, listener-before-send, listener removal,
send errors, timeout, close cancellation and process-wide ownership.

`test/backend.test.ts` checks default Gen 3 tool registration, unchanged mocked
Gen 3 status/connect handlers, isolated Gen 1 registration and invalid backend
rejection. The original Gen 3 suites remain intact. Their BTS sandbox tests skip
when the Gen 3 UI bundle is absent; skips must never be reported as passes.

## Manual hardware qualification — NOT RUN / requires separate approval

There is no automatic hardware runner in this contribution. Perform each stage
only with the operator's explicit approval for that stage and retain raw TX/RX,
model label, driver/Node/native dependency versions and timestamps as evidence.

1. Confirm physical KATANA-50 Gen 1 label, firmware if discoverable without
   changing it, driver and USB cabling. Close BTS, TONEFORGE and other MIDI clients.
2. Approve read-only testing. Enable hardware and physical-model startup gates;
   leave both write gates absent. Discover ports, connect once, record identity.
   Verify a different model or ambiguous ports fail before any RQ1/DT1.
3. Read AmpType/PanelGain/Volume individually and compare raw frames with the
   device's current state. Read research addresses only by explicit operator
   request; do not assume a full patch snapshot or active effect semantics.
4. Approve unplug/reconnect testing. Unplug during a read; prove timeout releases
   resources, locks queued commands and sends no retries. Inspect state, reconnect
   USB and restart the server. Confirm clean disconnect/reconnect separately.
5. Only after a separate **explicit write approval**, set physical MASTER low,
   retain original gain and confirm it is raw 95 or 96. Enable both write gates,
   request one adjacent temporary gain value and inspect RQ1 readback. If the
   operator approves restoration, request the original value and verify again.
   Stop immediately on mismatch or uncertainty; no automated recovery writes.
6. Separately qualify delayed unsolicited messages, fragmented SysEx, duplicate
   notifications, long driver calls and cross-process WinMM ownership. These are
   known limitations of this initial transport, not already-passed tests.

Patch save, volume writes, firmware updates and broad range sweeps are excluded.
Gen 3 hardware regression also requires separate approval and is SKIPPED here.

## Run evidence

Baseline before implementation: build PASS; 21 tests PASS, 49 SKIPPED. The skipped
tests require the Gen 3 BTS installation (48) or opt-in hardware e2e (1). This
machine has the older Tone Studio, not the Gen 3 sandbox bundle. Historical
TONEFORGE 934/934 checks and physical 23/23 reads are source evidence, not tests
executed by this change. See `gen1-validation.md` for final run results.
