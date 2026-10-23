# Experimental Gen 1 temporary tone writes

2026-10-23. The operator requested a metal tone, explicitly approved hardware
writes and confirmed low physical MASTER. This authorizes this manual session;
normal startup still disables hardware and writes. Patch save and firmware
operations remain unavailable. Hardware results are recorded separately, never
inferred from these source definitions or the offline tests.

## Source evidence

The installed **original** BTS 4.0.0 `temporary` address map names the effective
preamp and effect controls below. Its SHA-256 is
`57714a40077d200f2cf55e4869b7c0475dcb24a996c77bb54655a2d2131bd7e4`.
The SWF SHA-256 is
`28674f980ae8c854b6888138d86d22c65bfbcc8007d80ae85b89f065b2350480`.
`ParameterDefinitionGT` initializer, method 14165 at FWS `0x910b04`, supplies
explicit id/min/max/step definitions. [Retained decoded facts](gen1-tone-source-evidence.json)
include exact offsets. `python scripts/Verify-Gen1ToneSource.py` independently
decodes the pinned ABC string pool and checks these operands and map entries;
it never runs the SWF, launches BTS or accesses MIDI.

| Effective control | Address | Source raw bounds | Write policy |
| --- | --- | --- | --- |
| TemporaryAmpType | 60 00 00 51 | Default codes 1/8/11/24/23 | Acoustic/Clean/Crunch/Lead/Brown only |
| TemporaryGain | 60 00 00 52 | 0..120 | Integer raw DSP value |
| TemporaryBass/Middle/Treble/Presence | 60 00 00 54/55/56/57 | 0..100 | Integer raw DSP values |
| TemporaryLevel | 60 00 00 58 | 0..100 in editor | Software ceiling **10** |
| BoosterOn / ModOn | 60 00 00 30 / 60 00 01 40 | 0=off, 1=on | Boolean raw codes |
| FxOn / DelayOn / ReverbOn | 60 00 03 4C / 60 00 05 60 / 60 00 06 10 | 0=off, 1=on | Boolean raw codes |
| NoiseSuppressorOn / Threshold | 60 00 06 63 / 64 | 0/1 and 0..100 | Independent raw controls |

The [original Katana-50 amp-type measurements](https://raw.githubusercontent.com/katana-dev/docs/master/tables/amp-types.md)
identify the five default effective algorithms and their different panel codes;
Brown is effective **23**, panel **4**. Those measurements cite firmware 1.0.2;
this device's firmware is unknown. The operator's historical block capture also
contained effective 23 while the UI showed Brown. This does not qualify hidden
amp models or every default model on this device.

[Hirsch's original Katana measurements](https://raw.githubusercontent.com/snhirsch/katana-midi-bridge/master/doc/katana_sysex.txt)
document effective effect-toggle codes and the noise-gate bounds. They were made
on a Katana-100 and corroborate the installed map; they are not new Katana-50
hardware evidence. Toggle addresses refer to their respective effect ranges;
enabling one does not configure its algorithm or guarantee it is audible.

No C#/PowerShell implementation, original inspection helper, proprietary SWF,
address-map asset or third-party library source is copied into this contribution.
The new verifier and TypeScript controls are independent implementations of
protocol facts. No new runtime dependency is added.

## MCP contract and behavior

`katana_gen1_set {key,value}` now supports only the bounded effective fields
above. All panel/system addresses remain read-only. Both write startup gates,
hardware enablement, physical-model confirmation and a live verified connection
are required. Each write pre-reads and validates the current raw value, sends at
most one DT1 and demands exact RQ1 readback. Unchanged values skip DT1.

`katana_gen1_apply_tone {name:"metal"}` defaults to **dryRun=true**, returning a
plan with no device I/O. `dryRun:false` applies this starting sound:

Brown/SLDN; raw Gain 85, Bass 60, Middle 40, Treble 65, Presence 45;
Booster/Mod/FX/Delay/Reverb off; NS1 on, Threshold 55.

The whole operation occupies the adapter queue. It pre-reads all 14 original
fields before writing, reduces effective LEVEL to zero, verifies each change
and checks LEVEL stayed zero, then verifies every tone target again. Finally it
sets LEVEL to `min(previous LEVEL, outputLevel)`; outputLevel defaults to 5 and
must be 0..10. A previous zero remains zero. No panel-volume conversion is used.

**The numerical ceiling is a conservative application policy, not an acoustic
safety guarantee.** Keep physical MASTER low; model-switch behavior can still
affect output before a later read detects it. Incoming values outside source
bounds, a timeout, checksum/address error, LEVEL drift or a readback mismatch
stop and lock the session. There is no automatic retry, unmute or rollback.
Partial failures report the original values, completed steps and failing stage.
Reads and multi-parameter edits are sequential, not atomic snapshots/transactions;
do not operate physical controls or another MIDI client during application.

`savedToPatch:false` means no save command was sent; power-cycle persistence and
audible tone quality have not been established. There is no general patch-write,
hidden-amp, arbitrary-address or firmware endpoint. Gen 3 remains unchanged.

## Manual session harness

After a fresh build, **only with current operator approval**, low physical MASTER,
the correct physical model and other MIDI clients closed:

```powershell
node scripts/Apply-Gen1Metal.mjs NEW_EVIDENCE_DIRECTORY --write-approved --low-master-confirmed
```

This invokes the actual MCP SDK over stdio, previews the plan, discovers/connects,
applies it once and disconnects. It is not registered in npm tests or automation.
The native-send guard admits only the exact approved tone values, LEVEL 0..5,
the corresponding single-byte reads and one identity request; repeated writes,
unapproved frames and raising LEVEL before verified tone values are blocked.
Each raw RX and native-send attempt/return is synchronously journalled and flushed.
The report records source/build hashes, original values, calls, results and errors.
Its authorization flags must never be enabled on behalf of an absent operator.
