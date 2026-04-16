// MX6000 Control - Decision Tree Frontend
// NO PRESETS - direct layer API control

// Resolution data per stage height
// Wall: 6144x2304, 4500mm tall, bottom at 427mm from floor
// Window sizes: max=100%, large=85%, medium=70%, small=55%
const RESOLUTIONS = {
  '40': {
    effective: { w: 6144, h: 2304 },
    windows: {
      max:    { w: 4096, h: 2304 },
      large:  { w: 3481, h: 1958 },
      medium: { w: 2867, h: 1613 },
      small:  { w: 2252, h: 1267 },
    }
  },
  '60': {
    effective: { w: 6144, h: 2215 },
    windows: {
      max:    { w: 3938, h: 2215 },
      large:  { w: 3347, h: 1883 },
      medium: { w: 2757, h: 1551 },
      small:  { w: 2165, h: 1218 },
    }
  },
  '80': {
    effective: { w: 6144, h: 2113 },
    windows: {
      max:    { w: 3756, h: 2113 },
      large:  { w: 3193, h: 1796 },
      medium: { w: 2629, h: 1479 },
      small:  { w: 2066, h: 1162 },
    }
  },
  '100': {
    effective: { w: 6144, h: 2011 },
    windows: {
      max:    { w: 3575, h: 2011 },
      large:  { w: 3038, h: 1709 },
      medium: { w: 2503, h: 1408 },
      small:  { w: 1966, h: 1106 },
    }
  },
};

// State
const state = {
  connected: false,
  stageHeight: '60',
  source: null,
  layout: 'center',
  background: 'none',
  windowSize: 'max',
  brightness: 80,
  blackout: false,
  freeze: false,
  frameRate: 30,
  bitDepth: 0,  // 0 = 8-bit, 255 = auto
  syncMode: 100,  // 100=internal, 101=genlock unlocked, 102=genlock to source
};

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const vmpWarning = document.getElementById('vmp-warning');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessDisplay = document.getElementById('brightness-display');
const applyBtn = document.getElementById('btn-apply');
const applyStatus = document.getElementById('apply-status');
const initializeBtn = document.getElementById('btn-initialize');
const blackoutBtn = document.getElementById('btn-blackout');
const freezeBtn = document.getElementById('btn-freeze');
const stepLayout = document.getElementById('step-layout');
const stepBackground = document.getElementById('step-background');
const stepSize = document.getElementById('step-size');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  loadBrightness();
  loadOutputSettings();
  setupEventListeners();
  updateUI();
  updateResolutionHints();
});

// Check device status
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.connected) {
      state.connected = true;
      statusIndicator.className = 'status-indicator connected';
      statusIndicator.querySelector('.text').textContent = `Connected - ${data.device}`;
      vmpWarning.style.display = 'none';
    } else {
      state.connected = false;
      statusIndicator.className = 'status-indicator error';
      statusIndicator.querySelector('.text').textContent = 'Disconnected';

      // Check if it's a VMP lock
      if (data.error && data.error.includes('timeout')) {
        vmpWarning.style.display = 'block';
      }
    }
  } catch (err) {
    state.connected = false;
    statusIndicator.className = 'status-indicator error';
    statusIndicator.querySelector('.text').textContent = 'Server Error';
  }
}

// Load current brightness
async function loadBrightness() {
  try {
    const res = await fetch('/api/brightness');
    const data = await res.json();
    if (data.brightness !== undefined) {
      state.brightness = data.brightness;
      brightnessSlider.value = data.brightness;
      brightnessDisplay.textContent = data.brightness;
    }
  } catch (err) {
    console.error('Failed to load brightness:', err);
  }
}

// Load output settings from MX6000 and update UI
async function loadOutputSettings() {
  try {
    const res = await fetch('/api/output');
    const data = await res.json();

    state.frameRate = data.frameRate || 30;
    state.bitDepth = data.bitDepth ?? 0;
    state.syncMode = data.genlock?.selectedType ?? 100;

    // Select matching sync mode button
    document.querySelectorAll('[data-syncmode]').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.syncmode) === state.syncMode);
    });

    // Show/hide framerate vs genlock rows
    updateSyncUI();

    // Select matching frame rate button
    document.querySelectorAll('[data-framerate]').forEach(btn => {
      btn.classList.toggle('selected', parseFloat(btn.dataset.framerate) === state.frameRate);
    });

    // Select matching bit depth button
    document.querySelectorAll('[data-bitdepth]').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.bitdepth) === state.bitDepth);
    });

    // Show actual resolved bit depth
    updateCurrentBitDepth(data.currentBitDepthLabel || '');

    // Update source clock display
    if (state.syncMode === 102) {
      var sourceClockLabel = document.getElementById('current-source-clock');
      if (sourceClockLabel) {
        sourceClockLabel.textContent = state.frameRate + ' Hz';
      }
    }

    console.log('Loaded output settings:', data);
  } catch (err) {
    console.error('Failed to load output settings:', err);
    state.frameRate = 30;
    state.bitDepth = 0;
    state.syncMode = 100;
  }

  updateBandwidthDisplay();
}

// Update sync mode UI visibility
function updateSyncUI() {
  var framerateRow = document.getElementById('framerate-row');
  var sourceClockRow = document.getElementById('source-clock-row');
  if (framerateRow) framerateRow.style.display = state.syncMode === 100 ? 'block' : 'none';
  if (sourceClockRow) {
    sourceClockRow.style.display = state.syncMode === 102 ? 'block' : 'none';
    if (state.syncMode === 102) {
      loadSourceOptions();
    } else if (_sourceClockPollTimer) {
      clearInterval(_sourceClockPollTimer);
      _sourceClockPollTimer = null;
    }
  }
  updateCurrentFramerate();
}

function updateCurrentBitDepth(label) {
  var el = document.getElementById('current-bitdepth');
  if (el) el.textContent = label || '';
}

function updateCurrentFramerate() {
  var el = document.getElementById('current-framerate');
  if (el) el.textContent = state.frameRate + ' Hz';
}

// Set sync mode and frame rate via API
async function setSyncMode(selectedType) {
  try {
    var res = await fetch('/api/output/sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedType: selectedType }),
    });
    var data = await res.json();

    if (data.success) {
      state.syncMode = selectedType;
      state.frameRate = data.frameRate || state.frameRate;
      updateSyncUI();
      updateBandwidthDisplay();
    } else {
      showStatus('Sync error: ' + (data.error || 'Unknown'), 'error');
    }
    return data;
  } catch (err) {
    showStatus('Sync error: ' + err.message, 'error');
    return { success: false };
  }
}

async function setFrameRate(framerate) {
  try {
    var res = await fetch('/api/output/framerate', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framerate: framerate }),
    });
    var data = await res.json();

    if (data.success) {
      state.frameRate = data.frameRate || framerate;
      updateCurrentFramerate();
      updateBandwidthDisplay();
    } else {
      showStatus('Framerate error: ' + (data.error || 'Unknown'), 'error');
    }
    return data;
  } catch (err) {
    showStatus('Framerate error: ' + err.message, 'error');
    return { success: false };
  }
}


var _sourceClockPollTimer = null;

// Load available input sources for source clock selection (with polling)
async function loadSourceOptions() {
  // Start polling if not already
  if (!_sourceClockPollTimer) {
    _sourceClockPollTimer = setInterval(function() {
      if (state.syncMode === 102) {
        loadSourceOptions();
      } else {
        clearInterval(_sourceClockPollTimer);
        _sourceClockPollTimer = null;
      }
    }, 3000);
  }
  var container = document.getElementById('source-clock-buttons');
  if (!container) return;

  try {
    var res = await fetch('/api/input/sources');
    var data = await res.json();

    // Get current source selection
    var outputRes = await fetch('/api/output');
    var outputData = await outputRes.json();
    var currentSource = outputData.genlock?.selectSource;

    container.innerHTML = '';
    var sources = data.sources || [];

    sources.forEach(function(src) {
      var btn = document.createElement('button');
      btn.className = 'option-btn small source-btn';
      if (!src.connected) btn.className += ' disabled';
      if (src.groupId === currentSource) btn.className += ' selected';
      btn.dataset.sourceid = src.groupId;

      var detail = src.connected
        ? src.resolution.width + '\u00d7' + src.resolution.height + ' @ ' + src.refreshRate + 'Hz'
        : 'No signal';

      btn.innerHTML = src.label + '<br><small>' + detail + '</small>';

      if (src.connected) {
        btn.addEventListener('click', function() {
          setSourceClock(src.groupId, src.label);
        });
      }

      container.appendChild(btn);
    });
  } catch (err) {
    container.innerHTML = '<span class="hint">Failed to load sources</span>';
    console.error('Failed to load sources:', err);
  }
}

// Set source clock to a specific input
async function setSourceClock(selectSource, label) {
  try {
    // Mark selected button
    document.querySelectorAll('.source-btn').forEach(function(b) {
      b.classList.remove('selected');
      if (parseInt(b.dataset.sourceid) === selectSource) b.classList.add('selected');
    });

    var res = await fetch('/api/output/sync/source', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectSource: selectSource }),
    });
    var data = await res.json();

    if (data.success) {
      state.frameRate = data.frameRate || state.frameRate;
      updateCurrentFramerate();
      updateBandwidthDisplay();
      var sourceLabel = document.getElementById('current-source-clock');
      if (sourceLabel) sourceLabel.textContent = state.frameRate + ' Hz';
      showStatus('Source Clock: locked to ' + (label || 'source ' + selectSource) + ' @ ' + state.frameRate + ' Hz', 'success');
    } else {
      showStatus('Source clock error: ' + (data.error || 'Unknown'), 'error');
      loadSourceOptions(); // refresh to show correct selection
    }
  } catch (err) {
    showStatus('Source clock error: ' + err.message, 'error');
  }
}

// Fetch real Ethernet load from MX6000 output capacity API
async function updateBandwidthDisplay() {
  var loadBar = document.getElementById('load-bar');
  var loadText = document.getElementById('bandwidth-load');
  var status = document.getElementById('bandwidth-status');

  if (!loadBar || !loadText || !status) return;

  try {
    var res = await fetch('/api/output/capacity');
    var data = await res.json();
    var load = data.maxLoad || 0;

    loadBar.style.setProperty('--load', Math.min(load, 100) + '%');
    loadText.textContent = Math.round(load) + '%';

    loadBar.classList.remove('warning', 'overload');
    loadText.classList.remove('overload');
    status.classList.remove('ok', 'warning', 'overload');

    if (load > 100) {
      status.textContent = 'OVERLOAD';
      status.classList.add('overload');
      loadBar.classList.add('overload');
      loadText.classList.add('overload');
    } else if (load > 85) {
      status.textContent = 'HIGH';
      status.classList.add('warning');
      loadBar.classList.add('warning');
    } else {
      status.textContent = 'OK';
      status.classList.add('ok');
    }
  } catch (err) {
    loadText.textContent = '--';
    status.textContent = 'ERROR';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Stage height selection
  document.querySelectorAll('[data-stage]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-stage]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.stageHeight = btn.dataset.stage;
      updateResolutionHints();
      loadReferenceData(state.stageHeight);
    });
  });

  // Load initial reference data
  loadReferenceData(state.stageHeight);

  // Source selection
  document.querySelectorAll('[data-source]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-source]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.source = btn.dataset.source;
      updateUI();
    });
  });

  // Layout selection
  document.querySelectorAll('[data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-layout]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.layout = btn.dataset.layout;
      updateUI();
    });
  });

  // Background selection
  document.querySelectorAll('[data-background]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-background]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.background = btn.dataset.background;
    });
  });

  // Window size selection
  document.querySelectorAll('[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-size]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.windowSize = btn.dataset.size;
    });
  });

  // Brightness slider - fires on every drag tick
  brightnessSlider.addEventListener('input', () => {
    state.brightness = parseInt(brightnessSlider.value);
    brightnessDisplay.textContent = state.brightness;
    setBrightness(state.brightness);
  });

  // Brightness preset buttons
  document.querySelectorAll('[data-brightness]').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = parseInt(btn.dataset.brightness);
      state.brightness = value;
      brightnessSlider.value = value;
      brightnessDisplay.textContent = value;
      setBrightness(value);
    });
  });

  // Initialize button
  initializeBtn.addEventListener('click', runInitialize);

  // Blackout button
  blackoutBtn.addEventListener('click', toggleBlackout);

  // Freeze button
  freezeBtn.addEventListener('click', toggleFreeze);

  // Backup button
  document.getElementById('btn-backup').addEventListener('click', async () => {
    var btn = document.getElementById('btn-backup');
    var origText = btn.innerHTML;
    btn.textContent = '...';
    btn.classList.add('loading');
    try {
      var res = await fetch('/api/backup');
      var data = await res.json();
      if (data.success) {
        showStatus('Backup saved: ' + data.filename + ' (' + Math.round(data.size/1024) + ' KB)', 'success');
      } else {
        showStatus('Backup failed: ' + (data.error || 'Unknown'), 'error');
      }
    } catch (err) {
      showStatus('Backup error: ' + err.message, 'error');
    } finally {
      btn.innerHTML = origText;
      btn.classList.remove('loading');
    }
  });

  // Apply button
  applyBtn.addEventListener('click', applyConfiguration);

  // Frame rate is read-only (no API endpoint available)
  // Display is updated via loadOutputSettings()

  // Bit depth selection - calls MX6000 API
  document.querySelectorAll('[data-bitdepth]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const value = parseInt(btn.dataset.bitdepth);
      btn.classList.add('loading');

      try {
        const res = await fetch('/api/output/bitdepth', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bitDepth: value }),
        });
        const data = await res.json();
        console.log('Bit depth response:', data);

        if (data.success) {
          document.querySelectorAll('[data-bitdepth]').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          // Update state and bandwidth calculator
          state.bitDepth = value;
          updateBandwidthDisplay();
          // Refresh to show actual resolved bit depth
          setTimeout(function() { loadOutputSettings(); }, 500);
        } else {
          showStatus('Bit depth error: ' + (data.error || 'Unknown'), 'error');
        }
      } catch (err) {
        console.error('Failed to set bit depth:', err);
        showStatus('Bit depth error: ' + err.message, 'error');
      } finally {
        btn.classList.remove('loading');
      }
    });
  });

  // Sync mode selection (Internal vs Genlock)
  document.querySelectorAll('[data-syncmode]').forEach(btn => {
    btn.addEventListener('click', async () => {
      var selectedType = parseInt(btn.dataset.syncmode);
      btn.classList.add('loading');
      var fr = selectedType === 100 ? state.frameRate : 60;
      var result = await setSyncMode(selectedType);
      if (result.success) {
        document.querySelectorAll('[data-syncmode]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        var label = selectedType === 100 ? 'Internal Clock ' + (result.frameRate || fr) + ' Hz' : 'Source Clock ' + (result.frameRate || '') + ' Hz';
        showStatus('Sync: ' + label, 'success');
        setTimeout(function() { loadOutputSettings(); }, 500);
      }
      btn.classList.remove('loading');
    });
  });

  // Frame rate preset buttons
  document.querySelectorAll('[data-framerate]').forEach(btn => {
    btn.addEventListener('click', async () => {
      var framerate = parseFloat(btn.dataset.framerate);
      btn.classList.add('loading');
      var result = await setFrameRate(framerate);
      if (result.success) {
        document.querySelectorAll('[data-framerate]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('custom-framerate').value = '';
        showStatus('Refresh rate: ' + (result.frameRate || framerate) + ' Hz', 'success');
      }
      btn.classList.remove('loading');
    });
  });

  // Custom frame rate
  var customFramerateBtn = document.getElementById('btn-custom-framerate');
  var customFramerateInput = document.getElementById('custom-framerate');
  if (customFramerateBtn) {
    customFramerateBtn.addEventListener('click', async () => {
      var value = parseFloat(customFramerateInput.value);
      if (!value || value < 23 || value > 240) {
        showStatus('Enter a frame rate between 23 and 240 Hz', 'error');
        return;
      }
      customFramerateBtn.classList.add('loading');
      var result = await setFrameRate(value);
      if (result.success) {
        document.querySelectorAll('[data-framerate]').forEach(b => b.classList.remove('selected'));
        showStatus('Refresh rate: ' + (result.frameRate || value) + ' Hz', 'success');
      }
      customFramerateBtn.classList.remove('loading');
    });
    customFramerateInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') customFramerateBtn.click();
    });
  }
}

// Update resolution hints based on stage height
function updateResolutionHints() {
  const res = RESOLUTIONS[state.stageHeight];
  if (!res) return;

  // Update each window size hint with calculated resolution
  const sizeMax = document.getElementById('size-max');
  const sizeLarge = document.getElementById('size-large');
  const sizeMedium = document.getElementById('size-medium');
  const sizeSmall = document.getElementById('size-small');

  if (sizeMax) sizeMax.textContent = `${res.windows.max.w} \u00d7 ${res.windows.max.h}`;
  if (sizeLarge) sizeLarge.textContent = `${res.windows.large.w} \u00d7 ${res.windows.large.h}`;
  if (sizeMedium) sizeMedium.textContent = `${res.windows.medium.w} \u00d7 ${res.windows.medium.h}`;
  if (sizeSmall) sizeSmall.textContent = `${res.windows.small.w} \u00d7 ${res.windows.small.h}`;
}

// Update UI based on state
function updateUI() {
  // Sources that show layout options (center vs fill)
  const showsLayout = state.source === 'tvone' || state.source === 'player' || state.source === 'sdi-single';

  // Show layout options for tvONE, Media Player, and Single SDI
  stepLayout.style.display = showsLayout ? 'block' : 'none';

  // Show window size options for centered layout on sources with layout options
  stepSize.style.display = (showsLayout && state.layout === 'center') ? 'block' : 'none';

  // Background only available for centered 16:9 layouts (not fill, not full-screen sources)
  // Full-screen sources (Mac, SDI 1+2, SDI Quad, or Fill Width mode) don't need backgrounds
  const showsBackground = showsLayout && state.layout === 'center';
  stepBackground.style.display = showsBackground ? 'block' : 'none';
}

// Initialize: blackout \u2192 brightness 0 \u2192 delete all layers \u2192 normal mode
async function runInitialize() {
  initializeBtn.classList.add('active');
  initializeBtn.textContent = 'INITIALIZING...';

  try {
    const res = await fetch('/api/initialize', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      state.brightness = 0;
      state.blackout = false;
      state.freeze = false;
      brightnessSlider.value = 0;
      brightnessDisplay.textContent = '0';
      blackoutBtn.classList.remove('active');
      blackoutBtn.textContent = 'BLACKOUT';
      freezeBtn.classList.remove('active');
      freezeBtn.textContent = 'FREEZE';
      showStatus('Initialized. Screen blank, brightness 0, all layers cleared.', 'success');
      loadOutputSettings();
    } else {
      showStatus(`Initialize failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showStatus(`Initialize error: ${err.message}`, 'error');
  } finally {
    initializeBtn.classList.remove('active');
    initializeBtn.textContent = 'INITIALIZE';
  }
}

// Toggle blackout
async function toggleBlackout() {
  const newBlackout = !state.blackout;
  blackoutBtn.classList.add('loading');

  try {
    const res = await fetch('/api/blackout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blackout: newBlackout }),
    });
    const data = await res.json();

    if (data.success) {
      state.blackout = newBlackout;
      blackoutBtn.classList.toggle('active', state.blackout);
      blackoutBtn.textContent = state.blackout ? 'BLACKED OUT' : 'BLACKOUT';
    } else {
      showStatus(`Blackout error: ${data.error}`, 'error');
    }
  } catch (err) {
    showStatus(`Blackout error: ${err.message}`, 'error');
  } finally {
    blackoutBtn.classList.remove('loading');
  }
}

// Toggle freeze
async function toggleFreeze() {
  const newFreeze = !state.freeze;
  freezeBtn.classList.add('loading');

  try {
    const res = await fetch('/api/freeze', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeze: newFreeze }),
    });
    const data = await res.json();

    if (data.success) {
      state.freeze = newFreeze;
      freezeBtn.classList.toggle('active', state.freeze);
      freezeBtn.textContent = state.freeze ? 'FROZEN' : 'FREEZE';
    } else {
      showStatus(`Freeze error: ${data.error}`, 'error');
    }
  } catch (err) {
    showStatus(`Freeze error: ${err.message}`, 'error');
  } finally {
    freezeBtn.classList.remove('loading');
  }
}

// Apply current configuration
async function applyConfiguration() {
  if (!state.source) {
    showStatus('Please select a primary source', 'error');
    return;
  }

  applyBtn.classList.add('loading');
  showStatus('Applying...', '');

  try {
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: state.source,
        layout: state.layout,
        background: state.background,
        stageHeight: state.stageHeight,
        windowSize: state.windowSize,
      }),
    });

    const data = await res.json();

    if (data.success) {
      let message = `Applied: ${data.config}`;
      if (data.geometry) {
        message += ` (${data.geometry.scaler.width}x${data.geometry.scaler.height} at ${data.geometry.position.x},${data.geometry.position.y})`;
      }
      if (data.note) {
        message += ` - Note: ${data.note}`;
      }
      showStatus(message, 'success');
    } else {
      showStatus(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    applyBtn.classList.remove('loading');
  }
}

// Set brightness
async function setBrightness(value) {
  try {
    const res = await fetch('/api/brightness', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brightness: value }),
    });

    const data = await res.json();
    if (!data.success && data.error) {
      console.error('Brightness error:', data.error);
    }
  } catch (err) {
    console.error('Failed to set brightness:', err);
  }
}

// Show status message
function showStatus(message, type) {
  applyStatus.textContent = message;
  applyStatus.className = 'apply-hint ' + (type || '');
}

// Load V1 reference data for stage height
async function loadReferenceData(stageHeight) {
  try {
    const res = await fetch(`/api/reference/${stageHeight}`);
    const data = await res.json();

    if (data.error) {
      console.error('Reference data error:', data.error);
      return;
    }

    const refVisible = document.getElementById('ref-visible');
    const refAspect = document.getElementById('ref-aspect');
    const ref4k = document.getElementById('ref-4k');
    const ref1080p = document.getElementById('ref-1080p');

    if (refVisible) refVisible.textContent = `${data.visibleResolution.width}\u00d7${data.visibleResolution.height}`;
    if (refAspect) refAspect.textContent = data.v1MediaSizes.aspectRatio;
    if (ref4k) ref4k.textContent = `${data.v1MediaSizes['4k'].w}\u00d7${data.v1MediaSizes['4k'].h}`;
    if (ref1080p) ref1080p.textContent = `${data.v1MediaSizes['1080p'].w}\u00d7${data.v1MediaSizes['1080p'].h}`;
  } catch (err) {
    console.error('Failed to load reference data:', err);
  }
}
