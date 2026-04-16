# Novastar COEX API Reference

Source: https://api.coex.en.novastar.tech/

## Base URL
```
http://{device-ip}:8001
```

## Prerequisites
1. Ensure proper communication between the PC and the device
2. Make sure device is not occupied by VMP (click blank space in device list to release)

---

## Error Codes

| Code | Key | Meaning |
|------|-----|---------|
| 0 | Success | Successful |
| 1 | InvalidParam | Invalid parameters |
| 2 | SendFailed | Failed to send |
| 3 | InternalErr | Internal error |
| 4 | AnalysisFailed | Failed to parse data |
| 5 | Busying | Device busy |
| 6 | NotSupport | Feature not supported |
| 7 | LengthErr | Parameter length error |
| 10 | OpenFileFailed | Failed to open file |
| 11 | CloseFileFailed | Failed to close file |
| 12 | ReadErr | Readback failed |
| 13 | CreateDirFailed | Failed to create directory |
| 14 | ReadFileFailed | Failed to read file |
| 15 | DecodeFailed | Failed to decode |
| 16 | EncodeFailed | Failed to encode |
| 17 | WriteFileFailed | Failed to write file |
| 18 | RequestTimeout | Request timeout |
| 19 | ResponseErr | Response error |
| 26 | SerializeDataFailed | Failed to serialize data |
| 27 | FunctionalRestrictions | Feature conflict from conditional restrictions |
| 29 | LowDelayFunctionalRestrictions | Low latency feature conflict |
| 30 | ThreadDFunctionalRestrictions | 3D feature conflict |
| 31 | GenLockFunctionalRestrictions | Genlock feature conflict |
| 32 | AdditionFrameDelayFunctionalRestrictions | Additional frame rate conflict |
| 33 | MultiplierFunctionalRestrictions | Frame multiplication conflict |
| 34 | ScreenYPosIsNotEqualForOpenLowDelay | Screen Y-coordinate inconsistency with low latency |
| 35 | NoScreenLayoutInfo | No screen layout configured |

---

## General Endpoints

### Retrieve Screen Information
```
GET /api/v1/screen?isNeedCabinetInfo={0|1}
```

**Query Parameters:**
- `isNeedCabinetInfo`: 0 = include cabinet info, 1 = exclude

**Response Data:**
- `screens[]` - Array of screen objects
  - `screenID` (string) - Unique identifier
  - `screenName` (string)
  - `workingMode` (number) - 0=send-only, 1=all-in-one
  - `brightness` (number) - 0.0-1.0
  - `layoutMode` (number) - 0-8
  - `masterFrameRate` (number)
- `layers[]` - Layer configuration per working mode
  - `id` (number) - Layer ID
  - `source` (number) - Source group ID
  - `position` (object) - x, y
  - `scaler` (object) - width, height
  - `zOrder` (number)
- `canvases[]` - Canvas configuration

### Set Screen Brightness
```
PUT /api/v1/screen/brightness
Content-Type: application/json

{
  "screenIdList": ["screen-uuid"],
  "brightness": 0.8  // Range: 0.0 to 1.0
}
```

### Set Blackout/Freeze Screen
```
PUT /api/v1/screen/blackout
Content-Type: application/json

{
  "screenIdList": ["screen-uuid"],
  "isBlackout": true,
  "isFreeze": false
}
```

---

## Input Endpoints

### Retrieve Input Source List
```
GET /api/v1/device/input/sources
```

**Response:**
- `data[]` - Array of input sources
  - `id` (number) - Source ID
  - `groupId` (number) - Source group ID (used for layer switching)
  - `type` (number) - Source type
  - `name` (string)
  - `actualResolution` (object) - { width, height }
  - `actualRefreshRate` (number)
  - `bitDepth` (number)
  - `colorSpace` (number)

---

## Layer Endpoints

### Switch Source for Layer
```
PUT /api/v1/screen/layer/input
Content-Type: application/json

{
  "screenID": "screen-uuid",
  "layers": [
    {
      "id": 0,        // uint8, layer ID from /api/v1/screen
      "source": 1     // uint8, source group ID from /api/v1/device/input/sources
    }
  ]
}
```

**Notes:**
- Layer ID is obtained from GET /api/v1/screen based on workingMode
- Source is the `groupId` field from input sources, NOT the source `id`

---

## Output Endpoints

### Retrieve Screen Output Data
```
GET /api/v1/screen/output
```

**Response Data:**
- `outputBitDepth` (object)
  - `bitDepth` (uint8) - Configured bit depth
  - `currentBitDepth` (uint8) - Actual current bit depth
- `genlock` (object)
  - `selectedType` (number) - Sync type
  - `masterLayerGroupId` (number)
- `currentFrameRate` (float)
- `lowDelay` (boolean)
- `threeD` (object) - 3D settings

### Set Output Bit Depth
```
PUT /api/v1/screen/output/bitdepth
Content-Type: application/json

{
  "screenIdList": ["screen-uuid"],
  "bitDepth": 0    // int type
}
```

**Valid bitDepth values:**
- `0` = 8-bit
- `1` = 10-bit
- `2` = 12-bit
- `255` = Follow input source (default)

---

## Preset Endpoints

### Retrieve Preset Information
```
GET /api/v1/preset
```

**Response:**
- `screenPresetList[]`
  - `screenID` (string)
  - `presetList[]`
    - `sequenceNumber` (integer) - Preset ID
    - `name` (string)
    - `state` (boolean) - Is active

### Apply Preset
```
POST /api/v1/preset/current/update
Content-Type: application/json

{
  "screenID": "screen-uuid",
  "sequenceNumber": 1    // int16 preset ID
}
```

---

## Set Screen Color Temperature
```
PUT /api/v1/screen/colortemp
Content-Type: application/json

{
  "screenIdList": ["screen-uuid"],
  "colorTemp": 6500
}
```

## Set Screen Gamma
```
PUT /api/v1/screen/gamma
Content-Type: application/json

{
  "screenIdList": ["screen-uuid"],
  "gamma": 2.2
}
```

---

## Important Notes

1. **Screen ID**: Always retrieve from `/api/v1/screen` - it's a UUID string
2. **Source switching**: Use `groupId` from input sources, not `id`
3. **Brightness**: Range is 0.0-1.0, not 0-100
4. **VMP Lock**: Device must not be selected in VMP software
5. **Bit depth 255**: "Follow input source" is the default behavior
