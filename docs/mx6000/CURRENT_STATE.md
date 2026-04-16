# MX6000 Control Project - Current State

**Last Updated:** 2026-01-16
**Status:** Audit complete, cleanup pending

---

## Project Overview

Web control interface for Novastar MX6000 Pro LED video processor. Provides simplified layer management, source switching, brightness control, and output settings for a 6144x2304 LED wall.

**Location:** `/home/cameron/novastar-mx6000/web-control/`
**Device IP:** 10.0.81.207:8001
**Screen ID:** `{7e8ded0a-a4d9-4003-9ecf-731d60d07280}`

---

## Recent Work (2026-01-16)

### API Audit Completed

Full audit of server.js against official Novastar COEX API documentation.

**Results:**
- 6 endpoints documented and used correctly
- 3 endpoints undocumented but functional (device/hw, layer create, layer delete)
- 5 pieces of dead code identified

**Reports created:**
- `API-AUDIT-REPORT.md` - Full audit with execution path tracing
- `COEX-API-REFERENCE.md` - Official API documentation reference

### Corruption Investigation

Previous session identified that `outputCardModeId` changed from 0 to 42048 causing display corruption. Root cause: Claude clicked bit depth buttons during testing, triggering real API calls to live MX6000.

**Conclusion:** The bit depth API is used correctly per official docs. If it corrupts outputCardModeId, that's a firmware bug or state dependency issue, not a code error.

---

## Pending Tasks

### 1. Remove Dead Code from server.js

**Safe to delete - none are called:**

| Code | Lines | Reason Dead |
|------|-------|-------------|
| `PUT /api/blackout` route | 395-406 | Frontend uses brightness=0 instead |
| `GET /api/layers` route | 299-305 | Never called by frontend |
| `PUT /api/output/framerate` route | 337-342 | Returns 501, framerate is read-only |
| `GET /api/configs` route | 642-650 | Never called by frontend |
| `updateLayer()` function | 134-152 | Defined but never called |

**Requires:** Server restart after changes

---

## Key Files

```
/home/cameron/novastar-mx6000/
├── CURRENT_STATE.md          # This file
├── API-AUDIT-REPORT.md       # Full audit report
├── COEX-API-REFERENCE.md     # Official API docs
└── web-control/
    ├── server.js             # Backend (needs dead code cleanup)
    └── public/
        ├── index.html
        ├── app.js            # Frontend
        └── style.css
```

---

## Undocumented APIs in Use

These work but aren't in official Novastar docs - accept the risk or redesign:

1. **GET /api/v1/device/hw** - Device info (low risk, read-only)
2. **POST /api/v1/screen/layer** - Create layers (medium risk, no alternative)
3. **DELETE /api/v1/screen/layer** - Delete layers (medium risk, no alternative)

---

## Notes

- **isNeedCabinetInfo parameter:** Docs say "0 = include, 1 = exclude" but code uses 0 expecting to exclude. Needs empirical verification.
- **Blackout implementation:** Uses brightness=0, not a separate API. This is correct and intentional.
- **Layer management:** The undocumented layer APIs are essential - there's no documented alternative for dynamic layer creation/deletion.
