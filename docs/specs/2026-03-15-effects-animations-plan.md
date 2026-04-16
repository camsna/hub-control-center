# Effects & Animations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add curated lighting effects (chase, strobe, color wash, etc.) and a keyframe sequencer to the lighting controller, with a compass wheel for real-time directional control.

**Architecture:** New `effectEngine.js` module handles effect computation at 40fps. Server endpoints expose start/stop/update-params. Effects tab in controller.html provides UI. All DMX output goes through existing SACNSender. DRY_RUN mode prevents actual sACN transmission during development — effects compute frames and log output but do not send packets.

**Tech Stack:** Node.js (ES5-compatible, matching existing server.js style), vanilla JS frontend, Express REST API, sACN/E1.31 over UDP.

**CRITICAL CONSTRAINT:** Do NOT send any DMX/sACN packets to real fixtures during development. The effect engine must have a `dryRun` flag (default: true) that logs computed DMX values instead of calling `_sendPacket`. Only Cameron will flip this to false when ready to test on real lights.

**Deployment:** Container uses `build:` — after code changes, deploy with:
```bash
cd /Users/thehub/stacks/hub-tech
docker compose build lighting-controller && docker compose up -d lighting-controller
```

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lighting-controller/effectEngine.js` | Create | Effect computation engine — tick loops, directional sorting, all 8 effect types |
| `lighting-controller/server.js` | Modify | Add capabilities to FIXTURE_TYPES, x/y to FIXTURES, import effectEngine, add API endpoints, wire /release |
| `lighting-controller/public/controller.html` | Modify | Add Effects tab with effect cards, parameter sliders, compass wheel, keyframe sequencer UI |
| `lighting-controller/data/sequences.json` | Created at runtime | Persisted keyframe sequences (same pattern as show_presets.json) |

---

## Chunk 1: Foundation + Effect Engine

### Task 1: Add capabilities and positions to fixture data

**Files:**
- Modify: `lighting-controller/server.js:730-740` (FIXTURE_TYPES)
- Modify: `lighting-controller/server.js:746-838` (FIXTURES array)

- [ ] **Step 1: Add capabilities object to each entry in FIXTURE_TYPES**

In `server.js`, replace the FIXTURE_TYPES block at line ~730:

```javascript
const FIXTURE_TYPES = {
  aura:    { channels: 14, onProfile: AURA_ON, restProfile: AURA_REST,
             caps: { color: true, dimmer: true, shutter: true, panTilt: true, zoom: true } },
  quantum: { channels: 27, onProfile: QUANTUM_ON, restProfile: QUANTUM_REST,
             caps: { color: true, dimmer: true, shutter: true, panTilt: true, zoom: true } },
  fresnel: { channels: 6, dimmerOnly: true,
             caps: { color: false, dimmer: true, shutter: false, panTilt: false, zoom: false } },
  spot:    { channels: 6, dimmerOnly: true,
             caps: { color: false, dimmer: true, shutter: false, panTilt: false, zoom: false } },
  xbar:    { channels: 32,
             caps: { color: true, dimmer: true, shutter: false, panTilt: false, zoom: false } },
  xled:    { channels: 10,
             caps: { color: true, dimmer: true, shutter: false, panTilt: false, zoom: false } },
};
```

- [ ] **Step 2: Add x, y coordinates to every fixture in FIXTURES array**

Y values by truss row (normalized): pipe=0.0, truss1=0.15, truss2=0.3, truss3=0.45, truss4=0.6, truss5=0.7, truss6=0.8, truss7=0.9.

X values: normalize fixture index within its truss. For a truss with N fixtures, fixture at index i gets x = i / (N-1). If N=1, x=0.5.

Add `x` and `y` to each fixture object. Example for pipe (8 auras, y=0.0):

```javascript
  { id: 'aura-1', type: 'aura', universe: 4, address: 29, room: 'a', truss: 'pipe', x: 0.000, y: 0.0 },
  { id: 'aura-2', type: 'aura', universe: 4, address: 15, room: 'a', truss: 'pipe', x: 0.143, y: 0.0 },
  { id: 'aura-3', type: 'aura', universe: 4, address: 1,  room: 'a', truss: 'pipe', x: 0.286, y: 0.0 },
  { id: 'aura-4', type: 'aura', universe: 4, address: 43, room: 'a', truss: 'pipe', x: 0.429, y: 0.0 },
  { id: 'aura-5', type: 'aura', universe: 4, address: 57, room: 'a', truss: 'pipe', x: 0.571, y: 0.0 },
  { id: 'aura-6', type: 'aura', universe: 4, address: 71, room: 'a', truss: 'pipe', x: 0.714, y: 0.0 },
  { id: 'aura-7', type: 'aura', universe: 4, address: 85, room: 'a', truss: 'pipe', x: 0.857, y: 0.0 },
  { id: 'aura-8', type: 'aura', universe: 4, address: 99, room: 'a', truss: 'pipe', x: 1.000, y: 0.0 },
```

Apply the same pattern to all trusses. Compute x = index / (count-1) for each truss group.

- [ ] **Step 3: Add a /fixtures endpoint to expose fixture data (with capabilities) to the frontend**

At the end of server.js API endpoints section, add:

```javascript
app.get('/fixtures', function(req, res) {
  var result = FIXTURES.map(function(f) {
    var typeInfo = FIXTURE_TYPES[f.type] || {};
    return {
      id: f.id, type: f.type, universe: f.universe, address: f.address,
      room: f.room, truss: f.truss, x: f.x, y: f.y,
      caps: typeInfo.caps || {}
    };
  });
  res.json({ ok: true, fixtures: result });
});
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add fixture capabilities and XY positions"
```

---

### Task 2: Create effectEngine.js — core infrastructure

**Files:**
- Create: `lighting-controller/effectEngine.js`

The effect engine is a standalone module that receives a reference to the SACNSender (or a dry-run stub) and manages effect lifecycles. It does NOT import server.js — server.js imports it.

- [ ] **Step 1: Create effectEngine.js with the EffectEngine class skeleton**

```javascript
'use strict';

// ============================================================
// EFFECT ENGINE — computes DMX frames for lighting effects
// ============================================================
// Usage: var engine = new EffectEngine(fixtureData, sender, opts)
//   fixtureData: array of { id, type, universe, address, x, y, caps, channelCount }
//   sender: object with sendFrame(universe, dmxData, priority) method
//   opts: { dryRun: true } — if true, logs instead of sending
// ============================================================

var EFFECT_PRIORITY = 190;
var TICK_INTERVAL = 25; // 40fps

// === COLOR PALETTES ===
var PALETTES = {
  warm:   [ [255,180,50,100], [255,120,20,50], [200,80,10,30] ],
  cool:   [ [50,100,255,80], [80,150,255,40], [30,60,200,20] ],
  ocean:  [ [0,80,180,0], [0,200,150,0], [0,120,255,0] ],
  fire:   [ [255,0,0,0], [255,80,0,0], [255,180,0,0] ],
  pastel: [ [255,180,200,80], [180,200,255,60], [200,255,200,60] ]
};

// === EFFECT PARAMETER DEFINITIONS ===
var EFFECT_DEFS = {
  chase:      { requires: ['dimmer'], params: ['speed','direction','width','fade'] },
  breathe:    { requires: ['dimmer'], params: ['speed','min','max'] },
  strobe:     { requires: ['dimmer'], params: ['bpm','intensity'] },
  colorWash:  { requires: ['color'],  params: ['speed','palette'] },
  rainbow:    { requires: ['color'],  params: ['speed','spread'] },
  wave:       { requires: ['dimmer'], params: ['speed','direction','wavelength'] },
  lightning:  { requires: ['dimmer'], params: ['intensity','frequency'] },
  sparkle:    { requires: ['dimmer'], params: ['density','speed'] }
};

var PARAM_DEFAULTS = {
  speed: 1, bpm: 120, intensity: 100, direction: 0, width: 3,
  spread: 50, density: 30, wavelength: 2, fade: 50, min: 10, max: 100,
  palette: 'warm'
};

function EffectEngine(fixtureData, sender, opts) {
  this.fixtures = fixtureData;       // full fixture array with caps
  this.sender = sender;              // { sendFrame(universe, dmxData, priority) }
  this.dryRun = opts && opts.dryRun !== undefined ? opts.dryRun : true;
  this.activeEffects = {};           // effectId -> { type, fixtures, params, startTime, timer, frameCount }
  this.nextId = 1;

  // Build fixture lookup by id
  this.fixtureMap = {};
  var self = this;
  fixtureData.forEach(function(f) {
    self.fixtureMap[f.id] = f;
  });
}

// === PUBLIC API ===

// Get available effects for a set of fixture IDs (capability intersection)
EffectEngine.prototype.getAvailableEffects = function(fixtureIds) {
  var self = this;
  // Find intersection of capabilities
  var caps = null;
  fixtureIds.forEach(function(id) {
    var f = self.fixtureMap[id];
    if (!f || !f.caps) return;
    if (!caps) {
      caps = {};
      Object.keys(f.caps).forEach(function(k) { caps[k] = f.caps[k]; });
    } else {
      Object.keys(caps).forEach(function(k) {
        if (!f.caps[k]) caps[k] = false;
      });
    }
  });
  if (!caps) return [];

  // Filter effects whose requirements are met
  var available = [];
  Object.keys(EFFECT_DEFS).forEach(function(effectType) {
    var def = EFFECT_DEFS[effectType];
    var met = def.requires.every(function(req) { return caps[req]; });
    available.push({ type: effectType, available: met, params: def.params });
  });
  return available;
};

// Start an effect on given fixtures
EffectEngine.prototype.startEffect = function(type, fixtureIds, params) {
  var self = this;
  var def = EFFECT_DEFS[type];
  if (!def) return { error: 'Unknown effect type: ' + type };

  // Stop any existing effects on these fixtures
  this._stopConflicting(fixtureIds);

  // Merge params with defaults
  var merged = {};
  Object.keys(PARAM_DEFAULTS).forEach(function(k) { merged[k] = PARAM_DEFAULTS[k]; });
  if (params) {
    Object.keys(params).forEach(function(k) { merged[k] = params[k]; });
  }

  // Resolve fixture objects and sort by directional offset
  var fixtures = [];
  fixtureIds.forEach(function(id) {
    var f = self.fixtureMap[id];
    if (f) fixtures.push(f);
  });
  var sorted = self._sortByDirection(fixtures, merged.direction || 0);

  var effectId = 'fx-' + (this.nextId++);
  var effect = {
    id: effectId,
    type: type,
    fixtureIds: fixtureIds,
    fixtures: sorted,
    params: merged,
    startTime: Date.now(),
    frameCount: 0,
    timer: null,
    // Per-fixture state (for effects that need it, like sparkle/lightning)
    state: {}
  };

  // Start tick loop
  effect.timer = setInterval(function() {
    self._tick(effectId);
  }, TICK_INTERVAL);

  this.activeEffects[effectId] = effect;
  console.log('[FX] Started ' + type + ' (' + effectId + ') on ' + fixtures.length + ' fixtures' +
              (self.dryRun ? ' [DRY RUN]' : ''));
  return { effectId: effectId };
};

// Update parameters of a running effect (real-time)
EffectEngine.prototype.updateParams = function(effectId, params) {
  var effect = this.activeEffects[effectId];
  if (!effect) return { error: 'Effect not found: ' + effectId };

  var self = this;
  Object.keys(params).forEach(function(k) {
    effect.params[k] = params[k];
  });

  // Re-sort fixtures if direction changed
  if (params.direction !== undefined) {
    effect.fixtures = self._sortByDirection(
      effect.fixtureIds.map(function(id) { return self.fixtureMap[id]; }).filter(Boolean),
      params.direction
    );
  }

  return { ok: true };
};

// Stop a single effect
EffectEngine.prototype.stopEffect = function(effectId) {
  var effect = this.activeEffects[effectId];
  if (!effect) return { error: 'Effect not found: ' + effectId };

  if (effect.timer) clearInterval(effect.timer);
  delete this.activeEffects[effectId];
  console.log('[FX] Stopped ' + effect.type + ' (' + effectId + ')');
  return { ok: true };
};

// Stop all effects
EffectEngine.prototype.stopAll = function() {
  var self = this;
  Object.keys(this.activeEffects).forEach(function(id) {
    self.stopEffect(id);
  });
  return { ok: true };
};

// List active effects
EffectEngine.prototype.listActive = function() {
  var self = this;
  return Object.keys(this.activeEffects).map(function(id) {
    var e = self.activeEffects[id];
    return { id: e.id, type: e.type, fixtureIds: e.fixtureIds, params: e.params };
  });
};

// Get all effect definitions (for UI)
EffectEngine.prototype.getEffectDefs = function() {
  return EFFECT_DEFS;
};

EffectEngine.prototype.getPalettes = function() {
  return PALETTES;
};

// === DIRECTIONAL SORTING ===

EffectEngine.prototype._sortByDirection = function(fixtures, angleDeg) {
  var rad = angleDeg * (Math.PI / 180);
  var sinA = Math.sin(rad);
  var cosA = Math.cos(rad);

  // Compute offset for each fixture
  var withOffset = fixtures.map(function(f) {
    // "up" on compass = toward stage = -Y direction
    var offset = (f.x || 0) * sinA - (f.y || 0) * cosA;
    return { fixture: f, offset: offset };
  });

  // Sort by offset (ascending = first to fire)
  withOffset.sort(function(a, b) { return a.offset - b.offset; });

  return withOffset.map(function(w) { return w.fixture; });
};

// === TICK DISPATCHER ===

EffectEngine.prototype._tick = function(effectId) {
  var effect = this.activeEffects[effectId];
  if (!effect) return;

  var elapsed = Date.now() - effect.startTime;
  effect.frameCount++;

  // Compute per-fixture DMX values
  var frames = this._computeEffect(effect, elapsed);

  if (this.dryRun) {
    // Log every 80 ticks (~2 seconds) to avoid spam
    if (effect.frameCount % 80 === 1) {
      var sample = {};
      Object.keys(frames).forEach(function(u) {
        var nonZero = 0;
        for (var i = 0; i < 512; i++) { if (frames[u][i] !== 0) nonZero++; }
        sample['U' + u] = nonZero + ' non-zero channels';
      });
      console.log('[FX-DRY] ' + effect.type + ' (' + effectId + ') t=' +
                  (elapsed/1000).toFixed(1) + 's: ' + JSON.stringify(sample));
    }
  } else {
    // Send frames to sACN
    var self = this;
    Object.keys(frames).forEach(function(u) {
      self.sender.sendFrame(parseInt(u), frames[u], EFFECT_PRIORITY);
    });
  }
};

// === EFFECT COMPUTATION ===

EffectEngine.prototype._computeEffect = function(effect, elapsed) {
  switch (effect.type) {
    case 'chase':     return this._chase(effect, elapsed);
    case 'breathe':   return this._breathe(effect, elapsed);
    case 'strobe':    return this._strobe(effect, elapsed);
    case 'colorWash': return this._colorWash(effect, elapsed);
    case 'rainbow':   return this._rainbow(effect, elapsed);
    case 'wave':      return this._wave(effect, elapsed);
    case 'lightning':  return this._lightning(effect, elapsed);
    case 'sparkle':   return this._sparkle(effect, elapsed);
    default:          return {};
  }
};

// Helper: create empty DMX frames object keyed by universe
EffectEngine.prototype._emptyFrames = function(fixtures) {
  var frames = {};
  fixtures.forEach(function(f) {
    if (!frames[f.universe]) frames[f.universe] = new Uint8Array(512);
  });
  return frames;
};

// Helper: set dimmer value for a fixture in frames
// Handles different fixture types' dimmer channel locations
EffectEngine.prototype._setDimmer = function(frames, fixture, value) {
  var addr = fixture.address - 1; // 0-indexed
  var v = Math.max(0, Math.min(255, Math.round(value)));
  var u = fixture.universe;
  if (!frames[u]) return;

  if (fixture.type === 'aura') {
    frames[u][addr] = 22;      // shutter open
    frames[u][addr + 1] = v;   // dimmer
    // Keep white on for visibility
    frames[u][addr + 10] = v;  // white channel
  } else if (fixture.type === 'quantum') {
    frames[u][addr] = v > 0 ? 30 : 0;  // shutter open/closed
    frames[u][addr + 1] = v;            // dimmer MSB
  } else {
    // xbar, xled, fresnel, spot — ch1 is dimmer
    frames[u][addr] = v;
  }
};

// Helper: set RGBW color for a fixture in frames
EffectEngine.prototype._setColor = function(frames, fixture, r, g, b, w) {
  var addr = fixture.address - 1;
  var u = fixture.universe;
  if (!frames[u]) return;

  if (fixture.type === 'aura') {
    frames[u][addr] = 22;          // shutter open
    frames[u][addr + 1] = 255;    // dimmer full
    frames[u][addr + 7] = r;      // R
    frames[u][addr + 8] = g;      // G
    frames[u][addr + 9] = b;      // B
    frames[u][addr + 10] = w;     // W
  } else if (fixture.type === 'quantum') {
    frames[u][addr] = 30;          // shutter open
    frames[u][addr + 1] = 255;    // dimmer full
    // Quantum color control is complex — use CTC and color wheel
    // For now, skip color on quantums (dimmer effects still work)
  } else if (fixture.type === 'xbar') {
    // XBar 32-channel mode: need to check channel layout
    // Assuming segments with RGB — set first segment
    frames[u][addr] = 255;         // dimmer
    frames[u][addr + 1] = r;
    frames[u][addr + 2] = g;
    frames[u][addr + 3] = b;
    frames[u][addr + 4] = w;
  } else if (fixture.type === 'xled') {
    // XLED 10ch: dimmer, R, G, B, W, ...
    frames[u][addr] = 255;         // dimmer
    frames[u][addr + 1] = r;
    frames[u][addr + 2] = g;
    frames[u][addr + 3] = b;
    frames[u][addr + 4] = w;
  }
};

// Helper: set shutter for strobe effect
EffectEngine.prototype._setShutter = function(frames, fixture, open) {
  var addr = fixture.address - 1;
  var u = fixture.universe;
  if (!frames[u]) return;

  if (fixture.type === 'aura') {
    frames[u][addr] = open ? 22 : 0;
    if (open) frames[u][addr + 1] = 255; // dimmer full when open
  } else if (fixture.type === 'quantum') {
    frames[u][addr] = open ? 30 : 0;
    if (open) frames[u][addr + 1] = 255;
  } else {
    // Use dimmer as pseudo-shutter
    frames[u][addr] = open ? 255 : 0;
  }
};

// === EFFECT IMPLEMENTATIONS ===

// CHASE: sequential pulse through fixtures in directional order
EffectEngine.prototype._chase = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures; // already sorted by direction
  var n = fixtures.length;
  if (n === 0) return {};

  var frames = this._emptyFrames(fixtures);
  var speed = (p.speed || 1) * 0.5;            // cycles per second
  var width = Math.max(1, p.width || 3);        // how many fixtures lit
  var fadeTrail = (p.fade || 50) / 100;         // 0-1 trail softness
  var pos = (elapsed / 1000 * speed * n) % n;   // current head position

  var self = this;
  fixtures.forEach(function(f, i) {
    var dist = pos - i;
    // Wrap around
    if (dist < 0) dist += n;
    // Normalize to 0-1 within width
    var brightness = 0;
    if (dist < width) {
      brightness = 1 - (dist / width) * fadeTrail;
      brightness = Math.max(0, brightness);
    }
    self._setDimmer(frames, f, brightness * 255 * (p.intensity || 100) / 100);
  });

  return frames;
};

// BREATHE: sine-wave dimmer pulse, all fixtures in sync
EffectEngine.prototype._breathe = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures;
  var frames = this._emptyFrames(fixtures);

  var speed = (p.speed || 1) * 0.3;  // cycles per second
  var minVal = (p.min || 10) / 100;
  var maxVal = (p.max || 100) / 100;
  var t = elapsed / 1000 * speed * Math.PI * 2;
  var sine = (Math.sin(t) + 1) / 2;  // 0-1
  var brightness = minVal + sine * (maxVal - minVal);

  var self = this;
  fixtures.forEach(function(f) {
    self._setDimmer(frames, f, brightness * 255);
  });

  return frames;
};

// STROBE: rhythmic flash at BPM
EffectEngine.prototype._strobe = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures;
  var frames = this._emptyFrames(fixtures);

  var bpm = p.bpm || 120;
  var msPerBeat = 60000 / bpm;
  var phase = (elapsed % msPerBeat) / msPerBeat;
  // On for first 20% of beat, off for rest (snappy feel)
  var on = phase < 0.2;

  var self = this;
  fixtures.forEach(function(f) {
    self._setShutter(frames, f, on);
  });

  return frames;
};

// COLOR WASH: slow crossfade through palette colors
EffectEngine.prototype._colorWash = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures;
  var frames = this._emptyFrames(fixtures);

  var palette = PALETTES[p.palette || 'warm'] || PALETTES.warm;
  if (p.palette === 'custom' && p.customColor) {
    palette = [p.customColor];
  }
  var speed = (p.speed || 1) * 0.1;  // slow
  var t = (elapsed / 1000 * speed) % palette.length;
  var idx = Math.floor(t);
  var frac = t - idx;
  var c1 = palette[idx % palette.length];
  var c2 = palette[(idx + 1) % palette.length];

  // Interpolate
  var r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
  var g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
  var b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);
  var w = Math.round(c1[3] + (c2[3] - c1[3]) * frac);

  var self = this;
  fixtures.forEach(function(f) {
    self._setColor(frames, f, r, g, b, w);
  });

  return frames;
};

// RAINBOW: continuous hue rotation with positional spread
EffectEngine.prototype._rainbow = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures;
  var frames = this._emptyFrames(fixtures);
  var n = fixtures.length;

  var speed = (p.speed || 1) * 0.2;
  var spread = (p.spread || 50) / 100;  // 0-1
  var baseHue = (elapsed / 1000 * speed * 360) % 360;

  var self = this;
  fixtures.forEach(function(f, i) {
    var offset = n > 1 ? (i / (n - 1)) * spread * 360 : 0;
    var hue = (baseHue + offset) % 360;
    var rgb = self._hueToRgb(hue);
    self._setColor(frames, f, rgb[0], rgb[1], rgb[2], 0);
  });

  return frames;
};

// WAVE: sine wave of intensity rippling across fixtures
EffectEngine.prototype._wave = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures;
  var frames = this._emptyFrames(fixtures);
  var n = fixtures.length;

  var speed = (p.speed || 1) * 0.5;
  var wavelength = (p.wavelength || 2);
  var t = elapsed / 1000 * speed;

  var self = this;
  fixtures.forEach(function(f, i) {
    var phase = (i / n) * wavelength * Math.PI * 2;
    var sine = (Math.sin(t * Math.PI * 2 - phase) + 1) / 2;
    self._setDimmer(frames, f, sine * 255 * (p.intensity || 100) / 100);
  });

  return frames;
};

// LIGHTNING: random sharp flashes with fast decay
EffectEngine.prototype._lightning = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures;
  var frames = this._emptyFrames(fixtures);
  var n = fixtures.length;

  var freq = (p.frequency || 50) / 100;    // probability per tick
  var intensity = (p.intensity || 100) / 100;

  // Initialize state if needed
  if (!effect.state.flashes) effect.state.flashes = {};

  // Maybe trigger new flash
  if (Math.random() < freq * 0.05) {  // ~2 flashes/sec at frequency=100
    var target = Math.floor(Math.random() * n);
    effect.state.flashes[target] = { brightness: 1.0, decay: 0.85 + Math.random() * 0.1 };
  }

  // Render active flashes
  var self = this;
  fixtures.forEach(function(f, i) {
    var flash = effect.state.flashes[i];
    if (flash && flash.brightness > 0.01) {
      self._setDimmer(frames, f, flash.brightness * 255 * intensity);
      flash.brightness *= flash.decay;
    } else if (flash) {
      delete effect.state.flashes[i];
    }
  });

  return frames;
};

// SPARKLE: random individual fixtures briefly flash
EffectEngine.prototype._sparkle = function(effect, elapsed) {
  var p = effect.params;
  var fixtures = effect.fixtures;
  var frames = this._emptyFrames(fixtures);
  var n = fixtures.length;

  var density = (p.density || 30) / 100;
  var speed = (p.speed || 1);

  // Initialize state
  if (!effect.state.sparks) effect.state.sparks = {};

  // Maybe trigger new sparks
  var numNew = Math.floor(density * n * 0.02 * speed);
  for (var s = 0; s < numNew; s++) {
    if (Math.random() < density * 0.1) {
      var target = Math.floor(Math.random() * n);
      effect.state.sparks[target] = { brightness: 1.0, decay: 0.9 };
    }
  }

  // Render
  var self = this;
  fixtures.forEach(function(f, i) {
    var spark = effect.state.sparks[i];
    if (spark && spark.brightness > 0.02) {
      self._setDimmer(frames, f, spark.brightness * 255);
      spark.brightness *= spark.decay;
    } else if (spark) {
      delete effect.state.sparks[i];
    }
  });

  return frames;
};

// === UTILITY ===

// Convert hue (0-360) to RGB [r,g,b]
EffectEngine.prototype._hueToRgb = function(hue) {
  var h = hue / 60;
  var c = 255;
  var x = Math.round(c * (1 - Math.abs(h % 2 - 1)));
  if (h < 1) return [c, x, 0];
  if (h < 2) return [x, c, 0];
  if (h < 3) return [0, c, x];
  if (h < 4) return [0, x, c];
  if (h < 5) return [x, 0, c];
  return [c, 0, x];
};

// Stop effects that conflict with given fixture IDs
EffectEngine.prototype._stopConflicting = function(fixtureIds) {
  var idSet = {};
  fixtureIds.forEach(function(id) { idSet[id] = true; });

  var self = this;
  Object.keys(this.activeEffects).forEach(function(effectId) {
    var effect = self.activeEffects[effectId];
    var conflicts = effect.fixtureIds.some(function(id) { return idSet[id]; });
    if (conflicts) {
      console.log('[FX] Stopping conflicting effect ' + effectId + ' (' + effect.type + ')');
      self.stopEffect(effectId);
    }
  });
};

module.exports = EffectEngine;
```

- [ ] **Step 2: Commit**

```bash
git add effectEngine.js
git commit -m "feat: create effect engine with 8 effect types and directional sorting"
```

---

### Task 3: Wire effectEngine into server.js

**Files:**
- Modify: `lighting-controller/server.js` (top-level require, initialization, API endpoints, /release integration)

- [ ] **Step 1: Add require and initialization near top of server.js**

After the existing `require` lines (around line 5), add:

```javascript
var EffectEngine = require('./effectEngine');
```

After the `sacnSender` is instantiated (after `new SACNSender()`), add:

```javascript
// === EFFECT ENGINE ===
var effectFixtureData = FIXTURES.map(function(f) {
  var typeInfo = FIXTURE_TYPES[f.type] || {};
  return {
    id: f.id, type: f.type, universe: f.universe, address: f.address,
    x: f.x, y: f.y, caps: typeInfo.caps || {},
    channelCount: typeInfo.channels || 1
  };
});

var effectSender = {
  sendFrame: function(universe, dmxData, priority) {
    sacnSender._sendPacket(universe, dmxData, priority);
  }
};

var effectEngine = new EffectEngine(effectFixtureData, effectSender, { dryRun: true });
console.log('Effect engine initialized (DRY RUN mode — no sACN output)');
```

- [ ] **Step 2: Add effect API endpoints**

Add these before the existing `app.post('/release', ...)` endpoint:

```javascript
// === EFFECT ENDPOINTS ===

// List available effects for given fixtures
app.post('/effects/available', function(req, res) {
  var fixtureIds = (req.body && req.body.fixtures) || [];
  var available = effectEngine.getAvailableEffects(fixtureIds);
  res.json({ ok: true, effects: available });
});

// Start an effect
app.post('/effects/start', function(req, res) {
  var body = req.body || {};
  if (!body.type || !body.fixtures || !body.fixtures.length) {
    return res.status(400).json({ error: 'Required: type, fixtures[]' });
  }
  var result = effectEngine.startEffect(body.type, body.fixtures, body.params || {});
  if (result.error) return res.status(400).json(result);
  res.json({ ok: true, effectId: result.effectId });
});

// Update running effect parameters
app.patch('/effects/:id/params', function(req, res) {
  var result = effectEngine.updateParams(req.params.id, req.body || {});
  if (result.error) return res.status(404).json(result);
  res.json({ ok: true });
});

// Stop a single effect
app.delete('/effects/:id', function(req, res) {
  var result = effectEngine.stopEffect(req.params.id);
  if (result.error) return res.status(404).json(result);
  res.json({ ok: true });
});

// Stop all effects
app.delete('/effects', function(req, res) {
  effectEngine.stopAll();
  res.json({ ok: true });
});

// List active effects
app.get('/effects', function(req, res) {
  res.json({ ok: true, effects: effectEngine.listActive() });
});

// Get effect definitions and palettes (for UI)
app.get('/effects/defs', function(req, res) {
  res.json({
    ok: true,
    effects: effectEngine.getEffectDefs(),
    palettes: effectEngine.getPalettes(),
    paramDefaults: effectEngine.getParamDefaults ? effectEngine.getParamDefaults() : {}
  });
});
```

- [ ] **Step 3: Wire effectEngine.stopAll() into the /release endpoint**

Find the existing `/release` endpoint (around line 2170). Add this line right after `console.log('Releasing all control to console');`:

```javascript
  effectEngine.stopAll();
```

- [ ] **Step 4: Update Dockerfile to copy effectEngine.js**

Add after the `COPY server.js ./` line:

```dockerfile
COPY effectEngine.js ./
```

- [ ] **Step 5: Commit**

```bash
git add server.js Dockerfile
git commit -m "feat: wire effect engine into server with REST API endpoints"
```

---

### Task 4: Keyframe sequence persistence and playback

**Files:**
- Modify: `lighting-controller/effectEngine.js` (add sequence methods)
- Modify: `lighting-controller/server.js` (add sequence endpoints)

- [ ] **Step 1: Add sequence support to effectEngine.js**

Add these methods to the EffectEngine prototype, before `module.exports`:

```javascript
// === KEYFRAME SEQUENCER ===

EffectEngine.prototype.initSequenceStore = function(dataDir) {
  this.dataDir = dataDir;
  this.sequencesFile = dataDir + '/sequences.json';
  this.sequences = this._loadSequences();
  this.activeSequences = {};  // seqId -> { timer, currentKeyframe, phase }
};

EffectEngine.prototype._loadSequences = function() {
  try {
    var fs = require('fs');
    if (fs.existsSync(this.sequencesFile)) {
      return JSON.parse(fs.readFileSync(this.sequencesFile, 'utf8'));
    }
  } catch (e) {
    console.error('[FX] Error loading sequences:', e.message);
  }
  return { nextId: 1, sequences: [] };
};

EffectEngine.prototype._saveSequences = function() {
  try {
    var fs = require('fs');
    fs.writeFileSync(this.sequencesFile, JSON.stringify(this.sequences, null, 2));
    return true;
  } catch (e) {
    console.error('[FX] Error saving sequences:', e.message);
    return false;
  }
};

EffectEngine.prototype.createSequence = function(name, fixtureIds, keyframes, loopMode) {
  var seq = {
    id: 'seq-' + (this.sequences.nextId++),
    name: name || 'Untitled',
    fixtures: fixtureIds,
    keyframes: keyframes || [],
    loopMode: loopMode || 'loop'
  };
  this.sequences.sequences.push(seq);
  this._saveSequences();
  return seq;
};

EffectEngine.prototype.updateSequence = function(seqId, updates) {
  var seq = this.sequences.sequences.find(function(s) { return s.id === seqId; });
  if (!seq) return { error: 'Sequence not found' };
  Object.keys(updates).forEach(function(k) { seq[k] = updates[k]; });
  this._saveSequences();
  return { ok: true, sequence: seq };
};

EffectEngine.prototype.deleteSequence = function(seqId) {
  this.stopSequence(seqId);
  this.sequences.sequences = this.sequences.sequences.filter(function(s) { return s.id !== seqId; });
  this._saveSequences();
  return { ok: true };
};

EffectEngine.prototype.listSequences = function() {
  var activeIds = Object.keys(this.activeSequences);
  var self = this;
  return this.sequences.sequences.map(function(s) {
    return {
      id: s.id, name: s.name, fixtures: s.fixtures,
      keyframeCount: s.keyframes.length, loopMode: s.loopMode,
      playing: activeIds.indexOf(s.id) !== -1
    };
  });
};

EffectEngine.prototype.playSequence = function(seqId) {
  var seq = this.sequences.sequences.find(function(s) { return s.id === seqId; });
  if (!seq) return { error: 'Sequence not found' };
  if (seq.keyframes.length < 2) return { error: 'Need at least 2 keyframes' };

  // Stop conflicting effects on these fixtures
  this._stopConflicting(seq.fixtures);

  // Stop if already playing
  if (this.activeSequences[seqId]) this.stopSequence(seqId);

  var state = {
    seq: seq,
    currentKeyframe: 0,
    phase: 'hold',  // 'hold' or 'fade'
    phaseStart: Date.now(),
    timer: null,
    direction: 1  // 1=forward, -1=backward (for pingpong)
  };

  var self = this;
  state.timer = setInterval(function() {
    self._tickSequence(seqId);
  }, TICK_INTERVAL);

  this.activeSequences[seqId] = state;
  console.log('[FX] Playing sequence ' + seq.name + ' (' + seqId + ')' +
              (self.dryRun ? ' [DRY RUN]' : ''));
  return { ok: true };
};

EffectEngine.prototype.pauseSequence = function(seqId) {
  var state = this.activeSequences[seqId];
  if (!state) return { error: 'Sequence not playing' };
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  return { ok: true };
};

EffectEngine.prototype.stopSequence = function(seqId) {
  var state = this.activeSequences[seqId];
  if (!state) return { ok: true };
  if (state.timer) clearInterval(state.timer);
  delete this.activeSequences[seqId];
  console.log('[FX] Stopped sequence ' + seqId);
  return { ok: true };
};

EffectEngine.prototype._tickSequence = function(seqId) {
  var state = this.activeSequences[seqId];
  if (!state) return;

  var seq = state.seq;
  var kf = seq.keyframes[state.currentKeyframe];
  var elapsed = Date.now() - state.phaseStart;

  if (state.phase === 'hold') {
    if (elapsed >= (kf.holdMs || 3000)) {
      // Transition to fade phase, advance keyframe
      state.phase = 'fade';
      state.phaseStart = Date.now();
      state.nextKeyframe = this._getNextKeyframe(seq, state);
      if (state.nextKeyframe === -1) {
        // One-shot complete
        this.stopSequence(seqId);
        return;
      }
    } else {
      // Hold: render current keyframe static
      this._renderKeyframe(seq, kf);
      return;
    }
  }

  if (state.phase === 'fade') {
    var nextKf = seq.keyframes[state.nextKeyframe];
    var fadeMs = nextKf.fadeMs || 2000;
    if (elapsed >= fadeMs) {
      // Fade complete, move to next keyframe hold
      state.currentKeyframe = state.nextKeyframe;
      state.phase = 'hold';
      state.phaseStart = Date.now();
      this._renderKeyframe(seq, nextKf);
    } else {
      // Interpolate between current and next
      var progress = elapsed / fadeMs;
      this._renderKeyframeCrossfade(seq, kf, nextKf, progress);
    }
  }
};

EffectEngine.prototype._getNextKeyframe = function(seq, state) {
  var n = seq.keyframes.length;
  if (seq.loopMode === 'loop') {
    return (state.currentKeyframe + 1) % n;
  } else if (seq.loopMode === 'pingpong') {
    var next = state.currentKeyframe + state.direction;
    if (next >= n) { state.direction = -1; next = n - 2; }
    if (next < 0) { state.direction = 1; next = 1; }
    return next;
  } else {
    // oneshot
    var next = state.currentKeyframe + 1;
    return next >= n ? -1 : next;
  }
};

EffectEngine.prototype._renderKeyframe = function(seq, kf) {
  if (!kf.channels) return;
  var frames = {};
  var self = this;

  seq.fixtures.forEach(function(fId) {
    var f = self.fixtureMap[fId];
    if (!f || !kf.channels[fId]) return;
    if (!frames[f.universe]) frames[f.universe] = new Uint8Array(512);
    var chData = kf.channels[fId];
    var addr = f.address - 1;
    for (var i = 0; i < chData.length && (addr + i) < 512; i++) {
      frames[f.universe][addr + i] = chData[i];
    }
  });

  if (!this.dryRun) {
    Object.keys(frames).forEach(function(u) {
      self.sender.sendFrame(parseInt(u), frames[u], EFFECT_PRIORITY);
    });
  }
};

EffectEngine.prototype._renderKeyframeCrossfade = function(seq, kfA, kfB, progress) {
  if (!kfA.channels || !kfB.channels) return;
  var frames = {};
  var self = this;

  seq.fixtures.forEach(function(fId) {
    var f = self.fixtureMap[fId];
    if (!f) return;
    var chA = kfA.channels[fId] || [];
    var chB = kfB.channels[fId] || [];
    if (!frames[f.universe]) frames[f.universe] = new Uint8Array(512);
    var addr = f.address - 1;
    var len = Math.max(chA.length, chB.length);
    for (var i = 0; i < len && (addr + i) < 512; i++) {
      var a = chA[i] || 0;
      var b = chB[i] || 0;
      frames[f.universe][addr + i] = Math.round(a + (b - a) * progress);
    }
  });

  if (!this.dryRun) {
    Object.keys(frames).forEach(function(u) {
      self.sender.sendFrame(parseInt(u), frames[u], EFFECT_PRIORITY);
    });
  }
};
```

- [ ] **Step 2: Add PARAM_DEFAULTS getter to effectEngine.js**

After the existing `getPalettes` method, add:

```javascript
EffectEngine.prototype.getParamDefaults = function() {
  return PARAM_DEFAULTS;
};
```

- [ ] **Step 3: Add sequence initialization and endpoints to server.js**

After the effectEngine initialization (after `new EffectEngine(...)`), add:

```javascript
effectEngine.initSequenceStore(path.join(__dirname, 'data'));
```

Add these endpoints after the effect endpoints:

```javascript
// === SEQUENCE ENDPOINTS ===

app.post('/sequences', function(req, res) {
  var body = req.body || {};
  if (!body.fixtures || !body.fixtures.length) {
    return res.status(400).json({ error: 'Required: fixtures[]' });
  }
  var seq = effectEngine.createSequence(body.name, body.fixtures, body.keyframes, body.loopMode);
  res.json({ ok: true, sequence: seq });
});

app.get('/sequences', function(req, res) {
  res.json({ ok: true, sequences: effectEngine.listSequences() });
});

app.put('/sequences/:id', function(req, res) {
  var result = effectEngine.updateSequence(req.params.id, req.body || {});
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

app.delete('/sequences/:id', function(req, res) {
  var result = effectEngine.deleteSequence(req.params.id);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

app.post('/sequences/:id/play', function(req, res) {
  var result = effectEngine.playSequence(req.params.id);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/sequences/:id/pause', function(req, res) {
  var result = effectEngine.pauseSequence(req.params.id);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/sequences/:id/stop', function(req, res) {
  var result = effectEngine.stopSequence(req.params.id);
  res.json(result);
});

// Capture current DMX state for keyframe
app.post('/keyframe/capture', function(req, res) {
  var fixtureIds = (req.body && req.body.fixtures) || [];
  var channels = {};
  fixtureIds.forEach(function(fId) {
    var fixture = FIXTURES.find(function(f) { return f.id === fId; });
    if (!fixture) return;
    var typeInfo = FIXTURE_TYPES[fixture.type];
    if (!typeInfo) return;
    var u = fixture.universe;
    var addr = fixture.address - 1;
    var chCount = typeInfo.channels || 1;
    var data = sacnSender.universeData[u];
    if (!data) return;
    var chData = [];
    for (var i = 0; i < chCount && (addr + i) < 512; i++) {
      chData.push(data.dmxData[addr + i]);
    }
    channels[fId] = chData;
  });
  res.json({ ok: true, channels: channels });
});
```

- [ ] **Step 4: Commit**

```bash
git add effectEngine.js server.js
git commit -m "feat: add keyframe sequencer with persistence and crossfade playback"
```

---

## Chunk 2: Effects Tab UI

### Task 5: Add Effects tab to controller.html — tab structure and effect cards

**Files:**
- Modify: `lighting-controller/public/controller.html`

- [ ] **Step 1: Add "Effects" tab button to the tab bar**

Find the tab-bar nav (line ~3494). After the show-presets tab and before the blackout tab, add:

```html
    <div class="tab" data-tab="effects">Effects</div>
```

- [ ] **Step 2: Add Effects tab content container**

After the show-presets tab-content div (line ~4524) and before the blackout tab-content div, add:

```html
    <!-- Effects Tab -->
    <div class="tab-content" data-tab-content="effects">

      <!-- Selection Summary -->
      <div class="effects-selection-summary" id="effectsSelectionSummary">
        <span class="effects-summary-text">No fixtures selected</span>
      </div>

      <!-- Effect Cards Grid -->
      <div class="effects-grid" id="effectsGrid">
        <!-- Cards generated by JS -->
      </div>

      <!-- Active Effect Controls -->
      <div class="effects-active-panel" id="effectsActivePanel" style="display:none;">
        <div class="effects-active-header">
          <span id="effectsActiveName">Chase</span>
          <button class="effects-stop-btn" id="effectsStopBtn">Stop</button>
        </div>

        <!-- Parameter Sliders Container -->
        <div class="effects-params" id="effectsParams">
          <!-- Generated per-effect -->
        </div>

        <!-- Compass Wheel (shown for directional effects) -->
        <div class="effects-compass-container" id="effectsCompassContainer" style="display:none;">
          <canvas id="compassCanvas" width="150" height="150"></canvas>
          <div class="compass-readout" id="compassReadout">0°</div>
        </div>
      </div>

      <!-- Keyframe Sequencer -->
      <div class="effects-sequencer" id="effectsSequencer">
        <div class="sequencer-header">
          <h3>Keyframe Sequencer</h3>
          <button class="seq-btn" id="seqCaptureBtn">Capture Keyframe</button>
        </div>

        <!-- Keyframe Timeline -->
        <div class="sequencer-timeline" id="seqTimeline">
          <div class="seq-empty-msg" id="seqEmptyMsg">Select fixtures and capture keyframes to build a sequence</div>
        </div>

        <!-- Transport Controls -->
        <div class="sequencer-transport" id="seqTransport" style="display:none;">
          <button class="seq-transport-btn" id="seqPlayBtn">Play</button>
          <button class="seq-transport-btn" id="seqPauseBtn">Pause</button>
          <button class="seq-transport-btn" id="seqStopBtn">Stop</button>
          <select id="seqLoopMode">
            <option value="loop">Loop</option>
            <option value="pingpong">Ping-Pong</option>
            <option value="oneshot">One-Shot</option>
          </select>
          <button class="seq-btn" id="seqSaveBtn">Save</button>
        </div>

        <!-- Saved Sequences -->
        <div class="sequencer-saved" id="seqSavedList">
          <!-- Populated by JS -->
        </div>
      </div>

    </div><!-- /tab-content effects -->
```

- [ ] **Step 3: Add Effects tab CSS**

Add to the `<style>` section (before the closing `</style>` tag):

```css
    /* === EFFECTS TAB === */
    .effects-selection-summary {
      padding: 8px 12px;
      background: var(--bg-card);
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--text-dim);
    }

    .effects-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }

    .effect-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 8px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
    }
    .effect-card:hover:not(.disabled) {
      border-color: var(--accent);
      transform: translateY(-1px);
    }
    .effect-card.disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .effect-card.active {
      border-color: var(--accent);
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
    }
    .effect-card .effect-icon { font-size: 20px; margin-bottom: 4px; }
    .effect-card .effect-name { font-size: 11px; font-weight: 600; }

    .effects-active-panel {
      background: var(--bg-card);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .effects-active-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .effects-active-header span { font-weight: 600; font-size: 14px; }
    .effects-stop-btn {
      background: var(--red);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 12px;
    }

    .effects-params { display: flex; flex-direction: column; gap: 8px; }
    .effect-param-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .effect-param-row label { font-size: 11px; width: 60px; color: var(--text-dim); }
    .effect-param-row input[type="range"] { flex: 1; }
    .effect-param-row .param-value { font-size: 11px; width: 40px; text-align: right; }

    /* Compass Wheel */
    .effects-compass-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 12px;
      gap: 4px;
    }
    #compassCanvas { cursor: grab; }
    #compassCanvas:active { cursor: grabbing; }
    .compass-readout { font-size: 13px; font-weight: 600; color: var(--accent); }

    /* Keyframe Sequencer */
    .effects-sequencer {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
    }
    .sequencer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .sequencer-header h3 { font-size: 13px; margin: 0; }
    .seq-btn {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 11px;
    }
    .seq-btn:hover { opacity: 0.9; }

    .sequencer-timeline {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 8px 0;
      min-height: 60px;
      align-items: center;
    }
    .seq-empty-msg { font-size: 11px; color: var(--text-dim); }

    .seq-keyframe {
      min-width: 50px;
      height: 50px;
      border-radius: 6px;
      border: 2px solid var(--border);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
    }
    .seq-keyframe.active { border-color: var(--accent); }
    .seq-keyframe .seq-kf-label { font-weight: 600; }
    .seq-keyframe .seq-kf-timing { font-size: 9px; color: var(--text-dim); }
    .seq-keyframe .seq-kf-delete {
      position: absolute;
      top: -6px;
      right: -6px;
      background: var(--red);
      color: white;
      border: none;
      border-radius: 50%;
      width: 14px;
      height: 14px;
      font-size: 9px;
      cursor: pointer;
      display: none;
      line-height: 14px;
      padding: 0;
    }
    .seq-keyframe:hover .seq-kf-delete { display: block; }

    .seq-arrow {
      color: var(--text-dim);
      font-size: 14px;
      flex-shrink: 0;
    }

    .sequencer-transport {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }
    .seq-transport-btn {
      background: var(--bg-elevated);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 11px;
    }
    .seq-transport-btn:hover { border-color: var(--accent); }
    #seqLoopMode {
      background: var(--bg-elevated);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 11px;
    }

    .sequencer-saved { margin-top: 12px; }
    .seq-saved-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px;
      background: var(--bg-elevated);
      border-radius: 4px;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .seq-saved-item button {
      background: none;
      border: 1px solid var(--border);
      border-radius: 3px;
      color: var(--text);
      padding: 2px 8px;
      cursor: pointer;
      font-size: 10px;
      margin-left: 4px;
    }

    /* Mobile adjustments */
    @media (max-width: 768px) {
      .effects-grid { grid-template-columns: repeat(2, 1fr); }
    }
```

- [ ] **Step 4: Commit**

```bash
git add public/controller.html
git commit -m "feat: add Effects tab HTML structure and CSS"
```

---

### Task 6: Effects tab JavaScript — effect cards, parameters, and compass wheel

**Files:**
- Modify: `lighting-controller/public/controller.html` (JavaScript section)

- [ ] **Step 1: Add effect definitions and state to the JavaScript section**

Add this block at the end of the JavaScript section (before the closing `</script>` tag):

```javascript
// ============================================================================
// EFFECTS TAB
// ============================================================================

var EFFECT_ICONS = {
  chase: '>', colorWash: '~', breathe: 'O', strobe: '#',
  rainbow: '=', wave: 'S', lightning: '!', sparkle: '*'
};
var EFFECT_LABELS = {
  chase: 'Chase', colorWash: 'Color Wash', breathe: 'Breathe', strobe: 'Strobe',
  rainbow: 'Rainbow', wave: 'Wave', lightning: 'Lightning', sparkle: 'Sparkle'
};
var EFFECT_PARAM_LABELS = {
  speed: 'Speed', bpm: 'Tempo', intensity: 'Intensity', direction: 'Direction',
  width: 'Width', spread: 'Spread', density: 'Density', wavelength: 'Wave Len',
  fade: 'Fade Trail', min: 'Min', max: 'Max', palette: 'Palette'
};
var EFFECT_PARAM_RANGES = {
  speed: [0.1, 10, 0.1], bpm: [30, 600, 1], intensity: [0, 100, 1],
  width: [1, 10, 1], spread: [0, 100, 1], density: [1, 100, 1],
  wavelength: [0.5, 5, 0.1], fade: [0, 100, 1], min: [0, 100, 1], max: [0, 100, 1]
};
var DIRECTIONAL_EFFECTS = ['chase', 'wave', 'rainbow'];

var effectsState = {
  activeEffectId: null,
  activeEffectType: null,
  currentParams: {},
  compassAngle: 0,
  compassDragging: false,
  // Keyframe sequencer state
  keyframes: [],
  activeSequenceId: null,
  sequencePlaying: false
};

function initEffectsTab() {
  buildEffectCards();
  setupCompassWheel();
  setupSequencer();
  loadSavedSequences();
}

// Update selection summary and card availability when selection changes
function updateEffectsSelection() {
  var selected = getSelectedFixtureIds();
  var summary = document.getElementById('effectsSelectionSummary');
  var summaryText = summary.querySelector('.effects-summary-text');

  if (selected.length === 0) {
    summaryText.textContent = 'No fixtures selected — select fixtures in the Control tab';
    disableAllEffectCards();
    return;
  }

  // Count by type
  var counts = {};
  selected.forEach(function(id) {
    var type = getFixtureType(id);
    counts[type] = (counts[type] || 0) + 1;
  });
  var parts = Object.keys(counts).map(function(t) {
    return counts[t] + 'x ' + t.charAt(0).toUpperCase() + t.slice(1);
  });
  summaryText.textContent = selected.length + ' fixtures: ' + parts.join(', ');

  // Check capabilities and update cards
  fetch('http://' + SERVER + '/effects/available', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fixtures: selected })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) return;
    data.effects.forEach(function(e) {
      var card = document.querySelector('.effect-card[data-effect="' + e.type + '"]');
      if (!card) return;
      if (e.available) {
        card.classList.remove('disabled');
      } else {
        card.classList.add('disabled');
      }
    });
  }).catch(function() {});
}

function getSelectedFixtureIds() {
  var ids = [];
  document.querySelectorAll('.fixture.selected').forEach(function(el) {
    if (el.dataset.id) ids.push(el.dataset.id);
  });
  return ids;
}

function getFixtureType(id) {
  // Search all truss groups in TRUSS_FIXTURES
  var keys = Object.keys(TRUSS_FIXTURES);
  for (var k = 0; k < keys.length; k++) {
    var fixtures = TRUSS_FIXTURES[keys[k]];
    for (var i = 0; i < fixtures.length; i++) {
      if (fixtures[i].id === id) return fixtures[i].type;
    }
  }
  return 'unknown';
}

function disableAllEffectCards() {
  document.querySelectorAll('.effect-card').forEach(function(c) {
    c.classList.add('disabled');
  });
}

function buildEffectCards() {
  var grid = document.getElementById('effectsGrid');
  var types = ['chase', 'colorWash', 'breathe', 'strobe', 'rainbow', 'wave', 'lightning', 'sparkle'];

  grid.innerHTML = types.map(function(type) {
    return '<div class="effect-card disabled" data-effect="' + type + '">' +
      '<div class="effect-icon">' + (EFFECT_ICONS[type] || '?') + '</div>' +
      '<div class="effect-name">' + (EFFECT_LABELS[type] || type) + '</div>' +
    '</div>';
  }).join('');

  grid.addEventListener('click', function(e) {
    var card = e.target.closest('.effect-card');
    if (!card || card.classList.contains('disabled')) return;
    var type = card.dataset.effect;
    if (effectsState.activeEffectId && effectsState.activeEffectType === type) {
      stopActiveEffect();
    } else {
      startEffect(type);
    }
  });
}

function startEffect(type) {
  var selected = getSelectedFixtureIds();
  if (selected.length === 0) return;

  // Stop current effect if any
  if (effectsState.activeEffectId) {
    stopActiveEffect();
  }

  fetch('http://' + SERVER + '/effects/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: type, fixtures: selected, params: {} })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) return;
    effectsState.activeEffectId = data.effectId;
    effectsState.activeEffectType = type;
    effectsState.currentParams = {};

    // Update UI
    document.querySelectorAll('.effect-card').forEach(function(c) { c.classList.remove('active'); });
    var card = document.querySelector('.effect-card[data-effect="' + type + '"]');
    if (card) card.classList.add('active');

    showEffectControls(type);
  }).catch(function(err) { console.error('Start effect failed:', err); });
}

function stopActiveEffect() {
  if (!effectsState.activeEffectId) return;

  fetch('http://' + SERVER + '/effects/' + effectsState.activeEffectId, { method: 'DELETE' })
    .catch(function() {});

  effectsState.activeEffectId = null;
  effectsState.activeEffectType = null;

  document.querySelectorAll('.effect-card').forEach(function(c) { c.classList.remove('active'); });
  document.getElementById('effectsActivePanel').style.display = 'none';
}

function showEffectControls(type) {
  var panel = document.getElementById('effectsActivePanel');
  panel.style.display = 'block';
  document.getElementById('effectsActiveName').textContent = EFFECT_LABELS[type] || type;

  // Build parameter sliders
  var paramsDiv = document.getElementById('effectsParams');
  // Get params for this effect type from EFFECT_DEFS equivalent
  var paramNames = {
    chase: ['speed','width','fade'],
    breathe: ['speed','min','max'],
    strobe: ['bpm','intensity'],
    colorWash: ['speed','palette'],
    rainbow: ['speed','spread'],
    wave: ['speed','wavelength'],
    lightning: ['intensity','frequency'],
    sparkle: ['density','speed']
  }[type] || [];

  var defaults = { speed: 1, bpm: 120, intensity: 100, width: 3, spread: 50,
                   density: 30, wavelength: 2, fade: 50, min: 10, max: 100, frequency: 50 };

  paramsDiv.innerHTML = paramNames.filter(function(p) { return p !== 'palette'; }).map(function(param) {
    var range = EFFECT_PARAM_RANGES[param] || [0, 100, 1];
    var val = defaults[param] || 50;
    effectsState.currentParams[param] = val;
    return '<div class="effect-param-row">' +
      '<label>' + (EFFECT_PARAM_LABELS[param] || param) + '</label>' +
      '<input type="range" min="' + range[0] + '" max="' + range[1] + '" step="' + range[2] +
      '" value="' + val + '" data-param="' + param + '">' +
      '<span class="param-value">' + val + '</span>' +
    '</div>';
  }).join('');

  // Add palette selector for color effects
  if (paramNames.indexOf('palette') !== -1) {
    var palettes = ['warm', 'cool', 'ocean', 'fire', 'pastel'];
    paramsDiv.innerHTML += '<div class="effect-param-row">' +
      '<label>Palette</label>' +
      '<select data-param="palette" style="flex:1; background:var(--bg-elevated); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:3px;">' +
      palettes.map(function(p) { return '<option value="' + p + '">' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>'; }).join('') +
      '</select>' +
    '</div>';
  }

  // Slider change handlers
  paramsDiv.querySelectorAll('input[type="range"]').forEach(function(slider) {
    slider.addEventListener('input', function() {
      var param = this.dataset.param;
      var val = parseFloat(this.value);
      this.nextElementSibling.textContent = val;
      effectsState.currentParams[param] = val;
      sendParamUpdate(param, val);
    });
  });

  // Palette change handler
  var palSelect = paramsDiv.querySelector('select[data-param="palette"]');
  if (palSelect) {
    palSelect.addEventListener('change', function() {
      effectsState.currentParams.palette = this.value;
      sendParamUpdate('palette', this.value);
    });
  }

  // Show/hide compass
  var compassContainer = document.getElementById('effectsCompassContainer');
  if (DIRECTIONAL_EFFECTS.indexOf(type) !== -1) {
    compassContainer.style.display = 'flex';
  } else {
    compassContainer.style.display = 'none';
  }

  // Stop button
  document.getElementById('effectsStopBtn').onclick = stopActiveEffect;
}

function sendParamUpdate(param, value) {
  if (!effectsState.activeEffectId) return;
  var body = {};
  body[param] = value;
  fetch('http://' + SERVER + '/effects/' + effectsState.activeEffectId + '/params', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(function() {});
}

// === COMPASS WHEEL ===

function setupCompassWheel() {
  var canvas = document.getElementById('compassCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var cx = 75, cy = 75, radius = 60;

  function draw(angle) {
    ctx.clearRect(0, 0, 150, 150);

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cardinal markers
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE', cx, cy - radius - 4);
    ctx.fillText('REAR', cx, cy + radius + 12);
    ctx.save();
    ctx.translate(cx - radius - 8, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('L', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(cx + radius + 8, cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('R', 0, 0);
    ctx.restore();

    // Tick marks every 45 degrees
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var x1 = cx + Math.sin(a) * (radius - 6);
      var y1 = cy - Math.cos(a) * (radius - 6);
      var x2 = cx + Math.sin(a) * radius;
      var y2 = cy - Math.cos(a) * radius;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Needle
    var rad = angle * Math.PI / 180;
    var nx = cx + Math.sin(rad) * (radius - 12);
    var ny = cy - Math.cos(rad) * (radius - 12);

    // Needle line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Needle tip (arrowhead)
    ctx.beginPath();
    ctx.arc(nx, ny, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
  }

  function getAngleFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX || e.touches[0].clientX) - rect.left - cx;
    var y = (e.clientY || e.touches[0].clientY) - rect.top - cy;
    var angle = Math.atan2(x, -y) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return Math.round(angle);
  }

  function onDrag(e) {
    if (!effectsState.compassDragging) return;
    e.preventDefault();
    var angle = getAngleFromEvent(e);
    effectsState.compassAngle = angle;
    draw(angle);
    document.getElementById('compassReadout').textContent = angle + '\u00B0';
    sendParamUpdate('direction', angle);
  }

  canvas.addEventListener('mousedown', function(e) {
    effectsState.compassDragging = true;
    onDrag(e);
  });
  canvas.addEventListener('touchstart', function(e) {
    effectsState.compassDragging = true;
    onDrag(e);
  }, { passive: false });

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, { passive: false });

  document.addEventListener('mouseup', function() { effectsState.compassDragging = false; });
  document.addEventListener('touchend', function() { effectsState.compassDragging = false; });

  // Initial draw
  draw(0);
}

// === KEYFRAME SEQUENCER ===

function setupSequencer() {
  document.getElementById('seqCaptureBtn').addEventListener('click', captureKeyframe);
  document.getElementById('seqPlayBtn').addEventListener('click', playSequence);
  document.getElementById('seqPauseBtn').addEventListener('click', pauseSequence);
  document.getElementById('seqStopBtn').addEventListener('click', stopSequence);
  document.getElementById('seqSaveBtn').addEventListener('click', saveSequence);
}

function captureKeyframe() {
  var selected = getSelectedFixtureIds();
  if (selected.length === 0) {
    showStatus('Select fixtures first', true);
    return;
  }

  fetch('http://' + SERVER + '/keyframe/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fixtures: selected })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) return;

    effectsState.keyframes.push({
      label: 'KF ' + (effectsState.keyframes.length + 1),
      channels: data.channels,
      holdMs: 3000,
      fadeMs: 2000
    });

    renderTimeline();
    showStatus('Keyframe captured');
  }).catch(function(err) { showStatus('Capture failed', true); });
}

function renderTimeline() {
  var timeline = document.getElementById('seqTimeline');
  var transport = document.getElementById('seqTransport');
  var emptyMsg = document.getElementById('seqEmptyMsg');

  if (effectsState.keyframes.length === 0) {
    emptyMsg.style.display = 'block';
    transport.style.display = 'none';
    timeline.innerHTML = '';
    timeline.appendChild(emptyMsg);
    return;
  }

  emptyMsg.style.display = 'none';
  transport.style.display = 'flex';

  var html = '';
  effectsState.keyframes.forEach(function(kf, i) {
    if (i > 0) html += '<span class="seq-arrow">\u2192</span>';
    // Determine dominant color from channel data for the thumbnail background
    var bgColor = '#3a3a42';
    html += '<div class="seq-keyframe" data-index="' + i + '" style="background:' + bgColor + ';">' +
      '<span class="seq-kf-label">' + kf.label + '</span>' +
      '<span class="seq-kf-timing">' + (kf.holdMs/1000) + 's / ' + (kf.fadeMs/1000) + 's</span>' +
      '<button class="seq-kf-delete" data-index="' + i + '">\u00D7</button>' +
    '</div>';
  });

  timeline.innerHTML = html;

  // Delete buttons
  timeline.querySelectorAll('.seq-kf-delete').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var idx = parseInt(this.dataset.index);
      effectsState.keyframes.splice(idx, 1);
      renderTimeline();
    });
  });

  // Click keyframe to edit timing
  timeline.querySelectorAll('.seq-keyframe').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(this.dataset.index);
      var kf = effectsState.keyframes[idx];
      var holdStr = prompt('Hold duration (seconds):', (kf.holdMs / 1000));
      if (holdStr !== null) kf.holdMs = parseFloat(holdStr) * 1000;
      var fadeStr = prompt('Fade duration (seconds):', (kf.fadeMs / 1000));
      if (fadeStr !== null) kf.fadeMs = parseFloat(fadeStr) * 1000;
      renderTimeline();
    });
  });
}

function playSequence() {
  if (effectsState.keyframes.length < 2) {
    showStatus('Need at least 2 keyframes', true);
    return;
  }
  var selected = getSelectedFixtureIds();
  if (selected.length === 0) {
    showStatus('Select fixtures first', true);
    return;
  }

  var loopMode = document.getElementById('seqLoopMode').value;

  // Create and immediately play
  fetch('http://' + SERVER + '/sequences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Live Sequence',
      fixtures: selected,
      keyframes: effectsState.keyframes,
      loopMode: loopMode
    })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) return;
    effectsState.activeSequenceId = data.sequence.id;
    return fetch('http://' + SERVER + '/sequences/' + data.sequence.id + '/play', { method: 'POST' });
  }).then(function(r) { return r.json(); }).then(function(data) {
    effectsState.sequencePlaying = true;
    showStatus('Sequence playing');
  }).catch(function(err) { showStatus('Play failed', true); });
}

function pauseSequence() {
  if (!effectsState.activeSequenceId) return;
  fetch('http://' + SERVER + '/sequences/' + effectsState.activeSequenceId + '/pause', { method: 'POST' })
    .then(function() { effectsState.sequencePlaying = false; showStatus('Sequence paused'); })
    .catch(function() {});
}

function stopSequence() {
  if (!effectsState.activeSequenceId) return;
  fetch('http://' + SERVER + '/sequences/' + effectsState.activeSequenceId + '/stop', { method: 'POST' })
    .then(function() {
      effectsState.sequencePlaying = false;
      effectsState.activeSequenceId = null;
      showStatus('Sequence stopped');
    }).catch(function() {});
}

function saveSequence() {
  if (effectsState.keyframes.length < 2) {
    showStatus('Need at least 2 keyframes to save', true);
    return;
  }
  var name = prompt('Sequence name:', 'My Sequence');
  if (!name) return;

  var selected = getSelectedFixtureIds();
  var loopMode = document.getElementById('seqLoopMode').value;

  fetch('http://' + SERVER + '/sequences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name,
      fixtures: selected,
      keyframes: effectsState.keyframes,
      loopMode: loopMode
    })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) return;
    showStatus('Sequence saved: ' + name);
    loadSavedSequences();
  }).catch(function() {});
}

function loadSavedSequences() {
  fetch('http://' + SERVER + '/sequences')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) return;
      var list = document.getElementById('seqSavedList');
      if (data.sequences.length === 0) {
        list.innerHTML = '';
        return;
      }
      list.innerHTML = '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-dim);">Saved Sequences</div>' +
        data.sequences.map(function(s) {
          return '<div class="seq-saved-item">' +
            '<span>' + s.name + ' (' + s.keyframeCount + ' keyframes)</span>' +
            '<span>' +
              '<button onclick="playSavedSequence(\'' + s.id + '\')">Play</button>' +
              '<button onclick="deleteSavedSequence(\'' + s.id + '\')">Delete</button>' +
            '</span>' +
          '</div>';
        }).join('');
    }).catch(function() {});
}

function playSavedSequence(seqId) {
  fetch('http://' + SERVER + '/sequences/' + seqId + '/play', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        effectsState.activeSequenceId = seqId;
        effectsState.sequencePlaying = true;
        showStatus('Sequence playing');
      } else {
        showStatus(data.error || 'Play failed', true);
      }
    }).catch(function() {});
}

function deleteSavedSequence(seqId) {
  fetch('http://' + SERVER + '/sequences/' + seqId, { method: 'DELETE' })
    .then(function() { loadSavedSequences(); })
    .catch(function() {});
}

// === HOOK INTO EXISTING SELECTION SYSTEM ===

// Patch the existing fixture click handler to also update effects selection
var _origFixtureClick = null;
(function() {
  // Find the fixture click handler and extend it
  // The existing code uses event delegation on .fixture elements
  // We'll add a MutationObserver-style hook: whenever selection changes, update effects
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        updateEffectsSelection();
      }
    });
  });

  // Observe all fixture elements for class changes (selected/deselected)
  function observeFixtures() {
    document.querySelectorAll('.fixture').forEach(function(el) {
      observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }

  // Run after DOM is ready
  if (document.readyState === 'complete') {
    observeFixtures();
  } else {
    window.addEventListener('load', observeFixtures);
  }
})();

// Initialize effects tab
initEffectsTab();
```

- [ ] **Step 2: Commit**

```bash
git add public/controller.html
git commit -m "feat: add Effects tab JavaScript — cards, compass wheel, keyframe sequencer UI"
```

---

### Task 7: Build, deploy, and smoke test

**Files:**
- No file changes — deployment and verification only

- [ ] **Step 1: Build and deploy**

```bash
cd /Users/thehub/stacks/hub-tech
docker compose build lighting-controller && docker compose up -d lighting-controller
```

- [ ] **Step 2: Verify server starts without errors**

```bash
docker logs lighting-controller --tail 20
```

Expected: `Effect engine initialized (DRY RUN mode — no sACN output)` in the logs, no crash.

- [ ] **Step 3: Smoke test API endpoints**

```bash
# Get fixtures with capabilities
curl -s http://10.0.81.223:8081/fixtures | python3 -m json.tool | head -20

# Check available effects for auras
curl -s -X POST http://10.0.81.223:8081/effects/available \
  -H 'Content-Type: application/json' \
  -d '{"fixtures":["aura-1","aura-2"]}' | python3 -m json.tool

# Start a chase in dry run
curl -s -X POST http://10.0.81.223:8081/effects/start \
  -H 'Content-Type: application/json' \
  -d '{"type":"chase","fixtures":["aura-1","aura-2","aura-3"],"params":{"speed":2}}' | python3 -m json.tool

# Check logs for dry run output
docker logs lighting-controller --tail 5

# List active effects
curl -s http://10.0.81.223:8081/effects | python3 -m json.tool

# Update direction in real-time
curl -s -X PATCH http://10.0.81.223:8081/effects/fx-1/params \
  -H 'Content-Type: application/json' \
  -d '{"direction":90}' | python3 -m json.tool

# Stop all effects
curl -s -X DELETE http://10.0.81.223:8081/effects | python3 -m json.tool
```

- [ ] **Step 4: Open the UI and verify the Effects tab**

Navigate to `http://10.0.81.223:8081` (or via Tailscale `http://100.74.129.100:8081`).

Verify:
- Effects tab appears in tab bar
- Selecting fixtures in Control tab updates the effects selection summary
- Effect cards enable/disable based on fixture capabilities
- Clicking an enabled effect card shows parameter controls
- Compass wheel renders and needle is draggable
- Keyframe capture button works (captures current DMX state)
- Check server logs for `[FX-DRY]` entries confirming effects compute without sending

- [ ] **Step 5: Push to GitHub**

```bash
cd /Users/thehub/stacks/hub-tech
git push origin main
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Fixture capabilities + XY positions | server.js |
| 2 | Effect engine module (8 effects + directional sorting) | effectEngine.js (new) |
| 3 | Wire engine into server + REST API | server.js, Dockerfile |
| 4 | Keyframe sequencer persistence + playback | effectEngine.js, server.js |
| 5 | Effects tab HTML + CSS | controller.html |
| 6 | Effects tab JavaScript (cards, compass, sequencer UI) | controller.html |
| 7 | Build, deploy, smoke test | deployment only |

**Total commits:** 6 code commits + deployment verification

**DRY RUN mode:** The effect engine defaults to `dryRun: true`. Effects compute DMX frames and log every ~2 seconds but never send sACN packets. When Cameron is ready to test on real lights, change the initialization in server.js to `{ dryRun: false }`.
