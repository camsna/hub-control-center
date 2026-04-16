# Fixtures, Locations, and Patch List

**Source:** Cross-referenced from `lighting-reference.html`, `controller.html`, and `Hub Patch List.xlsx` (authoritative)
**Last Verified:** 2026-03-03

---

## Venue Overview

**Jernbanetorget** is the main hall. It is divisible into 3 smaller rooms:
- **Sal A** (Jernbanetorget A)
- **Sal B** (Jernbanetorget B)
- **Sal C** (Jernbanetorget C)

Each room has its own house lighting universe (U6, U7, U8 respectively).

---

## Universe Assignment

| Universe | DMX Lines | Purpose |
|----------|-----------|---------|
| 1 | 21, 23 | Sal A conventionals (Truss 2, 3) |
| 2 | 17 | Sal A moving lights + XBARs (Truss 1) |
| 3 | 19, 25, 27, 29 | Sal B + Sal C truss fixtures (Truss 4, 5, 6, 7) |
| 4 | 31 | Auras over stage (Pipe) |
| 5 | ? | Astra fixtures (Luma 700, XLED 3) |
| 6 | — | House lights Sal A |
| 7 | — | House lights Sal B |
| 8 | — | House lights Sal C |

---

## DMX Line to Truss Mapping

| DMX Line | Truss | Universe | Location | Notes |
|----------|-------|----------|----------|-------|
| 17 | Truss 1 | U2 | Sal A | DMX 18 open |
| 19 | Truss 5 | U3 | Sal B | DMX 20 open |
| 21 | Truss 2 | U1 | Sal A | DMX 22 open |
| 23 | Truss 3 | U1 | Sal A | DMX 24 open |
| 25 | Truss 4 | U3 | Sal B | DMX 26 open |
| 27 | Truss 6 | U3 | Sal C | DMX 28 open |
| 29 | Truss 7 | U3 | Sal C | DMX 30 open |
| 31 | Pipe | U4 | Sal A (over stage) | — |

---

## Truss Fixtures

### SAL A

**Pipe (P)** — DMX Line 31 → U4
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | Aura 1 | 4.029 |
| 2 | Aura 2 | 4.015 |
| 3 | Aura 3 | 4.001 |
| 4 | Aura 4 | 4.043 |
| 5 | Aura 5 | 4.057 |
| 6 | Aura 6 | 4.071 |
| 7 | Aura 7 | 4.085 |
| 8 | Aura 8 | 4.099 |
| 9 | Aura 9 | 4.113 |
| 10 | Aura 10 | 4.127 |

**Truss 1** — DMX Line 17 → U2
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | Q1 (Quantum) | 2.029 |
| 2 | XBAR | 2.100 |
| 3 | XBAR | 2.132 |
| 4 | XBAR | 2.164 |
| 5 | XBAR | 2.196 |
| 6 | XBAR | 2.228 |
| 7 | XBAR | 2.260 |
| 8 | XBAR | 2.292 |
| 9 | XBAR | 2.324 |
| 10 | XBAR | 2.356 |
| 11 | XBAR | 2.388 |
| 12 | XBAR | 2.420 |
| 13 | XBAR | 2.452 |
| 14 | Q2 (Quantum) | 2.056 |

**Truss 2** — DMX Line 21 → U1
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | Fresnel | 1.007 |
| 2 | Fresnel | 1.043 |
| 3 | Fresnel | 1.001 |
| 4 | Fresnel | 1.013 |

**Truss 3** — DMX Line 23 → U1
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | Spot | 1.101 |
| 2 | Fresnel | 1.067 |
| 3 | Fresnel | 1.037 |
| 4 | Fresnel | 1.031 |
| 5 | Spot | 1.109 |
| 6 | Fresnel | 1.073 |
| 7 | Fresnel | 1.049 |
| 8 | Spot | 1.105 |
| 9 | Fresnel | 1.055 |
| 10 | Fresnel | 1.061 |
| 11 | Fresnel | 1.025 |
| 12 | Spot | 1.113 |

### SAL B

**Truss 4** — DMX Line 25 → U3
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | Q6 (Quantum) | 3.327 |
| 2 | XLED | 3.001 |
| 3 | XLED | 3.011 |
| 4 | XLED | 3.021 |
| 5 | XLED | 3.031 |
| 6 | XLED | 3.041 |
| 7 | XLED | 3.051 |
| 8 | Q5 (Quantum) | 3.300 |

**Truss 5** — DMX Line 19 → U3
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | Q7 (Quantum) | 3.381 |
| 2 | XLED | 3.061 |
| 3 | XLED | 3.071 |
| 4 | XLED | 3.141 |
| 5 | XLED | 3.151 |
| 6 | XLED | 3.161 |
| 7 | Q8 (Quantum) | 3.354 |
| 8 | XLED | 3.171 |

### SAL C

**Truss 6** — DMX Line 27 → U3
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | XLED | 3.181 |
| 2 | XLED | 3.191 |
| 3 | XLED | 3.201 |
| 4 | XLED | 3.211 |
| 5 | XLED | 3.221 |
| 6 | XLED | 3.231 |

**Truss 7** — DMX Line 29 → U3
| Position | Fixture | Address |
|----------|---------|---------|
| 1 | XLED | 3.241 |
| 2 | XLED | 3.251 |
| 3 | XLED | 3.261 |
| 4 | XLED | 3.271 |
| 5 | XLED | 3.281 |

---

## House Lights (U6, U7, U8)

Each room has identical fixture types at identical base addresses.

### Taklys (Ceiling Spots)
- **Channels:** 1–72 (72 fixtures per room, 1 channel each)
- **Type:** Simple dimmer
- **Location:** Ceiling, per room

### Kreios / Stage Spots
- **Addresses:** 81, 83, 85, 87 (4 fixtures per room, 2 channels each)
- **Location:** Stage area, per room

**Sal A (U6) and Sal C (U8):** Osram Kreios Profile 80W WW
- Ch1 = Dimmer, Ch2 = Strobe (must be 0 for normal operation)

**Sal B (U7):** Mixed — 2× Kreios remain, 2× replaced with BriteQ BT-PROFILE WW (March 2026)
- 7.081, 7.085: Osram Kreios (Ch1 = Dimmer, Ch2 = Strobe, keep at 0)
- 7.083, 7.087: BriteQ BT-PROFILE WW in DOS mode (Ch1 = Dimmer, Ch2 = Dimmer Fine — 16-bit dimming)

### Vegglys (Illuminated Walls)
- **Start Address:** 211
- **Channels per fixture:** 5 (Dimmer, R, G, B, W)
- **Count by room:**
  - Sal A (U6): 48 fixtures (211–451)
  - Sal B (U7): 60 fixtures (211–506)
  - Sal C (U8): 51 fixtures (211–466)
- **Location:** Walls, per room

### Lysekroner (Chandeliers)
2 per room. Facing the stage: odd numbers on LEFT, even numbers on RIGHT.

| Lysekrone | Room | Position | Address Range |
|-----------|------|----------|---------------|
| 1 | Sal A | Left | 6.101 – 6.155 |
| 2 | Sal A | Right | 6.156 – 6.210 |
| 3 | Sal B | Left | 7.101 – 7.155 |
| 4 | Sal B | Right | 7.156 – 7.210 |
| 5 | Sal C | Left | 8.101 – 8.155 |
| 6 | Sal C | Right | 8.156 – 8.210 |

*(Detailed lysekrone channel mapping in separate document: LYSEKRONER.md)*

---

## Fixture Reference

| Label | Manufacturer | Model | Type | Channels |
|-------|--------------|-------|------|----------|
| Q1–Q8 | Martin | MAC Quantum Profile | Moving Spot | 27 |
| Aura 1–10 | Martin | MAC Aura XB | Moving Wash | 14 |
| XBAR 1–12 | Bright | XBAR | LED Bar | 32 |
| XLED HD 1–23 | Bright | XLED HD | LED Wash | 10 |
| XLED 3 1–10 | Bright Norway | XLED | LED Wash | 6 |
| Fresnel 1–13 | ADB | Lexpert Fresnel M | Conventional | 6 |
| Profil 1–10 | ADB | Lexpert Profile L | Spot | 4 |
| Lum70016 1–4 | Prolights | Luma 700 | LED Wash | 28 |
| JCHazePr 1–2 | Martin | Jem Compact Hazer Pro | Hazer | 3 |
| Taklys | Generic | Dimmer | Ceiling Spot | 1 |
| Kreios 1–4 | Osram | Kreios Profile 80W WW | Stage Light | 2 |
| BT-PROFILE 1–2 | BriteQ | BT-PROFILE WW (150W, 3200K) | LED Profile | 2 (DOS mode) |
| Vegglys | Elation | LED | Wall Light | 5 |
| Lysekrone 1–6 | Bright | TheOrbit | Motorized Chandelier | 55 |

---

## Screen Lights

Screen lights are specific **taklys (ceiling spots)** that illuminate projection screens.

**Addresses:** Unknown (see TODO.md #1)

---

## U3 Channel Split (Sal B vs Sal C)

Universe 3 is shared between Sal B and Sal C:
- **Sal B:** Channels 1–326
- **Sal C:** Channels 327–512

---

## Exhaustive Patch List

**Source:** Hub Patch List.xlsx (authoritative)

### Universe 1

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| Fresnel 1 | ADB | Lexpert Fresnel M | Default | 1.001 | Truss 2/3 |
| Fresnel 2 | ADB | Lexpert Fresnel M | Default | 1.007 | Truss 2/3 |
| Fresnel 3 | ADB | Lexpert Fresnel M | Default | 1.013 | Truss 2/3 |
| Fresnel 4 | ADB | Lexpert Fresnel M | Default | 1.019 | Truss 2/3 |
| Fresnel 5 | ADB | Lexpert Fresnel M | Default | 1.025 | Truss 2/3 |
| Fresnel 6 | ADB | Lexpert Fresnel M | Default | 1.031 | Truss 2/3 |
| Fresnel 7 | ADB | Lexpert Fresnel M | Default | 1.037 | Truss 2/3 |
| Fresnel 8 | ADB | Lexpert Fresnel M | Default | 1.043 | Truss 2/3 |
| Fresnel 9 | ADB | Lexpert Fresnel M | Default | 1.049 | Truss 2/3 |
| Fresnel 10 | ADB | Lexpert Fresnel M | Default | 1.055 | Truss 2/3 |
| Fresnel 11 | ADB | Lexpert Fresnel M | Default | 1.061 | Truss 2/3 |
| Fresnel 12 | ADB | Lexpert Fresnel M | Default | 1.067 | Truss 2/3 |
| Fresnel 13 | ADB | Lexpert Fresnel M | Default | 1.073 | Truss 2/3 |
| Profil 1 | ADB | Lexpert Profile L | Mode 5 | 1.101 | Truss 2/3 |
| Profil 2 | ADB | Lexpert Profile L | Mode 5 | 1.105 | Truss 2/3 |
| Profil 3 | ADB | Lexpert Profile L | Mode 5 | 1.109 | Truss 2/3 |
| Profil 4 | ADB | Lexpert Profile L | Mode 5 | 1.113 | Truss 2/3 |
| Quantum 3 | Martin | MAC Quantum Profile | Extended | 1.309 | Truss 2/3 |
| Quantum 4 | Martin | MAC Quantum Profile | Extended | 1.336 | Truss 2/3 |
| JCHazePr 1 | Martin | Jem Compact Hazer Pro | Mode 0 | 1.501 | Stage |
| JCHazePr 2 | Martin | Jem Compact Hazer Pro | Mode 0 | 1.504 | Stage |

### Universe 2

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| Quantum 1 | Martin | MAC Quantum Profile | Extended | 2.029 | Truss 1 |
| Quantum 2 | Martin | MAC Quantum Profile | Extended | 2.056 | Truss 1 |
| XBAR 1 | Bright | XBAR | 32CH | 2.100 | Truss 1 |
| XBAR 2 | Bright | XBAR | 32CH | 2.132 | Truss 1 |
| XBAR 3 | Bright | XBAR | 32CH | 2.164 | Truss 1 |
| XBAR 4 | Bright | XBAR | 32CH | 2.196 | Truss 1 |
| XBAR 5 | Bright | XBAR | 32CH | 2.228 | Truss 1 |
| XBAR 6 | Bright | XBAR | 32CH | 2.260 | Truss 1 |
| XBAR 7 | Bright | XBAR | 32CH | 2.292 | Truss 1 |
| XBAR 8 | Bright | XBAR | 32CH | 2.324 | Truss 1 |
| XBAR 9 | Bright | XBAR | 32CH | 2.356 | Truss 1 |
| XBAR 10 | Bright | XBAR | 32CH | 2.388 | Truss 1 |
| XBAR 11 | Bright | XBAR | 32CH | 2.420 | Truss 1 |
| XBAR 12 | Bright | XBAR | 32CH | 2.452 | Truss 1 |

### Universe 3

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| XLED HD 1 | Bright | XLED HD | 10CH | 3.001 | Truss 4 |
| XLED HD 2 | Bright | XLED HD | 10CH | 3.011 | Truss 4 |
| XLED HD 3 | Bright | XLED HD | 10CH | 3.021 | Truss 4 |
| XLED HD 4 | Bright | XLED HD | 10CH | 3.031 | Truss 4 |
| XLED HD 5 | Bright | XLED HD | 10CH | 3.041 | Truss 4 |
| XLED HD 6 | Bright | XLED HD | 10CH | 3.051 | Truss 4 |
| XLED HD 7 | Bright | XLED HD | 10CH | 3.061 | Truss 5 |
| XLED HD 8 | Bright | XLED HD | 10CH | 3.071 | Truss 5 |
| Profil 5 | ADB | Lexpert Profile L | Mode 5 | 3.081 | Sal B/C |
| Profil 6 | ADB | Lexpert Profile L | Mode 5 | 3.085 | Sal B/C |
| XLED HD 9 | Bright | XLED HD | 10CH | 3.141 | Truss 5 |
| XLED HD 10 | Bright | XLED HD | 10CH | 3.151 | Truss 5 |
| XLED HD 11 | Bright | XLED HD | 10CH | 3.161 | Truss 5 |
| XLED HD 12 | Bright | XLED HD | 10CH | 3.171 | Truss 5 |
| XLED HD 13 | Bright | XLED HD | 10CH | 3.181 | Truss 6 |
| XLED HD 14 | Bright | XLED HD | 10CH | 3.191 | Truss 6 |
| XLED HD 15 | Bright | XLED HD | 10CH | 3.201 | Truss 6 |
| XLED HD 16 | Bright | XLED HD | 10CH | 3.211 | Truss 6 |
| XLED HD 17 | Bright | XLED HD | 10CH | 3.221 | Truss 6 |
| XLED HD 18 | Bright | XLED HD | 10CH | 3.231 | Truss 6 |
| XLED HD 19 | Bright | XLED HD | 10CH | 3.241 | Truss 7 |
| XLED HD 20 | Bright | XLED HD | 10CH | 3.251 | Truss 7 |
| XLED HD 21 | Bright | XLED HD | 10CH | 3.261 | Truss 7 |
| XLED HD 22 | Bright | XLED HD | 10CH | 3.271 | Truss 7 |
| XLED HD 23 | Bright | XLED HD | 10CH | 3.281 | Truss 7 |
| Quantum 5 | Martin | MAC Quantum Profile | Extended | 3.300 | Truss 4 |
| Quantum 6 | Martin | MAC Quantum Profile | Extended | 3.327 | Truss 4 |
| Quantum 8 | Martin | MAC Quantum Profile | Extended | 3.354 | Truss 5 |
| Quantum 7 | Martin | MAC Quantum Profile | Extended | 3.381 | Truss 5 |

### Universe 4

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| Aura 1 | Martin | MAC Aura XB | Standard - Extended | 4.001 | Pipe |
| Aura 2 | Martin | MAC Aura XB | Standard - Extended | 4.015 | Pipe |
| Aura 3 | Martin | MAC Aura XB | Standard - Extended | 4.029 | Pipe |
| Aura 4 | Martin | MAC Aura XB | Standard - Extended | 4.043 | Pipe |
| Aura 5 | Martin | MAC Aura XB | Standard - Extended | 4.057 | Pipe |
| Aura 6 | Martin | MAC Aura XB | Standard - Extended | 4.071 | Pipe |
| Aura 7 | Martin | MAC Aura XB | Standard - Extended | 4.085 | Pipe |
| Aura 8 | Martin | MAC Aura XB | Standard - Extended | 4.099 | Pipe |
| Aura 9 | Martin | MAC Aura XB | Standard - Extended | 4.113 | Pipe |
| Aura 10 | Martin | MAC Aura XB | Standard - Extended | 4.127 | Pipe |

### Universe 5 (Astra)

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| Lum70016 1 | Prolights | Luma 700 | Standard | 5.001 | ? |
| Lum70016 2 | Prolights | Luma 700 | Standard | 5.029 | ? |
| Lum70016 3 | Prolights | Luma 700 | Standard | 5.057 | ? |
| Lum70016 4 | Prolights | Luma 700 | Standard | 5.085 | ? |
| XLED 3 1 | Bright Norway | XLED | 6 channel | 5.113 | ? |
| XLED 3 2 | Bright Norway | XLED | 6 channel | 5.119 | ? |
| XLED 3 3 | Bright Norway | XLED | 6 channel | 5.125 | ? |
| XLED 3 4 | Bright Norway | XLED | 6 channel | 5.131 | ? |
| XLED 3 5 | Bright Norway | XLED | 6 channel | 5.137 | ? |
| XLED 3 6 | Bright Norway | XLED | 6 channel | 5.143 | ? |
| XLED 3 7 | Bright Norway | XLED | 6 channel | 5.149 | ? |
| XLED 3 8 | Bright Norway | XLED | 6 channel | 5.155 | ? |
| XLED 3 9 | Bright Norway | XLED | 6 channel | 5.161 | ? |
| XLED 3 10 | Bright Norway | XLED | 6 channel | 5.167 | ? |
| Profil 7 | ADB | Lexpert Profile L | Mode 5 | 5.295 | ? |

### Universe 6 (Sal A House Lights)

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| Taklys 1–72 | Generic | Dimmer | Mode 0 | 6.001–072 | Ceiling |
| Kreios 1 | Osram | Kreios Profile 80W WW | 2 channel | 6.081 | Stage |
| Kreios 2 | Osram | Kreios Profile 80W WW | 2 channel | 6.083 | Stage |
| Kreios 3 | Osram | Kreios Profile 80W WW | 2 channel | 6.085 | Stage |
| Kreios 4 | Osram | Kreios Profile 80W WW | 2 channel | 6.087 | Stage |
| TheOrbit 1 | Bright | TheOrbit | Default | 6.101–155 | Ceiling (left) |
| TheOrbit 2 | Bright | TheOrbit | Default | 6.156–210 | Ceiling (right) |
| Vegglys 1–48 | Elation | LED Vegg HUB | 5 channel | 6.211–446 | Wall |

### Universe 7 (Sal B House Lights)

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| Taklys 1–72 | Generic | Dimmer | Mode 0 | 7.001–072 | Ceiling |
| Kreios 1 | Osram | Kreios Profile 80W WW | 2 channel | 7.081 | Stage |
| BT-PROFILE 1 | BriteQ | BT-PROFILE WW | DOS (2ch) | 7.083 | Stage |
| Kreios 3 | Osram | Kreios Profile 80W WW | 2 channel | 7.085 | Stage |
| BT-PROFILE 2 | BriteQ | BT-PROFILE WW | DOS (2ch) | 7.087 | Stage |
| TheOrbit 3 | Bright | TheOrbit | Default | 7.101–155 | Ceiling (left) |
| TheOrbit 4 | Bright | TheOrbit | Default | 7.156–210 | Ceiling (right) |
| Vegglys 1–60 | Elation | LED Vegg HUB | 5 channel | 7.211–506 | Wall |

### Universe 8 (Sal C House Lights)

| Fixture | Manufacturer | Model | Mode | Address | Location |
|---------|--------------|-------|------|---------|----------|
| Taklys 1–72 | Generic | Dimmer | Mode 0 | 8.001–072 | Ceiling |
| Kreios 1 | Osram | Kreios Profile 80W WW | 2 channel | 8.081 | Stage |
| Kreios 2 | Osram | Kreios Profile 80W WW | 2 channel | 8.083 | Stage |
| Kreios 3 | Osram | Kreios Profile 80W WW | 2 channel | 8.085 | Stage |
| Kreios 4 | Osram | Kreios Profile 80W WW | 2 channel | 8.087 | Stage |
| TheOrbit 5 | Bright | TheOrbit | Default | 8.101–155 | Ceiling (left) |
| TheOrbit 6 | Bright | TheOrbit | Default | 8.156–210 | Ceiling (right) |
| Vegglys 1–51 | Elation | LED Vegg HUB | 5 channel | 8.211–461 | Wall |

### Not Connected

| Fixture | Manufacturer | Model | Mode |
|---------|--------------|-------|------|
| Profil 8 | ADB | Lexpert Profile L | Mode 5 |
| Profil 9 | ADB | Lexpert Profile L | Mode 5 |
| Profil 10 | ADB | Lexpert Profile L | Mode 5 |
