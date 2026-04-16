# Vegglys & XBAR Physical Layout

**Mapped on-site 2026-03-18.**

---

## Vegglys Overview

Vegglys are wall-wash LED fixtures (Elation LED Vegg HUB) in 5-channel mode:
- Ch1: Dimmer, Ch2: Red, Ch3: Green, Ch4: Blue, Ch5: White
- NOT individually addressable cells — each fixture is one light source with color mixing
- Start address: 211 in each house light universe, spaced 5 channels apart

### Wall Orientation

The vegglys are on the **side wall** (90° counterclockwise from stage). This is the
**front wall** when Jernbanetorget is divided into three separate rooms (A, B, C).

Each room's wall has **3 horizontal rows** of fixtures spanning the wall's breadth.
Within each row, fixtures **alternate between UP-firing and DOWN-firing** (opposite
directions on the same plane): up/down/up/down/up/down.

Fixture numbers within each row run **left to right** (confirmed on-site).

### Dead Fixtures

| Fixture | Room | Position | Notes |
|---------|------|----------|-------|
| A-31 | Sal A | Row 3 Up | Dead |
| A-35 | Sal A | Row 3 Up | Dead |
| A-44 | Sal A | Row 3 Down | Dead (may correspond to B-52) |
| B-52 | Sal B | Row 3 Down | Dead (may correspond to A-44) |
| C-15 | Sal C | Row 1 Down | Dead |
| C-21 | Sal C | Row 1 Down | Dead |
| C-22 | Sal C | Row 2 Up | Dead |
| C-42 | Sal C | Row 3 Up | Dead |

### Gap Fixtures (doors / not present)

| Fixture | Room | Notes |
|---------|------|-------|
| A-10 | Sal A | Does not exist |
| A-12 | Sal A | Door location |
| A-39 | Sal A | Door/gap |
| B-49 | Sal B | Door/gap (between B and C) |
| B-59, B-60 | Sal B | Door/gap |
| C-26 | Sal C | Gap |

### Quirks

- **C-20**: Turning on fixture 20 also turns on fixture 21 (linked/double-patched)

---

## Sal A (U6) — 48 fixtures

| Row | Direction | Fixtures (left → right) | Count |
|-----|-----------|------------------------|-------|
| 1 | Up | 1, 2, 3, 4, 5, 6, 7, 8, 9 | 9 |
| 1 | Down | 11, 13, 15, 17, 19, 21, 23, 25 | 8 |
| 2 | Up | 14, 16, 18, 20, 22, 24, 26 | 7 |
| 2 | Down | 27, 28, 30, 32, 34, 36, 38, 40 | 8 |
| 3 | Up | 29, 31, 33, 35, 37, 41 | 6 |
| 3 | Down | 42, 43, 44, 45, 46, 47, 48 | 7 |

**Mapped:** 45 &nbsp;|&nbsp; **Gaps:** 10, 12, 39 &nbsp;|&nbsp; **Dead:** 31, 35, 44

---

## Sal B (U7) — 60 fixtures

| Row | Direction | Fixtures (left → right) | Count |
|-----|-----------|------------------------|-------|
| 1 | Up | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 | 10 |
| 1 | Down | 11, 13, 15, 17, 19, 21, 23, 25, 27, 29 | 10 |
| 2 | Up | 12, 14, 16, 18, 20, 22, 24, 26, 28, 30 | 10 |
| 2 | Down | 31, 33, 35, 37, 39, 41, 43, 45, 47, 48 | 10 |
| 3 | Up | 32, 34, 36, 38, 40, 42, 44, 46 | 8 |
| 3 | Down | 50, 51, 52, 53, 54, 55, 56, 57, 58 | 9 |

**Mapped:** 57 &nbsp;|&nbsp; **Gaps:** 49, 59, 60 &nbsp;|&nbsp; **Dead:** 52

---

## Sal C (U8) — 51 fixtures

| Row | Direction | Fixtures (left → right) | Count |
|-----|-----------|------------------------|-------|
| 1 | Up | 1, 2, 3, 4, 5, 6, 7, 8, 9 | 9 |
| 1 | Down | 11, 13, 15, 17, 19, 21, 23, 25, 27 | 9 |
| 2 | Up | 10, 12, 14, 16, 18, 20, 22, 24 | 8 |
| 2 | Down | 29, 31, 33, 35, 37, 39, 41, 43, 44 | 9 |
| 3 | Up | 28, 30, 32, 34, 36, 38, 40, 42 | 8 |
| 3 | Down | 45, 46, 47, 48, 49, 50, 51 | 7 |

**Mapped:** 50 &nbsp;|&nbsp; **Gaps:** 26 &nbsp;|&nbsp; **Dead:** 15, 21, 22, 42

---

## DMX Address Reference

To convert fixture number to DMX address:
```
address = 211 + (fixture - 1) * 5
```

Channels per fixture: Dimmer (+0), Red (+1), Green (+2), Blue (+3), White (+4)

Example: Fixture 10 in Sal B = U7 ch 256 (256, 257, 258, 259, 260)

---

## XBAR Layout

12 Bright XBARs on **Truss 1** (Sal A), all on **Universe 2**, in **32-channel mode**.

### 32ch Mode Channel Map

| Channels | Function |
|----------|----------|
| 1–24 | 12 cells × 2ch (coarse + fine 16-bit dimmer) |
| 25 | Red (global) |
| 26 | Green (global) |
| 27 | Blue (global) |
| 28 | White (global) |
| 29 | Amber (global) |
| 30 | UV (global) |
| 31 | Shutter (0–7 closed, 8–15 open, 16+ strobe modes) |
| 32 | Rise-time (0–31 instant, 32–63 short, 64–95 long) |

### Bar Addresses

| Bar | DMX Address | Cell 1 ch | Cell 12 ch |
|-----|-------------|-----------|------------|
| XBAR 1 | 2.100 | 100–101 | 122–123 |
| XBAR 2 | 2.132 | 132–133 | 154–155 |
| XBAR 3 | 2.164 | 164–165 | 186–187 |
| XBAR 4 | 2.196 | 196–197 | 218–219 |
| XBAR 5 | 2.228 | 228–229 | 250–251 |
| XBAR 6 | 2.260 | 260–261 | 282–283 |
| XBAR 7 | 2.292 | 292–293 | 314–315 |
| XBAR 8 | 2.324 | 324–325 | 346–347 |
| XBAR 9 | 2.356 | 356–357 | 378–379 |
| XBAR 10 | 2.388 | 388–389 | 410–411 |
| XBAR 11 | 2.420 | 420–421 | 442–443 |
| XBAR 12 | 2.452 | 452–453 | 474–475 |

### Physical Layout (confirmed 2026-03-18)

- All 12 bars mounted on Truss 1 (Sal A), left to right = XBAR 1 → XBAR 12
- Cell 1 → Cell 12 runs left to right on all bars (confirmed)
- **XBAR 4 was reversed** — fixed on-site by toggling cell order in fixture menu
  (Menu → DMX Channels → 32ch → Normal/Reversed). Was `C32-REV`, changed to `C32`.

### Cell Address Formula

```
cell_coarse_ch = bar_address + (cell - 1) * 2
cell_fine_ch   = bar_address + (cell - 1) * 2 + 1
```

Example: XBAR 3 Cell 7 = coarse ch 176, fine ch 177

### Configuration Note (Bright XBAR manual v2.1)

The XBAR local menu allows:
- **DMX Channels**: 2ch, 3ch, 12ch, 32ch, 60ch, 96ch modes
- **Cell order**: Normal or Reversed (-REV) — "Normal cell order: First cell is on the input side"
- **Display rotation**: Hold Up+Down for 2 seconds to rotate 180°
- **RDM**: Supported for remote addressing
