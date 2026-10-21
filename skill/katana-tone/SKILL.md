---
name: katana-tone
description: Use when the user describes a guitar tone or asks to change BOSS KATANA Gen 3 amp/effect settings ("volume 12 yap", "80'ler hard rock lead", "biraz daha parlak", "delay ekle"). Drives the katana MCP tools; BOSS TONE STUDIO shows every change live.
---

# KATANA tone

Tools: `katana_status`, `katana_launch`, `katana_get`, `katana_set`, `katana_list_params` (MCP server `katana`).

## Workflow
1. `katana_status`. If it errors as not reachable → `katana_launch`, then `katana_status` again.
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
| Clean jazz | CLEAN | 20 | 60/50/35 | off | off | off | ROOM 25 |
| Funk clean | CLEAN | 30 | 45/55/65 | off | COMP | off | ROOM 15 |
| Blues | CRUNCH | 45 | 55/60/50 | BLUES DRIVE drive 40 | off | ANALOG 350ms fb 20 lvl 25 | SPRING 30 |
| Classic rock | CRUNCH | 60 | 55/60/60 | T-SCREAM drive 30 | off | ANALOG 400ms lvl 20 | ROOM 25 |
| 80s hard rock lead | LEAD | 70 | 55/55/65 | T-SCREAM drive 20, tone +10 | CHORUS light | DIGITAL 450ms fb 30 lvl 30 | HALL 35 |
| Modern metal rhythm | BROWN | 75 | 60/40/60 | T-SCREAM drive 0, level high | off | off | ROOM 10, ns.sw on threshold 40 |
| Ambient | CLEAN | 25 | 50/50/55 | off | CHORUS | DIGITAL 600ms fb 50 lvl 40 + delay2 REVERSE | HALL 60 |
