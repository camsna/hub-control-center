// DMX Blackout Server with CORRECT Quantum rest position support
// FIXED: Room overlap issue - tracks per-room state and merges for shared universes

const dgram = require('dgram');
const http = require('http');
const net = require('net');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
var EffectEngine = require('./effectEngine');

// ============================================================================
// CRESTRON CIP (Crestron over IP) CLIENT
// Connects to Crestron CP3 processor to send digital join commands
// Protocol: TCP port 41794, custom binary protocol
// ============================================================================
const CRESTRON_CONFIG = {
  HOST: '10.0.80.71',
  PORT: 41794,
  IPID: 0x4D,  // Touchpanel IP ID — slot 6 has screen CED modules (DvH=650)
  RECONNECT_DELAY: 5000,
  HEARTBEAT_TIMEOUT: 30000
};

// CIP Message Types
const CIP = {
  MSG_CONNECT: 0x01,
  MSG_CONNECTED: 0x02,
  MSG_DISCONNECT: 0x03,
  MSG_DISCONNECTED: 0x04,
  MSG_DATA: 0x05,
  MSG_HEARTBEAT_REQ: 0x0D,
  MSG_HEARTBEAT_ACK: 0x0E,
  MSG_CONNECT_ACK: 0x0F,
  DATA_DIGITAL_JOIN: 0x00,
  DATA_ANALOG_JOIN: 0x01,
  DATA_SERIAL_JOIN: 0x02
};

class CrestronCIP {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.lastHeartbeat = null;

    // Digital join states (1-based indexing for joins)
    this.digitalJoins = {};

    // Callback for state changes
    this.onStateChange = null;

    // Pending promises for join operations (for async responses)
    this.pendingJoins = new Map();
  }

  connect() {
    if (this.socket) {
      this.socket.destroy();
    }

    console.log('[CIP] Connecting to ' + CRESTRON_CONFIG.HOST + ':' + CRESTRON_CONFIG.PORT);

    this.socket = new net.Socket();
    this.socket.setTimeout(CRESTRON_CONFIG.HEARTBEAT_TIMEOUT);

    this.socket.connect(CRESTRON_CONFIG.PORT, CRESTRON_CONFIG.HOST, () => {
      console.log('[CIP] TCP connected, waiting for server registration request...');
      // Start proactive heartbeat (reference library does this on connect)
      this._startHeartbeat();
    });

    this.socket.on('data', (data) => {
      this._handleData(data);
    });

    this.socket.on('error', (err) => {
      console.error('[CIP] Socket error:', err.message);
      this._stopHeartbeat();
      this._scheduleReconnect();
    });

    this.socket.on('close', () => {
      console.log('[CIP] Connection closed');
      this.connected = false;
      this._stopHeartbeat();
      this._scheduleReconnect();
    });

    this.socket.on('timeout', () => {
      console.log('[CIP] Connection timeout (no heartbeat)');
      this.socket.destroy();
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopHeartbeat();
    if (this.socket) {
      this._send(Buffer.from([CIP.MSG_DISCONNECT, 0x00, 0x00]));
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === 'open') {
        this._send(Buffer.from([0x0D, 0x00, 0x02, 0x00, 0x00]));
      } else {
        this._stopHeartbeat();
      }
    }, 5000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, CRESTRON_CONFIG.RECONNECT_DELAY);
  }

  _sendRegistration() {
    // CIP registration response: 0x01 [len:0x0B] [payload with IPID]
    // Format from reference: \x01\x00\x0b\x00\x00\x00\x00\x00[ipid]\x40\xff\xff\xf1\x01
    var ipidChar = String.fromCharCode(CRESTRON_CONFIG.IPID);
    var packet = Buffer.from(
      '\x01\x00\x0b\x00\x00\x00\x00\x00' + ipidChar + '\x40\xff\xff\xf1\x01',
      'binary'
    );
    console.log('[CIP] Sending registration with IPID 0x' + CRESTRON_CONFIG.IPID.toString(16));
    this._send(packet);
  }

  _send(data) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(data);
    }
  }

  _handleData(data) {
    // Parse CIP messages from buffer
    var offset = 0;
    while (offset < data.length) {
      var msgType = data[offset];
      if (offset + 3 > data.length) break;

      var length = (data[offset + 1] << 8) | data[offset + 2];
      var payload = data.slice(offset + 3, offset + 3 + length);

      this._processMessage(msgType, payload);
      offset += 3 + length;
    }
  }

  _processMessage(type, payload) {
    switch (type) {
      case 0x0F:
        // Server registration request — respond with our IPID
        console.log('[CIP] Server requests registration');
        this._sendRegistration();
        break;

      case 0x02:
        // Connection response from server
        if (payload.length >= 3 && payload[0] === 0xFF && payload[1] === 0xFF) {
          console.log('[CIP] Registration FAILED (IP ID 0x' + CRESTRON_CONFIG.IPID.toString(16) + ' not in IP table)');
          this.connected = false;
        } else {
          console.log('[CIP] Registration OK (response: ' + payload.toString('hex') + ')');
          // Don't set connected=true yet — wait for end-of-query (0x1C) handshake
          this.lastHeartbeat = Date.now();
          // Send update request acknowledgment
          this._send(Buffer.from([0x05, 0x00, 0x05, 0x00, 0x00, 0x02, 0x03, 0x00]));
        }
        break;

      case 0x04:
        // Disconnect indication
        console.log('[CIP] Disconnected by server, payload: ' + payload.toString('hex'));
        this.connected = false;
        break;

      case 0x0D:
      case 0x0E:
        // Heartbeat
        this.lastHeartbeat = Date.now();
        break;

      case 0x05:
        // Data message
        this._processData(payload);
        break;

      default:
        console.log('[CIP] Unknown message type: 0x' + type.toString(16) + ', payload: ' + payload.toString('hex'));
        break;
    }
  }

  _processData(payload) {
    if (payload.length < 4) return;

    var dataType = payload[3];

    if (dataType === 0x00 && payload.length >= 6) {
      // Digital join update (reference library format)
      // Byte order: payload[4]=join_lo, payload[5]=state|join_hi
      var joinIndex = ((payload[5] & 0x7F) << 8) | payload[4];
      var state = ((payload[5] & 0x80) >> 7) ^ 1;  // Inverted per reference
      var join = joinIndex + 1;

      var prevState = this.digitalJoins[join];
      this.digitalJoins[join] = !!state;

      // Log significant joins
      if (join >= 53 && join <= 55) {
        console.log('[CIP] Brake ' + (join - 52) + ' = ' + (state ? 'OFF (released)' : 'ON (engaged)'));
      } else if (join >= 101 && join <= 120) {
        console.log('[CIP] Motor M' + (join - 100) + ' enable = ' + state);
      } else if (join === 123 || join === 124) {
        console.log('[CIP] Hoist ' + (join === 123 ? 'UP' : 'DOWN') + ' = ' + state);
      }

      if (this.onStateChange && prevState !== !!state) {
        this.onStateChange('digital', join, !!state);
      }

      var pending = this.pendingJoins.get(join);
      if (pending) {
        pending.resolve(!!state);
        this.pendingJoins.delete(join);
      }
    } else if (dataType === 0x14 && payload.length >= 8) {
      // Analog join update
      var aJoin = ((payload[4] << 8) | payload[5]) + 1;
      var aValue = (payload[6] << 8) + payload[7];
      // Store but don't log unless needed
    } else if (dataType === 0x03 && payload.length >= 5) {
      // Update request from server — must handle sub-types per python-cipclient reference
      var updateType = payload[4];
      if (updateType === 0x00) {
        console.log('[CIP] Standard update request');
        // Already sent initial ack after registration
      } else if (updateType === 0x16) {
        console.log('[CIP] Penultimate update request');
        // No response needed
      } else if (updateType === 0x1C) {
        // End-of-query — MUST acknowledge or CP3 won't accept our commands
        console.log('[CIP] End-of-query — sending acknowledgment, connection fully ready');
        this._send(Buffer.from([0x05, 0x00, 0x05, 0x00, 0x00, 0x02, 0x03, 0x1D]));
        this._send(Buffer.from([0x0D, 0x00, 0x02, 0x00, 0x00]));
        this.connected = true;
      } else if (updateType === 0x1D) {
        console.log('[CIP] End-of-query acknowledgment received');
      } else {
        console.log('[CIP] Unknown update request type 0x' + updateType.toString(16));
      }
    } else {
      console.log('[CIP] Data type 0x' + dataType.toString(16) + ', payload (' + payload.length + ' bytes): ' + payload.toString('hex'));
    }
  }

  // Send a digital join state (reference library format)
  sendDigitalJoin(join, state) {
    if (!this.connected) {
      console.log('[CIP] Not connected, cannot send join ' + join);
      return false;
    }

    // Reference format: 0x05 0x00 0x06 0x00 0x00 0x03 0x00 [join_lo] [join_hi|state]
    var buf = Buffer.from([0x05, 0x00, 0x06, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00]);
    var joinIndex = join - 1;
    if (!state) {
      joinIndex |= 0x8000;
    }
    buf[7] = joinIndex & 0xFF;
    buf[8] = (joinIndex >> 8) & 0xFF;
    this._send(buf);
    console.log('[CIP] Sent join ' + join + ' = ' + state);
    return true;
  }

  // Pulse a digital join (ON then OFF)
  pulseDigitalJoin(join, duration) {
    duration = duration || 100;
    if (!this.connected) {
      return Promise.reject(new Error('Not connected'));
    }

    var self = this;
    return new Promise(function(resolve) {
      self.sendDigitalJoin(join, true);
      setTimeout(function() {
        self.sendDigitalJoin(join, false);
        resolve(true);
      }, duration);
    });
  }

  // Send a Smart Object digital join (button press/release)
  // Format from Crestron-CIP C# reference:
  // 05 00 0C 00 00 09 38 00 00 00 [ID] 03 27 [JOIN_LO] [JOIN_HI|STATE]
  sendSmartObjectDigitalJoin(objectId, join, state) {
    if (!this.connected) {
      console.log('[CIP] Not connected, cannot send SO ' + objectId + ' join ' + join);
      return false;
    }

    var buf = Buffer.from([
      0x05, 0x00, 0x0C,           // CIP data message, length 12
      0x00, 0x00, 0x09,           // flags, inner length 9
      0x38,                        // Smart Object data type
      0x00, 0x00, 0x00,           // reserved
      objectId & 0xFF,             // Smart Object ID
      0x03, 0x27,                  // digital sub-type, button-style flag
      0x00, 0x00                   // join bytes (filled below)
    ]);
    var joinIndex = join - 1;
    if (!state) {
      joinIndex |= 0x8000;
    }
    buf[13] = joinIndex & 0xFF;
    buf[14] = (joinIndex >> 8) & 0xFF;
    this._send(buf);
    console.log('[CIP] Sent SO ' + objectId + ' join ' + join + ' = ' + state);
    return true;
  }

  // Pulse a Smart Object digital join (press then release)
  pulseSmartObjectDigitalJoin(objectId, join, duration) {
    duration = duration || 200;
    if (!this.connected) {
      return Promise.reject(new Error('Not connected'));
    }

    var self = this;
    return new Promise(function(resolve) {
      self.sendSmartObjectDigitalJoin(objectId, join, true);
      setTimeout(function() {
        self.sendSmartObjectDigitalJoin(objectId, join, false);
        resolve(true);
      }, duration);
    });
  }

  // Get current state of a digital join
  getDigitalJoin(join) {
    return this.digitalJoins[join] || false;
  }

  // Get all brake states
  getBrakeStates() {
    return {
      a: this.digitalJoins[53] || false,  // R1
      b: this.digitalJoins[54] || false,  // R2
      c: this.digitalJoins[55] || false   // R3
    };
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.connected,
      host: CRESTRON_CONFIG.HOST,
      port: CRESTRON_CONFIG.PORT,
      ipid: '0x' + CRESTRON_CONFIG.IPID.toString(16),
      lastHeartbeat: this.lastHeartbeat
    };
  }
}

// Singleton instance (lazy initialized)
let crestronClient = null;

function getCrestronClient() {
  if (!crestronClient) {
    crestronClient = new CrestronCIP();
  }
  return crestronClient;
}


const CONFIG = {
  HTTP_PORT: 8081,
  SACN_PORT: 5568,
  SOURCE_NAME: 'DMX Blackout Control',
  CID: Buffer.from([0x45,0x4D,0x52,0x47,0x4E,0x43,0x59,0x20,0x42,0x4C,0x4B,0x4F,0x55,0x54,0x00,0x01]),
};

const DEVICES = {
  luminex: '10.0.80.98',
  cuecoreA: '10.0.80.95',
  cuecoreB: '10.0.80.96',
  cuecoreC: '10.0.80.97',
};

// Device connectivity status (updated by periodic ping)
let deviceStatus = {
  luminex: false,
  cuecoreA: false,
  cuecoreB: false,
  cuecoreC: false
};

// === PRESET STORAGE ===
const PRESETS_FILE = path.join(__dirname, 'data', 'show_presets.json');

// Load presets from disk
function loadShowPresets() {
  try {
    if (fs.existsSync(PRESETS_FILE)) {
      const data = fs.readFileSync(PRESETS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading presets:', e.message);
  }
  return { nextId: 1, presets: [] };
}

// Save presets to disk
function saveShowPresets(data) {
  try {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving presets:', e.message);
    return false;
  }
}

// === SHOW STORAGE ===
const SHOWS_FILE = path.join(__dirname, 'data', 'shows.json');

// Load shows from disk
function loadShows() {
  try {
    if (fs.existsSync(SHOWS_FILE)) {
      const data = fs.readFileSync(SHOWS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading shows:', e.message);
  }
  return { nextId: 1, shows: [] };
}

// Save shows to disk
function saveShows(data) {
  try {
    fs.writeFileSync(SHOWS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving shows:', e.message);
    return false;
  }
}

// Helper to generate channel range
function generateChannelRange(start, end, value) {
  var result = {};
  for (var i = start; i <= end; i++) {
    result[String(i)] = value;
  }
  return result;
}

// Prune presets older than 30 days
function pruneOldPresets() {
  var data = loadShowPresets();
  var thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  var originalCount = data.presets.length;
  data.presets = data.presets.filter(function(p) {
    return p.permanent || new Date(p.created).getTime() > thirtyDaysAgo;
  });
  var prunedCount = originalCount - data.presets.length;
  if (prunedCount > 0) {
    saveShowPresets(data);
    console.log('Pruned ' + prunedCount + ' old presets');
  }
  return prunedCount;
}

// Initialize permanent presets (Blackout and House Lights)
function initPermanentPresets() {
  var data = loadShowPresets();
  var hasBlackout = data.presets.some(function(p) { return p.id === -1; });
  var hasHouseLights = data.presets.some(function(p) { return p.id === -2; });
  if (!hasBlackout) {
    data.presets.unshift({
      id: -1,
      name: 'Blackout',
      created: new Date().toISOString(),
      channels: {
        '1': generateChannelRange(1, 512, 0),
        '2': generateChannelRange(1, 512, 0),
        '3': generateChannelRange(1, 512, 0),
        '4': generateChannelRange(1, 512, 0),
        '5': generateChannelRange(1, 512, 0),
        '6': generateChannelRange(1, 512, 0),
        '7': generateChannelRange(1, 512, 0),
        '8': generateChannelRange(1, 512, 0)
      },
      permanent: true
    });
  }
  if (!hasHouseLights) {
    data.presets.unshift({
      id: -2,
      name: 'House Lights',
      created: new Date().toISOString(),
      channels: {
        '6': generateChannelRange(1, 72, 255),
        '7': generateChannelRange(1, 72, 255),
        '8': generateChannelRange(1, 72, 255)
      },
      permanent: true
    });
  }
  if (!hasBlackout || !hasHouseLights) {
    saveShowPresets(data);
    console.log('Initialized permanent presets');
  }
}

// === HOUSE PRESETS (from CueCore2 reference) ===
// Stage 2ch mode: Ch1 (81,83,85,87) = Shutter/Enable (must be 255 for output)
//                   Ch2 (82,84,86,88) = Dimmer
// When doing dmx.fill(255) for "lights on", both channels get 255 = correct.
// When doing dmx.fill(0) for blackout, both get 0 = correct.
// No special handling needed for fill operations.

const HOUSE_PRESETS = {
  'default': {
    id: 'default', name: 'Default', category: 'system',
    description: 'Startup default state - applied on server boot',
    isDefault: true,
    channels: {
      // TODO: Define actual channel values
      '6': {},
      '7': {},
      '8': {}
    }
  },
  'taklys-max': {
    id: 'taklys-max', name: 'TakLys Max', category: 'ceiling',
    description: 'All ceiling lights at full brightness',
    channels: {
      '6': generateChannelRange(1, 72, 255),
      '7': generateChannelRange(1, 72, 255),
      '8': generateChannelRange(1, 72, 255)
    }
  },
  'taklys-off': {
    id: 'taklys-off', name: 'TakLys Off', category: 'ceiling',
    description: 'All ceiling lights off',
    channels: {
      '6': generateChannelRange(1, 72, 0),
      '7': generateChannelRange(1, 72, 0),
      '8': generateChannelRange(1, 72, 0)
    }
  },
  'stage-on': {
    id: 'stage-on', name: 'Stage On', category: 'front',
    description: 'Speaker lights on for projection',
    channels: {
      '6': { '81': 255, '82': 255, '83': 255, '84': 255, '85': 255, '86': 255, '87': 255, '88': 255 },
      '7': { '83': 255, '84': 255, '85': 255, '86': 255, '87': 255, '88': 0 },  // no fixture at 81; ch84=Kreios dimmer at addr 83; ch88=0 BriteQ fine
      '8': { '81': 255, '82': 255, '83': 255, '84': 255, '85': 255, '86': 255, '87': 255, '88': 255 }
    }
  },
  'stage-off': {
    id: 'stage-off', name: 'Stage Off', category: 'front',
    description: 'Speaker lights off',
    channels: {
      '6': { '81': 0, '82': 0, '83': 0, '84': 0, '85': 0, '86': 0, '87': 0, '88': 0 },
      '7': { '81': 0, '82': 0, '83': 0, '84': 0, '85': 0, '86': 0, '87': 0, '88': 0 },
      '8': { '81': 0, '82': 0, '83': 0, '84': 0, '85': 0, '86': 0, '87': 0, '88': 0 }
    }
  },
  'krone-glod-100': {
    id: 'krone-glod-100', name: 'Globe 100%', category: 'chandelier-globe',
    description: 'Chandelier globes at full brightness',
    channels: {
      '6': { '152': 255, '153': 255, '154': 255, '207': 255, '208': 255, '209': 255 },
      '7': { '152': 255, '153': 255, '154': 255, '207': 255, '208': 255, '209': 255 },
      '8': { '152': 255, '153': 255, '154': 255, '207': 255, '208': 255, '209': 255 }
    }
  },
  'krone-glod-50': {
    id: 'krone-glod-50', name: 'Globe 50%', category: 'chandelier-globe',
    description: 'Chandelier globes at 50%',
    channels: {
      '6': { '152': 127, '153': 127, '154': 127, '207': 127, '208': 127, '209': 127 },
      '7': { '152': 127, '153': 127, '154': 127, '207': 127, '208': 127, '209': 127 },
      '8': { '152': 127, '153': 127, '154': 127, '207': 127, '208': 127, '209': 127 }
    }
  },
  'krone-glod-0': {
    id: 'krone-glod-0', name: 'Globe Off', category: 'chandelier-globe',
    description: 'Chandelier globes off',
    channels: {
      '6': { '152': 0, '153': 0, '154': 0, '207': 0, '208': 0, '209': 0 },
      '7': { '152': 0, '153': 0, '154': 0, '207': 0, '208': 0, '209': 0 },
      '8': { '152': 0, '153': 0, '154': 0, '207': 0, '208': 0, '209': 0 }
    }
  }
};


// Ping a device (returns promise, resolves to true if reachable)
function pingDevice(ip) {
  return new Promise((resolve) => {
    // Use -W 1 for 1 second timeout, -c 1 for single ping
    exec('ping -c 1 -W 1 ' + ip, (err) => {
      resolve(!err);
    });
  });
}

// Check all device connectivity
async function checkDeviceConnectivity() {
  const results = await Promise.all([
    pingDevice(DEVICES.luminex),
    pingDevice(DEVICES.cuecoreA),
    pingDevice(DEVICES.cuecoreB),
    pingDevice(DEVICES.cuecoreC)
  ]);
  deviceStatus.luminex = results[0];
  deviceStatus.cuecoreA = results[1];
  deviceStatus.cuecoreB = results[2];
  deviceStatus.cuecoreC = results[3];
}

// Check devices every 10 seconds
setInterval(checkDeviceConnectivity, 10000);

// ============================================================
// FIXTURE PROFILES — on/off DMX values for complex fixtures
// ============================================================

// Mac Aura Standard Mode (14 channels)
// Ch1=Shutter, Ch2=Dimmer, Ch3=Zoom, Ch4-5=Pan, Ch6-7=Tilt, Ch8-11=RGBW, Ch12=CTC, Ch13-14=FX
const AURA_REST = new Uint8Array([
  0,    // Ch1: Shutter - CLOSED (0-19)
  0,    // Ch2: Dimmer - off
  128,  // Ch3: Zoom - middle
  128,  // Ch4: Pan - center
  0,    // Ch5: Pan fine
  128,  // Ch6: Tilt - center
  0,    // Ch7: Tilt fine
  0,    // Ch8: Red
  0,    // Ch9: Green
  0,    // Ch10: Blue
  0,    // Ch11: White
  0,    // Ch12: CTC
  0,    // Ch13: FX1 select
  0     // Ch14: FX1 adjust
]);
const AURA_ON = new Uint8Array([
  22,   // Ch1: Shutter - OPEN (20-24)
  255,  // Ch2: Dimmer - FULL
  128,  // Ch3: Zoom - middle
  128,  // Ch4: Pan - center (DON'T MOVE)
  0,    // Ch5: Pan fine
  128,  // Ch6: Tilt - center (DON'T MOVE)
  0,    // Ch7: Tilt fine
  0,    // Ch8: Red
  0,    // Ch9: Green
  0,    // Ch10: Blue
  255,  // Ch11: White - FULL
  0,    // Ch12: CTC
  0,    // Ch13: FX1 select
  0     // Ch14: FX1 adjust
]);

// Mac Quantum Profile Extended mode (27 channels)
// Ch 18: PAN MSB, Ch 19: Pan LSB, Ch 20: TILT MSB, Ch 21: Tilt LSB
const QUANTUM_REST = new Uint8Array([
  0,    // Ch 1: Shutter (closed)
  0,    // Ch 2: Dimmer MSB (off)
  0,    // Ch 3: Dimmer LSB
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // Ch 4-13
  128,  // Ch 14: Zoom MSB (middle)
  0,    // Ch 15: Zoom LSB
  128,  // Ch 16: Focus MSB (middle)
  0,    // Ch 17: Focus LSB
  128,  // Ch 18: PAN MSB (CENTER)
  0,    // Ch 19: Pan LSB
  128,  // Ch 20: TILT MSB (CENTER)
  0,    // Ch 21: Tilt LSB
  0, 0, 0, 0, 0, 0,  // Ch 22-27
]);
const QUANTUM_ON = new Uint8Array([
  30,   // Ch 1: Shutter (open)
  255,  // Ch 2: Dimmer MSB (full)
  0,    // Ch 3: Dimmer LSB
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // Ch 4-13
  128,  // Ch 14: Zoom MSB (middle)
  0,    // Ch 15: Zoom LSB
  128,  // Ch 16: Focus MSB (middle)
  0,    // Ch 17: Focus LSB
  128,  // Ch 18: PAN MSB (CENTER)
  0,    // Ch 19: Pan LSB
  128,  // Ch 20: TILT MSB (CENTER)
  0,    // Ch 21: Tilt LSB
  0, 0, 0, 0, 0, 0,  // Ch 22-27
]);

// ============================================================
// FIXTURE TYPES — channel count and blackout behavior per type
// ============================================================
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

// ============================================================
// FIXTURES — Single source of truth for all truss fixtures
// ============================================================
// Every fixture has: id, type, universe, address, room, truss
// Truss/room blackout logic derives everything from this array.
// When a fixture is added, replaced, or repatched — update HERE only.
// ============================================================
const FIXTURES = [
  // Pipe (U4) — 8x Aura
  { id: 'aura-1', type: 'aura', universe: 4, address: 29, room: 'a', truss: 'pipe', x: 0.000, y: 0.0 },
  { id: 'aura-2', type: 'aura', universe: 4, address: 15, room: 'a', truss: 'pipe', x: 0.143, y: 0.0 },
  { id: 'aura-3', type: 'aura', universe: 4, address: 1, room: 'a', truss: 'pipe', x: 0.286, y: 0.0 },
  { id: 'aura-4', type: 'aura', universe: 4, address: 43, room: 'a', truss: 'pipe', x: 0.429, y: 0.0 },
  { id: 'aura-5', type: 'aura', universe: 4, address: 57, room: 'a', truss: 'pipe', x: 0.571, y: 0.0 },
  { id: 'aura-6', type: 'aura', universe: 4, address: 71, room: 'a', truss: 'pipe', x: 0.714, y: 0.0 },
  { id: 'aura-7', type: 'aura', universe: 4, address: 85, room: 'a', truss: 'pipe', x: 0.857, y: 0.0 },
  { id: 'aura-8', type: 'aura', universe: 4, address: 99, room: 'a', truss: 'pipe', x: 1.000, y: 0.0 },

  // Truss 1 (U2) — 2x Quantum + 12x XBar (14 fixtures total)
  { id: 'q1', type: 'quantum', universe: 2, address: 29, room: 'a', truss: 'truss1', x: 0.000, y: 0.15 },
  { id: 'q2', type: 'quantum', universe: 2, address: 56, room: 'a', truss: 'truss1', x: 0.077, y: 0.15 },
  { id: 'xbar-1',  type: 'xbar', universe: 2, address: 100, room: 'a', truss: 'truss1', x: 0.154, y: 0.15 },
  { id: 'xbar-2',  type: 'xbar', universe: 2, address: 132, room: 'a', truss: 'truss1', x: 0.231, y: 0.15 },
  { id: 'xbar-3',  type: 'xbar', universe: 2, address: 164, room: 'a', truss: 'truss1', x: 0.308, y: 0.15 },
  { id: 'xbar-4',  type: 'xbar', universe: 2, address: 196, room: 'a', truss: 'truss1', x: 0.385, y: 0.15 },
  { id: 'xbar-5',  type: 'xbar', universe: 2, address: 228, room: 'a', truss: 'truss1', x: 0.462, y: 0.15 },
  { id: 'xbar-6',  type: 'xbar', universe: 2, address: 260, room: 'a', truss: 'truss1', x: 0.538, y: 0.15 },
  { id: 'xbar-7',  type: 'xbar', universe: 2, address: 292, room: 'a', truss: 'truss1', x: 0.615, y: 0.15 },
  { id: 'xbar-8',  type: 'xbar', universe: 2, address: 324, room: 'a', truss: 'truss1', x: 0.692, y: 0.15 },
  { id: 'xbar-9',  type: 'xbar', universe: 2, address: 356, room: 'a', truss: 'truss1', x: 0.769, y: 0.15 },
  { id: 'xbar-10', type: 'xbar', universe: 2, address: 388, room: 'a', truss: 'truss1', x: 0.846, y: 0.15 },
  { id: 'xbar-11', type: 'xbar', universe: 2, address: 420, room: 'a', truss: 'truss1', x: 0.923, y: 0.15 },
  { id: 'xbar-12', type: 'xbar', universe: 2, address: 452, room: 'a', truss: 'truss1', x: 1.000, y: 0.15 },

  // Truss 2 (U1) — 4x Fresnel
  { id: 'fr-1', type: 'fresnel', universe: 1, address: 13, room: 'a', truss: 'truss2', x: 0.000, y: 0.3 },
  { id: 'fr-2', type: 'fresnel', universe: 1, address: 43, room: 'a', truss: 'truss2', x: 0.333, y: 0.3 },
  { id: 'fr-3', type: 'fresnel', universe: 1, address: 1,  room: 'a', truss: 'truss2', x: 0.667, y: 0.3 },
  { id: 'fr-4', type: 'fresnel', universe: 1, address: 7,  room: 'a', truss: 'truss2', x: 1.000, y: 0.3 },

  // Truss 3 (U1) — 4x Spot + 8x Fresnel + 2x Quantum (14 fixtures total)
  { id: 'spot-1',  type: 'spot',    universe: 1, address: 101, room: 'a', truss: 'truss3', x: 0.000, y: 0.45 },
  { id: 'spot-2',  type: 'spot',    universe: 1, address: 109, room: 'a', truss: 'truss3', x: 0.077, y: 0.45 },
  { id: 'spot-3',  type: 'spot',    universe: 1, address: 105, room: 'a', truss: 'truss3', x: 0.154, y: 0.45 },
  { id: 'spot-4',  type: 'spot',    universe: 1, address: 113, room: 'a', truss: 'truss3', x: 0.231, y: 0.45 },
  { id: 'fr-5',    type: 'fresnel', universe: 1, address: 67, room: 'a', truss: 'truss3', x: 0.308, y: 0.45 },
  { id: 'fr-6',    type: 'fresnel', universe: 1, address: 37, room: 'a', truss: 'truss3', x: 0.385, y: 0.45 },
  { id: 'fr-7',    type: 'fresnel', universe: 1, address: 31, room: 'a', truss: 'truss3', x: 0.462, y: 0.45 },
  { id: 'fr-8',    type: 'fresnel', universe: 1, address: 49, room: 'a', truss: 'truss3', x: 0.538, y: 0.45 },
  { id: 'fr-9',    type: 'fresnel', universe: 1, address: 55, room: 'a', truss: 'truss3', x: 0.615, y: 0.45 },
  { id: 'fr-10',   type: 'fresnel', universe: 1, address: 61, room: 'a', truss: 'truss3', x: 0.692, y: 0.45 },
  { id: 'fr-11',   type: 'fresnel', universe: 1, address: 25, room: 'a', truss: 'truss3', x: 0.769, y: 0.45 },
  { id: 'fr-12',   type: 'fresnel', universe: 1, address: 73, room: 'a', truss: 'truss3', x: 0.846, y: 0.45 },
  { id: 'q3',      type: 'quantum', universe: 1, address: 309, room: 'a', truss: 'truss3', x: 0.923, y: 0.45 },
  { id: 'q4',      type: 'quantum', universe: 1, address: 336, room: 'a', truss: 'truss3', x: 1.000, y: 0.45 },

  // Truss 4 (U3) — 6x XLED + 2x Quantum (Room B, 8 fixtures total)
  { id: 'xled-1', type: 'xled',    universe: 3, address: 1,   room: 'b', truss: 'truss4', x: 0.000, y: 0.6 },
  { id: 'xled-2', type: 'xled',    universe: 3, address: 11,  room: 'b', truss: 'truss4', x: 0.143, y: 0.6 },
  { id: 'xled-3', type: 'xled',    universe: 3, address: 21,  room: 'b', truss: 'truss4', x: 0.286, y: 0.6 },
  { id: 'xled-4', type: 'xled',    universe: 3, address: 31,  room: 'b', truss: 'truss4', x: 0.429, y: 0.6 },
  { id: 'xled-5', type: 'xled',    universe: 3, address: 41,  room: 'b', truss: 'truss4', x: 0.571, y: 0.6 },
  { id: 'xled-6', type: 'xled',    universe: 3, address: 51,  room: 'b', truss: 'truss4', x: 0.714, y: 0.6 },
  { id: 'q5',     type: 'quantum', universe: 3, address: 300, room: 'b', truss: 'truss4', x: 0.857, y: 0.6 },
  { id: 'q6',     type: 'quantum', universe: 3, address: 327, room: 'b', truss: 'truss4', x: 1.000, y: 0.6 },

  // Truss 5 (U3) — 6x XLED + 2x Quantum (Room B, 8 fixtures total)
  { id: 'xled-7',  type: 'xled',    universe: 3, address: 61,  room: 'b', truss: 'truss5', x: 0.000, y: 0.7 },
  { id: 'xled-8',  type: 'xled',    universe: 3, address: 71,  room: 'b', truss: 'truss5', x: 0.143, y: 0.7 },
  { id: 'xled-9',  type: 'xled',    universe: 3, address: 141, room: 'b', truss: 'truss5', x: 0.286, y: 0.7 },
  { id: 'xled-10', type: 'xled',    universe: 3, address: 151, room: 'b', truss: 'truss5', x: 0.429, y: 0.7 },
  { id: 'xled-11', type: 'xled',    universe: 3, address: 161, room: 'b', truss: 'truss5', x: 0.571, y: 0.7 },
  { id: 'xled-12', type: 'xled',    universe: 3, address: 171, room: 'b', truss: 'truss5', x: 0.714, y: 0.7 },
  { id: 'q7',      type: 'quantum', universe: 3, address: 381, room: 'b', truss: 'truss5', x: 0.857, y: 0.7 },
  { id: 'q8',      type: 'quantum', universe: 3, address: 354, room: 'b', truss: 'truss5', x: 1.000, y: 0.7 },

  // Truss 6 (U3) — 6x XLED (Room C)
  { id: 'xled-13', type: 'xled', universe: 3, address: 181, room: 'c', truss: 'truss6', x: 0.000, y: 0.8 },
  { id: 'xled-14', type: 'xled', universe: 3, address: 191, room: 'c', truss: 'truss6', x: 0.200, y: 0.8 },
  { id: 'xled-15', type: 'xled', universe: 3, address: 201, room: 'c', truss: 'truss6', x: 0.400, y: 0.8 },
  { id: 'xled-16', type: 'xled', universe: 3, address: 211, room: 'c', truss: 'truss6', x: 0.600, y: 0.8 },
  { id: 'xled-17', type: 'xled', universe: 3, address: 221, room: 'c', truss: 'truss6', x: 0.800, y: 0.8 },
  { id: 'xled-18', type: 'xled', universe: 3, address: 231, room: 'c', truss: 'truss6', x: 1.000, y: 0.8 },

  // Truss 7 (U3) — 5x XLED (Room C)
  { id: 'xled-19', type: 'xled', universe: 3, address: 241, room: 'c', truss: 'truss7', x: 0.000, y: 0.9 },
  { id: 'xled-20', type: 'xled', universe: 3, address: 251, room: 'c', truss: 'truss7', x: 0.250, y: 0.9 },
  { id: 'xled-21', type: 'xled', universe: 3, address: 261, room: 'c', truss: 'truss7', x: 0.500, y: 0.9 },
  { id: 'xled-22', type: 'xled', universe: 3, address: 271, room: 'c', truss: 'truss7', x: 0.750, y: 0.9 },
  { id: 'xled-23', type: 'xled', universe: 3, address: 281, room: 'c', truss: 'truss7', x: 1.000, y: 0.9 },
];

// ============================================================
// DERIVED DATA — built from FIXTURES at startup, never hand-edited
// ============================================================

// Truss names (for validation)
const VALID_TRUSSES = [...new Set(FIXTURES.map(function(f) { return f.truss; }))];

// Backward-compatible views used by buildBaselineDMX and _applyAura
const AURA_FIXTURES = FIXTURES.filter(function(f) { return f.type === 'aura'; });
const QUANTUM_FIXTURES = FIXTURES.filter(function(f) { return f.type === 'quantum'; });
const AURA_CHANNELS = AURA_REST.length;
const QUANTUM_CHANNELS = QUANTUM_REST.length;

// Get the set of universes a truss spans (usually 1, but derived from data)
function getTrussUniverses(trussId) {
  var universes = [];
  FIXTURES.forEach(function(f) {
    if (f.truss === trussId && universes.indexOf(f.universe) === -1) {
      universes.push(f.universe);
    }
  });
  return universes;
}

// ============================================================
// ROOM CONFIGURATION
// ============================================================
// House light universes (U6/U7/U8) are NOT in FIXTURES — they're
// managed separately as taklys/vegglys/lysekroner groups.
// Truss universes are derived from FIXTURES.
// ============================================================
const HOUSE_LIGHT_UNIVERSES = { a: 6, b: 7, c: 8 };

const ROOM_CONFIG = (function() {
  var config = {
    a: { label: 'Room A', universes: new Set(), channelRanges: null },
    b: { label: 'Room B', universes: new Set(), channelRanges: null },
    c: { label: 'Room C', universes: new Set(), channelRanges: null }
  };

  // Add truss universes from fixtures
  FIXTURES.forEach(function(f) {
    if (config[f.room]) config[f.room].universes.add(f.universe);
  });

  // Add house light universes
  Object.keys(HOUSE_LIGHT_UNIVERSES).forEach(function(room) {
    config[room].universes.add(HOUSE_LIGHT_UNIVERSES[room]);
  });

  // Convert Sets to sorted arrays
  Object.keys(config).forEach(function(room) {
    config[room].universes = Array.from(config[room].universes).sort();
  });

  return config;
})();

class SACNSender {
  constructor() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.universeData = {};
    this.blackoutActive = false;
    this.lightsOnActive = false;

    // Track per-room states: { roomId: { state: 'on'|'off'|'inactive', universes: [...] } }
    this.roomStates = {
      a: { state: 'inactive', timer: null },
      b: { state: 'inactive', timer: null },
      c: { state: 'inactive', timer: null }
    };

    // Track U3 room commands separately (B and C share U3)
    // (u3LastCommand removed — _buildUniverseDMX now derives shared-universe
    //  state from roomStates directly)

    // Crossfade state per universe
    this.crossfadeTimers = {};

    for (var u = 1; u <= 8; u++) {
      this.universeData[u] = { dmxData: new Uint8Array(512).fill(0), priority: 100, seq: 0 };
    }

    this.socket.bind(function() {
      console.log('sACN sender ready (UDP socket open)');
    });
  }

  _frameLengths(rootLen) { return 0x7000 | rootLen; }

  _packet(universe, dmxData, priority) {
    var packet = Buffer.alloc(638);
    var o = 0;

    packet.writeUInt16BE(0x0010, o); o += 2;
    packet.writeUInt16BE(0x0000, o); o += 2;
    Buffer.from('ASC-E1.17\0\0\0').copy(packet, o); o += 12;
    packet.writeUInt16BE(this._frameLengths(638 - 16), o); o += 2;
    packet.writeUInt32BE(0x00000004, o); o += 4;
    CONFIG.CID.copy(packet, o); o += 16;

    packet.writeUInt16BE(this._frameLengths(638 - 38), o); o += 2;
    packet.writeUInt32BE(0x00000002, o); o += 4;
    var src = Buffer.alloc(64); src.write(CONFIG.SOURCE_NAME); src.copy(packet, o); o += 64;
    packet.writeUInt8(priority, o); o += 1;
    packet.writeUInt16BE(0, o); o += 2;
    var seq = (this.universeData[universe].seq = (this.universeData[universe].seq + 1) & 0xff);
    packet.writeUInt8(seq, o); o += 1;
    packet.writeUInt8(0x00, o); o += 1;
    packet.writeUInt16BE(universe, o); o += 2;

    packet.writeUInt16BE(this._frameLengths(638 - 115), o); o += 2;
    packet.writeUInt8(0x02, o); o += 1;
    packet.writeUInt8(0xa1, o); o += 1;
    packet.writeUInt16BE(0x0000, o); o += 2;
    packet.writeUInt16BE(0x0001, o); o += 2;
    packet.writeUInt16BE(0x0201, o); o += 2;
    packet.writeUInt8(0x00, o); o += 1;
    for (var i = 0; i < 512; i++) packet.writeUInt8(dmxData[i] || 0, o + i);

    return packet;
  }

  _mcastAddr(u) { return '239.255.' + ((u >> 8) & 0xff) + '.' + (u & 0xff); }

  _sendPacket(universe, dmx, priority) {
    this.universeData[universe].dmxData = dmx;
    this.universeData[universe].priority = priority;

    var pkt = this._packet(universe, dmx, priority);
    var maddr = this._mcastAddr(universe);
    var self = this;

    this.socket.send(pkt, CONFIG.SACN_PORT, maddr, function(err) {
      if (err) console.error('send mcast U' + universe + ' error:', err);
    });

    if (DEVICES.luminex) {
      this.socket.send(pkt, CONFIG.SACN_PORT, DEVICES.luminex, function() {});
    }

    if (universe <= 2) {
      [DEVICES.cuecoreA, DEVICES.cuecoreB, DEVICES.cuecoreC].forEach(function(ip) {
        if (!ip) return;
        self.socket.send(pkt, CONFIG.SACN_PORT, ip, function() {});
      });
    }
  }

  // =========================================================================
  // CROSSFADE ENGINE
  // Smoothly interpolates from current shadow state to target over duration
  // Sends frames at ~40fps (25ms intervals) for smooth visual transitions
  // =========================================================================
  // Build a Set of shutter channel indices (0-based) for a universe.
  // Shutter channels snap instantly instead of fading.
  _getShutterChannels(universe) {
    var shutters = new Set();

    // Quantum Ch1 = Shutter (27ch fixtures)
    QUANTUM_FIXTURES.forEach(function(f) {
      if (f.universe === universe) {
        shutters.add(f.address - 1);  // Ch1 = shutter, 0-indexed
      }
    });

    // Aura Ch1 = Shutter (14ch fixtures, all on U4)
    if (universe === 4) {
      AURA_FIXTURES.forEach(function(f) {
        shutters.add(f.address - 1);
      });
    }

    // Stage (Kreios) Ch1 = Shutter at addresses 81, 83, 85, 87
    // U7: ch87 is BriteQ (Ch1=Dimmer, no shutter). ch83 has Kreios+BriteQ sharing addr.
    // TODO next week: move Kreios from 83 to 81, then add 81 back as shutter
    if (universe >= 6 && universe <= 8) {
      [81, 83, 85, 87].forEach(function(addr) {
        if (universe === 7 && addr === 87) return;  // BriteQ at 87, no shutter
        if (universe === 7 && addr === 81) return;  // nothing at 81 (Kreios shares 83)
        shutters.add(addr - 1);
      });
    }

    return shutters;
  }

  crossfadeTo(universe, targetDmx, durationMs, priority, holdDuration) {
    var self = this;
    priority = priority || 180;
    holdDuration = holdDuration || 5000;

    // Cancel any existing crossfade on this universe
    if (this.crossfadeTimers[universe]) {
      clearInterval(this.crossfadeTimers[universe].interval);
      if (this.crossfadeTimers[universe].holdTimer) {
        clearInterval(this.crossfadeTimers[universe].holdTimer);
      }
    }

    // Get current state (shadow state)
    var startDmx = new Uint8Array(this.universeData[universe].dmxData);
    var currentDmx = new Uint8Array(512);

    // If duration is 0 or very short, snap immediately
    if (durationMs < 50) {
      for (var i = 0; i < 512; i++) {
        currentDmx[i] = targetDmx[i] || 0;
      }
      this._sendPacket(universe, currentDmx, priority);
      console.log('Crossfade U' + universe + ': SNAP (0ms)');
      this._startHold(universe, currentDmx, priority, holdDuration);
      return;
    }

    // Identify shutter channels for this universe
    var shutterChannels = this._getShutterChannels(universe);

    // Determine fade direction for each shutter: opening or closing
    // Opening: snap open at frame 1 (so dimmer fades up with shutter already open)
    // Closing: snap closed at final frame (dimmer fades down first, then shutter closes)
    var shutterOpening = new Set();
    var shutterClosing = new Set();
    shutterChannels.forEach(function(ch) {
      var startVal = startDmx[ch] || 0;
      var endVal = targetDmx[ch] || 0;
      if (endVal > startVal) shutterOpening.add(ch);
      else if (endVal < startVal) shutterClosing.add(ch);
    });

    var frameInterval = 25; // 40fps
    var totalFrames = Math.ceil(durationMs / frameInterval);
    var currentFrame = 0;

    console.log('Crossfade U' + universe + ': ' + durationMs + 'ms, ' + totalFrames + ' frames, ' + shutterChannels.size + ' shutter channels');

    // Interpolation loop
    this.crossfadeTimers[universe] = {
      interval: setInterval(function() {
        currentFrame++;
        var progress = Math.min(currentFrame / totalFrames, 1);
        var isLastFrame = (currentFrame >= totalFrames);

        for (var i = 0; i < 512; i++) {
          var start = startDmx[i] || 0;
          var end = targetDmx[i] || 0;

          if (shutterOpening.has(i)) {
            // Opening shutter: snap to target immediately
            currentDmx[i] = end;
          } else if (shutterClosing.has(i)) {
            // Closing shutter: hold open until last frame, then snap closed
            currentDmx[i] = isLastFrame ? end : start;
          } else {
            // Normal channel: linear interpolation
            currentDmx[i] = Math.round(start + (end - start) * progress);
          }
        }

        self._sendPacket(universe, currentDmx, priority);

        // Crossfade complete
        if (isLastFrame) {
          clearInterval(self.crossfadeTimers[universe].interval);
          console.log('Crossfade U' + universe + ': complete');
          self._startHold(universe, currentDmx, priority, holdDuration);
        }
      }, frameInterval),
      holdTimer: null
    };
  }

  // After crossfade, continue sending to maintain priority (HTP merge)
  _startHold(universe, dmxData, priority, holdDuration) {
    var self = this;

    // If persistent streaming is active, no need for hold timer
    if (this.persistentUniverses && this.persistentUniverses[universe]) {
      if (this.crossfadeTimers[universe]) {
        this.crossfadeTimers[universe] = null;
      }
      return;
    }

    var count = 0;
    var maxCount = Math.ceil(holdDuration / 1000);

    if (this.crossfadeTimers[universe]) {
      this.crossfadeTimers[universe].holdTimer = setInterval(function() {
        count++;
        if (count >= maxCount) {
          clearInterval(self.crossfadeTimers[universe].holdTimer);
          self.crossfadeTimers[universe] = null;
          self.releaseStream(universe);
          console.log('Crossfade U' + universe + ': hold released after ' + count + 's');
          return;
        }
        self._sendPacket(universe, dmxData, priority);
      }, 1000);
    }
  }

  // Apply a single fixture's on/off state to a DMX array
  _applyFixtureState(dmx, fixture, state) {
    var typeInfo = FIXTURE_TYPES[fixture.type];
    if (!typeInfo) return;
    var startAddr = fixture.address - 1;

    if (typeInfo.onProfile) {
      // Has a specific on/off profile (aura, quantum)
      var profile = (state === 'on') ? typeInfo.onProfile : typeInfo.restProfile;
      for (var i = 0; i < typeInfo.channels && (startAddr + i) < 512; i++) {
        dmx[startAddr + i] = profile[i];
      }
    } else if (typeInfo.dimmerOnly) {
      // Only control ch1 dimmer (fresnel, spot)
      if (startAddr < 512) dmx[startAddr] = (state === 'on') ? 255 : 0;
    } else {
      // Generic: fill all channels (xbar, xled)
      var value = (state === 'on') ? 255 : 0;
      for (var i = 0; i < typeInfo.channels && (startAddr + i) < 512; i++) {
        dmx[startAddr + i] = value;
      }
    }
  }

  // Apply rest/on profiles for all profiled fixtures on a universe (quantum, aura)
  // Used by sendBlackout/sendLightsOn/buildBaselineDMX for whole-universe commands
  _applyProfiledFixtures(dmx, universe, state, roomFilter) {
    var self = this;
    FIXTURES.forEach(function(f) {
      var typeInfo = FIXTURE_TYPES[f.type];
      if (!typeInfo || !typeInfo.onProfile) return;  // Only profiled fixtures
      if (f.universe !== universe) return;
      if (roomFilter && f.room !== roomFilter) return;
      self._applyFixtureState(dmx, f, state);
    });
  }

  // Backward-compatible wrapper (used by sendBlackout/sendLightsOn)
  _applyQuantumValues(dmx, universe, quantumValues, roomFilter) {
    var self = this;
    QUANTUM_FIXTURES.forEach(function(fixture) {
      if (fixture.universe === universe) {
        if (!roomFilter || fixture.room === roomFilter) {
          var startAddr = fixture.address - 1;
          for (var i = 0; i < QUANTUM_CHANNELS && (startAddr + i) < 512; i++) {
            dmx[startAddr + i] = quantumValues[i];
          }
        }
      }
    });
  }

  // Build DMX data for a universe by merging all active room states
  _buildUniverseDMX(universe, priority) {
    var self = this;

    // Shared universes: multiple rooms have fixtures here
    var sharedRooms = [];
    Object.keys(ROOM_CONFIG).forEach(function(roomId) {
      if (ROOM_CONFIG[roomId].universes.indexOf(universe) !== -1) {
        sharedRooms.push(roomId);
      }
    });
    var isShared = sharedRooms.length > 1 &&
      sharedRooms.some(function(r) { return self.roomStates[r].state !== 'inactive'; });

    // If universe is shared between rooms, use fixture-level control
    if (isShared) {
      var dmx = new Uint8Array(this.universeData[universe].dmxData);

      sharedRooms.forEach(function(roomId) {
        var roomState = self.roomStates[roomId];
        if (roomState.state === 'inactive') return;

        // Apply each fixture belonging to this room on this universe
        FIXTURES.forEach(function(f) {
          if (f.universe === universe && f.room === roomId) {
            self._applyFixtureState(dmx, f, roomState.state);
          }
        });
      });

      return dmx;
    }

    // Non-shared universe: full fill + profiled fixture overrides
    var dmx = new Uint8Array(512).fill(0);

    sharedRooms.forEach(function(roomId) {
      var roomState = self.roomStates[roomId];
      if (roomState.state === 'inactive') return;

      var targetValue = (roomState.state === 'on') ? 255 : 0;
      dmx.fill(targetValue);

      // Apply profiled fixture overrides (quantum, aura)
      self._applyProfiledFixtures(dmx, universe, roomState.state, roomId);
    });

    return dmx;
  }

  // Send current state for all universes affected by a room
  _sendRoomState(roomId, priority) {
    var config = ROOM_CONFIG[roomId];
    var self = this;
    priority = priority || 200;

    // Find all universes that need updating (including shared ones)
    var universesToUpdate = new Set(config.universes);

    // Also include any universe shared with other rooms
    Object.keys(ROOM_CONFIG).forEach(function(otherRoomId) {
      if (otherRoomId === roomId) return;
      ROOM_CONFIG[otherRoomId].universes.forEach(function(u) {
        if (config.universes.includes(u) || universesToUpdate.has(u)) {
          universesToUpdate.add(u);
        }
      });
    });

    console.log('Room ' + roomId.toUpperCase() + ' state=' + self.roomStates[roomId].state + ', updating universes: ' + Array.from(universesToUpdate).join(', '));

    universesToUpdate.forEach(function(universe) {
      var dmx = self._buildUniverseDMX(universe, priority);
      self._sendPacket(universe, dmx, priority);
    });
  }

  // === Room-based control (NEW) ===

  setRoomState(roomId, state, priority, duration) {
    var self = this;
    roomId = roomId.toLowerCase();
    priority = priority || 200;
    duration = duration || 5000;  // 5 seconds default

    if (!ROOM_CONFIG[roomId]) {
      console.error('Unknown room: ' + roomId);
      return false;
    }

    // Clear any existing timer for this room
    if (this.roomStates[roomId].timer) {
      clearInterval(this.roomStates[roomId].timer);
      this.roomStates[roomId].timer = null;
    }

    this.roomStates[roomId].state = state;

    console.log('=== Room ' + roomId.toUpperCase() + ' -> ' + state + ' ===');

    // Send initial state
    this._sendRoomState(roomId, priority);

    // Continue sending for duration (every 1 second)
    var count = 0;
    var maxCount = Math.ceil(duration / 1000);

    this.roomStates[roomId].timer = setInterval(function() {
      count++;
      if (count >= maxCount || self.roomStates[roomId].state === 'inactive') {
        clearInterval(self.roomStates[roomId].timer);
        self.roomStates[roomId].timer = null;
        self.roomStates[roomId].state = 'inactive';

        console.log('Room ' + roomId.toUpperCase() + ' auto-released after ' + count + ' seconds');
        // Release streams for this room's universes
        ROOM_CONFIG[roomId].universes.forEach(function(u) {
          self.releaseStream(u);
        });
        return;
      }
      self._sendRoomState(roomId, priority);
    }, 1000);

    return true;
  }

  releaseRoom(roomId) {
    roomId = roomId.toLowerCase();
    if (!ROOM_CONFIG[roomId]) return false;

    if (this.roomStates[roomId].timer) {
      clearInterval(this.roomStates[roomId].timer);
      this.roomStates[roomId].timer = null;
    }
    this.roomStates[roomId].state = 'inactive';

    var self = this;
    ROOM_CONFIG[roomId].universes.forEach(function(u) {
      self.releaseStream(u);
    });

    console.log('Room ' + roomId.toUpperCase() + ' released');
    return true;
  }

  // === INITIALIZATION (known baseline state) ===
  // Builds the correct "home" DMX frame for any universe:
  // - All dimmers at 0 (lights off)
  // - Quantums in rest position (pan/tilt centered, shutter closed)
  // - Auras in rest position (pan/tilt centered, shutter closed)
  // - Everything else at 0
  buildBaselineDMX(universe) {
    var dmx = new Uint8Array(512).fill(0);

    // Apply rest profiles for all profiled fixtures (quantum, aura) on this universe
    this._applyProfiledFixtures(dmx, universe, 'off', null);

    return dmx;
  }

  // Initialize all universes for a room: send baseline, store as shadow state,
  // and start persistent streaming (no auto-release).
  initializeRoom(roomId, priority) {
    var self = this;
    roomId = roomId.toLowerCase();
    priority = priority || 190;

    if (!ROOM_CONFIG[roomId]) {
      console.error('Unknown room: ' + roomId);
      return false;
    }

    // Track which universes we've initialized (for persistent streaming)
    if (!this.persistentUniverses) this.persistentUniverses = {};

    var universes = ROOM_CONFIG[roomId].universes;
    console.log('=== INITIALIZING Room ' + roomId.toUpperCase() + ' (U' + universes.join(', U') + ') ===');

    universes.forEach(function(u) {
      // Cancel any existing timers/crossfades on this universe
      if (self.channelTimers && self.channelTimers[u]) {
        clearInterval(self.channelTimers[u]);
        self.channelTimers[u] = null;
      }
      if (self.crossfadeTimers[u]) {
        if (self.crossfadeTimers[u].interval) clearInterval(self.crossfadeTimers[u].interval);
        if (self.crossfadeTimers[u].holdTimer) clearInterval(self.crossfadeTimers[u].holdTimer);
        self.crossfadeTimers[u] = null;
      }

      // Build and send baseline
      var dmx = self.buildBaselineDMX(u);
      self._sendPacket(u, dmx, priority);
      console.log('  U' + u + ': baseline sent (' + self._countNonZero(dmx) + ' non-zero channels)');

      // Start persistent streaming (resend every 1s to maintain sACN priority)
      if (self.persistentUniverses[u]) {
        clearInterval(self.persistentUniverses[u]);
      }
      self.persistentUniverses[u] = setInterval(function() {
        // Resend current shadow state
        var current = self.universeData[u];
        self.socket.send(
          self._packet(u, current.dmxData, current.priority),
          CONFIG.SACN_PORT,
          self._mcastAddr(u),
          function() {}
        );
        if (DEVICES.luminex) {
          self.socket.send(
            self._packet(u, current.dmxData, current.priority),
            CONFIG.SACN_PORT,
            DEVICES.luminex,
            function() {}
          );
        }
      }, 1000);
    });

    return true;
  }

  // Stop persistent streaming for a room's universes
  stopPersistent(roomId) {
    var self = this;
    if (!this.persistentUniverses) return;
    if (!ROOM_CONFIG[roomId]) return;

    ROOM_CONFIG[roomId].universes.forEach(function(u) {
      if (self.persistentUniverses[u]) {
        clearInterval(self.persistentUniverses[u]);
        delete self.persistentUniverses[u];
        self.releaseStream(u);
        console.log('Persistent stream U' + u + ' stopped');
      }
    });
  }

  // Get full shadow state for specified universes (for preset save)
  getUniverseState(universes) {
    var self = this;
    var state = {};
    universes.forEach(function(u) {
      state[u] = {};
      var dmx = self.universeData[u].dmxData;
      for (var ch = 0; ch < 512; ch++) {
        if (dmx[ch] !== 0) {
          state[u][ch + 1] = dmx[ch];  // 1-indexed for consistency
        }
      }
    });
    return state;
  }

  // Recall a full preset: replace universeData entirely for each universe
  recallFullPreset(channels, priority) {
    var self = this;
    priority = priority || 190;

    Object.keys(channels).forEach(function(universeStr) {
      var universe = parseInt(universeStr);
      var channelValues = channels[universeStr];

      // Start from baseline (so unspecified channels get correct home values)
      var dmx = self.buildBaselineDMX(universe);

      // Overlay preset values
      Object.keys(channelValues).forEach(function(ch) {
        var idx = parseInt(ch) - 1;
        if (idx >= 0 && idx < 512) {
          dmx[idx] = channelValues[ch];
        }
      });

      self._sendPacket(universe, dmx, priority);
      console.log('  Preset recall U' + universe + ': ' + Object.keys(channelValues).length + ' channels set');
    });
  }

  // === Legacy methods (for ALL blackout/lightson) ===

  sendBlackout(universe, priority, channelRanges) {
    priority = priority || 200;
    var dmx = new Uint8Array(512).fill(0);
    this._applyQuantumValues(dmx, universe, QUANTUM_REST, null);

    if (channelRanges && Array.isArray(channelRanges)) {
      console.log('Universe ' + universe + ' selective blackout:', channelRanges);
      channelRanges.forEach(function(range) {
        var start = range[0], end = range[1];
        for (var i = start - 1; i < end && i < 512; i++) {
          dmx[i] = 0;
        }
      });
      this._applyQuantumValues(dmx, universe, QUANTUM_REST, null);
    } else {
      console.log('Universe ' + universe + ' full blackout');
    }

    this._sendPacket(universe, dmx, priority);
  }

  sendLightsOn(universe, priority, channelRanges) {
    priority = priority || 200;
    var dmx = new Uint8Array(512).fill(255);

    this._applyQuantumValues(dmx, universe, QUANTUM_ON, null);

    if (channelRanges && Array.isArray(channelRanges)) {
      console.log('Universe ' + universe + ' selective lights on:', channelRanges);
      dmx.fill(0);
      channelRanges.forEach(function(range) {
        var start = range[0], end = range[1];
        for (var i = start - 1; i < end && i < 512; i++) {
          dmx[i] = 255;
        }
      });

      this._applyQuantumValues(dmx, universe, QUANTUM_ON, null);
    } else {
      console.log('Universe ' + universe + ' full lights on');
    }

    this._sendPacket(universe, dmx, priority);
  }

  releaseStream(universe) {
    var prev = this.universeData[universe];
    var pkt = this._packet(universe, prev.dmxData, prev.priority);
    pkt[125] = 0x40;
    var maddr = this._mcastAddr(universe);
    var self = this;
    for (var i = 0; i < 3; i++) {
      (function(idx) {
        setTimeout(function() {
          self.socket.send(pkt, CONFIG.SACN_PORT, maddr, function() {});
          if (DEVICES.luminex) self.socket.send(pkt, CONFIG.SACN_PORT, DEVICES.luminex, function() {});
          if (universe <= 2) {
            [DEVICES.cuecoreA, DEVICES.cuecoreB, DEVICES.cuecoreC].forEach(function(ip) {
              if (ip) self.socket.send(pkt, CONFIG.SACN_PORT, ip, function() {});
            });
          }
        }, idx * 100);
      })(i);
    }
  }

  // === Channel-level control (for house lights: taklys, stage, vegg, etc.) ===
  // Track active channel control timers per universe
  sendChannelData(universe, dmxData, priority, duration) {
    var self = this;
    priority = priority || 180;
    duration = duration || 5000;

    // Clear existing timer for this universe if any
    if (!this.channelTimers) this.channelTimers = {};
    if (this.channelTimers[universe]) {
      clearInterval(this.channelTimers[universe]);
      this.channelTimers[universe] = null;
    }

    console.log('Channel control U' + universe + ': ' + this._countNonZero(dmxData) + ' channels set, priority=' + priority);

    // Send the packet (updates shadow state)
    this._sendPacket(universe, dmxData, priority);

    // If persistent streaming is active, the 1s resend timer handles keepalive.
    // No need for a separate timer or auto-release.
    if (this.persistentUniverses && this.persistentUniverses[universe]) {
      return;
    }

    // Legacy mode: repeat for duration then release
    var count = 0;
    var maxCount = Math.ceil(duration / 1000);

    this.channelTimers[universe] = setInterval(function() {
      count++;
      if (count >= maxCount) {
        clearInterval(self.channelTimers[universe]);
        self.channelTimers[universe] = null;
        self.releaseStream(universe);
        console.log('Channel control U' + universe + ' auto-released after ' + count + 's');
        return;
      }
      self._sendPacket(universe, dmxData, priority);
    }, 1000);
  }

  _countNonZero(arr) {
    var count = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] !== 0) count++;
    }
    return count;
  }

  startContinuousBlackout(universes, priority, universeChannelMap) {
    this.blackoutActive = true;
    priority = priority || 200;

    var count = 0;
    var maxCount = 5;
    var self = this;

    var tick = function() {
      if (count >= maxCount) {
        self.blackoutActive = false;
        universes.forEach(function(u) { self.releaseStream(u); });
        console.log('Blackout auto-released after ' + maxCount + ' seconds');
        return;
      }

      universes.forEach(function(u) {
        var channelRanges = universeChannelMap ? universeChannelMap[u] : null;
        self.sendBlackout(u, priority, channelRanges);
      });
      count++;
      setTimeout(tick, 1000);
    };
    tick();
  }

  startContinuousLightsOn(universes, priority, universeChannelMap) {
    this.lightsOnActive = true;
    priority = priority || 200;

    var count = 0;
    var maxCount = 5;
    var self = this;

    var tick = function() {
      if (count >= maxCount) {
        self.lightsOnActive = false;
        universes.forEach(function(u) { self.releaseStream(u); });
        console.log('Lights on auto-released after ' + maxCount + ' seconds');
        return;
      }

      universes.forEach(function(u) {
        var channelRanges = universeChannelMap ? universeChannelMap[u] : null;
        self.sendLightsOn(u, priority, channelRanges);
      });
      count++;
      setTimeout(tick, 1000);
    };
    tick();
  }

  stopContinuousBlackout(universes) {
    this.blackoutActive = false;
    var self = this;
    universes.forEach(function(u) { self.releaseStream(u); });
  }

  stopContinuousLightsOn(universes) {
    this.lightsOnActive = false;
    var self = this;
    universes.forEach(function(u) { self.releaseStream(u); });
  }

  getRoomStates() {
    var states = {};
    var self = this;
    Object.keys(this.roomStates).forEach(function(roomId) {
      states[roomId] = {
        state: self.roomStates[roomId].state,
        active: self.roomStates[roomId].timer !== null
      };
    });
    return states;
  }

  // === TRUSS CONTROL — derived from FIXTURES ===

  // Apply Aura fixture values (backward compat for buildBaselineDMX)
  _applyAura(dmx, fixture, values) {
    var start = fixture.address - 1;
    for (var i = 0; i < AURA_CHANNELS && (start + i) < 512; i++) {
      dmx[start + i] = values[i];
    }
  }

  // Send truss state (on/off) — iterates FIXTURES for this truss
  sendTrussState(trussId, state, priority) {
    var trussFixtures = FIXTURES.filter(function(f) { return f.truss === trussId; });
    if (trussFixtures.length === 0) return false;

    priority = priority || 200;
    var self = this;

    // Group fixtures by universe (a truss could span multiple universes)
    var byUniverse = {};
    trussFixtures.forEach(function(f) {
      if (!byUniverse[f.universe]) byUniverse[f.universe] = [];
      byUniverse[f.universe].push(f);
    });

    Object.keys(byUniverse).forEach(function(uStr) {
      var universe = parseInt(uStr);
      var fixtures = byUniverse[uStr];

      // Start from current shadow state (don't clobber other trusses on same universe)
      var dmx = new Uint8Array(self.universeData[universe].dmxData);

      fixtures.forEach(function(f) {
        self._applyFixtureState(dmx, f, state);
      });

      self._sendPacket(universe, dmx, priority);
      console.log('Truss ' + trussId + ' (U' + universe + ', ' + fixtures.length + ' fixtures) -> ' + state);
    });

    return true;
  }
}

var app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

var sacnSender = new SACNSender();

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

var effectEngine = new EffectEngine(effectFixtureData, effectSender, { dryRun: false });
effectEngine.initSequenceStore(path.join(__dirname, 'data'));
console.log('Effect engine initialized (LIVE mode — sACN output active)');

// === NEW Room-based endpoints ===

app.post('/room/:roomId/on', function(req, res) {
  var roomId = req.params.roomId.toLowerCase();
  var priority = (req.body && req.body.priority) || 200;
  var duration = (req.body && req.body.duration) || 5000;

  if (!ROOM_CONFIG[roomId]) {
    return res.status(400).json({ error: 'Unknown room: ' + roomId });
  }

  sacnSender.setRoomState(roomId, 'on', priority, duration);
  res.json({ ok: true, room: roomId, state: 'on', priority: priority });
});

app.post('/room/:roomId/off', function(req, res) {
  var roomId = req.params.roomId.toLowerCase();
  var priority = (req.body && req.body.priority) || 200;
  var duration = (req.body && req.body.duration) || 5000;

  if (!ROOM_CONFIG[roomId]) {
    return res.status(400).json({ error: 'Unknown room: ' + roomId });
  }

  sacnSender.setRoomState(roomId, 'off', priority, duration);
  res.json({ ok: true, room: roomId, state: 'off', priority: priority });
});

app.post('/room/:roomId/release', function(req, res) {
  var roomId = req.params.roomId.toLowerCase();

  if (!ROOM_CONFIG[roomId]) {
    return res.status(400).json({ error: 'Unknown room: ' + roomId });
  }

  sacnSender.releaseRoom(roomId);
  res.json({ ok: true, room: roomId, state: 'released' });
});

app.get('/rooms', function(req, res) {
  res.json({
    config: ROOM_CONFIG,
    states: sacnSender.getRoomStates(),
    quantumFixtures: QUANTUM_FIXTURES
  });
});

// === INITIALIZATION ENDPOINT (Take Control) ===
// Sends known baseline to all universes in a room, starts persistent streaming
app.post('/room/:roomId/initialize', function(req, res) {
  var roomId = req.params.roomId.toLowerCase();
  var priority = (req.body && req.body.priority) || 190;

  if (!ROOM_CONFIG[roomId]) {
    return res.status(400).json({ error: 'Unknown room: ' + roomId });
  }

  var result = sacnSender.initializeRoom(roomId, priority);
  var universes = ROOM_CONFIG[roomId].universes;

  // Return the baseline state for each universe so the frontend knows the initial values
  var state = {};
  universes.forEach(function(u) {
    state[u] = {};
    var dmx = sacnSender.universeData[u].dmxData;
    for (var ch = 0; ch < 512; ch++) {
      if (dmx[ch] !== 0) {
        state[u][ch + 1] = dmx[ch];
      }
    }
  });

  res.json({ ok: result, room: roomId, universes: universes, state: state });
});


// Get current DMX state for a room WITHOUT reinitializing
// Used for "Resume" — reconnect UI to existing fixture state
app.get('/room/:roomId/state', function(req, res) {
  var roomId = req.params.roomId.toLowerCase();

  if (!ROOM_CONFIG[roomId]) {
    return res.status(400).json({ error: 'Unknown room: ' + roomId });
  }

  var universes = ROOM_CONFIG[roomId].universes;
  var state = {};
  var isStreaming = false;

  universes.forEach(function(u) {
    state[u] = {};
    if (sacnSender.universeData[u]) {
      var dmx = sacnSender.universeData[u].dmxData;
      for (var ch = 0; ch < 512; ch++) {
        if (dmx[ch] !== 0) {
          state[u][ch + 1] = dmx[ch];  // 1-indexed for consistency
        }
      }
      if (sacnSender.persistentUniverses && sacnSender.persistentUniverses[u]) {
        isStreaming = true;
      }
    }
  });

  res.json({ ok: true, room: roomId, universes: universes, state: state, streaming: isStreaming });
});

// Stop persistent streaming for a room (on Release)
app.post('/room/:roomId/stop-persistent', function(req, res) {
  var roomId = req.params.roomId.toLowerCase();
  if (!ROOM_CONFIG[roomId]) {
    return res.status(400).json({ error: 'Unknown room: ' + roomId });
  }
  sacnSender.stopPersistent(roomId);
  res.json({ ok: true, room: roomId });
});

// Get full shadow state for all universes (for preset save)
app.get('/state', function(req, res) {
  var allUniverses = [1, 2, 3, 4, 5, 6, 7, 8];
  var state = sacnSender.getUniverseState(allUniverses);
  res.json({ ok: true, state: state });
});

// === TRUSS CONTROL ENDPOINTS (for blackout tab) ===
var trussTimers = {};

app.post('/truss/:id/on', function(req, res) {
  var id = req.params.id.toLowerCase();
  if (!VALID_TRUSSES.includes(id)) {
    return res.status(400).json({ error: 'Invalid truss. Valid: ' + VALID_TRUSSES.join(', ') });
  }
  var priority = (req.body && req.body.priority) || 200;
  var duration = (req.body && req.body.duration) || 5000;

  if (trussTimers[id]) {
    clearInterval(trussTimers[id]);
  }

  sacnSender.sendTrussState(id, 'on', priority);

  var trussUniverses = getTrussUniverses(id);
  var count = 0;
  var maxCount = Math.ceil(duration / 1000);
  trussTimers[id] = setInterval(function() {
    count++;
    if (count >= maxCount) {
      clearInterval(trussTimers[id]);
      trussTimers[id] = null;
      trussUniverses.forEach(function(u) { sacnSender.releaseStream(u); });
      return;
    }
    sacnSender.sendTrussState(id, 'on', priority);
  }, 1000);

  res.json({ ok: true, truss: id, state: 'on', universes: trussUniverses });
});

app.post('/truss/:id/off', function(req, res) {
  var id = req.params.id.toLowerCase();
  if (!VALID_TRUSSES.includes(id)) {
    return res.status(400).json({ error: 'Invalid truss. Valid: ' + VALID_TRUSSES.join(', ') });
  }
  var priority = (req.body && req.body.priority) || 200;
  var duration = (req.body && req.body.duration) || 5000;

  if (trussTimers[id]) {
    clearInterval(trussTimers[id]);
  }

  sacnSender.sendTrussState(id, 'off', priority);

  var trussUniverses = getTrussUniverses(id);
  var count = 0;
  var maxCount = Math.ceil(duration / 1000);
  trussTimers[id] = setInterval(function() {
    count++;
    if (count >= maxCount) {
      clearInterval(trussTimers[id]);
      trussTimers[id] = null;
      trussUniverses.forEach(function(u) { sacnSender.releaseStream(u); });
      return;
    }
    sacnSender.sendTrussState(id, 'off', priority);
  }, 1000);

  res.json({ ok: true, truss: id, state: 'off', universes: trussUniverses });
});

app.post('/truss/:id/release', function(req, res) {
  var id = req.params.id.toLowerCase();
  if (trussTimers[id]) {
    clearInterval(trussTimers[id]);
    trussTimers[id] = null;
  }
  var trussUniverses = getTrussUniverses(id);
  trussUniverses.forEach(function(u) { sacnSender.releaseStream(u); });
  res.json({ ok: true, truss: id, state: 'released' });
});

app.get('/trusses', function(req, res) {
  // Build truss summary from FIXTURES for API consumers
  var trusses = {};
  VALID_TRUSSES.forEach(function(trussId) {
    var fixtures = FIXTURES.filter(function(f) { return f.truss === trussId; });
    trusses[trussId] = {
      label: trussId === 'pipe' ? 'Pipe' : 'Truss ' + trussId.replace('truss', ''),
      universes: getTrussUniverses(trussId),
      fixtureCount: fixtures.length,
      fixtureTypes: [...new Set(fixtures.map(function(f) { return f.type; }))]
    };
  });
  res.json({ trusses: trusses });
});

// === SCREEN CONTROL ENDPOINTS ===
// Signal numbers from SIMPL source — these pass through as CIP digital joins
const SCREENS = {
  1: { label: 'Screen 1 (12m Cinema)', up: 192, down: 226 },
  2: { label: 'Screen 2 (Sal A)',      up: 293, stop: 294, down: 295 },
  3: { label: 'Screen 3 (Sal B)',      up: 299, stop: 300, down: 301 },
  4: { label: 'Screen 4 (Sal C)',      up: 305, stop: 306, down: 307 },
  5: { label: 'Screen 5',             up: 311, down: 313 },
  6: { label: 'Screen 6',             up: 317, down: 319 },
};

const BOXES = {
  2: { label: 'Box 2 (Sal A)', up: 323, stop: 294, down: 325 },
  3: { label: 'Box 3 (Sal B)', up: 328, stop: 300, down: 331 },
  4: { label: 'Box 4 (Sal C)', up: 335, stop: 306, down: 337 },
};

app.post('/screen/:id/:action', function(req, res) {
  var id = parseInt(req.params.id);
  var action = req.params.action.toLowerCase();
  var screen = SCREENS[id];

  if (!screen) {
    return res.status(400).json({ error: 'Unknown screen: ' + id + '. Valid: 1-6' });
  }
  if (!['up', 'down', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Valid: up, down, stop' });
  }

  var join = screen[action];
  if (!join) {
    return res.status(400).json({ error: 'Screen ' + id + ' has no ' + action + ' control' });
  }

  var cipClient = getCrestronClient();
  if (!cipClient.connected) {
    cipClient.connect();
    return res.status(503).json({ error: 'Not connected to Crestron — connecting now, retry in a moment' });
  }

  cipClient.pulseDigitalJoin(join, 200)
    .then(function() {
      console.log('Screen ' + id + ' ' + action + ' (join ' + join + ')');
      res.json({ ok: true, screen: id, action: action, join: join });
    })
    .catch(function(err) {
      res.status(500).json({ error: err.message });
    });
});

app.post('/box/:id/:action', function(req, res) {
  var id = parseInt(req.params.id);
  var action = req.params.action.toLowerCase();
  var box = BOXES[id];

  if (!box) {
    return res.status(400).json({ error: 'Unknown box: ' + id + '. Valid: 2, 3, 4' });
  }
  if (!['up', 'down', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Valid: up, down, stop' });
  }

  var join = box[action];
  if (!join) {
    return res.status(400).json({ error: 'Box ' + id + ' has no ' + action + ' control' });
  }

  var cipClient = getCrestronClient();
  if (!cipClient.connected) {
    cipClient.connect();
    return res.status(503).json({ error: 'Not connected to Crestron — connecting now, retry in a moment' });
  }

  cipClient.pulseDigitalJoin(join, 200)
    .then(function() {
      console.log('Box ' + id + ' ' + action + ' (join ' + join + ')');
      res.json({ ok: true, box: id, action: action, join: join });
    })
    .catch(function(err) {
      res.status(500).json({ error: err.message });
    });
});

app.get('/screens', function(req, res) {
  res.json({ screens: SCREENS, boxes: BOXES });
});

// Test endpoint: pulse arbitrary CIP digital join
app.post('/cip/test/:join', function(req, res) {
  var join = parseInt(req.params.join);
  var duration = parseInt(req.query.duration) || 200;
  if (isNaN(join) || join < 1) {
    return res.status(400).json({ error: 'Invalid join number' });
  }
  var cipClient = getCrestronClient();
  if (!cipClient.connected) {
    cipClient.connect();
    return res.status(503).json({ error: 'Not connected — connecting now' });
  }
  cipClient.pulseDigitalJoin(join, duration)
    .then(function() {
      console.log('[CIP TEST] Pulsed join ' + join + ' (' + duration + 'ms)');
      res.json({ ok: true, join: join, duration: duration });
    })
    .catch(function(err) {
      res.status(500).json({ error: err.message });
    });
});

// Smart Object test endpoint — pulse a button on a Smart Object
app.post('/cip/so/:objectId/:join', function(req, res) {
  var objectId = parseInt(req.params.objectId);
  var join = parseInt(req.params.join);
  var duration = parseInt(req.query.duration) || 200;
  if (isNaN(objectId) || objectId < 1 || isNaN(join) || join < 1) {
    return res.status(400).json({ error: 'Invalid objectId or join' });
  }
  var cipClient = getCrestronClient();
  if (!cipClient.connected) {
    cipClient.connect();
    return res.status(503).json({ error: 'Not connected — connecting now' });
  }
  cipClient.pulseSmartObjectDigitalJoin(objectId, join, duration)
    .then(function() {
      console.log('[CIP SO TEST] Pulsed SO ' + objectId + ' join ' + join + ' (' + duration + 'ms)');
      res.json({ ok: true, objectId: objectId, join: join, duration: duration });
    })
    .catch(function(err) {
      res.status(500).json({ error: err.message });
    });
});

// === UNIVERSE CONTROL ENDPOINTS (for blackout tab) ===
var universeTimers = {};

app.post('/universe/:id/on', function(req, res) {
  var u = parseInt(req.params.id);
  if (![1,2,3,4,5,6,7,8].includes(u)) {
    return res.status(400).json({ error: 'Invalid universe' });
  }
  var priority = (req.body && req.body.priority) || 200;
  var duration = (req.body && req.body.duration) || 5000;

  if (universeTimers[u]) {
    clearInterval(universeTimers[u]);
  }

  sacnSender.sendLightsOn(u, priority);

  var count = 0;
  var maxCount = Math.ceil(duration / 1000);
  universeTimers[u] = setInterval(function() {
    count++;
    if (count >= maxCount) {
      clearInterval(universeTimers[u]);
      universeTimers[u] = null;
      sacnSender.releaseStream(u);
      return;
    }
    sacnSender.sendLightsOn(u, priority);
  }, 1000);

  res.json({ ok: true, universe: u, state: 'on' });
});

app.post('/universe/:id/off', function(req, res) {
  var u = parseInt(req.params.id);
  if (![1,2,3,4,5,6,7,8].includes(u)) {
    return res.status(400).json({ error: 'Invalid universe' });
  }
  var priority = (req.body && req.body.priority) || 200;
  var duration = (req.body && req.body.duration) || 5000;

  if (universeTimers[u]) {
    clearInterval(universeTimers[u]);
  }

  sacnSender.sendBlackout(u, priority);

  var count = 0;
  var maxCount = Math.ceil(duration / 1000);
  universeTimers[u] = setInterval(function() {
    count++;
    if (count >= maxCount) {
      clearInterval(universeTimers[u]);
      universeTimers[u] = null;
      sacnSender.releaseStream(u);
      return;
    }
    sacnSender.sendBlackout(u, priority);
  }, 1000);

  res.json({ ok: true, universe: u, state: 'off' });
});

app.post('/universe/:id/release', function(req, res) {
  var u = parseInt(req.params.id);
  if (universeTimers[u]) {
    clearInterval(universeTimers[u]);
    universeTimers[u] = null;
  }
  sacnSender.releaseStream(u);
  res.json({ ok: true, universe: u, state: 'released' });
});

// === Legacy endpoints ===

app.post('/blackout', function(req, res) {
  var body = req.body || {};
  var action = body.action;
  var universes = body.universes || [1,2,3,4,5,6,7,8];
  var priority = body.priority || 200;
  var channelRanges = body.channelRanges || null;

  if (action === 'blackout') {
    sacnSender.startContinuousBlackout(universes, priority, channelRanges);
    return res.json({ status: 'Blackout activated', universes: universes, priority: priority });
  }
  if (action === 'release') {
    sacnSender.stopContinuousBlackout(universes);
    return res.json({ status: 'Blackout released', universes: universes });
  }
  return res.status(400).json({ error: 'Invalid action' });
});

app.post('/lightson', function(req, res) {
  var body = req.body || {};
  var action = body.action;
  var universes = body.universes || [1,2,3,4,5,6,7,8];
  var priority = body.priority || 200;
  var channelRanges = body.channelRanges || null;

  if (action === 'on') {
    sacnSender.startContinuousLightsOn(universes, priority, channelRanges);
    return res.json({ status: 'Lights on activated', universes: universes, priority: priority });
  }
  if (action === 'release') {
    sacnSender.stopContinuousLightsOn(universes);
    return res.json({ status: 'Lights on released', universes: universes });
  }
  return res.status(400).json({ error: 'Invalid action' });
});


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
    paramDefaults: effectEngine.getParamDefaults()
  });
});

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
  // If no fixtures specified, capture ALL fixtures
  var fixtureIds = (req.body && req.body.fixtures && req.body.fixtures.length)
    ? req.body.fixtures
    : FIXTURES.map(function(f) { return f.id; });
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

// === Fixture data endpoint (for effects UI) ===
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

// === Release all control (let console take over) ===
// Stops all active streams without sending blackout - console resumes control
app.post('/release', function(req, res) {
  console.log('Releasing all control to console');
  effectEngine.stopAll();

  // Stop any active blackout/lightson
  sacnSender.stopContinuousBlackout([1,2,3,4,5,6,7,8]);
  sacnSender.stopContinuousLightsOn([1,2,3,4,5,6,7,8]);

  // Release all universe streams
  for (var u = 1; u <= 8; u++) {
    // Cancel any active crossfades
    if (sacnSender.crossfadeTimers[u]) {
      if (sacnSender.crossfadeTimers[u].interval) {
        clearInterval(sacnSender.crossfadeTimers[u].interval);
      }
      if (sacnSender.crossfadeTimers[u].holdTimer) {
        clearInterval(sacnSender.crossfadeTimers[u].holdTimer);
      }
      sacnSender.crossfadeTimers[u] = null;
    }
    // Cancel any channel control timers
    if (sacnSender.channelTimers && sacnSender.channelTimers[u]) {
      clearInterval(sacnSender.channelTimers[u]);
      sacnSender.channelTimers[u] = null;
    }
    // Release the stream (stop sending)
    sacnSender.releaseStream(u);
  }

  res.json({ ok: true, status: 'All control released to console' });
});

// === All Off (end of night shutdown) ===
// Fades all house lights to 0 at NORMAL priority - another controller can override
app.post('/all-off', function(req, res) {
  var body = req.body || {};
  var crossfadeMs = body.crossfade || 2000;  // Default 2 second fade
  var priority = body.priority || 150;  // LOWER than normal (180) - console can override

  console.log('All Off: fading to 0 with ' + crossfadeMs + 'ms crossfade, priority ' + priority);

  // Fade house light universes to 0
  [6, 7, 8].forEach(function(universe) {
    var dmx = new Uint8Array(512).fill(0);
    sacnSender.crossfadeTo(universe, dmx, crossfadeMs, priority, 3000);
  });

  res.json({ ok: true, status: 'Fading all to off', crossfade: crossfadeMs, priority: priority });
});

// === Channel-level control endpoint (for house lights) ===
// Accepts: { universe: { channel: value, ... }, ... }
// Example: { "6": { "1": 255, "8": 128 }, "7": { "81": 200 } }
app.post('/channels', function(req, res) {
  console.log('DEBUG /channels: raw body =', JSON.stringify(req.body));
  var body = req.body || {};
  var priority = body.priority || 180;  // Lower priority than panic/room controls
  var duration = body.duration || 5000;  // 5 second default

  // Validate input
  if (typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid channel data format' });
  }

  var channelCount = 0;
  var universeCount = 0;

  // Process each universe
  Object.keys(body).forEach(function(universeStr) {
    if (universeStr === 'priority' || universeStr === 'duration') return;

    var universe = parseInt(universeStr);
    if (isNaN(universe) || universe < 1 || universe > 8) return;

    var channelValues = body[universeStr];
    if (typeof channelValues !== 'object') return;

    universeCount++;

    // MERGE with existing universe state (don't zero out unspecified channels!)
    var existingDmx = sacnSender.universeData[universe] ? sacnSender.universeData[universe].dmxData : new Uint8Array(512);
    var dmx = new Uint8Array(existingDmx);  // Copy existing state

    Object.keys(channelValues).forEach(function(channelStr) {
      var channel = parseInt(channelStr);
      var value = parseInt(channelValues[channelStr]);

      if (channel >= 1 && channel <= 512 && value >= 0 && value <= 255) {
        dmx[channel - 1] = value;  // DMX channels are 1-indexed
        channelCount++;
      }
    });

    // Send the DMX data for this universe
    sacnSender.sendChannelData(universe, dmx, priority, duration);
  });

  // Debug: log raw request body for channel 67 debugging
  if (body['1'] && body['1']['67']) {
    console.log('DEBUG: Channel 1.067 received! Value: ' + body['1']['67']);
  }
  console.log('Channel control: ' + channelCount + ' channels across ' + universeCount + ' universes');
  console.log('DEBUG: Full body:', JSON.stringify(body));
  res.json({ ok: true, channels: channelCount, universes: universeCount, priority: priority });
});

app.get('/status', function(req, res) {
  res.json({
    blackoutActive: sacnSender.blackoutActive,
    lightsOnActive: sacnSender.lightsOnActive,
    roomStates: sacnSender.getRoomStates(),
    devices: DEVICES,
    quantumFixtures: QUANTUM_FIXTURES,
    roomConfig: ROOM_CONFIG,
    status: deviceStatus  // Actual ping results, not just IP existence
  });
});

var server = http.createServer(app);
var wss = new WebSocket.Server({ server: server });

wss.on('connection', function(ws) {
  ws.send(JSON.stringify({ type: 'hello', msg: 'connected', roomConfig: ROOM_CONFIG }));
  ws.on('message', function(raw) {
    try {
      var m = JSON.parse(String(raw));

      // NEW: Room-based WebSocket commands
      if (m.type === 'room') {
        var roomId = m.room;
        var action = m.action;  // 'on', 'off', 'release'
        var priority = m.priority || 200;
        var duration = m.duration || 5000;

        if (action === 'on' || action === 'off') {
          sacnSender.setRoomState(roomId, action, priority, duration);
        } else if (action === 'release') {
          sacnSender.releaseRoom(roomId);
        }
        ws.send(JSON.stringify({ type: 'ack', action: 'room', room: roomId, state: action }));
        return;
      }

      // Legacy commands
      if (m.type === 'blackout') {
        var universes = Array.isArray(m.universes) ? m.universes : [1,2,3,4,5,6,7,8];
        var priority = Number.isInteger(m.priority) ? m.priority : 200;
        var channelRanges = m.channelRanges || null;
        sacnSender.startContinuousBlackout(universes, priority, channelRanges);
        ws.send(JSON.stringify({ type: 'ack', action: 'blackout', universes: universes, priority: priority }));
      } else if (m.type === 'lightson') {
        var universes = Array.isArray(m.universes) ? m.universes : [1,2,3,4,5,6,7,8];
        var priority = Number.isInteger(m.priority) ? m.priority : 200;
        var channelRanges = m.channelRanges || null;
        sacnSender.startContinuousLightsOn(universes, priority, channelRanges);
        ws.send(JSON.stringify({ type: 'ack', action: 'lightson', universes: universes, priority: priority }));
      } else if (m.type === 'release') {
        var universes = Array.isArray(m.universes) ? m.universes : [1,2,3,4,5,6,7,8];
        sacnSender.stopContinuousBlackout(universes);
        sacnSender.stopContinuousLightsOn(universes);
        ws.send(JSON.stringify({ type: 'ack', action: 'release', universes: universes }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: e.message }));
    }
  });
});

setInterval(function() {
  var payload = JSON.stringify({
    type: 'status',
    blackoutActive: sacnSender.blackoutActive,
    lightsOnActive: sacnSender.lightsOnActive,
    roomStates: sacnSender.getRoomStates(),
    devices: DEVICES
  });
  wss.clients.forEach(function(c) { if (c.readyState === WebSocket.OPEN) c.send(payload); });
}, 5000);

// === PRESET API ENDPOINTS ===

// Get all house presets
app.get('/house-presets', function(req, res) {
  var presetList = Object.values(HOUSE_PRESETS).map(function(p) {
    return { id: p.id, name: p.name, category: p.category, description: p.description };
  });
  res.json({ presets: presetList });
});

// Recall a house preset
app.post('/house-presets/:id/recall', function(req, res) {
  var presetId = req.params.id;
  var preset = HOUSE_PRESETS[presetId];
  if (!preset) {
    return res.status(404).json({ error: 'House preset not found: ' + presetId });
  }
  var crossfadeMs = (req.body && req.body.crossfade) || 0;
  var priority = (req.body && req.body.priority) || 180;

  console.log('Recalling house preset: ' + preset.name + ' with ' + crossfadeMs + 'ms crossfade');

  // Build full frames from baseline + preset overlay
  Object.keys(preset.channels).forEach(function(universeStr) {
    var universe = parseInt(universeStr);
    var channelValues = preset.channels[universeStr];
    var dmx = sacnSender.buildBaselineDMX(universe);
    Object.keys(channelValues).forEach(function(ch) {
      dmx[parseInt(ch) - 1] = channelValues[ch];
    });
    sacnSender.crossfadeTo(universe, dmx, crossfadeMs, priority, 5000);
  });
  res.json({ ok: true, preset: preset.name, crossfade: crossfadeMs });
});

// === SHOWS API ===
// Get all shows
app.get('/shows', function(req, res) {
  var data = loadShows();
  res.json({ ok: true, shows: data.shows });
});

// Create a new show
app.post('/shows', function(req, res) {
  var body = req.body || {};
  var name = body.name;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Show name is required' });
  }
  var data = loadShows();
  var newShow = {
    id: String(data.nextId),
    name: name.trim(),
    created: new Date().toISOString()
  };
  data.shows.push(newShow);
  data.nextId++;
  if (saveShows(data)) {
    res.json({ ok: true, show: newShow });
  } else {
    res.status(500).json({ error: 'Failed to save show' });
  }
});

// Delete a show
app.delete('/shows/:id', function(req, res) {
  var showId = req.params.id;
  var data = loadShows();
  var showIndex = data.shows.findIndex(function(s) { return s.id === showId; });
  if (showIndex === -1) {
    return res.status(404).json({ error: 'Show not found' });
  }
  data.shows.splice(showIndex, 1);
  if (saveShows(data)) {
    res.json({ ok: true, deleted: showId });
  } else {
    res.status(500).json({ error: 'Failed to save shows' });
  }
});

// Get all show presets
app.get('/show-presets', function(req, res) {
  var data = loadShowPresets();
  res.json({
    presets: data.presets.map(function(p) {
      return { id: p.id, name: p.name, created: p.created, permanent: p.permanent || false, showId: p.showId || null };
    }),
    nextId: data.nextId
  });
});

// Create a new show preset — captures FULL shadow state from server
app.post('/show-presets', function(req, res) {
  var body = req.body || {};
  var movement = body.movement || null;
  var customName = body.name || null;
  var showId = body.showId || null;
  var universes = body.universes || [1, 2, 3, 4, 5, 6, 7, 8];

  // Capture full shadow state from server (not from frontend)
  var channels = sacnSender.getUniverseState(universes);

  var data = loadShowPresets();
  var newPreset = {
    id: data.nextId,
    name: customName || ('Preset ' + data.nextId),
    created: new Date().toISOString(),
    channels: channels,
    movement: movement,
    showId: showId,
    permanent: false
  };
  data.presets.push(newPreset);
  data.nextId++;
  if (saveShowPresets(data)) {
    res.json({ ok: true, preset: { id: newPreset.id, name: newPreset.name, showId: newPreset.showId } });
  } else {
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

// Update a show preset (rename)
app.put('/show-presets/:id', function(req, res) {
  var presetId = parseInt(req.params.id);
  var body = req.body || {};
  var data = loadShowPresets();
  var preset = data.presets.find(function(p) { return p.id === presetId; });
  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  if (body.name) { preset.name = body.name; }
  if (saveShowPresets(data)) {
    res.json({ ok: true, preset: { id: preset.id, name: preset.name } });
  } else {
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

// Delete a show preset
app.delete('/show-presets/:id', function(req, res) {
  var presetId = parseInt(req.params.id);
  var data = loadShowPresets();
  var presetIndex = data.presets.findIndex(function(p) { return p.id === presetId; });
  if (presetIndex === -1) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  var preset = data.presets[presetIndex];
  if (preset.permanent) {
    return res.status(400).json({ error: 'Cannot delete permanent preset' });
  }
  data.presets.splice(presetIndex, 1);
  if (saveShowPresets(data)) {
    res.json({ ok: true, deleted: presetId });
  } else {
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

// Recall a show preset
app.post('/show-presets/:id/recall', function(req, res) {
  var presetId = parseInt(req.params.id);
  var body = req.body || {};
  var crossfadeMs = body.crossfade || 0;
  var priority = body.priority || 180;
  var data = loadShowPresets();
  var preset = data.presets.find(function(p) { return p.id === presetId; });
  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }

  console.log('Recalling show preset: ' + preset.name + ' with ' + crossfadeMs + 'ms crossfade');

  if (preset.channels) {
    // Full recall: overlay preset on baseline, crossfade to target
    Object.keys(preset.channels).forEach(function(universeStr) {
      var universe = parseInt(universeStr);
      var channelValues = preset.channels[universeStr];
      var dmx = sacnSender.buildBaselineDMX(universe);
      Object.keys(channelValues).forEach(function(ch) {
        var idx = parseInt(ch) - 1;
        if (idx >= 0 && idx < 512) {
          dmx[idx] = channelValues[ch];
        }
      });
      sacnSender.crossfadeTo(universe, dmx, crossfadeMs, priority, 5000);
    });
  }
  res.json({ ok: true, preset: preset.name, crossfade: crossfadeMs, movement: preset.movement || null });
});

// === Instant Preset Activate/Deactivate (Momentary & Latching) ===

// Snapshot storage: presetId -> { universeSnapshots: { universe: Uint8Array } }
var activePresetSnapshots = {};

// Activate a preset instantly (snapshot current state, apply preset)
app.post('/show-presets/:id/activate', function(req, res) {
  var presetId = parseInt(req.params.id);
  var data = loadShowPresets();
  var preset = data.presets.find(function(p) { return p.id === presetId; });
  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  if (!preset.channels) {
    return res.status(400).json({ error: 'Preset has no channel data' });
  }

  // Snapshot current universeData for each universe the preset touches
  var snapshots = {};
  Object.keys(preset.channels).forEach(function(universeStr) {
    var universe = parseInt(universeStr);
    if (sacnSender.universeData[universe]) {
      snapshots[universe] = new Uint8Array(sacnSender.universeData[universe].dmxData);
    }
  });
  activePresetSnapshots[presetId] = { universeSnapshots: snapshots };

  // Apply preset instantly via recallFullPreset (priority 190 = Take Control level)
  console.log('Instant activate preset: ' + preset.name);
  sacnSender.recallFullPreset(preset.channels, 190);

  res.json({ ok: true, preset: preset.name, activated: true });
});

// Deactivate a preset instantly (restore snapshotted state)
app.post('/show-presets/:id/deactivate', function(req, res) {
  var presetId = parseInt(req.params.id);
  var snapshot = activePresetSnapshots[presetId];
  if (!snapshot) {
    return res.status(400).json({ error: 'Preset not active (no snapshot)' });
  }

  console.log('Instant deactivate preset ' + presetId + ': restoring snapshot');
  Object.keys(snapshot.universeSnapshots).forEach(function(universeStr) {
    var universe = parseInt(universeStr);
    sacnSender._sendPacket(universe, snapshot.universeSnapshots[universe], 190);
  });
  delete activePresetSnapshots[presetId];

  res.json({ ok: true, deactivated: true });
});

// Abandon a preset snapshot (delete without restoring — used when switching latches)
app.post('/show-presets/:id/abandon', function(req, res) {
  var presetId = parseInt(req.params.id);
  if (activePresetSnapshots[presetId]) {
    console.log('Abandon snapshot for preset ' + presetId + ' (no restore)');
    delete activePresetSnapshots[presetId];
  }
  res.json({ ok: true });
});

// Run pruning at startup and daily
pruneOldPresets();
setInterval(pruneOldPresets, 24 * 60 * 60 * 1000);

// Initialize permanent presets
initPermanentPresets();


server.listen(CONFIG.HTTP_PORT, '0.0.0.0', function() {
  console.log('DMX Blackout Server running on port ' + CONFIG.HTTP_PORT);
  console.log('WebSocket available on ws://localhost:' + CONFIG.HTTP_PORT);
  console.log('HTTP endpoints available at http://localhost:' + CONFIG.HTTP_PORT);
  console.log('');
  console.log('Room configuration:');
  Object.keys(ROOM_CONFIG).forEach(function(roomId) {
    var config = ROOM_CONFIG[roomId];
    console.log('  ' + config.label + ': Universes ' + config.universes.join(', '));
    if (config.channelRanges) {
      Object.keys(config.channelRanges).forEach(function(u) {
        console.log('    U' + u + ' channels: ' + config.channelRanges[u].map(function(r) { return r[0] + '-' + r[1]; }).join(', '));
      });
    }
  });
  console.log('');
  console.log('Quantum fixtures:');
  QUANTUM_FIXTURES.forEach(function(f) {
    console.log('  ' + f.name + ': U' + f.universe + ' @' + f.address + ' (Room ' + f.room.toUpperCase() + ')');
  });
  console.log('');
  console.log('Devices:');
  console.log('  Luminex: ' + DEVICES.luminex);
  console.log('  CueCores: ' + DEVICES.cuecoreA + ', ' + DEVICES.cuecoreB + ', ' + DEVICES.cuecoreC);
  console.log('');
  console.log('Checking device connectivity...');
  checkDeviceConnectivity().then(function() {
    console.log('  Luminex: ' + (deviceStatus.luminex ? 'ONLINE' : 'OFFLINE'));
    console.log('  CueCore A: ' + (deviceStatus.cuecoreA ? 'ONLINE' : 'OFFLINE'));
    console.log('  CueCore B: ' + (deviceStatus.cuecoreB ? 'ONLINE' : 'OFFLINE'));
    console.log('  CueCore C: ' + (deviceStatus.cuecoreC ? 'ONLINE' : 'OFFLINE'));
  });
});

// === PANIC endpoints ===
var PANIC_ACTIVE = false;
var PANIC_TIMER = null;

app.post('/panic/start', function(req, res) {
  try {
    var p = (req && req.body && Number.isInteger(req.body.priority)) ? req.body.priority : 200;
    if (PANIC_ACTIVE) return res.json({ ok: true, mode: 'panic', action: 'start', already: true, priority: p });
    PANIC_ACTIVE = true;
    var universes = [1,2,3,4,5,6,7,8];
    var tick = function() {
      if (!PANIC_ACTIVE) return;
      universes.forEach(function(u) { sacnSender.sendBlackout(u, p, null); });
      PANIC_TIMER = setTimeout(tick, 33);
    };
    tick();
    res.json({ ok: true, mode: 'panic', action: 'start', priority: p });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

app.post('/panic/release', function(req, res) {
  try {
    PANIC_ACTIVE = false;
    if (PANIC_TIMER) { clearTimeout(PANIC_TIMER); PANIC_TIMER = null; }
    res.json({ ok: true, mode: 'panic', action: 'release' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// ============================================================================
// CRESTRON CIP API ENDPOINTS
// Control Crestron functions: brakes, hoists, screens via CIP protocol
// ============================================================================

// Connect to Crestron (call once on demand or startup)
app.post('/crestron/connect', function(req, res) {
  try {
    var client = getCrestronClient();
    if (client.connected) {
      return res.json({ success: true, status: 'already_connected', ...client.getStatus() });
    }
    client.connect();
    // Return immediately - connection is async
    res.json({ success: true, status: 'connecting', ...client.getStatus() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Disconnect from Crestron
app.post('/crestron/disconnect', function(req, res) {
  try {
    var client = getCrestronClient();
    client.disconnect();
    res.json({ success: true, status: 'disconnected' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get Crestron connection status and known join states
app.get('/crestron/status', function(req, res) {
  try {
    var client = getCrestronClient();
    res.json({
      success: true,
      ...client.getStatus(),
      brakes: client.getBrakeStates()
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Send a digital join (pulse ON then OFF for toggles)
// Body: { join: number, state: boolean, pulse: boolean (default true) }
app.post('/crestron/join', function(req, res) {
  try {
    var body = req.body || {};
    var join = parseInt(body.join);
    var state = body.state !== false;  // Default to true
    var pulse = body.pulse !== false;  // Default to pulse mode (for toggles)

    if (isNaN(join) || join < 1 || join > 1000) {
      return res.status(400).json({ success: false, error: 'Invalid join number' });
    }

    var client = getCrestronClient();

    // Auto-connect if not connected
    if (!client.connected) {
      console.log('[CIP] Not connected, attempting auto-connect...');
      client.connect();
      // Wait a bit for connection
      setTimeout(function() {
        if (client.connected) {
          sendJoin();
        } else {
          res.status(503).json({ success: false, error: 'Not connected to Crestron' });
        }
      }, 1000);
      return;
    }

    sendJoin();

    function sendJoin() {
      if (pulse) {
        // Pulse mode: ON then OFF (for toggle buttons like brakes)
        client.pulseDigitalJoin(join, 100)
          .then(function() {
            res.json({ success: true, join: join, action: 'pulse' });
          })
          .catch(function(err) {
            res.status(500).json({ success: false, error: err.message });
          });
      } else {
        // Direct mode: set state directly
        var sent = client.sendDigitalJoin(join, state);
        res.json({ success: sent, join: join, state: state });
      }
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Convenience endpoint: Toggle brake for a room
// POST /crestron/brake/:room (room = a, b, or c)
app.post('/crestron/brake/:room', function(req, res) {
  try {
    var room = req.params.room.toLowerCase();
    var joinMap = { a: 53, b: 54, c: 55 };
    var join = joinMap[room];

    if (!join) {
      return res.status(400).json({ success: false, error: 'Invalid room. Use a, b, or c.' });
    }

    var client = getCrestronClient();

    // Auto-connect if not connected
    if (!client.connected) {
      client.connect();
      setTimeout(function() {
        if (client.connected) {
          toggleBrake();
        } else {
          res.status(503).json({ success: false, error: 'Not connected to Crestron' });
        }
      }, 1000);
      return;
    }

    toggleBrake();

    function toggleBrake() {
      client.pulseDigitalJoin(join, 100)
        .then(function() {
          var brakes = client.getBrakeStates();
          res.json({
            success: true,
            room: room,
            join: join,
            brakeReleased: brakes[room]  // Note: true = released (brake OFF)
          });
        })
        .catch(function(err) {
          res.status(500).json({ success: false, error: err.message });
        });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get brake states
app.get('/crestron/brakes', function(req, res) {
  try {
    var client = getCrestronClient();
    res.json({
      success: true,
      connected: client.connected,
      brakes: client.getBrakeStates()
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Hoist motor direction control
// POST /crestron/hoist/:direction (direction = up or down)
// Body: { hold: boolean } - if true, keeps button pressed (for movement)
app.post('/crestron/hoist/:direction', function(req, res) {
  try {
    var direction = req.params.direction.toLowerCase();
    var body = req.body || {};
    var hold = body.hold || false;
    var state = body.state !== false;  // true = press, false = release

    var joinMap = { up: 123, down: 124 };
    var join = joinMap[direction];

    if (!join) {
      return res.status(400).json({ success: false, error: 'Invalid direction. Use up or down.' });
    }

    var client = getCrestronClient();
    if (!client.connected) {
      return res.status(503).json({ success: false, error: 'Not connected to Crestron' });
    }

    // For hold mode, just set the state directly
    // For pulse mode, pulse briefly
    if (hold) {
      client.sendDigitalJoin(join, state);
      res.json({ success: true, direction: direction, join: join, state: state });
    } else {
      client.pulseDigitalJoin(join, 200)  // 200ms pulse for direction tap
        .then(function() {
          res.json({ success: true, direction: direction, join: join, action: 'pulse' });
        })
        .catch(function(err) {
          res.status(500).json({ success: false, error: err.message });
        });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Motor enable control
// POST /crestron/motor/:num/enable
// Body: { state: boolean } - true = enable, false = disable
app.post('/crestron/motor/:num/enable', function(req, res) {
  try {
    var num = parseInt(req.params.num);
    var body = req.body || {};
    var state = body.state !== false;

    if (isNaN(num) || num < 1 || num > 20) {
      return res.status(400).json({ success: false, error: 'Invalid motor number (1-20)' });
    }

    var join = 100 + num;  // M1 = 101, M2 = 102, etc.

    var client = getCrestronClient();
    if (!client.connected) {
      return res.status(503).json({ success: false, error: 'Not connected to Crestron' });
    }

    client.sendDigitalJoin(join, state);
    res.json({ success: true, motor: num, join: join, enabled: state });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
