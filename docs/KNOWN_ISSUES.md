# Known Issues

## Mover Pan/Tilt Snap on Resume + Dimmer

**Status:** Open
**Severity:** Annoying but not data-loss
**Workaround:** Initialize room before controlling movers

### Problem

When using Resume → All Rooms → Dimmer 100%, the Quantums and Auras physically
move to pan=0/tilt=0 (corner position). The dimmer button only sends shutter +
dimmer channels, but the server outputs full 512-byte sACN frames, which includes
pan/tilt at 0 for movers that share the universe.

### Root Cause

sACN (E1.31) requires full 512-byte frames per universe. There is no "send only
these channels" option. When the `/channels` endpoint sets 2 channels for a
Quantum on U2, the server merges into the universe buffer (initially all zeros)
and outputs all 512 bytes — including pan=0, tilt=0 for the Quantum.

### Affected Universes

Movers share universes with non-mover fixtures:
- U1: Fresnels, Spots, Quantums 3-4
- U2: XBARs, Quantums 1-2
- U3: XLEDs, Quantums 5-8
- U4: Auras only (no conflict)

U6/U7/U8 (house lights) have no movers — Resume + dimmer works fine on those.

### Potential Fixes (Not Yet Implemented)

1. **Per-channel sACN priority (E1.31 start code 0xDD):** Send our channels at
   high priority and mover channels at priority 0 (don't care). Requires Luminex
   node support — needs testing.

2. **Pre-seed mover rest profiles on first universe touch:** Set pan/tilt=128
   (home) before outputting. If movers are already at power-on home, no visible
   movement. But if GrandMA had them elsewhere, they snap to home.

3. **Separate mover universes:** Re-patch movers to dedicated universes so
   non-mover control doesn't affect them. Requires Luminex/GrandMA re-patch.

4. **Read current universe state before first output:** Query the Luminex node
   for its current DMX output and use that as the initial buffer. This preserves
   whatever the GrandMA set. Requires Luminex API investigation.

### Current Workaround

Use **Initialize** (not Resume) when you need to control fixtures on U1-U3.
Initialize sets mover rest profiles (pan/tilt=128, shutter closed) before
streaming, so subsequent dimmer commands work correctly.

Use **Resume** only for house light adjustments (U6/U7/U8) where no movers exist.
