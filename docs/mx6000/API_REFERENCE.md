# Novastar MX6000 COEX API Reference

**API Base URL:** `http://10.0.81.207:8001`
**Documentation:** https://api.coex.en.novastar.tech

## Prerequisites
- Device must NOT be occupied by VMP (click blank space in device list to release)
- Ensure network connectivity between control system and MX6000

---

## General Endpoints

### Get Screen Information
```
GET /api/v1/screen?isNeedCabinetInfo=0
```
Returns all screen info: screenID, screenName, canvases, layers, cabinets, working mode.

**Query Params:**
- `isNeedCabinetInfo`: `0` = include cabinet info, `1` = exclude

**Response includes:**
- `screens[]` - Array of screen objects
  - `screenID` - Unique identifier (needed for most other calls)
  - `screenName` - Display name
  - `workingMode` - Current working mode (needed for layer operations)
  - `canvases[]` - Canvas configuration
  - `layersInWorkingMode[]` - Layer info per working mode

---

### Set Screen Brightness
```
PUT /api/v1/screen/brightness
Content-Type: application/json

{
  "screenIdList": ["<screenID>"],
  "brightness": 0.5
}
```
**Parameters:**
- `brightness`: float 0.0 to 1.0 (0% to 100%)

---

### Set Screen Gamma
```
PUT /api/v1/screen/gamma
Content-Type: application/json
```

---

### Set Blackout/Freeze Screen
```
PUT /api/v1/screen/blackout
Content-Type: application/json
```
Controls black screen and freeze screen functions.

---

### Set Screen Color Temperature
```
PUT /api/v1/screen/colortemperature
Content-Type: application/json
```

---

## Preset Operations

### Get Preset Information
```
GET /api/v1/preset
```
Returns list of available presets with their sequence numbers.

---

### Apply Preset
```
POST /api/v1/preset/current/update
Content-Type: application/json

{
  "sequenceNumber": 0,
  "screenID": "<screenID>"
}
```
**Parameters:**
- `sequenceNumber`: Preset index (from preset list)
- `screenID`: Target screen

---

### Modify Preset
```
POST /api/v1/preset/modify  (Screen section endpoint)
```

---

## Input/Source Operations

### Get Input Source List
```
GET /api/v1/device/input/sources
```
Returns available input sources with `groupId` for each.

---

### Switch Source for Layer (Matrix Routing)
```
PUT /api/v1/screen/layer/input
Content-Type: application/json

{
  "layers": [
    {
      "id": 0,
      "source": 0
    }
  ],
  "screenID": "<screenID>"
}
```
**Parameters:**
- `layers[].id`: Layer ID (from screen info, based on workingMode)
- `layers[].source`: Source group ID (from input sources list)
- `screenID`: Target screen

**This is the key endpoint for matrix-style routing!**

---

### Set EDID
```
PUT /api/v1/input/edid
```

---

## Cabinet Operations

### Get All Cabinet Information
```
GET /api/v1/cabinet
```

### Enable Cabinet Mapping
```
PUT /api/v1/cabinet/mapping
```

---

## Device Operations

### Device Identify
```
PUT /api/v1/device/identify
```
Flashes the device for physical identification.

---

## Screen Advanced Operations

### Layer Management
- Position, size, z-order control
- Cut/crop settings
- Border settings
- Lock state

### Canvas Operations
- Canvas mapping
- Output configuration

### Processing
- 3D LUT
- Image enhancement

### Schedule
- Timed preset changes
- Brightness scheduling

---

## Error Codes
See: https://api.coex.en.novastar.tech/doc-4710335

Common codes:
- `0` = Success
- Non-zero = Error (check error code reference)

---

## Workflow Examples

### 1. Basic Setup - Get Screen ID
```bash
curl -s "http://10.0.81.207/api/v1/screen" | jq '.data.screens[0].screenID'
```

### 2. Set Brightness to 80%
```bash
curl -X PUT "http://10.0.81.207/api/v1/screen/brightness" \
  -H "Content-Type: application/json" \
  -d '{"screenIdList": ["SCREEN_ID_HERE"], "brightness": 0.8}'
```

### 3. Switch Layer 0 to Input Source 2
```bash
curl -X PUT "http://10.0.81.207/api/v1/screen/layer/input" \
  -H "Content-Type: application/json" \
  -d '{"layers": [{"id": 0, "source": 2}], "screenID": "SCREEN_ID_HERE"}'
```

### 4. Apply Preset 1
```bash
curl -X POST "http://10.0.81.207/api/v1/preset/current/update" \
  -H "Content-Type: application/json" \
  -d '{"sequenceNumber": 1, "screenID": "SCREEN_ID_HERE"}'
```

---

## Notes

### Backup Strategy
No explicit backup/export API exists. Build backup by:
1. GET `/api/v1/screen` - Full screen config
2. GET `/api/v1/preset` - All presets
3. GET `/api/v1/device/input/sources` - Input config
4. GET `/api/v1/cabinet` - Cabinet mapping

Store JSON responses as backup. Restoration requires VMP or rebuilding via API calls.

### VMP Conflict
The device can only be controlled by one client at a time. If VMP has the device selected, API calls will fail. Click blank space in VMP device list to release.
