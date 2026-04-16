# Movement Controller Issues

**Date:** 2026-01-21
**Updated:** 2026-01-22
**Status:** DMX sending FIXED, visualization still broken
**File:** `controller_work.html`

---

## Summary

~~The lysekrone movement tab has fundamental issues: **tiltX/tiltY values are never sent to DMX**.~~

**FIXED (2026-01-22):** TILT/TURN channels are now sent to DMX. Brake control now uses DMX SPEED channel (not Crestron CIP).

**REMAINING ISSUE:** The visualization doesn't accurately represent how tilted rings look in real life. Needs on-site observation to understand the real appearance, then update the rendering math.

---

## Physical Mechanism (for context)

Each lysekrone ring has:
- 3 motors (winches) with wires at 120° intervals
- DMX channels: SPEED, TILT coarse/fine, TURN coarse/fine, DROP coarse/fine
- TILT + TURN = two axes of tilt (rings tilt, they do NOT rotate)
- DROP = height (all 3 wires together)

The fixture internally converts TILT/TURN/DROP → individual motor movements. We don't control motors directly.

---

## Issues Found

### 1. ~~tiltX/tiltY Never Sent to DMX~~ — FIXED

**FIXED 2026-01-22:** `getMotorChannels()` now returns all motor channels including tilt/turn. `sendMovementCommand()` converts tiltX/tiltY to DMX values (±30 → 0-255, center=127) and sends them.

```javascript
// Now returns:
return {
  universe: config.universe,
  speed: ringBase,
  tilt: ringBase + 1,
  tiltFine: ringBase + 2,
  turn: ringBase + 3,
  turnFine: ringBase + 4,
  drop: ringBase + 5,
  dropFine: ringBase + 6
};
```

### 2. ~~Tilt Presets Only Send Height Differences~~ — FIXED

**FIXED 2026-01-22:** With Issue #1 fixed, tilt presets now send tiltX/tiltY values to TILT/TURN DMX channels. Needs on-site testing to verify the actual physical result.

### 3. Cone Presets May Be Mislabeled

The code comments reference CueCore channels:
```javascript
'cone': {
  // CueCore2 CONE: ch105=218(85%), ch122=171(67%), ch139=126(49%)
```

But ch105, ch122, ch139 are **TURN fine** channels (offset +4), not DROP channels!

The CueCore "cone" preset used TURN to create the cone shape. Our controller uses DROP (height). This may explain why the visual result differs.

### 4. ~~SPEED is Hardcoded~~ — RESOLVED

**RESOLVED 2026-01-22:** SPEED channel controls the electromagnetic brake:
- SPEED = 0: Brake ENGAGED (holds position)
- SPEED = 255: Brake RELEASED (motors can run)

The Room Brake buttons now properly control SPEED via DMX:
- Room A/B/C buttons send SPEED to all 6 rings in that room
- Channels: 101, 118, 135, 156, 173, 190 per universe (U6/U7/U8)

This replaces the broken Crestron CIP integration that tried to use joins 53-55.

### 5. Visualization Doesn't Match Reality

Cameron observed:
- In the visualizer, rings appear tilted for tilt presets
- In real life, rings are parallel to horizon (no tilt) because tilt values aren't sent
- Even if tilt WERE sent, the visualization model may not accurately represent how the physical fixtures look

---

## Cameron's Test Observations

| Preset | Expected | Actual Result |
|--------|----------|---------------|
| All Up | Rings go up | Works |
| All Down | Rings go down | Works |
| Cone | Inner low, outer high | **Reversed** from preview |
| Inv Cone | Inner high, outer low | **Reversed** from preview |
| Tilt 1 | Galaxy shape (tilted rings) | **Cone shape** (rings parallel, just different heights) |
| Tilt 2 | Galaxy shape (tilted rings) | **Cone shape** (rings parallel, just different heights) |

---

## What Needs to Be Fixed

### ~~Priority 1: Send TILT/TURN to DMX~~ — DONE ✓

### Priority 2: Figure Out TILT/TURN Mapping — ON-SITE TESTING NEEDED

Need to verify on-site:
- What direction does TILT control?
- What direction does TURN control?
- What DMX value = what angle?

Test procedure:
- Set TILT to 255, TURN to 0 → observe which way ring tilts
- Set TILT to 0, TURN to 255 → observe which way ring tilts

### Priority 3: Fix Visualization — CURRENT FOCUS

The visualization system (`drawRingArc()` function) doesn't accurately represent how tilted rings look in real life.

**What we know:**
- Visualization uses tiltX/tiltY to render tilted ellipses
- Physical rings tilt via 3-wire differential mechanism
- The visual representation doesn't match the physical appearance

**Approach:**
1. Test on-site with TILT/TURN sending (now working)
2. Observe what tilted rings actually look like
3. Update `drawRingArc()` math to match reality

### Priority 4: Verify Cone Preset Direction

Check if "cone" and "inv-cone" labels are backwards compared to visual expectation.

---

## Ignore For Now

- **M1/M2/M3 sliders** - "Quarter-baked feature" per Cameron. These don't map to how the DMX fixture actually works.

---

## Files Reference

| File | What |
|------|------|
| `controller_work.html` | Main controller with movement tab |
| `JBT B, 02 Nov.xml` | CueCore2 backup with working presets |
| `docs/LYSEKRONER.md` | Physical mechanism documentation |
| `docs/TODO.md` | TODO #8 has on-site verification steps |

---

## Next Steps

1. ~~Update `getMotorChannels()` to include tilt/turn~~ — DONE ✓
2. ~~Update `sendMovementCommand()` to send tilt/turn values~~ — DONE ✓
3. On-site: Verify TILT/TURN axis mapping (TODO #8)
4. On-site: Observe what tilted rings actually look like
5. Update visualization (`drawRingArc()`) to match physical behavior (TODO #9)
