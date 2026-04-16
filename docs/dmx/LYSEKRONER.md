# Lysekroner (Chandeliers) - Complete DMX Reference

**Source:** GrandMA3 fixture profile (authoritative) + verified controller code
**Last Verified:** 2026-01-21

---

## Overview

6 lysekroner (Bright TheOrbit), 2 per room. Bespoke fixtures — no others exist.

### Physical Construction
- **3 concentric rings** per chandelier
- **IMPORTANT:** DMX ring numbering is INVERTED from physical size:
  - DMX Ring 1 (ch 101-117 / 156-172) = Physical **OUTER** ring (largest)
  - DMX Ring 2 (ch 118-134 / 173-189) = Physical **MIDDLE** ring
  - DMX Ring 3 (ch 135-151 / 190-206) = Physical **INNER** ring (smallest)
- **3 motors per ring** (9 motors total per chandelier)
- Each motor is a **winch** that spools a wire in or out
- **3 wires per ring**, attached at 120° intervals around the top circumference
- This creates a 3-point suspension allowing each ring to tilt in any direction

### Lighting
- **6 LED strips** (2 per ring) — RGBW + Dimmer
- **3 globe bulbs** (1 per ring) — Dimmer only

### DMX
- **55 channels total** per lysekrone

---

## Fixture Locations

| Lysekrone | Room | Position (facing stage) | Universe |
|-----------|------|-------------------------|----------|
| 1 | Sal A | Left | U6 |
| 2 | Sal A | Right | U6 |
| 3 | Sal B | Left | U7 |
| 4 | Sal B | Right | U7 |
| 5 | Sal C | Left | U8 |
| 6 | Sal C | Right | U8 |

---

## Ring Channel Structure

Each ring has 17 channels:
- **7 motor channels:** SPEED, TILT (2), TURN (2), DROP (2)
- **10 LED channels:** 2 strips × 5 channels (R, G, B, W, Dimmer)

After the 3 rings (51 channels), there are:
- **3 globe bulb dimmers** (1 per ring)
- **1 dummy channel** (padding)

Total: 51 + 3 + 1 = **55 channels**

---

## Lysekrone 1 (Sal A Left) — U6

| DMX Ring | Physical | SPEED | DROP | LED Strip 1 | LED Strip 2 | Globe |
|----------|----------|-------|------|-------------|-------------|-------|
| 1 | Outer | 101 | 106 | 108–112 | 113–117 | 152 |
| 2 | Middle | 118 | 123 | 125–129 | 130–134 | 153 |
| 3 | Inner | 135 | 140 | 142–146 | 147–151 | 154 |

Full range: **6.101 – 6.155**

---

## Lysekrone 2 (Sal A Right) — U6

| DMX Ring | Physical | SPEED | DROP | LED Strip 1 | LED Strip 2 | Globe |
|----------|----------|-------|------|-------------|-------------|-------|
| 1 | Outer | 156 | 161 | 163–167 | 168–172 | 207 |
| 2 | Middle | 173 | 178 | 180–184 | 185–189 | 208 |
| 3 | Inner | 190 | 195 | 197–201 | 202–206 | 209 |

Full range: **6.156 – 6.210**

---

## Lysekrone 3 (Sal B Left) — U7

| DMX Ring | Physical | SPEED | DROP | LED Strip 1 | LED Strip 2 | Globe |
|----------|----------|-------|------|-------------|-------------|-------|
| 1 | Outer | 101 | 106 | 108–112 | 113–117 | 152 |
| 2 | Middle | 118 | 123 | 125–129 | 130–134 | 153 |
| 3 | Inner | 135 | 140 | 142–146 | 147–151 | 154 |

Full range: **7.101 – 7.155**

---

## Lysekrone 4 (Sal B Right) — U7

| DMX Ring | Physical | SPEED | DROP | LED Strip 1 | LED Strip 2 | Globe |
|----------|----------|-------|------|-------------|-------------|-------|
| 1 | Outer | 156 | 161 | 163–167 | 168–172 | 207 |
| 2 | Middle | 173 | 178 | 180–184 | 185–189 | 208 |
| 3 | Inner | 190 | 195 | 197–201 | 202–206 | 209 |

Full range: **7.156 – 7.210**

---

## Lysekrone 5 (Sal C Left) — U8

| DMX Ring | Physical | SPEED | DROP | LED Strip 1 | LED Strip 2 | Globe |
|----------|----------|-------|------|-------------|-------------|-------|
| 1 | Outer | 101 | 106 | 108–112 | 113–117 | 152 |
| 2 | Middle | 118 | 123 | 125–129 | 130–134 | 153 |
| 3 | Inner | 135 | 140 | 142–146 | 147–151 | 154 |

Full range: **8.101 – 8.155**

---

## Lysekrone 6 (Sal C Right) — U8

| DMX Ring | Physical | SPEED | DROP | LED Strip 1 | LED Strip 2 | Globe |
|----------|----------|-------|------|-------------|-------------|-------|
| 1 | Outer | 156 | 161 | 163–167 | 168–172 | 207 |
| 2 | Middle | 173 | 178 | 180–184 | 185–189 | 208 |
| 3 | Inner | 190 | 195 | 197–201 | 202–206 | 209 |

Full range: **8.156 – 8.210**

---

## Detailed Channel Layout Per Ring

Each ring follows this structure (offsets from ring start):

**Motor Channels (7):**
| Offset | Function | Notes |
|--------|----------|-------|
| +0 | SPEED | 0 = brake ON, >0 = brake OFF + motor runs |
| +1 | TILT coarse | Tilt axis 1 (differential wire lengths) |
| +2 | TILT fine | 16-bit precision with coarse |
| +3 | TURN coarse | Tilt axis 2 — not rotation (misleading name) |
| +4 | TURN fine | 16-bit precision with coarse |
| +5 | DROP coarse | Height: 0 = up, 255 = down |
| +6 | DROP fine | 16-bit precision with coarse |

**LED Strip 1 (5):**
| Offset | Function |
|--------|----------|
| +7 | Red |
| +8 | Green |
| +9 | Blue |
| +10 | White |
| +11 | Dimmer (must be >0 for output) |

**LED Strip 2 (5):**
| Offset | Function |
|--------|----------|
| +12 | Red |
| +13 | Green |
| +14 | Blue |
| +15 | White |
| +16 | Dimmer (must be >0 for output) |

---

## Per-Channel Function List

**Note:** DMX Ring 1 = Physical Outer, DMX Ring 2 = Physical Middle, DMX Ring 3 = Physical Inner

### Base 101 (Lysekroner 1, 3, 5)

| Ch | DMX Ring | Physical | Function |
|----|----------|----------|----------|
| 101 | 1 | Outer | SPEED (0=brake ON, >0=motor runs) |
| 102 | 1 | Outer | TILT coarse  |
| 103 | 1 | Outer | TILT fine  |
| 104 | 1 | Outer | TURN coarse  |
| 105 | 1 | Outer | TURN fine  |
| 106 | 1 | Outer | DROP coarse (0=up, 255=down) |
| 107 | 1 | Outer | DROP fine |
| 108 | 1 | Outer | Strip 1 Red |
| 109 | 1 | Outer | Strip 1 Green |
| 110 | 1 | Outer | Strip 1 Blue |
| 111 | 1 | Outer | Strip 1 White |
| 112 | 1 | Outer | Strip 1 Dimmer |
| 113 | 1 | Outer | Strip 2 Red |
| 114 | 1 | Outer | Strip 2 Green |
| 115 | 1 | Outer | Strip 2 Blue |
| 116 | 1 | Outer | Strip 2 White |
| 117 | 1 | Outer | Strip 2 Dimmer |
| 118 | 2 | Middle | SPEED |
| 119 | 2 | Middle | TILT coarse  |
| 120 | 2 | Middle | TILT fine  |
| 121 | 2 | Middle | TURN coarse  |
| 122 | 2 | Middle | TURN fine  |
| 123 | 2 | Middle | DROP coarse |
| 124 | 2 | Middle | DROP fine |
| 125 | 2 | Middle | Strip 1 Red |
| 126 | 2 | Middle | Strip 1 Green |
| 127 | 2 | Middle | Strip 1 Blue |
| 128 | 2 | Middle | Strip 1 White |
| 129 | 2 | Middle | Strip 1 Dimmer |
| 130 | 2 | Middle | Strip 2 Red |
| 131 | 2 | Middle | Strip 2 Green |
| 132 | 2 | Middle | Strip 2 Blue |
| 133 | 2 | Middle | Strip 2 White |
| 134 | 2 | Middle | Strip 2 Dimmer |
| 135 | 3 | Inner | SPEED |
| 136 | 3 | Inner | TILT coarse  |
| 137 | 3 | Inner | TILT fine  |
| 138 | 3 | Inner | TURN coarse  |
| 139 | 3 | Inner | TURN fine  |
| 140 | 3 | Inner | DROP coarse |
| 141 | 3 | Inner | DROP fine |
| 142 | 3 | Inner | Strip 1 Red |
| 143 | 3 | Inner | Strip 1 Green |
| 144 | 3 | Inner | Strip 1 Blue |
| 145 | 3 | Inner | Strip 1 White |
| 146 | 3 | Inner | Strip 1 Dimmer |
| 147 | 3 | Inner | Strip 2 Red |
| 148 | 3 | Inner | Strip 2 Green |
| 149 | 3 | Inner | Strip 2 Blue |
| 150 | 3 | Inner | Strip 2 White |
| 151 | 3 | Inner | Strip 2 Dimmer |
| 152 | — | Outer | Globe Dimmer |
| 153 | — | Middle | Globe Dimmer |
| 154 | — | Inner | Globe Dimmer |
| 155 | — | — | (dummy/padding) |

### Base 156 (Lysekroner 2, 4, 6)

| Ch | DMX Ring | Physical | Function |
|----|----------|----------|----------|
| 156 | 1 | Outer | SPEED (0=brake ON, >0=motor runs) |
| 157 | 1 | Outer | TILT coarse  |
| 158 | 1 | Outer | TILT fine  |
| 159 | 1 | Outer | TURN coarse  |
| 160 | 1 | Outer | TURN fine  |
| 161 | 1 | Outer | DROP coarse (0=up, 255=down) |
| 162 | 1 | Outer | DROP fine |
| 163 | 1 | Outer | Strip 1 Red |
| 164 | 1 | Outer | Strip 1 Green |
| 165 | 1 | Outer | Strip 1 Blue |
| 166 | 1 | Outer | Strip 1 White |
| 167 | 1 | Outer | Strip 1 Dimmer |
| 168 | 1 | Outer | Strip 2 Red |
| 169 | 1 | Outer | Strip 2 Green |
| 170 | 1 | Outer | Strip 2 Blue |
| 171 | 1 | Outer | Strip 2 White |
| 172 | 1 | Outer | Strip 2 Dimmer |
| 173 | 2 | Middle | SPEED |
| 174 | 2 | Middle | TILT coarse  |
| 175 | 2 | Middle | TILT fine  |
| 176 | 2 | Middle | TURN coarse  |
| 177 | 2 | Middle | TURN fine  |
| 178 | 2 | Middle | DROP coarse |
| 179 | 2 | Middle | DROP fine |
| 180 | 2 | Middle | Strip 1 Red |
| 181 | 2 | Middle | Strip 1 Green |
| 182 | 2 | Middle | Strip 1 Blue |
| 183 | 2 | Middle | Strip 1 White |
| 184 | 2 | Middle | Strip 1 Dimmer |
| 185 | 2 | Middle | Strip 2 Red |
| 186 | 2 | Middle | Strip 2 Green |
| 187 | 2 | Middle | Strip 2 Blue |
| 188 | 2 | Middle | Strip 2 White |
| 189 | 2 | Middle | Strip 2 Dimmer |
| 190 | 3 | Inner | SPEED |
| 191 | 3 | Inner | TILT coarse  |
| 192 | 3 | Inner | TILT fine  |
| 193 | 3 | Inner | TURN coarse  |
| 194 | 3 | Inner | TURN fine  |
| 195 | 3 | Inner | DROP coarse |
| 196 | 3 | Inner | DROP fine |
| 197 | 3 | Inner | Strip 1 Red |
| 198 | 3 | Inner | Strip 1 Green |
| 199 | 3 | Inner | Strip 1 Blue |
| 200 | 3 | Inner | Strip 1 White |
| 201 | 3 | Inner | Strip 1 Dimmer |
| 202 | 3 | Inner | Strip 2 Red |
| 203 | 3 | Inner | Strip 2 Green |
| 204 | 3 | Inner | Strip 2 Blue |
| 205 | 3 | Inner | Strip 2 White |
| 206 | 3 | Inner | Strip 2 Dimmer |
| 207 | — | Outer | Globe Dimmer |
| 208 | — | Middle | Globe Dimmer |
| 209 | — | Inner | Globe Dimmer |
| 210 | — | — | (dummy/padding) |

---

## Ring Start Addresses

| Lysekrone | Outer (DMX 1) | Middle (DMX 2) | Inner (DMX 3) |
|-----------|---------------|----------------|---------------|
| 1 (U6) | 101 | 118 | 135 |
| 2 (U6) | 156 | 173 | 190 |
| 3 (U7) | 101 | 118 | 135 |
| 4 (U7) | 156 | 173 | 190 |
| 5 (U8) | 101 | 118 | 135 |
| 6 (U8) | 156 | 173 | 190 |

---

## Motor Control

### Physical Mechanism

Each ring is suspended by 3 wires at 120° intervals. The DMX channels control the 3 motors (winches) abstractly:

| Channel | Function | Physical Effect |
|---------|----------|-----------------|
| SPEED | Brake control | 0 = brake ON, >0 = brake OFF + motors run |
| DROP | Height | All 3 wires in/out together (0 = up, 255 = down) |
| TILT | Tilt enable | 0 = flat (no tilt), 255 = maximum tilt amount |
| TURN | Tilt direction | Rotates which motor is lowest (see table below) |

**TILT + TURN together:** TILT controls the amount of tilt, TURN controls the direction. Rings do not rotate/spin — they only tilt.

**"Galaxy" presets:** Each ring tilted in a different direction creates a multi-axis trainer look (orbital paths at different inclinations).

### Motor Positions (Verified 2026-01-22)

All 3 rings on each chandelier have motors attached at the same relative positions.

**Odd chandeliers (L1, L3, L5)** — facing stage:
- Motor 1: 12:00 (toward ceiling)
- Motor 2: 4:00 (toward stage)
- Motor 3: 8:00 (toward back wall)

**Even chandeliers (L2, L4, L6)** — facing stage:
- Motor A: 6:00 (toward audience/floor)
- Motor B: 10:00 (toward back wall)
- Motor C: 2:00 (toward stage)

Note: Motor 1 and Motor A are the "primary" attachment points. On odd chandeliers it's at top, on even chandeliers it's at bottom. This is a mounting difference, not a functional difference.

### TURN Direction Mapping (Verified 2026-01-22)

Tested on L6 (even chandelier) with TILT=255. The TURN channel rotates which motor is lowest:

| TURN Value | Result (L6) | Direction |
|------------|-------------|-----------|
| 0 | Motor C lowest | Tilts toward stage |
| ~42 | Motor B highest (A+C down) | Tilts away from back wall |
| ~64-85 | Motor A lowest | Tilts toward audience |
| ~127 | Motor B slightly lowest | Transitional |
| ~170-212 | Motor A highest (B+C down) | Tilts away from audience |
| ~255 | Motor A lowest | Tilts toward audience |

**Pattern:** With 3 motors at 120° intervals, each ~85 DMX units shifts the tilt direction by ~120°.

**For odd chandeliers (L1, L3, L5):** The same DMX values produce tilts in the same compass directions, but relative to different motor positions (Motor 1 at top instead of Motor A at bottom).

### To Move a Ring

1. Set **SPEED > 0** (releases brake, enables motors)
2. Set **DROP** to desired height (0 = full up, 255 = full down)
3. Optionally set **TILT/TURN** for angled positions
4. Ring moves to target position

### To Stop / Hold Position

1. Set **SPEED = 0** (engages brake, holds position)
2. Position values are ignored when SPEED = 0

### Notes

- **SPEED controls the electromagnetic brake** — audible "click" when it engages/disengages
- **Movement is slow** — allow time for rings to reach position
- **CueCore presets** exist: "krone cone", "krone tilt 1/2", "krone dyn bev" — these use TILT/TURN to create shapes

---

## DMX-to-Sensor Position Mapping

**Source:** Motor sensor position data from lysekrone controller PC (2026-01-22)

### Linear Mapping

The DMX DROP channel maps linearly to physical motor sensor positions:

```
Sensor Position = -2,500 - (DROP × 201)
```

Or inversely:
```
DROP = (-2,500 - Sensor Position) / 201
```

### Sensor Range

| Position | Sensor Value | DMX DROP |
|----------|--------------|----------|
| Full up | -2,500 | 0 |
| Full down | -53,800 | 255 |

**Total range:** ~51,300 sensor units = 255 DMX values

### Verified Preset Values

Data from lysekrone controller PC showing actual motor sensor positions.

**Flat presets** (all motors same per ring — no tilt):

| Preset | Outer (DMX 1) | Middle (DMX 2) | Inner (DMX 3) | DMX DROP (Outer/Mid/Inner) |
|--------|---------------|----------------|---------------|----------------------------|
| UP | -2,500 | -2,535 | -2,513 | 0 / 0 / 0 |
| DOWN | -53,803 | -53,778 | -53,806 | 255 / 255 / 255 |
| Cone (Preset 2) | -27,882 | -36,904 | -46,349 | 126 / 171 / 218 |
| Cone Inv (Preset 3) | -46,322 | -36,919 | -27,879 | 218 / 171 / 126 |

**Galaxy presets** (motors differ within ring — actual tilt):

| Preset | Ring | Motor 1 | Motor 2 | Motor 3 | Spread |
|--------|------|---------|---------|---------|--------|
| Galaxy 1 (Preset 4) | Inner | -49,987 | -46,970 | -49,981 | 3,017 |
| | Middle | -38,073 | -45,113 | -38,869 | 7,040 |
| | Outer | -47,124 | -36,456 | -36,456 | 10,668 |
| Galaxy 2 (Preset 5) | Inner | -49,987 | -46,970 | -47,202 | 3,017 |
| | Middle | -44,910 | -38,141 | -45,153 | 7,012 |
| | Outer | -34,881 | -47,129 | -36,456 | 12,248 |

### Tilt Motor Differences

For **flat presets** (UP, DOWN, Cone, Cone Inv), all 3 motors within a ring read the same position — the ring is level.

For **galaxy presets**, motors within each ring differ — this is actual tilt:

| Preset | Ring | Motor Spread | Effect |
|--------|------|--------------|--------|
| Galaxy 1 | Inner | 3,017 units | Slight tilt |
| Galaxy 1 | Middle | 7,040 units | Moderate tilt |
| Galaxy 1 | Outer | 10,668 units | Maximum tilt |
| Galaxy 2 | Inner | 3,017 units | Slight tilt |
| Galaxy 2 | Middle | 7,012 units | Moderate tilt |
| Galaxy 2 | Outer | 12,248 units | Maximum tilt |

The outer ring tilts most dramatically because it has the largest radius.

### CueCore DMX Values for Galaxy Presets

From CueCore2 backup `JBT B, 02 Nov.xml`:

| Preset | TILT | TURN per ring | DROP per ring |
|--------|------|---------------|---------------|
| Galaxy 1 (Track 124) | 255 (all) | 0 / 85 / 170 | 151 / 171 / 218 |
| Galaxy 2 (Track 125) | 255 (all) | 85 / 170 / 0 | 151 / 171 / 218 |

TILT=255 appears to be maximum tilt angle. TURN determines the direction of tilt — different TURN values per ring create the galaxy/orbital appearance.

---

## LED Control

### To Turn On LEDs

1. Set **Dimmer > 0** (required for any output)
2. Set **R, G, B, W** to desired color values

### Channel Order Per Strip

**R → G → B → W → Dimmer**

---

## Signal Path

Lysekroner are on house light universes (U6, U7, U8). Signal path depends on patch state:

- **Patched:** GrandMA3 → Luminex → Sal Patch Panel → Fixtures
- **Unpatched:** Crestron → CueCore2 → RdmSplitter → Fixtures

See `SYSTEM.md` for full signal flow diagram.

---

## Related Documents

- `FIXTURES_AND_PATCH.md` — Lysekrone locations and address ranges
- `SYSTEM.md` — Signal flow, CueCore2 fallback behavior, DMX line routing
