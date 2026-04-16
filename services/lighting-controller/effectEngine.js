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
  chase:      { requires: ['dimmer'], params: ['speed','direction','width','fade','chaseMode'] },
  breathe:    { requires: ['dimmer'], params: ['speed','min','max'] },
  strobe:     { requires: ['dimmer'], params: ['bpm','intensity'] },
  colorWash:  { requires: ['color'],  params: ['speed','palette'] },
  rainbow:    { requires: ['color'],  params: ['speed','spread'] },
  wave:       { requires: ['dimmer'], params: ['speed','direction','wavelength','chaseMode'] },
  lightning:  { requires: ['dimmer'], params: ['intensity','frequency'] },
  sparkle:    { requires: ['dimmer'], params: ['density','speed'] }
};

var PARAM_DEFAULTS = {
  speed: 1, bpm: 120, intensity: 100, direction: 0, width: 3,
  spread: 50, density: 30, wavelength: 2, fade: 50, min: 10, max: 100,
  palette: 'warm',
  chaseMode: 'absolute'  // 'absolute' or 'centerOut'
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
  // Also stop any active sequences
  if (this.activeSequences) {
    Object.keys(this.activeSequences).forEach(function(id) {
      self.stopSequence(id);
    });
  }
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

EffectEngine.prototype.getParamDefaults = function() {
  return PARAM_DEFAULTS;
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
    frames[u][addr] = v > 0 ? 22 : 0;  // shutter open/closed
    frames[u][addr + 1] = v;            // dimmer
    frames[u][addr + 10] = v;           // white channel
  } else if (fixture.type === 'quantum') {
    frames[u][addr] = v > 0 ? 30 : 0;  // shutter open/closed
    frames[u][addr + 1] = v;            // dimmer MSB
  } else if (fixture.type === 'xled') {
    // XLED 10ch: R,G,B,W,A,UV, Master(coarse), Master(fine), Shutter, Rise
    frames[u][addr] = 255;              // R (white)
    frames[u][addr + 1] = 255;          // G
    frames[u][addr + 2] = 255;          // B
    frames[u][addr + 3] = 255;          // W
    frames[u][addr + 4] = 0;            // A
    frames[u][addr + 5] = 0;            // UV
    frames[u][addr + 6] = v;            // Master dimmer coarse
    frames[u][addr + 7] = 0;            // Master dimmer fine
    frames[u][addr + 8] = v > 0 ? 10 : 0;  // Shutter (8-15=open)
    frames[u][addr + 9] = 0;            // Rise-time (instant)
  } else if (fixture.type === 'xbar') {
    // XBar 32ch: set all 12 cell dimmers + color + shutter
    for (var cell = 0; cell < 12; cell++) {
      frames[u][addr + (cell * 2)] = v;       // cell coarse
      frames[u][addr + (cell * 2) + 1] = 0;   // cell fine
    }
    frames[u][addr + 24] = 255;  // R
    frames[u][addr + 25] = 255;  // G
    frames[u][addr + 26] = 255;  // B
    frames[u][addr + 27] = 255;  // W
    frames[u][addr + 28] = 0;    // A
    frames[u][addr + 29] = 0;    // UV
    frames[u][addr + 30] = v > 0 ? 10 : 0;  // Shutter
    frames[u][addr + 31] = 0;    // Rise-time
  } else {
    // fresnel, spot — ch1 is dimmer
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
    // XLED 10ch: R,G,B,W,A,UV, Master, MasterF, Shutter, Rise
    frames[u][addr] = r;
    frames[u][addr + 1] = g;
    frames[u][addr + 2] = b;
    frames[u][addr + 3] = w;
    frames[u][addr + 4] = 0;       // Amber
    frames[u][addr + 5] = 0;       // UV
    frames[u][addr + 6] = 255;     // Master full
    frames[u][addr + 7] = 0;
    frames[u][addr + 8] = 10;      // Shutter open
    frames[u][addr + 9] = 0;       // Rise instant
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
  var intensity = (p.intensity || 100) / 100;

  var self = this;

  if (p.chaseMode === 'centerOut') {
    // Center-out: chase starts at midpoint, expands outward in both directions
    var half = n / 2;
    // pos goes from 0 to half (one expansion cycle)
    var pos = (elapsed / 1000 * speed * half) % half;

    fixtures.forEach(function(f, i) {
      // Distance from center (0 = center, half = edge)
      var distFromCenter = Math.abs(i - (n - 1) / 2);
      // How far this fixture is from the current wavefront
      var dist = pos - distFromCenter;
      var brightness = 0;
      if (dist >= 0 && dist < width) {
        brightness = 1 - (dist / width) * fadeTrail;
        brightness = Math.max(0, brightness);
      }
      self._setDimmer(frames, f, brightness * 255 * intensity);
    });
  } else {
    // Absolute: chase goes from one end to the other
    var pos = (elapsed / 1000 * speed * n) % n;

    fixtures.forEach(function(f, i) {
      var dist = pos - i;
      if (dist < 0) dist += n;
      var brightness = 0;
      if (dist < width) {
        brightness = 1 - (dist / width) * fadeTrail;
        brightness = Math.max(0, brightness);
      }
      self._setDimmer(frames, f, brightness * 255 * intensity);
    });
  }

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
  var intensity = (p.intensity || 100) / 100;

  var self = this;

  if (p.chaseMode === 'centerOut') {
    // Center-out wave: sine radiates from midpoint
    fixtures.forEach(function(f, i) {
      var distFromCenter = Math.abs(i - (n - 1) / 2) / (n / 2);
      var phase = distFromCenter * wavelength * Math.PI * 2;
      var sine = (Math.sin(t * Math.PI * 2 - phase) + 1) / 2;
      self._setDimmer(frames, f, sine * 255 * intensity);
    });
  } else {
    fixtures.forEach(function(f, i) {
      var phase = (i / n) * wavelength * Math.PI * 2;
      var sine = (Math.sin(t * Math.PI * 2 - phase) + 1) / 2;
      self._setDimmer(frames, f, sine * 255 * intensity);
    });
  }

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

// Compute timing segments from cycleMs, blend, and per-keyframe weights
// Returns array of { holdMs, fadeMs } per keyframe
EffectEngine.prototype._computeSegments = function(seq) {
  var cycleMs = seq.cycleMs || 60000;
  var blend = seq.blend !== undefined ? seq.blend : 0.5;  // 0-1
  var n = seq.keyframes.length;
  if (n === 0) return [];

  // Convert weights to multipliers: 5 ^ (weight / 5)
  var multipliers = seq.keyframes.map(function(kf) {
    var w = kf.weight || 0;
    return Math.pow(5, w / 5);
  });
  var totalMult = multipliers.reduce(function(sum, m) { return sum + m; }, 0);

  return multipliers.map(function(m) {
    var segmentMs = cycleMs * (m / totalMult);
    var fadeMs = segmentMs * blend;
    var holdMs = segmentMs - fadeMs;
    return { holdMs: holdMs, fadeMs: fadeMs };
  });
};

EffectEngine.prototype._tickSequence = function(seqId) {
  var state = this.activeSequences[seqId];
  if (!state) return;

  var seq = state.seq;
  var segments = this._computeSegments(seq);
  var kfIdx = state.currentKeyframe;
  var kf = seq.keyframes[kfIdx];
  var seg = segments[kfIdx];
  var elapsed = Date.now() - state.phaseStart;

  if (state.phase === 'hold') {
    if (elapsed >= seg.holdMs) {
      state.phase = 'fade';
      state.phaseStart = Date.now();
      state.nextKeyframe = this._getNextKeyframe(seq, state);
      if (state.nextKeyframe === -1) {
        this.stopSequence(seqId);
        return;
      }
    } else {
      this._renderKeyframe(seq, kf);
      return;
    }
  }

  if (state.phase === 'fade') {
    var nextKf = seq.keyframes[state.nextKeyframe];
    // Fade duration comes from the CURRENT keyframe's segment
    var fadeMs = seg.fadeMs || 1;
    var fadeElapsed = Date.now() - state.phaseStart;
    if (fadeElapsed >= fadeMs) {
      state.currentKeyframe = state.nextKeyframe;
      state.phase = 'hold';
      state.phaseStart = Date.now();
      this._renderKeyframe(seq, nextKf);
    } else {
      var progress = fadeElapsed / fadeMs;
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

module.exports = EffectEngine;
