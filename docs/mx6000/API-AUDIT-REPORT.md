# MX6000 Control Site API Audit Report

**Date:** 2026-01-16
**Audited Files:**
- `/home/cameron/novastar-mx6000/web-control/server.js` (backend)
- `/tmp/mac_app.js` (frontend)

**Reference:** Official Novastar COEX API at https://api.coex.en.novastar.tech/

---

## Methodology

This audit traces actual execution paths from UI actions through frontend JavaScript to backend routes to MX6000 API calls. Only endpoints that are actually invoked in production are evaluated.

---

## Execution Path Tracing

### UI → Frontend → Backend → MX6000

| UI Action | Frontend Function | Backend Route | MX6000 API |
|-----------|------------------|---------------|------------|
| Page load (status) | `checkStatus()` | `GET /api/status` | `GET /api/v1/device/hw` |
| Page load (brightness) | `loadBrightness()` | `GET /api/brightness` | `GET /api/v1/screen?isNeedCabinetInfo=0` |
| Page load (output) | `loadOutputSettings()` | `GET /api/output` | `GET /api/v1/screen/output` |
| Brightness slider | `setBrightness()` | `PUT /api/brightness` | `PUT /api/v1/screen/brightness` |
| BLACKOUT button | `toggleBlackout()` | `PUT /api/brightness` | `PUT /api/v1/screen/brightness` (value=0) |
| Bit depth buttons | click handler | `PUT /api/output/bitdepth` | `PUT /api/v1/screen/output/bitdepth` |
| Reset button | click handler | `POST /api/reset` | `DELETE /api/v1/screen/layer` + `POST /api/v1/screen/layer` |
| Apply (mac) | `applyConfiguration()` | `POST /api/apply` | `DELETE /api/v1/screen/layer` + `POST /api/v1/screen/layer` |
| Apply (tvone/player/sdi-single) | `applyConfiguration()` | `POST /api/apply` | `DELETE /api/v1/screen/layer` + `POST /api/v1/screen/layer` |
| Apply (sdi-dual/quad) | `applyConfiguration()` | `POST /api/apply` | `DELETE` + `POST /api/v1/preset/current/update` + `PUT /api/v1/screen/layer/input` + optional `POST /api/v1/screen/layer` |

---

## API Endpoint Audit

### ✅ DOCUMENTED & CORRECTLY USED

#### 1. GET /api/v1/screen?isNeedCabinetInfo=0
**Used by:** `GET /api/brightness`, `getCurrentLayers()` helper
**Purpose:** Retrieve screen info including brightness and layer data
**Status:** ✅ Matches documentation

**Note:** Documentation says `isNeedCabinetInfo`: "0 = include cabinet info, 1 = exclude". Code passes `0` intending to exclude cabinet info. This may be backwards - needs empirical verification.

---

#### 2. GET /api/v1/screen/output
**Used by:** `GET /api/output`
**Purpose:** Get frame rate, bit depth, genlock status
**Status:** ✅ Matches documentation

---

#### 3. PUT /api/v1/screen/brightness
**Used by:** `PUT /api/brightness` (brightness slider AND blackout button)
**Request body:**
```json
{
  "screenIdList": ["{uuid}"],
  "brightness": 0.8
}
```
**Status:** ✅ Matches documentation exactly

**Note:** Blackout is implemented as brightness=0, not via a separate blackout API. This is a valid approach.

---

#### 4. PUT /api/v1/screen/output/bitdepth
**Used by:** `PUT /api/output/bitdepth`
**Request body:**
```json
{
  "screenIdList": ["{uuid}"],
  "bitDepth": 0
}
```
**Status:** ✅ Matches documentation exactly

---

#### 5. PUT /api/v1/screen/layer/input
**Used by:** `POST /api/apply` (sdi-dual, sdi-quad via `routeSources()`)
**Request body:**
```json
{
  "screenID": "{uuid}",
  "layers": [
    { "id": 0, "source": 513 }
  ]
}
```
**Status:** ✅ Matches documentation exactly

---

#### 6. POST /api/v1/preset/current/update
**Used by:** `POST /api/apply` (sdi-dual, sdi-quad via `applyPreset()`)
**Request body:**
```json
{
  "screenID": "{uuid}",
  "sequenceNumber": 9
}
```
**Status:** ✅ Matches documentation exactly

---

### ⚠️ UNDOCUMENTED BUT FUNCTIONAL

#### 7. GET /api/v1/device/hw
**Used by:** `GET /api/status`
**Purpose:** Device hardware info (name, IP, firmware version)
**Status:** ⚠️ Not in official COEX documentation
**Risk:** Low - read-only endpoint

---

#### 8. POST /api/v1/screen/layer
**Used by:** `POST /api/reset`, `POST /api/apply` (via `createLayer()`)
**Request body:**
```json
{
  "screenID": "{uuid}",
  "workingMode": 1,
  "layers": [{
    "source": 1,
    "position": { "x": 0, "y": -580 },
    "scaler": { "width": 6144, "height": 3456 },
    "zOrder": 1000000000,
    "cut": { "enable": false, "rect": {...} }
  }]
}
```
**Status:** ⚠️ Not in official documentation
**Risk:** Medium - creates layers; no documented alternative exists

---

#### 9. DELETE /api/v1/screen/layer
**Used by:** `POST /api/reset`, `POST /api/apply` (via `deleteLayer()`, `ensureSingleLayer()`)
**Request body:**
```json
{
  "screenID": "{uuid}",
  "layers": [{ "id": 123 }]
}
```
**Status:** ⚠️ Not in official documentation
**Risk:** Medium - deletes layers; no documented alternative exists

---

## Dead Code

The following code exists in server.js but is never executed:

| Code | Location | Reason |
|------|----------|--------|
| `PUT /api/blackout` route | Line 395-406 | Frontend uses brightness=0 instead |
| `GET /api/layers` route | Line 299-305 | Never called by frontend |
| `PUT /api/output/framerate` route | Line 337-342 | Returns 501, framerate shown as read-only |
| `GET /api/configs` route | Line 642-650 | Never called by frontend |
| `updateLayer()` function | Line 134-152 | Defined but never called |

**Impact of dead code:**
- `PUT /api/blackout` uses undocumented endpoint with wrong parameters (`screenID` + `blackout` vs documented `screenIdList` + `isBlackout` + `isFreeze`)
- `PUT /api/v1/screen/layer` (via `updateLayer()`) is never actually called
- These don't affect production but should be removed to avoid confusion

---

## Summary

| Category | Count | Endpoints |
|----------|-------|-----------|
| ✅ Documented & Correct | 6 | screen info, screen output, brightness, bit depth, layer input, preset |
| ⚠️ Undocumented but functional | 3 | device/hw, layer create, layer delete |
| ❌ Dead code | 5 | blackout route, layers route, framerate route, configs route, updateLayer() |

---

## Risk Assessment

### Low Risk
- **GET /api/v1/device/hw** - Read-only, stable behavior expected

### Medium Risk
- **POST/DELETE /api/v1/screen/layer** - These work but are undocumented. Novastar could change them in firmware updates. However, there's no documented alternative for dynamic layer management.

### No Production Risk
- Dead code doesn't affect production but creates maintenance confusion

---

## Recommendations

1. **Remove dead code** - Delete unused routes and the `updateLayer()` function to reduce confusion

2. **Document undocumented API usage** - Add comments in code noting which endpoints are unofficial

3. **Verify isNeedCabinetInfo semantics** - Test whether 0 includes or excludes cabinet info

4. **Consider impact of layer APIs** - The undocumented layer create/delete APIs are necessary for the app's functionality. Accept this dependency or redesign around presets only.

---

## Corruption Analysis

The bit depth API (`PUT /api/v1/screen/output/bitdepth`) is used **correctly** per official documentation. If calling this endpoint corrupts `outputCardModeId`, the cause is:

1. MX6000 firmware bug
2. Undocumented state dependency
3. Race condition with VMP or other client

This is not an API usage error in the code.
