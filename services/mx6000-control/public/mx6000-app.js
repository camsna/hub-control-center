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
  frameRate: 30,
  bitDepth: 0,  // 0 = 8-bit, 255 = auto
};

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const vmpWarning = document.getElementById('vmp-warning');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessDisplay = document.getElementById('brightness-display');
const applyBtn = document.getElementById('btn-apply');
const applyStatus = document.getElementById('apply-status');
const blackoutBtn = document.getElementById('btn-blackout');
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

  // Poll status every 10 seconds
  setInterval(checkStatus, 10000);
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

    // Use actual MX6000 values
    state.frameRate = data.frameRate || 30;
    state.bitDepth = data.bitDepth ?? 0;

    // Display frame rate as read-only text
    const isGenlock = data.genlock?.selectedType === 102;
    const framerateDisplay = document.getElementById('framerate-display');
    if (framerateDisplay) {
      framerateDisplay.textContent = isGenlock ? 'Genlock' : `${state.frameRate} Hz`;
    }

    // Select matching bit depth button
    document.querySelectorAll('[data-bitdepth]').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.bitdepth) === state.bitDepth);
    });

    console.log('Loaded output settings:', data);
  } catch (err) {
    console.error('Failed to load output settings:', err);
    // Fallback to defaults
    state.frameRate = 30;
    state.bitDepth = 0;
  }

  // Update bandwidth calculator
  updateBandwidthDisplay(state.frameRate, state.bitDepth);
}

// Bandwidth calculator - based on empirical measurements
// Formula: load% = 42 × (refreshRate / 25) × bitDepthMultiplier (using max of odd/even)
// Bit depth multiplier: 8-bit = 1.0, Auto = 1.33
function calculateMaxLoad(frameRate, bitDepth) {
  const baseLoad = 42; // % at 25Hz 8-bit (odd ports are higher)
  const bitDepthMultiplier = (bitDepth === 0) ? 1.0 : 1.33;
  return baseLoad * (frameRate / 25) * bitDepthMultiplier;
}

// Update bandwidth display
function updateBandwidthDisplay(frameRate, bitDepth) {
  const load = calculateMaxLoad(frameRate, bitDepth);

  const loadBar = document.getElementById('load-bar');
  const loadText = document.getElementById('bandwidth-load');
  const status = document.getElementById('bandwidth-status');

  if (!loadBar || !loadText || !status) return;

  // Update bar
  loadBar.style.setProperty('--load', Math.min(load, 100) + '%');
  loadText.textContent = Math.round(load) + '%';

  // Reset classes
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
    });
  });

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

  // Brightness slider - live updates with debounce
  let brightnessTimeout = null;
  brightnessSlider.addEventListener('input', () => {
    state.brightness = parseInt(brightnessSlider.value);
    brightnessDisplay.textContent = state.brightness;

    // Debounce: send to API after 150ms of no movement
    clearTimeout(brightnessTimeout);
    brightnessTimeout = setTimeout(() => {
      setBrightness(state.brightness);
    }, 150);
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

  // Blackout button
  blackoutBtn.addEventListener('click', toggleBlackout);

  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', () => {
    checkStatus();
    loadBrightness();
    loadOutputSettings();
  });

  // Reset button (clears stuck layers)
  document.getElementById('btn-reset').addEventListener('click', async () => {
    const btn = document.getElementById('btn-reset');
    btn.classList.add('loading');
    btn.textContent = 'Resetting...';
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showStatus(`Reset complete. Deleted ${data.deletedLayers} layers.`, 'success');
      } else {
        showStatus(`Reset failed: ${data.error}`, 'error');
      }
    } catch (err) {
      showStatus(`Reset error: ${err.message}`, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.textContent = 'Reset Layers';
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
          updateBandwidthDisplay(state.frameRate, state.bitDepth);
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

  if (sizeMax) sizeMax.textContent = `${res.windows.max.w} × ${res.windows.max.h}`;
  if (sizeLarge) sizeLarge.textContent = `${res.windows.large.w} × ${res.windows.large.h}`;
  if (sizeMedium) sizeMedium.textContent = `${res.windows.medium.w} × ${res.windows.medium.h}`;
  if (sizeSmall) sizeSmall.textContent = `${res.windows.small.w} × ${res.windows.small.h}`;
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

// Toggle blackout (uses brightness 0)
async function toggleBlackout() {
  state.blackout = !state.blackout;

  try {
    const newBrightness = state.blackout ? 0 : (state.lastBrightness || 80);

    // Store current brightness before blackout
    if (state.blackout && state.brightness > 0) {
      state.lastBrightness = state.brightness;
    }

    const res = await fetch('/api/brightness', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brightness: newBrightness }),
    });

    const data = await res.json();

    if (data.success) {
      blackoutBtn.classList.toggle('active', state.blackout);
      blackoutBtn.textContent = state.blackout ? 'BLACKOUT ON' : 'BLACKOUT';
      if (!state.blackout) {
        state.brightness = newBrightness;
        brightnessSlider.value = newBrightness;
        brightnessDisplay.textContent = newBrightness;
      }
    } else {
      state.blackout = !state.blackout; // Revert
      console.error('Blackout error:', data.error);
    }
  } catch (err) {
    state.blackout = !state.blackout; // Revert
    console.error('Failed to toggle blackout:', err);
  }
}

// Show status message
function showStatus(message, type) {
  applyStatus.textContent = message;
  applyStatus.className = 'apply-hint ' + (type || '');
}
