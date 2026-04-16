# DMX Blackout Controller - Documentation Project

**READ THIS ENTIRE FILE BEFORE DOING ANYTHING.**

> **DEPLOYMENT REMINDER:** The controller lives on **Mac Studio (10.0.81.223)** in **Docker container `lighting-controller`**. NOT on the homelab Mac Mini. See DEPLOYMENT section below for commands.

---

## What This Is

Technical documentation for a DMX lighting control system at **Jernbanetorget** (The Hub), a venue in Oslo with 3 divisible rooms (Sal A, Sal B, Sal C). The system controls:

- **Truss fixtures** (moving lights, LED bars, conventionals) on Universes 1–5
- **House lights** (ceiling spots, wall lights, stage lights, chandeliers) on Universes 6–8

A previous AI session **corrupted these docs by making assumptions and filling in unverified information**. This documentation project was rebuilt from scratch with strict rules to prevent that from happening again.

---

## Critical Rules

### 1. NEVER ASSUME OR GUESS
- Only document **verified facts** from authoritative sources
- If you don't know something, mark it with `?` in tables or note it's unknown
- **Ask Cameron** before adding anything you're not 100% certain about

### 2. TODO ITEMS LIVE IN TODO.md ONLY
- Do NOT put TODO notes, `[UNVERIFIED]` tags, or explanatory cruft in documentation files
- Documentation files state facts; TODO.md tracks what needs to be found/done
- Use `?` as a placeholder value in tables, with a reference like "(see TODO.md #X)"

### 3. ONE TOPIC AT A TIME
- Don't try to document everything at once
- Complete one topic, verify it, then move to the next

### 4. AUTHORITATIVE SOURCES
These are the sources of truth. When in conflict, trust them in this order:

| Source | Location | What It Contains |
|--------|----------|------------------|
| Hub Patch List.xlsx | Mac: `/Users/cameronaanestad/Desktop/Hub Bidness/Technical Documentation/Lighting/` | Authoritative fixture list with manufacturer, model, mode, universe, address |
| GrandMA3 fixture profiles | On the lighting console | Channel layouts, fixture parameters |
| lighting-reference.html | `http://10.0.81.223/lighting-reference.html` | Truss fixture positions and addresses |
| controller.html | `http://10.0.81.223/controller.html` | House light control interface |
| Topology.docx | Mac: Technical Documentation folder | System signal flow |

**Credentials for 10.0.81.223:** username `thehub`, password `0155`

### 5. DON'T EDIT UNLESS ASKED
- These docs are source-of-truth references
- Don't "improve" or "clean up" without explicit request
- Don't add features, refactor, or restructure without asking

---

## Documentation Structure

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | This file — project overview and rules | Complete |
| `INDEX.md` | Master list of documentation topics, session notes | Complete |
| `TODO.md` | All pending tasks and information to find | Active |
| `FIXTURES_AND_PATCH.md` | Fixtures, locations, universe assignments, exhaustive patch list | Complete |
| `SYSTEM.md` | Components, signal flow, DMX line routing | Complete |
| `LYSEKRONER.md` | Exhaustive channel mapping for the 6 chandeliers | Complete |
| `CRESTRON.md` | Crestron control system documentation | Complete |
| `FIXTURE_PROFILES.md` | Control parameters for each fixture type | Not started |

---

## System Overview (Quick Reference)

### Venues
- **Jernbanetorget** = main hall, divisible into Sal A, Sal B, Sal C
- Each room has its own house lighting universe (U6, U7, U8)

### Universes
| Universe | Purpose |
|----------|---------|
| 1 | Sal A conventionals (Truss 2, 3) |
| 2 | Sal A moving lights + XBARs (Truss 1) |
| 3 | Sal B + C truss fixtures (Truss 4, 5, 6, 7) |
| 4 | Auras over stage (Pipe) |
| 5 | "Astra" fixtures (location unknown) |
| 6 | House lights Sal A |
| 7 | House lights Sal B |
| 8 | House lights Sal C |

### Control Paths
- **Primary:** GrandMA3 → Luminex → fixtures
- **Fallback:** Crestron → CueCore2 → RdmSplitter → house light fixtures
- **Patch panel** determines which path is active for U6/7/8

### Lysekroner (Chandeliers)
- 6 total, 2 per room
- Odd numbers (1, 3, 5) on LEFT, even (2, 4, 6) on RIGHT (facing stage)
- 55 DMX channels each: 3 rings × 17 channels + 3 globe dimmers + 1 padding
- Base addresses: 101 (left) and 156 (right) per room

---

## Current State

### Completed Documentation
1. **FIXTURES_AND_PATCH.md** — All fixtures, truss positions, house lights, exhaustive patch list from xlsx
2. **SYSTEM.md** — Signal flow, device inventory, DMX line routing (with unknowns marked)
3. **LYSEKRONER.md** — Complete channel mapping for all 6 chandeliers
4. **CRESTRON.md** — CP3 processor, CIP joins (brakes 53-55, motors 101-120, direction 123-124), CueCore IPs

### Pending (see TODO.md)
1. Find screen light addresses
2. Confirm house light DMX lines (32–49)
3. Identify unknown DMX lines (1–16)
4. Confirm U5 DMX lines
5. Identify "Astra" fixture locations (U5)
6. Verify screen control join numbers (Smart Objects)
7. Document fixture profiles
8. Fix lysekrone visualization system
9. Build new individual motor control UI

---

## How To Work On This Project

1. **Read INDEX.md** for session notes and current state
2. **Read TODO.md** to see what needs to be done
3. **Pick ONE task** from TODO.md
4. **Gather information** from authoritative sources (ask Cameron for access if needed)
5. **Document verified facts only** — ask Cameron if unsure
6. **Update TODO.md** when task is complete (move to Completed section)
7. **Update INDEX.md** session notes with what was done

---

## Common Mistakes To Avoid

| Mistake | Why It's Bad | What To Do Instead |
|---------|--------------|-------------------|
| Assuming channel functions | Previous session guessed TILT/TURN were "not used" — wrong | Leave blank or mark unknown |
| Filling in placeholder data | Makes docs look complete but introduces errors | Use `?` and track in TODO.md |
| Documenting from memory | AI doesn't have venue-specific knowledge | Always use authoritative sources |
| Adding TODO cruft to docs | Makes docs messy, hard to maintain | All TODOs go in TODO.md only |
| "Improving" without asking | May break things that work | Only change what's explicitly requested |
| Documenting multiple topics at once | Leads to incomplete/inconsistent work | One topic at a time |

---

## Access Information

| System | Address | Credentials |
|--------|---------|-------------|
| Control system web UI | http://10.0.81.223:8081 | thehub / 0155 |
| Mac (xlsx files) | 10.70.70.24 | SSH as cameronaanestad |

---

## DEPLOYMENT — READ THIS EVERY TIME

**CRITICAL: The lighting controller runs on the MAC STUDIO, NOT your homelab.**

### Mac Studio (10.0.81.223)
- **NOT** the Mac Mini at 10.70.70.24 (that's Plex/media in the homelab)
- SSH user: `thehub` / password: `0155`
- Docker is at `/usr/local/bin/docker`

### The Controller is in Docker
The file is **inside a Docker container**, not on the filesystem.

**Container:** `lighting-controller`
**File inside container:** `/app/public/controller.html`
**URL:** `http://10.0.81.223:8081/controller.html`

### Deployment Commands
```bash
# 1. Backup current version (do this FIRST)
sshpass -p '0155' ssh -o StrictHostKeyChecking=no thehub@10.0.81.223 \
  "/usr/local/bin/docker cp lighting-controller:/app/public/controller.html /Users/thehub/controller_backup_$(date +%Y%m%d_%H%M%S).html"

# 2. Copy file to Mac Studio
sshpass -p '0155' scp -o StrictHostKeyChecking=no \
  /home/cameron/dmx-blackout-work/controller_work.html \
  thehub@10.0.81.223:/tmp/controller.html

# 3. Copy into Docker container
sshpass -p '0155' ssh -o StrictHostKeyChecking=no thehub@10.0.81.223 \
  "/usr/local/bin/docker cp /tmp/controller.html lighting-controller:/app/public/controller.html"

# 4. Verify
sshpass -p '0155' ssh -o StrictHostKeyChecking=no thehub@10.0.81.223 \
  "/usr/local/bin/docker exec lighting-controller ls -la /app/public/controller.html"
```

### Restore Command
```bash
docker cp /Users/thehub/controller_backup_YYYYMMDD_HHMMSS.html lighting-controller:/app/public/controller.html
```

### DO NOT
- Deploy to 10.70.70.24 (wrong machine)
- Deploy to filesystem instead of Docker
- Forget to backup before deploying

---

## Questions?

Ask Cameron. Don't guess.
