---
name: katana-tone
description: Use when the user describes a guitar tone or asks to change BOSS KATANA Gen 3 amp/effect settings ("volume 12 yap", "80'ler hard rock lead", "biraz daha parlak", "delay ekle"). Drives the katana MCP tools; BOSS TONE STUDIO shows every change live.
---

# KATANA tone

Tools: `katana_status`, `katana_launch`, `katana_connect`, `katana_get`, `katana_set`, `katana_list_params` (MCP server `katana`).

## Workflow
1. `katana_status`. If it errors as not reachable → `katana_launch`. If it reports `ampConnected: false` →
   `katana_connect`. Both answer BTS's "Connect with" dialog themselves and return only once the amp's patch is
   loaded, with `ampConnected` and `patchName`.
   Trust `katana_get` values only when `ampConnected` is `true`: until then BTS shows stale defaults (e.g.
   `amp.volume: 50`, patch name `"KATANA"`) rather than what the amp holds. If it comes back `false`, tell the user
   its `message` (e.g. amp off / USB unplugged) and ask before continuing (editing the cold/default patch).
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
- `*.high_cut`, `*.low_cut`, `*_freq`, `*_q`, `reverb.density`, `other.chain`, `other.cabinet_resonance`,
  `other.master_key`, `eq.type`, `eq.position`, `pedalfx.type` are list indexes (a position into a fixed option
  list), not Hz or ms values. `katana_list_params` gives only the min/max index for those params, not the option
  labels, so prefer leaving them unchanged unless the user specifically asks to change one.

## Section keys
amp (type, gain, volume, bass, middle, treble, presence, resonance, preamp_variation, poweramp_variation) ·
booster (on, type, drive, bottom, tone, effect_level, direct_mix, solo_sw, solo_level) ·
mod / fx (on, type, + `<type>_<param>` details) · delay / delay2 (on, type, time ms, feedback, high_cut, effect_level, direct_level, mod_rate, mod_depth) ·
reverb (on, type, time, pre_delay, low_cut, high_cut, density, effect_level, direct_level, spring_color) ·
ns (sw, threshold, release) · eq (sw, type, position, peq_*, ge10_*) · eq2 (same keys as eq) ·
solo (solo.sw, solo.effect_level, solo.eq_* [position, sw, low_cut, low_gain, mid_freq, mid_q, mid_gain, high_gain, high_cut, level], solo.delay_* [sw, carryover, time, feedback, effect_level, direct_level, filter, high_cut, mod_sw, mod_rate, mod_depth]) ·
pedalfx · other (chain, cabinet_resonance, master_key)

## Types
- Amp: ACOUSTIC, CLEAN, PUSHED, CRUNCH, LEAD, BROWN
- Booster: MID BOOST, CLEAN BOOST, TREBLE BOOST, CRUNCH OD, NATURAL OD, WARM OD, FAT DS, METAL DS, OCT FUZZ, BLUES DRIVE, OVERDRIVE, T-SCREAM, TURBO OD, DISTORTION, RAT, GUV DS, DST+, METAL ZONE, '60S FUZZ, MUFF FUZZ, HM-2, METAL CORE, CENTA OD
- MOD/FX: T.WAH, AUTO WAH, PEDAL WAH, COMP, LIMITER, GRAPHIC EQ, PARAMETRIC EQ, GUITAR SIM, SLOW GEAR, WAVE SYNTH, OCTAVE, PITCH SHIFTER, HARMONIST, AC.PROCESSOR, PHASER, FLANGER, TREMOLO, ROTARY, UNI-V, SLICER, VIBRATO, RING MOD, HUMANIZER, CHORUS, AC.GUITAR SIM, PHASER 90E, FLANGER 117E, WAH 95E, DC-30, HEAVY OCTAVE, PEDAL BEND
- Delay: DIGITAL, PAN, STEREO, ANALOG, TAPE ECHO, REVERSE, MODULATE, SDE-3000
- Reverb: PLATE, ROOM, HALL, SPRING, MODULATE

## Starting points (then adjust by ear with the user)
| Style | Amp | Gain | B/M/T | Booster | Mod/FX | Delay | Reverb |
|---|---|---|---|---|---|---|---|
| Clean jazz | CLEAN | 20 | 60/50/35 | off | off | off | reverb.type ROOM, reverb.effect_level 25 |
| Funk clean | CLEAN | 30 | 45/55/65 | off | mod.type COMP | off | reverb.type ROOM, reverb.effect_level 15 |
| Blues | CRUNCH | 45 | 55/60/50 | booster.type BLUES DRIVE, booster.drive 40 | off | delay.type ANALOG, delay.time 350, delay.feedback 20, delay.effect_level 25 | reverb.type SPRING, reverb.effect_level 30 |
| Classic rock | CRUNCH | 60 | 55/60/60 | booster.type T-SCREAM, booster.drive 30 | off | delay.type ANALOG, delay.time 400, delay.effect_level 20 | reverb.type ROOM, reverb.effect_level 25 |
| 80s hard rock lead | LEAD | 70 | 55/55/65 | booster.type T-SCREAM, booster.drive 20, booster.tone 10 | mod.type CHORUS, defaults | delay.type DIGITAL, delay.time 450, delay.feedback 30, delay.effect_level 30 | reverb.type HALL, reverb.effect_level 35 |
| Modern metal rhythm | BROWN | 75 | 60/40/60 | booster.type T-SCREAM, booster.drive 0, booster.effect_level 80 | off | off | reverb.type ROOM, reverb.effect_level 10, ns.sw on, ns.threshold 40 |
| Ambient | CLEAN | 25 | 50/50/55 | off | mod.type CHORUS | delay.type DIGITAL, delay.time 600, delay.feedback 50, delay.effect_level 40, delay2.on true, delay2.type REVERSE | reverb.type HALL, reverb.effect_level 60 |
