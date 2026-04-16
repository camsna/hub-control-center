# MX6000 Pro Quick Reference

**Device:** MX6000 Pro
**IP:** 10.0.81.207
**API Port:** 8001
**Screen ID:** `{7e8ded0a-a4d9-4003-9ecf-731d60d07280}`
**Canvas Size:** 6144 x 2304 pixels

---

## Presets (via Companion or API)

| # | Name | Description |
|---|------|-------------|
| 1 | 16:9, Center MAX | Main centered 16:9 layout |
| 2 | 16:9 Center Large, L/R | Center with side panels |
| 3 | 16:9, Center Large, Bgd | Center with background |
| 4 | Zoom Fill | Full screen fill |
| 5 | Mac, Full Res | Native Mac resolution |
| 6 | Preset 6 | (unused) |
| 7 | Preset 7 | (unused) |
| 8 | 4x 1080 SDI | Quad SDI layout |
| 9 | 2x SDI | Dual SDI |
| 10 | 60cm, 16:9, Center Max | 60cm specific |
| 11 | 2x Custom | Custom dual |
| 12 | 2x SDI, 60cm | Dual SDI 60cm |
| 13 | 2x SDI, 60cm, LEFT | Dual SDI left-aligned |

---

## Input Sources (groupId for routing)

| groupId | Name | Type | Notes |
|---------|------|------|-------|
| 513 | 12G-SDI 1 | SDI | |
| 514 | 12G-SDI 2 | SDI | |
| 515 | 12G-SDI 3 | SDI | |
| 516 | 12G-SDI 4 | SDI | |
| 1 | HDMI2.1 1 | HDMI | Port A |
| 257 | HDMI2.1 1 | HDMI | Port A (alt mode) |
| 2 | HDMI2.1 2 | HDMI | Port B |
| 258 | HDMI2.1 2 | HDMI | Port B (alt mode) |
| 25857 | internal-source | Test | Test patterns |

---

## Common API Calls

### Check Connection
```bash
curl -s "http://10.0.81.207:8001/api/v1/device/hw" | jq '.data.name'
```

### Set Brightness (0.0-1.0)
```bash
curl -X PUT "http://10.0.81.207:8001/api/v1/screen/brightness" \
  -H "Content-Type: application/json" \
  -d '{"screenIdList": ["{7e8ded0a-a4d9-4003-9ecf-731d60d07280}"], "brightness": 0.8}'
```

### Apply Preset (1-13)
```bash
curl -X POST "http://10.0.81.207:8001/api/v1/preset/current/update" \
  -H "Content-Type: application/json" \
  -d '{"sequenceNumber": 1, "screenID": "{7e8ded0a-a4d9-4003-9ecf-731d60d07280}"}'
```

### Switch Layer Source
```bash
# Switch layer 0 to SDI 1 (groupId 513)
curl -X PUT "http://10.0.81.207:8001/api/v1/screen/layer/input" \
  -H "Content-Type: application/json" \
  -d '{"layers": [{"id": 0, "source": 513}], "screenID": "{7e8ded0a-a4d9-4003-9ecf-731d60d07280}"}'
```

### Blackout Screen
```bash
curl -X PUT "http://10.0.81.207:8001/api/v1/screen/blackout" \
  -H "Content-Type: application/json" \
  -d '{"screenID": "{7e8ded0a-a4d9-4003-9ecf-731d60d07280}", "blackout": true}'
```

---

## Backup Location
`/home/cameron/novastar-mx6000/backups/`

---

## Notes
- VMP must release device before API works (click blank space in device list)
- Working mode affects which layers are available
- Current working mode: 1
