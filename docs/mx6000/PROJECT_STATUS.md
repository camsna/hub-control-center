# Novastar MX6000 Control Project

## Status: Active Development
**Last Updated:** 2026-01-12

---

## Device Info
- **Model:** MX6000 Pro
- **IP Address:** 10.0.81.207
- **API Port:** 8001
- **Firmware:** V1.4.0
- **Screen ID:** `{7e8ded0a-a4d9-4003-9ecf-731d60d07280}`

## Network Access
The MX6000 is on a separate network (10.0.81.x). Access from OPi6 requires SSH jump through Cameron's Mac:
```bash
ssh cameronaanestad@10.70.71.2 "curl -s 'http://10.0.81.207:8001/api/v1/...'"
```

---

## What We've Discovered

### API Access
- **Port 8001** is the COEX API port (not documented well, found via web search)
- Standard REST API with GET/PUT/POST
- No authentication required (local network only)
- VMP must release device before API works

### Configuration Backup
Full backup captured in `/home/cameron/novastar-mx6000/backups/20260112_092409/`:
- `screen.json` - Full screen/canvas/layer config (39KB)
- `presets.json` - 13 presets defined
- `input_sources.json` - All input ports
- `device_hw.json` - Hardware info

### Inputs Available
| groupId | Name | Type | Status |
|---------|------|------|--------|
| 257 | HDMI2.1 1 | HDMI | Active (4K@30) |
| 2 | HDMI2.1 2 | HDMI | Active (4K@60) |
| 513-516 | 12G-SDI 1-4 | SDI | No signal |
| 25857 | Internal | Test | Available |

### Presets Defined
1. 16:9, Center MAX
2. 16:9 Center Large, L/R
3. 16:9, Center Large, Bgd
4. Zoom Fill
5. Mac, Full Res
6-7. (unused)
8. 4x 1080 SDI
9. 2x SDI
10-13. Various 60cm/SDI configs

### Layer Routing
- **Working Mode 1** is active
- Single layer (ID: 65537) currently showing HDMI 1
- Matrix-style routing = change `source` on layer via API

---

## Tools Created

### Control Script (SSH-based)
`/home/cameron/novastar-mx6000/scripts/mx6000.sh`

```bash
./mx6000.sh status          # Check device
./mx6000.sh brightness 80   # Set brightness (0-100)
./mx6000.sh preset 1        # Apply preset
./mx6000.sh blackout on/off # Toggle blackout
./mx6000.sh source 65537 2  # Route layer to source
./mx6000.sh inputs          # Show input status
./mx6000.sh backup          # Create backup
```

### Web Control Interface
`/home/cameron/novastar-mx6000/web-control/`

Node.js + Express server with web UI. Deploy to Mac:
```bash
scp -r /home/cameron/novastar-mx6000/web-control cameronaanestad@10.70.71.2:~/mx6000-control
ssh cameronaanestad@10.70.71.2 "cd ~/mx6000-control && npm install && npm start"
```

Access at: http://10.70.71.2:3000

---

## Next Steps

### Phase 1: Basic Control
- [x] Test preset switching via API
- [ ] Test source routing (non-destructive)
- [x] Validate blackout function

### Phase 2: Simple Web Interface - COMPLETE
- [x] Create Node.js + Express server
- [x] Decision tree UI (stage > source > layout > secondary)
- [x] Brightness slider with detents
- [x] Preset mapping logic
- [x] VMP lock warning display
- [ ] Deploy to Mac and test live

### Phase 3: Crestron Integration
- [ ] Document API for Crestron programmer
- [ ] Create HTTP driver/module
- [ ] Map to touchscreen UI

### Phase 4: Advanced Features
- [ ] Scheduled brightness (day/night)
- [ ] Custom presets via API
- [ ] Monitoring/alerts
- [ ] Backup automation

---

## Documentation
- `API_REFERENCE.md` - Full API documentation
- `QUICK_REFERENCE.md` - Common commands cheat sheet
- `backups/` - Configuration backups

---

## Physical Setup
- **LED Wall**: 6144 × 2304 px (12m wide × 4.5m tall)
- **Wall bottom**: 427mm off floor
- **Stage heights**: 40cm, 60cm (standard), 80cm, 100cm
- **Stage obscures bottom of wall** (except 40cm which is below wall)

### Effective Resolutions by Stage Height
| Stage | Obscured | Effective Height | Resolution |
|-------|----------|------------------|------------|
| 40cm | 0px | 2304px | 6144 × 2304 |
| 60cm | 89px | 2215px | 6144 × 2215 |
| 80cm | 191px | 2113px | 6144 × 2113 |
| 100cm | 293px | 2011px | 6144 × 2011 |

## Input Sources (Physical Connections)
- **SDI Card** (4× 12G-SDI): Ports 1 & 2 regularly used
- **HDMI Card 1, Port 1**: Mac Studio - full 6144×2304 pixel-perfect
  - Input card set to 8K mode to accommodate custom resolution
  - Actual output from Mac: 6144×2304
- **HDMI Card 1, Port 2**: Raspberry Pi 5 - 4K signage/media player
- **HDMI Card 2, Port 1**: TvONE matrix output (4K out, 1080p sources in)

Note: Input card mode (4K/8K) ≠ actual source resolution. Card mode sets max acceptance.

## Bandwidth Constraints (CRITICAL)
The MX6000 has data throughput limits. High resolution + high bit depth + high refresh = overload.

**Europe = 50Hz/25Hz preferred** (PAL territory, not 60Hz/30Hz)

| Configuration | Bit Depth | Refresh | Status |
|---------------|-----------|---------|--------|
| Single 4K (3840×2160) | Auto | 50Hz | ✅ OK |
| Mac Studio (6144×2304) | Auto | 50Hz | ❌ OVERLOAD |
| Mac Studio (6144×2304) | Auto | 25Hz | ✅ OK |
| Mac Studio (6144×2304) | 8-bit | 50Hz | ✅ OK (loses HDR) |
| 2× 4K SDI | Auto | >25Hz | ❌ OVERLOAD |
| 2× 4K SDI | Auto | 25Hz | ✅ OK |
| 2× 4K SDI | 8-bit | 50Hz | ✅ OK (loses HDR) |

**Trade-off**: Force 8-bit to unlock higher refresh, but lose dynamic range.

### HDR Mode API
Can force SDR mode to potentially reduce bandwidth:
```
PUT /api/v1/device/input/{id}/hdrmode
{"hdrMode": 2}  // 0=HDR10, 1=HLG, 2=SDR, 255=auto
```

## VMP Lock Issue
- If someone has VMP connected and hasn't clicked off the screen, API is blocked
- No API endpoint to force-release
- Workaround: Ask VMP user to click blank space in device list
- Consider: Training, signage, or timeout policy

## Menu System Concept
Building a decision-tree UI for volunteers:
1. Stage height (affects effective resolution)
2. Primary source (Mac Studio = full pixel-perfect, others = configurable)
3. Layout (full/16:9 centered/center+sides/center+background)
4. 16:9 size (Max/Large/Medium/Small) - top-justified, centered
5. Side windows (for branding/cameras alongside main content)
6. RPi player (off/background/side)
7. Refresh rate / bit depth (with bandwidth warnings)
8. Brightness (fader with detents at 0/25/50/75/100%)

**Mac Studio special case**: Always full pixel-perfect, no scaling options. Client (QLab/ProPresenter) handles windowing.

## Notes
- Don't use API while VMP is connected to device
- Presets are safer than direct layer manipulation
- Brightness 0.0-1.0 (multiply percentage by 0.01)
- Screen ID is required for most operations
