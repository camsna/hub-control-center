const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = 3000;

// MX6000 Configuration
const MX6000_IP = '10.0.81.207';
const MX6000_PORT = 8001;
const SCREEN_ID = '{7e8ded0a-a4d9-4003-9ecf-731d60d07280}';

// Canvas size
const CANVAS_WIDTH = 6144;
const CANVAS_HEIGHT = 2304;
const CANVAS_ID = 2048; // from screen.canvases[0].canvasID

// Display modes: PUT /api/v1/screen/output/displaymode
// {"value": N, "screenIdList": [SCREEN_ID]}
// 0 = Normal, 1 = Blackout, 2 = Frozen
const DISPLAY_MODE = { NORMAL: 0, BLACKOUT: 1, FREEZE: 2 };

// Sync source types for genlock/refresh rate control
// PUT /api/v1/screen/output/sync/source
const SYNC_TYPE = { FREERUN: 100, EXTERNAL: 101, GENLOCK: 102 };

// Source IDs (groupId) - physical connections
const SOURCES = {
  MAC: 1,           // Card 0, Port 1: Mac Studio (6144x2304 native)
  PLAYER: 2,        // Card 0, Port 2: Media Player
  TVONE: 257,       // Card 1, Port 1: TvONE matrix (4K)
  SDI1: 513,
  SDI2: 514,
  SDI3: 515,
  SDI4: 516,
  INTERNAL: 25857,
};

// Stage heights and their effective visible heights
const STAGE_HEIGHTS = {
  '40': { obscured: 0, visibleHeight: 2304 },
  '60': { obscured: 89, visibleHeight: 2215 },
  '80': { obscured: 191, visibleHeight: 2113 },
  '100': { obscured: 293, visibleHeight: 2011 },
};

// V1 media/canvas sizes for content creation reference
// These are the native canvas dimensions to create content at for each stage depth
// so content matches the visible aspect ratio without processor distortion
const V1_MEDIA_SIZES = {
  '40': { aspectRatio: '2.667:1', '4k': { w: 5760, h: 2160 }, '1080p': { w: 2880, h: 1080 } },
  '60': { aspectRatio: '2.774:1', '4k': { w: 5992, h: 2160 }, '1080p': { w: 2996, h: 1080 } },
  '80': { aspectRatio: '2.909:1', '4k': { w: 6281, h: 2160 }, '1080p': { w: 3140, h: 1080 } },
  '100': { aspectRatio: '3.056:1', '4k': { w: 6599, h: 2160 }, '1080p': { w: 3300, h: 1080 } },
};

// 16:9 window sizes by stage height
// Format: { width, height, x } (y is always 0, top-justified)
const WINDOW_SIZES = {
  '40': {
    max:    { w: 4096, h: 2304 },
    large:  { w: 3481, h: 1958 },
    medium: { w: 2867, h: 1613 },
    small:  { w: 2253, h: 1267 },
  },
  '60': {
    max:    { w: 3938, h: 2215 },
    large:  { w: 3347, h: 1883 },
    medium: { w: 2757, h: 1551 },
    small:  { w: 2169, h: 1220 },
  },
  '80': {
    max:    { w: 3757, h: 2113 },
    large:  { w: 3194, h: 1796 },
    medium: { w: 2631, h: 1480 },
    small:  { w: 2069, h: 1164 },
  },
  '100': {
    max:    { w: 3575, h: 2011 },
    large:  { w: 3039, h: 1709 },
    medium: { w: 2503, h: 1408 },
    small:  { w: 1968, h: 1107 },
  },
};

// Presets used ONLY for layer structure (we fix sources after)
const STRUCTURE_PRESETS = {
  SDI_DUAL: 9,   // Creates 2 layers side-by-side
  SDI_QUAD: 8,   // Creates 4 layers in 2x2 grid
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Make HTTP request to MX6000
// Disable connection pooling to avoid stale socket issues
const noPoolAgent = new http.Agent({ keepAlive: false, maxSockets: 1 });

function mx6000Request(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Connection': 'close',  // Don't reuse connections
    };
    if (bodyStr) {
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const options = {
      hostname: MX6000_IP,
      port: MX6000_PORT,
      path: endpoint,
      method: method,
      headers: headers,
      timeout: 10000,
      agent: noPoolAgent,  // Don't pool connections
    };

    const req = http.request(options, (httpRes) => {
      let data = '';
      httpRes.on('data', (chunk) => (data += chunk));
      httpRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          parsed._httpStatus = httpRes.statusCode;
          resolve(parsed);
        } catch (e) {
          // v1.5.0: some endpoints return empty body on success (HTTP 200)
          resolve({ _httpStatus: httpRes.statusCode, code: httpRes.statusCode === 200 ? 0 : -1, data: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout - VMP may have device locked'));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// Helper: Set display mode (0=normal, 1=blackout, 2=frozen)
async function setDisplayMode(mode) {
  return await mx6000Request('PUT', '/api/v1/screen/output/displaymode', {
    value: mode,
    screenIdList: [SCREEN_ID],
  });
}

// Helper: Get current layers
async function getCurrentLayers() {
  const data = await mx6000Request('GET', '/api/v1/screen?isNeedCabinetInfo=0');
  const workingMode1 = data.data?.screens?.[0]?.layersInWorkingMode?.find(wm => wm.workingMode === 1);
  return workingMode1?.layers || [];
}


// Helper: Route sources to layers
async function routeSources(layerSourceMap) {
  const layers = Object.entries(layerSourceMap).map(([id, source]) => ({
    id: parseInt(id),
    source: source,
  }));

  return await mx6000Request('PUT', '/api/v1/screen/layer/input', {
    screenID: SCREEN_ID,
    layers,
  });
}

// Helper: Delete a layer
async function deleteLayer(layerId) {
  return await mx6000Request('DELETE', '/api/v1/screen/layer', {
    screenID: SCREEN_ID,
    layers: [{ id: layerId }],
  });
}

// Helper: Ensure only one layer exists (delete extras)
async function ensureSingleLayer() {
  const layers = await getCurrentLayers();
  if (layers.length > 1) {
    // Sort by layerIndex, keep the first one, delete the rest
    const sorted = [...layers].sort((a, b) => a.layerIndex - b.layerIndex);
    for (let i = 1; i < sorted.length; i++) {
      await deleteLayer(sorted[i].id);
    }
    // Small delay for deletion to complete
    await new Promise(r => setTimeout(r, 300));
  }
  // Return the remaining layer
  const remaining = await getCurrentLayers();
  return remaining[0];
}

// Helper: Create a new layer (in workingMode 1 for display)
async function createLayer(source, position, scaler, zOrder = null) {
  // Get existing layers to determine unique zOrder
  if (zOrder === null) {
    const existing = await getCurrentLayers();
    // Use a unique zOrder that doesn't conflict
    // Higher zOrder = behind other layers
    const usedZOrders = existing.map(l => l.zOrder);
    zOrder = 1000000000 + existing.length;
    // Make sure it's unique
    while (usedZOrders.includes(zOrder)) {
      zOrder++;
    }
  }

  return await mx6000Request('POST', '/api/v1/screen/layer', {
    screenID: SCREEN_ID,
    workingMode: 1,  // Must specify workingMode 1 for display layers
    layers: [{
      source: source,
      position: position,
      scaler: scaler,
      zOrder: zOrder,
      cut: { enable: false, rect: { x: 0, y: 0, width: scaler.width, height: scaler.height } },
    }],
  });
}

// Helper: Setup background layer (returns layer count needed)
async function setupBackground(backgroundType) {
  if (backgroundType === 'none') {
    return null;
  }

  const bgSource = backgroundType === 'mac' ? SOURCES.MAC : SOURCES.PLAYER;

  // Background fills entire canvas
  // Mac: 6144x3456 at y=-580 (same as Mac primary)
  // Player: 6144x3456 at y=-580 (4K scaled to fill)
  const bgConfig = {
    source: bgSource,
    position: { x: 0, y: -580 },
    scaler: { width: 6144, height: 3456 },
  };

  return bgConfig;
}

// Helper: Apply preset and wait
async function applyPreset(presetId) {
  await mx6000Request('POST', '/api/v1/preset/current/update', {
    sequenceNumber: presetId,
    screenID: SCREEN_ID,
  });
  // Wait for preset to apply
  await new Promise(r => setTimeout(r, 500));
}

// Helper: Calculate centered x position
function centerX(width) {
  return Math.round((CANVAS_WIDTH - width) / 2);
}

// Helper: Add a background layer and return all layers
async function addBackgroundLayer(bgConfig) {
  // Create background layer with very high zOrder (puts it behind everything)
  console.log('Creating background layer...');
  const result = await createLayer(
    bgConfig.source,
    bgConfig.position,
    bgConfig.scaler,
    2000000000 // Very high zOrder = behind other layers
  );
  console.log('Background create result:', JSON.stringify(result));

  if (result.code !== 0) {
    throw new Error(`Failed to create background layer: ${result.message}`);
  }

  // Wait for layer to be committed
  await new Promise(r => setTimeout(r, 500));

  // Return the new layer ID from the response
  return result.data?.layers?.[0]?.id;
}

// API Routes

// Health check / device status
app.get('/api/status', async (req, res) => {
  try {
    const data = await mx6000Request('GET', '/api/v1/device/hw');
    res.json({
      connected: true,
      device: data.data?.name,
      ip: data.data?.ip,
      firmware: data.data?.hwVersion,
    });
  } catch (err) {
    res.json({
      connected: false,
      error: err.message,
    });
  }
});


// Get current layers
app.get("/api/layers", async (req, res) => {
  try {
    const layers = await getCurrentLayers();
    res.json({ layers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Get output settings (frame rate, bit depth)
app.get('/api/output', async (req, res) => {
  try {
    const data = await mx6000Request('GET', '/api/v1/screen/output');
    const output = data.data?.[0] || {};

    // Bit depth: 0=8-bit, 1=10-bit, 2=12-bit, 255=auto
    const bitDepthLabels = { 0: '8-bit', 1: '10-bit', 2: '12-bit', 255: 'Auto' };

    res.json({
      frameRate: output.currentFrameRate || 30,
      bitDepth: output.outputBitDepth?.bitDepth ?? 255,
      bitDepthLabel: bitDepthLabels[output.outputBitDepth?.bitDepth] || 'Unknown',
      currentBitDepth: output.outputBitDepth?.currentBitDepth ?? 0,
      currentBitDepthLabel: bitDepthLabels[output.outputBitDepth?.currentBitDepth] || '8-bit',
      availableFrameRates: output.phaseList || [25, 30, 50, 60],
      genlock: output.genlock || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Set bit depth (0=8-bit, 1=10-bit, 2=12-bit, 255=auto)
// Official endpoint: PUT /api/v1/screen/output/bitdepth
app.put('/api/output/bitdepth', async (req, res) => {
  try {
    const bitDepth = parseInt(req.body.bitDepth);
    if (![0, 1, 2, 255].includes(bitDepth)) {
      return res.status(400).json({ error: 'Invalid bit depth. Use 0 (8-bit), 1 (10-bit), 2 (12-bit), or 255 (auto)' });
    }

    // Use official documented endpoint
    const data = await mx6000Request('PUT', '/api/v1/screen/output/bitdepth', {
      screenIdList: [SCREEN_ID],
      bitDepth: bitDepth,
    });

    console.log('Bit depth response:', JSON.stringify(data));
    res.json({ success: data.code === 0, bitDepth });
  } catch (err) {
    console.error('Bit depth error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Set sync source / refresh rate
// selectedType: 100=freerun(60Hz), 102=genlock to input
// selectSource: input source group ID (when genlock)
app.put('/api/output/sync', async (req, res) => {
  try {
    const body = {};
    if (req.body.selectedType !== undefined) {
      body.selectedType = parseInt(req.body.selectedType);
    }
    if (req.body.selectSource !== undefined) {
      body.selectSource = parseInt(req.body.selectSource);
    }
    body.screenIdList = [SCREEN_ID];

    const data = await mx6000Request('PUT', '/api/v1/screen/output/sync/source', body);
    console.log('Sync source response:', JSON.stringify(data));

    // Read back the actual state
    const output = await mx6000Request('GET', '/api/v1/screen/output');
    const outputData = output.data?.[0] || {};

    res.json({
      success: data.code === 0,
      frameRate: outputData.currentFrameRate,
      genlock: outputData.genlock,
    });
  } catch (err) {
    console.error('Sync source error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get brightness
app.get('/api/brightness', async (req, res) => {
  try {
    const data = await mx6000Request('GET', '/api/v1/screen?isNeedCabinetInfo=0');
    const brightness = data.data?.screens?.[0]?.brightness ?? 0;
    res.json({ brightness: Math.round(brightness * 100) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set brightness (0-100)
app.put('/api/brightness', async (req, res) => {
  try {
    const percent = Math.max(0, Math.min(100, parseInt(req.body.brightness) || 0));
    const brightness = percent / 100;
    const data = await mx6000Request('PUT', '/api/v1/screen/brightness', {
      screenIdList: [SCREEN_ID],
      brightness: brightness,
    });
    res.json({ success: data.code === 0, brightness: percent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize: safe known-good state for configuring while room is in use
// 1. Blackout (displaymode=2, screen goes black instantly)
// 2. Brightness to 0 (belt and suspenders)
// 3. Delete all layers (nothing to show when brightness comes up)
// 4. Normal mode (displaymode=0)
// End state: brightness 0, no layers, normal display mode — completely blank
app.post('/api/initialize', async (req, res) => {
  try {
    const screenIdList = [SCREEN_ID];
    const steps = [
      { name: 'blackout on', fn: () => setDisplayMode(DISPLAY_MODE.BLACKOUT) },
      { name: 'brightness 0', fn: () => mx6000Request('PUT', '/api/v1/screen/brightness', { screenIdList, brightness: 0 }) },
      { name: 'delete layers', fn: async () => {
        const screenData = await mx6000Request('GET', '/api/v1/screen?isNeedCabinetInfo=0');
        const workingModes = screenData.data?.screens?.[0]?.layersInWorkingMode || [];
        let deleted = 0;
        for (const wm of workingModes) {
          for (const layer of (wm.layers || [])) {
            await mx6000Request('DELETE', '/api/v1/screen/layer', {
              screenID: SCREEN_ID,
              workingMode: wm.workingMode,
              layers: [{ id: layer.id }],
            });
            deleted++;
          }
        }
        return { code: 0, deleted };
      }},
      { name: 'normal mode', fn: () => setDisplayMode(DISPLAY_MODE.NORMAL) },
    ];

    const results = [];
    for (const step of steps) {
      console.log(`Initialize step: ${step.name}`);
      const data = await step.fn();
      results.push({ step: step.name, code: data.code });
      if (data.code !== 0) {
        return res.status(500).json({ error: `Failed at step: ${step.name}`, results });
      }
      await new Promise(r => setTimeout(r, 200));
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Initialize error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Blackout toggle: displaymode 2 (blackout) or 0 (normal)
app.put('/api/blackout', async (req, res) => {
  try {
    const blackout = req.body.blackout === true;
    const mode = blackout ? DISPLAY_MODE.BLACKOUT : DISPLAY_MODE.NORMAL;
    const data = await setDisplayMode(mode);
    console.log(`Blackout ${blackout ? 'on' : 'off'} response:`, JSON.stringify(data));
    res.json({ success: data.code === 0, blackout });
  } catch (err) {
    console.error('Blackout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Freeze toggle: displaymode 1 (freeze) or 0 (normal)
app.put('/api/freeze', async (req, res) => {
  try {
    const freeze = req.body.freeze === true;
    const mode = freeze ? DISPLAY_MODE.FREEZE : DISPLAY_MODE.NORMAL;
    const data = await setDisplayMode(mode);
    console.log(`Freeze ${freeze ? 'on' : 'off'} response:`, JSON.stringify(data));
    res.json({ success: data.code === 0, freeze });
  } catch (err) {
    console.error('Freeze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reset all layers (clear stuck frames)
app.post('/api/reset', async (req, res) => {
  try {
    // Get layers from both working modes
    const screenData = await mx6000Request('GET', '/api/v1/screen?isNeedCabinetInfo=0');
    const workingModes = screenData.data?.screens?.[0]?.layersInWorkingMode || [];

    let deletedCount = 0;

    // Delete layers from all working modes
    for (const wm of workingModes) {
      for (const layer of (wm.layers || [])) {
        console.log(`Deleting layer id=${layer.id} from workingMode=${wm.workingMode}`);
        await mx6000Request('DELETE', '/api/v1/screen/layer', {
          screenID: SCREEN_ID,
          workingMode: wm.workingMode,
          layers: [{ id: layer.id }],
        });
        deletedCount++;
      }
    }

    // Small delay for deletions to complete
    await new Promise(r => setTimeout(r, 500));

    // Create a fresh full-canvas layer with Mac Studio
    console.log('Creating fresh Mac Studio layer after reset...');
    await createLayer(
      SOURCES.MAC,
      { x: 0, y: -580 },
      { width: 6144, height: 3456 },
      1000000000
    );

    res.json({ success: true, deletedLayers: deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DECISION TREE API: Apply configuration
app.post('/api/apply', async (req, res) => {
  try {
    const { source, layout, background, stageHeight, windowSize } = req.body;

    if (!source) {
      return res.status(400).json({ error: 'Source is required' });
    }

    const stage = stageHeight || '60';
    const size = windowSize || 'max';
    const bg = background || 'none';
    const bgConfig = await setupBackground(bg);

    switch (source) {
      case 'mac': {
        // Mac Studio: 6144x3456 scaled, y=-580 to show correct portion
        // No background option for Mac - it IS the background
        console.log('Mac Studio: Deleting all layers and creating fresh...');

        // Delete ALL existing layers in workingMode 1
        const existingLayers = await getCurrentLayers();
        for (const layer of existingLayers) {
          console.log('Deleting layer id=' + layer.id);
          await deleteLayer(layer.id);
        }
        await new Promise(r => setTimeout(r, 300));

        // Create fresh layer with Mac Studio source
        console.log('Creating fresh Mac Studio layer...');
        const createResult = await createLayer(
          SOURCES.MAC,
          { x: 0, y: -580 },
          { width: 6144, height: 3456 },
          1000000000
        );
        console.log('Mac Studio create result:', JSON.stringify(createResult));

        return res.json({ success: true, config: 'mac-fullscreen' });
      }

      case 'tvone':
      case 'player':
      case 'sdi-single': {
        // Map source name to source ID and dimensions
        const sourceMap = {
          'tvone': { id: SOURCES.TVONE, width: 3840, height: 2160 },
          'player': { id: SOURCES.PLAYER, width: 3840, height: 2160 },
          'sdi-single': { id: SOURCES.SDI1, width: 1920, height: 1080 },
        };
        const srcInfo = sourceMap[source];
        const sourceId = srcInfo.id;
        const sourceWidth = srcInfo.width;
        const sourceHeight = srcInfo.height;

        console.log(`${source}: Deleting all layers and creating fresh...`);

        // Delete ALL existing layers in workingMode 1
        const existingLayers = await getCurrentLayers();
        for (const layer of existingLayers) {
          console.log('Deleting layer id=' + layer.id);
          await deleteLayer(layer.id);
        }
        await new Promise(r => setTimeout(r, 300));

        let geometry;
        if (layout === 'fill') {
          // Fill: stretch to full width, maintain aspect ratio
          const scaledHeight = Math.round((CANVAS_WIDTH / sourceWidth) * sourceHeight);
          geometry = {
            position: { x: 0, y: 0 },
            scaler: { width: CANVAS_WIDTH, height: scaledHeight },
          };
        } else {
          // Centered: use window size from lookup
          const windowConfig = WINDOW_SIZES[stage]?.[size] || WINDOW_SIZES['60']['max'];
          geometry = {
            position: { x: centerX(windowConfig.w), y: 0 },
            scaler: { width: windowConfig.w, height: windowConfig.h },
          };
        }

        // Create fresh primary layer
        console.log(`Creating fresh ${source} layer with source=${sourceId}...`);
        const createResult = await createLayer(
          sourceId,
          geometry.position,
          geometry.scaler,
          1000000000 // Lower zOrder = in front
        );
        console.log(`${source} create result:`, JSON.stringify(createResult));

        // Add background layer if needed
        let bgLayerId = null;
        if (bgConfig) {
          bgLayerId = await addBackgroundLayer(bgConfig);
        }

        return res.json({
          success: true,
          config: `${source}-${layout || 'center'}-${size}${bg !== 'none' ? '-bg-' + bg : ''}`,
          geometry,
          background: bg,
          layerCount: bgConfig ? 2 : 1,
          bgLayerId,
        });
      }

      case 'sdi-dual': {
        // First clean up to 1 layer, then apply preset
        await ensureSingleLayer();

        // Use preset 9 for layer structure
        await applyPreset(STRUCTURE_PRESETS.SDI_DUAL);

        let layers = await getCurrentLayers();

        // Route SDI1 and SDI2 to the layers (sort by x position)
        const sortedSDI = [...layers].sort((a, b) => a.position.x - b.position.x);
        if (sortedSDI.length < 2) {
          throw new Error('Not enough layers for SDI dual');
        }

        await routeSources({
          [sortedSDI[0].id]: SOURCES.SDI1,
          [sortedSDI[1].id]: SOURCES.SDI2,
        });

        // Add background layer if needed (after routing to avoid confusion)
        let bgLayerId = null;
        if (bgConfig) {
          bgLayerId = await addBackgroundLayer(bgConfig);
        }

        return res.json({
          success: true,
          config: `sdi-dual${bg !== 'none' ? '-bg-' + bg : ''}`,
          layerCount: bgConfig ? 3 : 2,
          background: bg,
          bgLayerId,
        });
      }

      case 'sdi-quad': {
        // First clean up to 1 layer, then apply preset
        await ensureSingleLayer();

        // Use preset 8 for layer structure
        await applyPreset(STRUCTURE_PRESETS.SDI_QUAD);

        let layers = await getCurrentLayers();

        if (layers.length < 4) {
          throw new Error('Not enough layers for SDI quad');
        }

        // Sort by position to get: top-left, top-right, bottom-left, bottom-right
        const sortedSDI = [...layers].sort((a, b) => {
          if (a.position.y !== b.position.y) return a.position.y - b.position.y;
          return a.position.x - b.position.x;
        });

        // Route SDI 1-4 in correct order
        await routeSources({
          [sortedSDI[0].id]: SOURCES.SDI1, // top-left
          [sortedSDI[1].id]: SOURCES.SDI2, // top-right
          [sortedSDI[2].id]: SOURCES.SDI3, // bottom-left
          [sortedSDI[3].id]: SOURCES.SDI4, // bottom-right
        });

        // Add background layer if needed (after routing to avoid confusion)
        let bgLayerId = null;
        if (bgConfig) {
          bgLayerId = await addBackgroundLayer(bgConfig);
        }

        return res.json({
          success: true,
          config: `sdi-quad${bg !== 'none' ? '-bg-' + bg : ''}`,
          layerCount: bgConfig ? 5 : 4,
          background: bg,
          bgLayerId,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown source: ${source}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Get available configurations
app.get("/api/configs", (req, res) => {
  res.json({
    sources: ["mac", "tvone", "sdi-single", "sdi-dual", "sdi-quad"],
    layouts: ["center", "fill"],
    windowSizes: ["max", "large", "medium", "small"],
    stageHeights: Object.keys(STAGE_HEIGHTS),
    windowConfigs: WINDOW_SIZES,
  });
});
// Get reference data for content creation (V1 media sizes)
app.get('/api/reference/:stageHeight', (req, res) => {
  const stage = req.params.stageHeight;
  if (!STAGE_HEIGHTS[stage]) {
    return res.status(400).json({ error: 'Invalid stage height' });
  }

  res.json({
    stageHeight: stage,
    visibleResolution: {
      width: CANVAS_WIDTH,
      height: STAGE_HEIGHTS[stage].visibleHeight,
    },
    obscuredPixels: STAGE_HEIGHTS[stage].obscured,
    v1MediaSizes: V1_MEDIA_SIZES[stage],
  });
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MX6000 Control running at http://localhost:${PORT}`);
  console.log(`Proxying to MX6000 at ${MX6000_IP}:${MX6000_PORT}`);
  console.log('Decision tree mode with window size options');
});
