# Documentation TODO List

Tasks that require finding/verifying information.

---

## Pending

### 1. Find Screen Light Addresses
**What:** Identify which taklys (ceiling spot) channels illuminate the projection screens in each room.

**Update when found:**
- File: `FIXTURES_AND_PATCH.md`
- Section: "Screen Lights"
- Replace "Unknown (see TODO.md #1)" with confirmed addresses

**Current state:** Previous channel list `[8, 16, 24, 36, 40, 48, 56, 57, 62, 70]` was WRONG (verified 2026-03-04 on-site in Sal B):
- Channels 8, 16, 24, 36, 40, 48: not connected to any fixture
- Channel 56: back of room (single light)
- Channel 57: front of room near screen (single light)
- Channels 62, 70: back-left, hung as a pair
- All 4 real fixtures are regular taklys, not screen lights
- Controller screenLights.channels cleared to `[]`, exclusion filter removed
- These 4 channels now included in normal taklys control

**What still needs to happen:**
- On-site identification: systematically test channel ranges to find which taklys illuminate the projection screens
- Each room may have 6-8 screen lights per screen (Cameron's estimate)
- Delay screen lights only in Sal C (U8) — also need to identify

---

### 2. Confirm House Light DMX Lines
**What:** Confirm which physical DMX lines carry U6/U7/U8 to house light fixtures. Currently have placeholders (32–49) based on reference doc structure.

**Update when confirmed:**
- File: `SYSTEM.md`
- Section: "DMX Line → Universe Map" — remove `?` from lines 32–49
- Section: "Universe → DMX Lines" — remove `?` from U6/U7/U8
- Also update: `FIXTURES_AND_PATCH.md` if specific line-to-fixture mapping is discovered

**Current state:** Placeholders in SYSTEM.md:
- Lines 32–37 → U6 (RdmSplitter A) — placeholder
- Lines 38–43 → U7 (RdmSplitter B) — placeholder
- Lines 44–49 → U8 (RdmSplitter C) — placeholder

### 3. Identify Unknown DMX Lines 1–16
**What:** Determine what (if anything) DMX lines 1–16 are connected to.

**Update when found:**
- File: `SYSTEM.md`
- Section: "DMX Line → Universe Map" — fill in universe and destination for each line

**Current state:** All marked as `?` in SYSTEM.md.

### 4. Confirm U5 DMX Lines
**What:** Identify which DMX line(s) carry Universe 5.

**Update when found:**
- File: `SYSTEM.md`
- Section: "DMX Line → Universe Map" and "Universe → DMX Lines"

**Current state:** U5 lines unknown.

---

### 5. Identify "Astra" Fixture Locations (U5)
**What:** Determine where the U5 "astra" fixtures are physically located.

**Fixtures:**
- Lum70016 1–4 (Prolights Luma 700)
- XLED 3 1–10 (Bright Norway XLED)
- Profil 7

**Update when found:**
- File: `FIXTURES_AND_PATCH.md`
- Section: "Exhaustive Patch List" → "Universe 5 (Astra)" — replace `?` with actual locations

**Current state:** Location column shows `?` for all U5 fixtures.

---

### 6. Verify Screen Control Join Numbers
**What:** Determine the exact CIP join numbers for screen controls (currently use Smart Objects).

**Method:** On-site traffic monitoring while pressing touchpanel buttons.

**Update when found:**
- File: `CRESTRON.md`
- Section: "Screen Controls" — add verified join numbers

**Current state:** Smart Object IDs known (3, 5, 8, 10, 11, 12) but exact join calculation needs verification.

---

### 7. Document Fixture Profiles
**What:** Document control parameters and particulars for each fixture type.

**Create:**
- File: `FIXTURE_PROFILES.md`

**Topics to cover:**
- Channel layouts for each fixture type
- Control parameters (modes, ranges, behaviors)
- Any quirks or special considerations

**Current state:** Not started.

**Note (2026-03-03):** Sal B Kreios at 7.083 and 7.087 replaced with BriteQ BT-PROFILE WW (DOS mode). These use Ch1=Dimmer, Ch2=Dimmer Fine (16-bit) instead of Ch1=Dimmer, Ch2=Strobe. Manual on file. Controller code needs updating to handle the different Ch2 behavior for these two fixtures.

---

---

### 9. Improve Lysekrone Visualization Accuracy
**What:** Fine-tune the visualization to more accurately show what tilted rings look like in real life.

**Current state (2026-01-22):**
- Simplified visualization now shows rings as tilted bars (edge-on view)
- Canvas drag interaction allows visual ring positioning
- Direction labels show Back/Stage (SIDE) and L/R (FRONT)
- Ring labels (O/M/I) identify each ring
- TILT/TURN DMX conversion uses verified polar coordinate mapping

**Remaining work:**
- On-site testing to compare visualization with actual tilted rings
- May need to adjust MAX_TILT_PIXELS constant for visual accuracy
- Consider whether 3D perspective view adds value

**Update when done:**
- File: `controller_work.html` — tune visualization constants

---

## Completed

### Visual Ring Control System (was #10)
**Completed:** 2026-01-22

**Updated:** `controller_work.html`

**Features implemented:**
- Simplified visualization showing rings as tilted bars (edge-on view)
- Canvas drag interaction: click and drag rings to set height and tilt
- Ring labels (O/M/I for Outer/Middle/Inner) visible on each ring
- Direction labels: Back/Stage for SIDE view, L/R for FRONT view
- Visual feedback: cursor changes when hovering near draggable rings
- Both FRONT and SIDE views support drag interaction

**How it works:**
- User drags ring vertically to set height (0-100%)
- User drags ring horizontally to set tilt (-30 to +30)
- SIDE view controls tiltX (stage/back axis)
- FRONT view controls tiltY (left/right axis)
- Hit GO to send calculated TILT/TURN/DROP DMX values

---

### TILT/TURN Axis Mapping (was #8)
**Completed:** 2026-01-22

**Updated:** `LYSEKRONER.md`

**Motor positions verified:**
- Odd chandeliers (L1, L3, L5): Motor 1 at 12:00, Motor 2 at 4:00 (stage), Motor 3 at 8:00 (back)
- Even chandeliers (L2, L4, L6): Motor A at 6:00, Motor B at 10:00 (back), Motor C at 2:00 (stage)

**TURN direction mapping (tested on L6 with TILT=255):**
- TURN=0: Motor C lowest (tilts toward stage)
- TURN=42: Motor B highest (A+C down together)
- TURN=64-85: Motor A lowest (tilts toward audience)
- TURN=127: Motor B slightly lowest
- TURN=170-212: Motor A highest (B+C down)
- TURN=255: Motor A lowest

**Key finding:** TILT controls amount of tilt (0=flat, 255=max), TURN controls direction (rotates which motor is lowest).

---

### Motor-to-Truss Mapping (was #7)
**Completed:** 2026-01-21

**Updated:** `CRESTRON.md`

**Mapping verified from SIMPL stepper outputs:**
- Truss 1: M1, M2, M3 (3 motors)
- Truss 2: M4, M5, M6 (3 motors)
- Truss 3: M7, M8 (2 motors)
- Truss 4: M9, M10, M11, M12 (4 motors)
- Truss 5: M13, M14, M15 (3 motors)
- Truss 6: M16, M17, M18 (3 motors)
- Truss 7: M19, M20 (2 motors)
- PA: PA_L (H=152), PA_R (H=153) — separate from M1-M20

**Also documented:**
- Screen layout (Screen 1 = 12m cinema, Screen 2-4 = Sal A/B/C)
- Curtains are labeled 1-9 + CurtainBack (Smart Objects 19-28)
- PA hoists can be moved together
- Safety limit: one truss at a time, or both PA stacks together

---

### Crestron System Documentation (was #6)
**Completed:** 2026-01-21

**Created:** `CRESTRON.md`

**Contents:**
- CP3 processor at 10.0.80.71:41794, IP ID 0x03
- CIP join mappings verified from SIMPL source:
  - Brakes: joins 53-55
  - Motor enables: joins 101-120
  - Motor direction: joins 123-124
- CueCore IPs: 10.0.80.95/96/97 port 7000
- Screen/curtain signal handles (Smart Objects, need join verification)
- DIN-8SW8-I relay module assignments (Crestnet ID 11-15)
- Touchpanel IP assignments (0x48-4F)
