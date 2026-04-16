# Effects & Animations — Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Approach:** B (Effect Presets + Keyframe Sequencer), with C (full engine) reserved for future

---

## Overview

Add a library of curated lighting effects and a keyframe sequencer to the lighting controller. Effects run server-side (survive browser close). The UI filters available effects based on the capabilities of selected fixtures. A compass wheel provides real-time directional control for spatial effects.

---

## 1. Selection Model

### Current State
Fixtures are selectable individually or in bulk (by room, type, truss). The color picker already disables when non-color fixtures are selected.

### Design
No changes to the selection mechanism. The effects system reads the current selection and derives:
- **Capability set**: intersection of all selected fixtures' capabilities (color, dimmer, shutter, pan/tilt, zoom)
- **Available effects**: only effects whose requirements are met by the capability set are enabled; others are grayed out

### Fixture Capabilities (added to FIXTURE_TYPES)
```javascript
aura:    { color: true, dimmer: true, shutter: true, panTilt: true, zoom: true }
quantum: { color: true, dimmer: true, shutter: true, panTilt: true, zoom: true }
xbar:    { color: true, dimmer: true, shutter: false, panTilt: false, zoom: false }
xled:    { color: true, dimmer: true, shutter: false, panTilt: false, zoom: false }
fresnel: { color: false, dimmer: true, shutter: false, panTilt: false, zoom: false }
spot:    { color: false, dimmer: true, shutter: false, panTilt: false, zoom: false }
vegglys: { color: true, dimmer: true, shutter: false, panTilt: false, zoom: false }
taklys:  { color: false, dimmer: true, shutter: false, panTilt: false, zoom: false }
```

---

## 2. Fixture Position Data

### Coordinate System
- **Origin**: top-left of UI layout (stage-left, upstage)
- **Y-axis**: 0 = stage (top of UI), increases toward rear of room
- **X-axis**: 0 = left (stage-left), increases toward right (stage-right)
- **Matches UI orientation**: compass needle pointing "up" = toward stage = decreasing Y

### Position Source
Derived from the UI layout:
- **Truss row** determines Y coordinate (pipe=0, truss1=1, truss2=2, etc.)
- **Position within truss row** determines X coordinate (fixture index in the strip, normalized 0-1)
- For house lights (vegglys, taklys), positions assigned after physical mapping exercise

### Data Structure (added to FIXTURES array)
```javascript
{ id: 'aura-1', type: 'aura', ..., x: 0.35, y: 0 }
{ id: 'xbar-1', type: 'xbar', ..., x: 0.0, y: 1 }
// vegglys (after mapping):
{ id: 'vegg-a-1', type: 'vegglys', ..., x: 0.0, y: 0.5, wall: 'left', row: 1 }
```

### Vegglys Mapping (prerequisite for wall effects)
Use a fixture-finder page: lights up one vegglys at a time, user records physical position. Until mapped, vegglys are available for non-directional effects (color wash, breathe) but not spatial effects (chase, wave).

---

## 3. Directional Control — Compass Wheel

### UI Element
A circular compass widget with a draggable needle/arrow. Positioned in the effects panel, visible when a directional effect is active.

- **0 deg (up)** = toward stage (decreasing Y)
- **90 deg (right)** = stage-right (increasing X)
- **180 deg (down)** = toward rear (increasing Y)
- **270 deg (left)** = stage-left (decreasing X)
- Full 360 deg rotation, continuous drag

### Real-Time Update
- Needle position sends angle to server on every drag move (throttled to ~20 updates/sec max)
- Server recalculates fixture ordering immediately — no effect restart
- Chase/wave direction changes instantaneously as needle moves

### Math
For each fixture, compute directional offset:
```
angle_rad = angle * (PI / 180)
offset = fixture.x * sin(angle_rad) - fixture.y * cos(angle_rad)
```
Sort fixtures by offset. The sort order is the effect sequence. Negate Y because UI Y=0 is stage (top), and "up" on the compass means "toward stage."

### Spread Control
Optional: a second parameter controlling how much offset-based delay is applied. At 0% spread, all fixtures fire simultaneously. At 100%, maximum stagger. Default 50%.

---

## 4. Effect Presets Library

Each effect runs as a server-side loop (like Jellyfish). The server stores active effects and their parameters. Browser disconnection does not stop effects.

### Effect Definitions

| Effect | Requires | Parameters | Description |
|--------|----------|------------|-------------|
| **Color Wash** | color | speed, palette | Slow crossfade through a color palette. All fixtures fade together. |
| **Rainbow** | color | speed, spread | Continuous hue rotation. Spread offsets fixtures by position for a rainbow gradient. |
| **Chase** | dimmer | speed, direction, width, fade% | Sequential pulse moving through fixtures. Direction via compass. Width = how many fixtures lit at once. Fade% = trail softness. |
| **Strobe** | shutter OR dimmer | BPM, intensity | Rhythmic flash. Uses shutter channel if available (aura), dimmer fallback otherwise. |
| **Lightning** | dimmer | intensity, frequency | Random sharp flashes with fast decay on random fixtures. Irregular timing. |
| **Breathe** | dimmer | speed, min%, max% | Slow sine-wave pulse on dimmer. All fixtures in sync. |
| **Wave** | dimmer OR color | speed, direction, wavelength | Sine wave of intensity (or color) rippling across fixtures by position. Direction via compass. |
| **Sparkle** | dimmer | density, speed | Random individual fixtures briefly flash to full, then fade. Like glitter. |

### Parameters
Each parameter has a type, range, default, and label:
```javascript
speed:      { type: 'slider', min: 0.1, max: 10, default: 1, unit: 'x', label: 'Speed' }
BPM:        { type: 'slider', min: 30, max: 600, default: 120, unit: 'BPM', label: 'Tempo' }
intensity:  { type: 'slider', min: 0, max: 100, default: 100, unit: '%', label: 'Intensity' }
palette:    { type: 'palette', options: ['warm','cool','ocean','fire','pastel','custom'], default: 'warm' }
direction:  { type: 'compass', min: 0, max: 360, default: 0, label: 'Direction' }
width:      { type: 'slider', min: 1, max: 10, default: 3, unit: 'fixtures', label: 'Width' }
spread:     { type: 'slider', min: 0, max: 100, default: 50, unit: '%', label: 'Spread' }
density:    { type: 'slider', min: 1, max: 100, default: 30, unit: '%', label: 'Density' }
wavelength: { type: 'slider', min: 0.5, max: 5, default: 2, unit: 'x', label: 'Wavelength' }
fade:       { type: 'slider', min: 0, max: 100, default: 50, unit: '%', label: 'Fade Trail' }
min:        { type: 'slider', min: 0, max: 100, default: 10, unit: '%', label: 'Min' }
max:        { type: 'slider', min: 0, max: 100, default: 100, unit: '%', label: 'Max' }
```

### Color Palettes (built-in)
```javascript
warm:    [ [255,180,50,100], [255,120,20,50], [200,80,10,30] ]    // amber/gold
cool:    [ [50,100,255,80], [80,150,255,40], [30,60,200,20] ]     // blue/ice
ocean:   [ [0,80,180,0], [0,200,150,0], [0,120,255,0] ]           // teal/aqua
fire:    [ [255,0,0,0], [255,80,0,0], [255,180,0,0] ]             // red/orange
pastel:  [ [255,180,200,80], [180,200,255,60], [200,255,200,60] ] // soft pinks/blues
custom:  [ user-selected color ]                                    // from picker
```

---

## 5. Keyframe Sequencer

### Concept
Capture DMX snapshots ("keyframes") of selected fixtures. Build a sequence of keyframes with crossfade timings. Loop playback.

### Workflow
1. Set up lights how you want them (using existing controls)
2. Tap "Add Keyframe" — captures current DMX state of selected fixtures
3. Adjust lights to next look
4. Tap "Add Keyframe" again
5. Set crossfade duration and hold duration per transition
6. Choose loop mode: **Loop** (A-B-C-A-...), **Ping-Pong** (A-B-C-B-A-...), or **One-Shot**
7. Hit Play

### Data Model
```javascript
{
  id: 'seq-1',
  name: 'Gala Ambiance',
  fixtures: ['aura-1', 'aura-2', ...],
  keyframes: [
    {
      label: 'Warm White',
      channels: { 'aura-1': [22,255,128,...], 'aura-2': [...] },
      holdMs: 5000,
      fadeMs: 3000
    },
    {
      label: 'Deep Blue',
      channels: { ... },
      holdMs: 8000,
      fadeMs: 4000
    }
  ],
  loopMode: 'pingpong',
  state: 'stopped'
}
```

### Storage
Sequences saved server-side in JSON file (like show presets). Persist across server restarts.

### UI
- Timeline strip showing keyframe thumbnails (color-coded by dominant fixture color)
- Drag to reorder keyframes
- Per-keyframe: hold time slider, fade time slider
- Transport controls: Play, Pause, Stop
- Loop mode selector
- Per-keyframe timing controls (tap keyframe to edit)

---

## 6. Server Architecture

### Effect Engine (new module: effectEngine.js)
```
effectEngine
  activeEffects: Map of effectId -> { type, fixtures, params, state, tickTimer }
  startEffect(type, fixtureIds, params) -> effectId
  updateParams(effectId, params)          // real-time param changes (compass, speed)
  stopEffect(effectId)
  stopAll()
  tick(effectId)                           // called every 25ms (40fps), computes DMX frame
```

### Tick Loop
Each active effect has a 25ms interval timer. On each tick:
1. Compute current value for each fixture based on effect type, elapsed time, and params
2. Write values into a DMX frame per universe
3. Send via sACN at priority 190 (below Take Control 200, above default 100)

### Priority Layering
| Source | Priority | Wins when... |
|--------|----------|--------------|
| Take Control (manual) | 200 | Always — manual override trumps effects |
| Effects/Sequences | 190 | Running effect overrides GrandMA |
| GrandMA | 100 | Default — has control when no effect running |

### Integration with Release
- The /release endpoint also calls effectEngine.stopAll()
- Individual effects can be stopped without releasing everything
- Closing browser does NOT stop effects (server-side loops)

### API Endpoints
```
POST   /effects/start          { type, fixtures[], params }     -> { effectId }
PATCH  /effects/:id/params     { direction: 45, speed: 2 }      -> { ok }
DELETE /effects/:id                                              -> { ok }
DELETE /effects                                                  -> { ok } (stop all)
GET    /effects                                                  -> [ active effects ]

POST   /sequences              { name, fixtures[], keyframes[] } -> { id }
GET    /sequences                                                -> [ ... ]
PUT    /sequences/:id          { ... }                           -> { ok }
DELETE /sequences/:id                                            -> { ok }
POST   /sequences/:id/play                                      -> { ok }
POST   /sequences/:id/pause                                     -> { ok }
POST   /sequences/:id/stop                                      -> { ok }
POST   /keyframe/capture       { fixtures[] }                    -> { channels }
```

---

## 7. UI Layout

### New "Effects" Tab
Added alongside Control, Movement, House Presets, Show Presets.

**Top section**: Current fixture selection summary (e.g., "8 Auras selected" or "Truss 1: 2 Quantum + 12 XBar")

**Effect grid**: 2x4 grid of effect cards. Each card shows:
- Effect name + icon
- Grayed out if incompatible with selection
- Tap to activate -> card expands to show parameter sliders
- Active effect has a glowing border + stop button

**Compass wheel**: Appears when a directional effect is active. Centered below the parameter sliders. ~120px diameter. Draggable needle with degree readout.

**Keyframe section**: Below effects grid.
- "Capture Keyframe" button (snapshots current state)
- Timeline strip of captured keyframes
- Transport controls (play/pause/stop)
- Loop mode selector
- Per-keyframe timing controls (tap keyframe to edit)

---

## 8. Implementation Phases

### Phase 1: Foundation
- Add capabilities to FIXTURE_TYPES
- Add x, y coordinates to FIXTURES (truss fixtures only — derive from UI layout)
- Create effectEngine.js with tick loop infrastructure
- Add API endpoints
- Wire /release to stop all effects

### Phase 2: Core Effects
- Implement: Chase, Breathe, Strobe, Color Wash
- Build Effects tab UI with parameter sliders
- Capability-based filtering

### Phase 3: Compass Wheel
- Build compass wheel UI component
- Wire real-time direction updates to server
- Implement directional sorting in effect engine

### Phase 4: Advanced Effects
- Implement: Rainbow, Wave, Lightning, Sparkle
- Color palette system
- Spread parameter for spatial effects

### Phase 5: Keyframe Sequencer
- Keyframe capture endpoint
- Sequence data model + persistence
- Sequence playback engine (crossfade between keyframes)
- Timeline UI

### Phase 6: Vegglys Integration
- Fixture-finder tool for mapping physical positions
- Add vegglys to FIXTURES array with positions
- Enable spatial effects on wall fixtures

---

## 9. Future (Approach C considerations)
Reserved for later — not in scope for this build:
- Custom waveform editor (sine, square, sawtooth, triangle)
- Per-channel effect modifiers
- Effect layering/stacking (multiple effects on same fixtures)
- Tap-tempo BPM sync
- Audio-reactive mode
- Effect macros / effect sequences (chain effects together)

---

## 10. Dependencies and Risks

**No external dependencies** — pure Node.js + vanilla JS, consistent with existing codebase.

**Risk: DMX frame conflicts** — Two effects targeting the same fixture. Mitigation: only one effect per fixture at a time. Starting a new effect on an already-affected fixture stops the previous one on those fixtures.

**Risk: CPU load from tick loops** — 8 effects x 40fps = 320 ticks/sec. Each tick is trivial math (no I/O). Mac Studio M2 handles this easily.

**Risk: Vegglys mapping effort** — 159 fixtures across 3 rooms. Could take 1-2 hours with fixture finder tool. Not blocking — non-spatial effects work without it.
