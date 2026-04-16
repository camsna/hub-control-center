# DMX Blackout Controller - Documentation Index

**Start here:** Read `README.md` first for project overview and rules.

**Purpose:** Master list of documentation topics and session history.

**Rules:**
- Document ONE topic at a time
- Only include VERIFIED facts
- Mark anything uncertain as `[UNVERIFIED]`
- Do NOT assume, guess, or fill in details
- Ask Cameron to confirm before adding anything

---

## Completed

| # | Topic | File |
|---|-------|------|
| 0 | Project overview and rules | `README.md` |
| 1 | Fixtures, Locations, and Patch List | `FIXTURES_AND_PATCH.md` |
| 3 | Lysekroner (exhaustive DMX channel mapping) | `LYSEKRONER.md` |
| 4 | System (components, signal flow, topology) | `SYSTEM.md` |
| 5 | Crestron control system | `CRESTRON.md` |
| 6 | Movement controller issues (code investigation) | `MOVEMENT_CONTROLLER_ISSUES.md` |

---

## Pending

All pending work tracked in `TODO.md`. Summary:

**On-site verification needed:**
- Screen light addresses (#1) — which taklys illuminate screens
- House light DMX lines (#2) — confirm lines 32–49 mapping
- Unknown DMX lines 1–16 (#3) — what are they connected to?
- U5 DMX lines (#4) — which line carries Universe 5
- Astra fixture locations (#5) — where are U5 fixtures physically?
- Screen control CIP joins (#6) — monitor touchpanel traffic to get exact joins
- CurtainBack (#3 in CRESTRON unknowns) — what is it physically?

**Documentation to create:**
- Fixture Profiles (#7) — channel layouts, parameters, quirks per fixture type

**On-site verification needed (mechanism understood):**
- Lysekrone TILT/TURN axes (#8) — which compass direction does each axis tilt?

**Controller improvements needed:**
- Lysekrone visualization (#9) — doesn't match real-world appearance
- Individual motor control UI (#10) — old one removed, needs proper rebuild

---

## Session Notes

- 2026-01-21: Index created. Starting fresh after previous session corrupted docs with assumptions.
- 2026-01-21: Completed FIXTURES_AND_PATCH.md - cross-verified lighting-reference.html against controller.html. Excludes orbit channel mapping (goes in LYSEKRONER.md).
- 2026-01-21: Consolidated original 9 topics into 5 (4 merged into Fixtures doc).
- 2026-01-21: Completed SYSTEM.md from Topology.docx + Mermaid diagram.
- 2026-01-21: Added exhaustive DMX Line → Universe table to SYSTEM.md (lines 1–49). Known truss lines filled in, house light lines as placeholders, unknowns marked with `?`. Added reverse lookup table.
- 2026-01-21: Completed LYSEKRONER.md from GrandMA3 fixture profile + controller code. Full channel mapping for all 6 fixtures.
- 2026-01-21: Added per-channel function list to LYSEKRONER.md. Removed assumptions about TILT/TURN channels — added TODO to investigate their actual function.
- 2026-01-21: Added exhaustive patch list to FIXTURES_AND_PATCH.md from Hub Patch List.xlsx. Discovered: 10 Auras (not 8), U5 has "astra" fixtures (Luma 700 + XLED 3), Profil 8-10 not connected. Added Manufacturer/Model/Mode columns.
- 2026-01-21: Cleaned up TODO cruft from docs — all TODO items now live exclusively in TODO.md.
- 2026-01-21: Moved pending documentation topics (Crestron, Fixture Profiles) to TODO.md (#6, #7).
- 2026-01-21: Created README.md — comprehensive project overview for new sessions.
- 2026-01-21: Completed CRESTRON.md from Jernbanetorget.smw SIMPL source analysis. Verified CIP join mappings: brakes (53-55), motor enables (101-120), motor direction (123-124). Documented CueCore IPs (10.0.80.95-97), relay modules (Crestnet 11-15), touchpanel IPs. Screen controls use Smart Objects - join numbers need on-site verification. Added new TODOs: screen joins (#6), motor-to-hoist mapping (#7).
- 2026-01-21: Verified truss-to-motor mapping from SIMPL stepper outputs. Truss 1-7 use M1-M20 (Truss 4 has 4 motors, others 2-3). PA hoists separate (PA_L/PA_R). Added screen layout (Screen 1 = 12m cinema, 2-4 = Sal A/B/C). Curtains labeled 1-9 + CurtainBack. Motor limit: one truss at a time or both PA stacks.
- 2026-01-21: Verified relay module load mappings from SIMPL source. ID-11=M1-M8, ID-12=M9-M16, ID-13=M17-M20+PA+Screen1, ID-14=Screens2-3+boxes, ID-15=Screens4-6. Added detailed load-to-function tables to CRESTRON.md.
- 2026-01-21: Investigated lysekrone TILT/TURN (TODO #8). Found CueCore2 backup with movement presets. Cameron confirmed physical mechanism: 3 motors per ring, wires at 120° intervals. Rings tilt but do NOT rotate — "TURN" is a misleading channel name. TILT + TURN = two perpendicular tilt axes. "Galaxy" presets tilt each ring differently. Updated LYSEKRONER.md with physical construction and corrected motor control explanation. TODO #8 now just needs on-site verification of which direction each axis controls.
- 2026-01-21: Analyzed controller_work.html movement tab. Found critical bug: tiltX/tiltY values drive visualization but are NEVER SENT TO DMX. getMotorChannels() only returns speed/drop channels, ignoring tilt/turn. This explains why tilt presets create cone shapes (only height differences sent) instead of galaxy shapes (tilted rings). Created MOVEMENT_CONTROLLER_ISSUES.md documenting all findings, Cameron's test observations, and fix priorities.
- 2026-01-21: Fixed TILT/TURN DMX sending. Updated getMotorChannels() to return tilt/turn channels. Updated sendMovementCommand() to convert tiltX/tiltY to DMX values and send them. Scale: ±30 maps to 0-255, center=127.
- 2026-01-21: Added ring labels throughout controller (Inner/Middle/Outer) — 26 instances across Control tab and Movement tab.
- 2026-01-21: Removed "Advanced: Individual Motor Control" section — was quarter-baked, didn't map to actual DMX. Removed HTML, CSS, and JS (calculateMotorValues, calculateHeightTiltFromMotors, updateMotorSliders). Added TODO #10 to build proper replacement.
- 2026-01-21: Added TODO #9 for visualization system fix (needs on-site testing first to see real tilted rings).
- 2026-01-21: Added DEPLOYMENT section to README.md with Mac Studio Docker deployment commands. CRITICAL: controller lives on Mac Studio (10.0.81.223) in Docker container `lighting-controller`, NOT on homelab Mac Mini (10.70.70.24).
- 2026-01-22: Fixed orphaned `updateMotorSliders()` call that was breaking TAKE CONTROL feature.
- 2026-01-22: **Fixed lysekrone brake control.** Brakes now use DMX SPEED channel instead of broken Crestron CIP. Room brake buttons send SPEED=0 (engaged) or SPEED=255 (released) to all 6 rings per room via `/channels` endpoint. Channels: 101, 118, 135, 156, 173, 190 on U6/U7/U8.
- 2026-01-22: Updated MOVEMENT_CONTROLLER_ISSUES.md to reflect fixes. Updated CRESTRON.md to note web controller uses DMX for brakes, not CIP. Updated TODO.md #9 with current state.
- 2026-01-22: **Fixed per-lysekrone brake control.** Individual chandelier buttons (L1-L6) now control only that lysekrone's 3 rings instead of all 6 rings in the room. Room buttons still control both chandeliers.
- 2026-01-22: **Decoded CueCore2 preset DMX values.** Extracted actual DMX values from base64 track data in `JBT B, 02 Nov.xml`. Mapped Crestron preset buttons to CueCore scenes: Track 121=Down, 122=Cone Inv, 123=Cone, 124=Galaxy 1, 125=Galaxy 2, 126=Up. Galaxy presets use TILT=255 with varying TURN per ring (0/85/170).
- 2026-01-22: **Analyzed motor sensor position data.** Cameron provided photos from lysekrone controller PC showing actual sensor values. Discovered linear DMX-to-sensor mapping: `Sensor = -2,500 - (DROP × 201)`. Range: -2,500 (up) to -53,800 (down). Galaxy presets show motor differences within rings (actual tilt) — outer ring tilts most dramatically (~10,600 unit spread).
- 2026-01-22: **Updated controller presets to match CueCore.** Fixed tilt-1 and tilt-2 preset values to use actual DMX values from CueCore backup instead of guesses.
- 2026-01-22: **Documented DMX-to-sensor mapping in LYSEKRONER.md.** Added new section with linear mapping formula, verified preset values, and motor difference data for tilt positions.
- 2026-01-22: **Fixed ring mapping throughout documentation and controller.** On-site testing confirmed DMX ring numbering is INVERTED from physical size: DMX Ring 1 = Physical OUTER (largest), DMX Ring 3 = Physical INNER (smallest). Updated LYSEKRONER.md tables, controller UI labels, and preset definitions.
- 2026-01-22: **Verified TILT/TURN axis mapping (TODO #8 complete).** On-site testing on L6 confirmed: TILT controls amount of tilt (0=flat, 255=max), TURN controls direction (rotates which motor is lowest). Documented motor positions for odd vs even chandeliers and TURN direction mapping table in LYSEKRONER.md.
- 2026-01-22: **Added visual ring control system.** New features: (1) Simplified visualization showing rings as angled bars, (2) Canvas drag interaction - click and drag rings to set height and tilt, (3) Ring labels (O/M/I for Outer/Middle/Inner) on each ring, (4) Direction labels (Back/Stage for SIDE view, L/R for FRONT view). User can now set ring positions visually and hit GO to send calculated DMX values.
