# PR draft â€” not submitted

Title: **Add experimental KATANA-50 Gen 1 MIDI controls and a guarded metal-tone tool**

The original KATANA-50 cannot use the server's Gen 3 WebView2/PID backend. This
adds a separately selected `KATANA_BACKEND=gen1` MIDI adapter with eight isolated
`katana_gen1_*` tools; the six default Gen 3 tools and their implementations remain
unchanged. Hardware and writes are disabled by default.

The adapter discovers a unique KATANA pair, checks the observed Roland identity
plus operator model attestation, reads 32 raw fields and permits source-bounded
writes only to 16 effective controls. It rejects system/panel, arbitrary-address,
patch-save and firmware writes. Strict framing/checksum/readback validation,
serialization, bounded sends and an irreversible uncertainty latch prevent
automatic retries or rollback after a questionable transaction.

`katana_gen1_apply_tone` defaults to a zero-I/O metal preview. Applying requires
`dryRun:false`, a connection and separate write/low-MASTER startup opt-ins. It
backs up all fields, reduces effective LEVEL to zero, verifies every target and
finishes at a non-increasing LEVEL, default at most 5. General LEVEL writes are
capped at 10; this is a software policy, not an acoustic safety guarantee.

Source facts come from the operator's earlier evidence, pinned installed BTS
definitions and attributed original protocol measurements. No unlicensed local
implementation or proprietary Roland asset is copied. The requested delay/reverb extension also supports wet levels 0..30; raw 15
for both effects passed readback with LEVEL unchanged at 5. The optional MIDI runtime
dependency is MIT; no dependency was added for the tone extension.

Validation:

- `npm run build`: **PASS**.
- `npm test`: **139 PASS, 49 SKIPPED**; original runnable Gen 3 checks pass.
- `npm run test:gen1`: **118 PASS**, including real SDK/mock integrations.
- `npm audit --omit=dev`: zero reported vulnerabilities.
- Static BTS definition checks: **PASS**, no device access.
- Initial read-only physical session: **PASS**, 20 addresses / 23 RQ1, zero DT1.
- Later explicitly approved metal session: **PASS**, identity + 70 RQ1 + nine
  effective DT1 writes, exact target readback, LEVEL 28â†’0â†’5 and clean disconnect.
  Six unchanged fields skipped writes. Retained raw traces and independent
  offline verifiers support both sessions.
- Four offline tamper variants rejected. Original local source/evidence hashes
  remain unchanged. Current extension received a manual static safety/security
  review; the earlier automated security scan predates this extension.
- Installed Gen 3 BTS sandbox/live e2e: **SKIPPED** (48 + 1 tests).
- Audible quality, persistence, other firmware/models, range endpoints, physical
  fault injection and effect enabling: **UNVERIFIED / NOT RUN**.

Identity cannot establish the exact physical submodel or firmware. Reads and tone
edits are sequential, not atomic; unsolicited same-address DT1 can resemble a
read response. Fragmented messages, driver hangs and cross-process ownership
need qualification. An interrupted tone can leave partial state; original values,
completed steps and the failing stage are reported, with no recovery write.

See [validation](gen1-validation.md), [source and write policy](gen1-write-support.md)
and [the approved session report](gen1-hardware-metal-2026-10-23.md).
This draft awaits operator review. **No upstream PR has been opened.**
