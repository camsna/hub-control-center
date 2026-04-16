# Crestron Control System Documentation

**Venue:** Jernbanetorget (Clarion Hotel The Hub), Oslo
**Processor:** CP3
**Source:** Jernbanetorget.smw (SIMPL Windows)

---

## System Overview

The Crestron system controls:
- **Chandelier brakes** (lysekrone movement enable/disable)
- **Hoist motors** (M1-M20 for truss/chandelier positioning)
- **Projection screens** (6 screens + projector lift boxes)
- **Curtains** (9 curtain tracks)
- **CueCore communication** (DMX scene triggering)

### Network Architecture

```
                    CP3 Processor (10.0.80.71)
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   Crestnet Bus        Ethernet (CIP)      TCP/IP
        │                   │                   │
  ┌─────┴─────┐      ┌──────┴──────┐     ┌──────┴──────┐
  │DIN-8SW8-I │      │ TSW-760     │     │ CueCore x3  │
  │ (5 units) │      │ Touchpanels │     │ Port 7000   │
  │ ID 11-15  │      │ ID 0x48-4F  │     │             │
  └───────────┘      └─────────────┘     └─────────────┘
```

---

## Connection Parameters

| Parameter | Value |
|-----------|-------|
| Processor IP | 10.0.80.71 |
| CIP Port | 41794 |
| Available IP ID | 0x03 |
| Protocol | TCP/CIP |

**Connection verified:** 2026-01-20 - CIP registration accepted.

---

## CueCore Communication

Three CueCores control house lighting via TCP port 7000:

| CueCore | IP | Universe |
|---------|-----|----------|
| Room 1 | 10.0.80.95 | U6 |
| Room 2 | 10.0.80.96 | U7 |
| Room 3 | 10.0.80.97 | U8 |

**Command format:**
```
core-pb-{playback}-{command}    # Playback control
core-dmx-{channel}={value}      # Direct DMX
```

**Signal names in SIMPL:**
- `QueCore_room_1_TX$` - Commands to Room 1 CueCore
- `QueCore_room_2_TX$` - Commands to Room 2 CueCore
- `QueCore_room_3_TX$` - Commands to Room 3 CueCore

---

## CIP Join Mappings

### Chandelier Brakes (Crestron Touchpanel)

| Join | Signal Handle | Signal Name | Function |
|------|---------------|-------------|----------|
| 53 | H=477 | Disable/Enable_Krone_MOV_R1 | Room 1 brake toggle |
| 54 | H=496 | Disable/Enable_Krone_MOV_R2 | Room 2 brake toggle |
| 55 | H=476 | Disable/Enable_Krone_MOV_R3 | Room 3 brake toggle |

**Behavior:** Toggle signals - sending ON flips the brake state.

**Related signals:**
- `Disable/Enable_Krone_MOV_Rx_T` - Toggle state
- `Disable/Enable_Krone_MOV_Rx_T_DLY` - Delayed output
- `Disable/Enable_Krone_MOV_Rx_T_OUT*` - Interlock output
- `Disable/Enable_Krone_MOV_Rx_i` - Feedback/status

> **NOTE (2026-01-22):** The web controller does NOT use these CIP joins. It controls brakes directly via the DMX SPEED channel on each ring. See `LYSEKRONER.md` for details. These CIP joins are for the Crestron touchpanel system only.

### Hoist Motor Enables (VERIFIED)

| Join | Signal Handle | Signal Name |
|------|---------------|-------------|
| 101 | H=132 | M1_enable |
| 102 | H=133 | M2_enable |
| 103 | H=134 | M3_enable |
| 104 | H=135 | M4_enable |
| 105 | H=136 | M5_enable |
| 106 | H=137 | M6_enable |
| 107 | H=138 | M7_enable |
| 108 | H=139 | M8_enable |
| 109 | H=140 | M9_enable |
| 110 | H=141 | M10_enable |
| 111 | H=142 | M11_enable |
| 112 | H=143 | M12_enable |
| 113 | H=144 | M13_enable |
| 114 | H=145 | M14_enable |
| 115 | H=146 | M15_enable |
| 116 | H=147 | M16_enable |
| 117 | H=148 | M17_enable |
| 118 | H=149 | M18_enable |
| 119 | H=150 | M19_enable |
| 120 | H=151 | M20_enable |

**Additional motor signals:**
- H=152: PA_L_enable
- H=153: PA_R_enable

### Hoist Direction Controls (VERIFIED)

| Join | Signal Handle | Signal Name | Function |
|------|---------------|-------------|----------|
| 123 | H=166 | motor_up_bt | Move enabled motor(s) UP |
| 124 | H=164 | motor_down_bt | Move enabled motor(s) DOWN |

**Safety signals:**
- `Motor_sum` - Count of enabled motors
- `MAX_motorEnable` - Maximum allowed simultaneous motors
- `warning_MAX_motorEnable` - Limit reached warning
- `motorEnable_OK` - Movement allowed flag
- `reset_motorEnable` - Reset all enables

### Truss-to-Motor Mapping (VERIFIED from SIMPL)

| Truss | Motors | Count | Notes |
|-------|--------|-------|-------|
| 1 | M1, M2, M3 | 3 | |
| 2 | M4, M5, M6 | 3 | |
| 3 | M7, M8 | 2 | |
| 4 | M9, M10, M11, M12 | 4 | |
| 5 | M13, M14, M15 | 3 | |
| 6 | M16, M17, M18 | 3 | |
| 7 | M19, M20 | 2 | |

**PA Hoists** (separate from M1-M20):
- PA_L: H=152 (left PA line array)
- PA_R: H=153 (right PA line array)
- Can be moved together (2 motors total)

### Hoist Operation Procedure

```
1. Enable motor(s) - Send ON to join 101-120
2. Verify motorEnable_OK is TRUE
3. Hold direction - Hold ON on join 123 (up) or 124 (down)
4. Release to stop - Send OFF to direction join
5. Disable motor - Send OFF to motor enable join
```

**Safety limit:** One truss at a time, or both PA stacks together.

---

## Screen Controls

Screens use **Smart Graphics objects** with calculated join numbers.

### Screen Layout

| Screen | Location | Type |
|--------|----------|------|
| Screen 1 | Front of room | 12m wide roll-up cinema screen |
| Screen 2 | Sal A (Room 1) | Retractable projection screen + projector box |
| Screen 3 | Sal B (Room 2) | Retractable projection screen + projector box |
| Screen 4 | Sal C (Room 3) | Retractable projection screen + projector box |
| Screen 5 | ? | ? |
| Screen 6 | ? | ? |
| Screen 7 | ? | ? |

**Note:** Screens retract/expand, and the projector boxes (holding the rolled-up screen) move up/down.

### Screen Smart Object IDs

| Screen | Smart Object ID | Signals |
|--------|-----------------|---------|
| Screen Pro1/2 | 3 | H=192 (up), H=226 (down) |
| Screen Pro3 | 5 | H=299 (up), H=300 (stop), H=301 (down) |
| Screen Pro4 | 8 | H=305 (up), H=306 (stop), H=307 (down) |
| Screen Pro5 | 10 | H=311 (up), H=313 (down) |
| Screen Pro6 | 11 | H=317 (up), H=319 (down) |
| Screen Pro7 | 12 | ? |

### Screen Signal Handles

| Signal | Handle | Function |
|--------|--------|----------|
| Screen_1_up | H=192 | Screen 1 raise |
| Screen_1_down | H=226 | Screen 1 lower |
| Screen_2_up | H=293 | Screen 2 raise |
| Screen_2_stop | H=294 | Screen 2 stop |
| Screen_2_down | H=295 | Screen 2 lower |
| Screen_3_up | H=299 | Screen 3 raise |
| Screen_3_stop | H=300 | Screen 3 stop |
| Screen_3_down | H=301 | Screen 3 lower |
| Screen_4_up | H=305 | Screen 4 raise |
| Screen_4_stop | H=306 | Screen 4 stop |
| Screen_4_down | H=307 | Screen 4 lower |
| Screen_5_up | H=311 | Screen 5 raise |
| Screen_5_down | H=313 | Screen 5 lower |
| Screen_6_up | H=317 | Screen 6 raise |
| Screen_6_down | H=319 | Screen 6 lower |

### Projector Lift Boxes

| Signal | Handle | Function |
|--------|--------|----------|
| Screen_2_up_box | H=323 | Projector 2 box raise |
| Screen_2_down_box | H=325 | Projector 2 box lower |
| Screen_3_up_box | H=328 | Projector 3 box raise |
| Screen_3_down_box | H=331 | Projector 3 box lower |
| Screen_4_up_box | ? | Projector 4 box raise |
| Screen_4_down_box | ? | Projector 4 box lower |

**Note:** Screen controls via CIP require Smart Object join calculation. Direct join numbers need on-site verification by monitoring touchpanel traffic.

---

## Curtain Controls

9 curtain tracks with up/stop/down control:

| Curtain | Up | Stop | Down |
|---------|-----|------|------|
| 1 | H=207 | H=208 | H=214 |
| 2 | H=227 | H=228 | H=229 |
| 3 | H=240 | H=241 | H=242 |
| 4 | H=246 | H=247 | H=248 |
| 5 | H=252 | H=253 | H=254 |
| 6-9 | ? | ? | ? |

**Note:** SIMPL source also has "CurtainBack" (Smart Object ID 28) — physical function unknown.

---

## Relay Modules (DIN-8SW8-I)

Five 8-channel relay modules on Crestnet (VERIFIED from SIMPL source):

### ID-11: Motors M1-M8
| Load | Input Handle | Function |
|------|--------------|----------|
| 1 | H=132 | M1_enable |
| 2 | H=133 | M2_enable |
| 3 | H=134 | M3_enable |
| 4 | H=135 | M4_enable |
| 5 | H=136 | M5_enable |
| 6 | H=137 | M6_enable |
| 7 | H=138 | M7_enable |
| 8 | H=139 | M8_enable |

### ID-12: Motors M9-M16
| Load | Input Handle | Function |
|------|--------------|----------|
| 1 | H=140 | M9_enable |
| 2 | H=141 | M10_enable |
| 3 | H=142 | M11_enable |
| 4 | H=143 | M12_enable |
| 5 | H=144 | M13_enable |
| 6 | H=145 | M14_enable |
| 7 | H=146 | M15_enable |
| 8 | H=147 | M16_enable |

### ID-13: Motors M17-M20, PA Hoists, Screen 1
| Load | Input Handle | Function |
|------|--------------|----------|
| 1 | H=148 | M17_enable |
| 2 | H=149 | M18_enable |
| 3 | H=150 | M19_enable |
| 4 | H=151 | M20_enable |
| 5 | H=152 | PA_L_enable |
| 6 | H=153 | PA_R_enable |
| 7 | H=192 | Screen_1_up |
| 8 | H=226 | Screen_1_down |

### ID-14: Screens 2-3 + Projector Boxes
| Load | Input Handle | Function |
|------|--------------|----------|
| 1 | H=293 | Screen_2_up |
| 2 | H=295 | Screen_2_down |
| 3 | H=323 | Screen_2_up_box |
| 4 | H=325 | Screen_2_down_box |
| 5 | H=299 | Screen_3_up |
| 6 | H=301 | Screen_3_down |
| 7 | H=328 | Screen_3_up_box |
| 8 | H=331 | Screen_3_down_box |

### ID-15: Screens 4-6
| Load | Input Handle | Function |
|------|--------------|----------|
| 1 | H=305 | Screen_4_up |
| 2 | H=307 | Screen_4_down |
| 3 | H=335 | Screen_4_up_box |
| 4 | H=337 | Screen_4_down_box |
| 5 | H=311 | Screen_5_up |
| 6 | H=313 | Screen_5_down |
| 7 | H=317 | Screen_6_up |
| 8 | H=319 | Screen_6_down |

---

## Touchpanel Configuration

Multiple TSW-760 touchpanels connect via Ethernet:

| IP ID | Decimal | IP Address |
|-------|---------|------------|
| 0x48 | 72 | 10.0.80.83 |
| 0x49 | 73 | 10.0.80.84 |
| 0x4A | 74 | 10.0.80.85 |
| 0x4B | 75 | 10.0.80.86 |
| 0x4C | 76 | 10.0.80.87 |
| 0x4D | 77 | 10.0.80.88 |
| 0x4E | 78 | 10.0.80.89 |
| 0x4F | 79 | ? |

---

## Lysekrone (Chandelier) Controls via Crestron

### LED Color Presets

Per-room color presets (Smart Objects ID 52-54):

| Room | Signals |
|------|---------|
| R1 | R1_Krone_Lights_Red/Green/Blue/White/Amber/Cyan/Magenta/Off |
| R2 | R2_Krone_Lights_Red/Green/Blue/White/Amber/Cyan/Magenta/Off |
| R3 | R3_Krone_Lights_Red/Green/Blue/White/Amber/Cyan/Magenta/Off |

### Movement Smart Objects

| Room | Smart Object ID | Name |
|------|-----------------|------|
| R1 | 49 | R-1 Krone mov |
| R2 | 50 | R-2 Krone mov |
| R3 | 51 | R-3 Krone mov |

These Smart Objects have 8 tab buttons for movement presets.

---

## CIP Protocol Reference

### Packet Format

```
[type: 1 byte] [length: 2 bytes BE] [payload]
```

### Message Types

| Type | Name | Description |
|------|------|-------------|
| 0x01 | Connect | Registration request |
| 0x05 | Data | Join data |
| 0x0D | Heartbeat Request | Keep-alive from processor |
| 0x0E | Heartbeat Response | Reply to keep-alive |
| 0x0F | Connect Ack | Registration accepted |

### Digital Join Packet

```
0x05 0x00 0x03 0x00 [join_hi | state] [join_lo]

state: 0x80 = ON, 0x00 = OFF
join: 0-based index (join 53 = index 52)
```

### JavaScript Implementation

```javascript
function buildDigitalJoin(join, state) {
  const joinIndex = join - 1;
  return Buffer.from([
    0x05,                                    // MSG_DATA
    0x00, 0x03,                              // Length = 3
    0x00,                                    // DATA_DIGITAL_JOIN
    (state ? 0x80 : 0x00) | ((joinIndex >> 8) & 0x7F),
    joinIndex & 0xFF
  ]);
}

// Toggle Room 1 brake
socket.write(buildDigitalJoin(53, true));   // Press
socket.write(buildDigitalJoin(53, false));  // Release
```

---

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│  CRESTRON CONTROL QUICK REFERENCE                           │
├─────────────────────────────────────────────────────────────┤
│  Host: 10.0.80.71    Port: 41794    IPID: 0x03              │
├─────────────────────────────────────────────────────────────┤
│  BRAKES (toggle):    Join 53 = Room 1 chandelier brake      │
│                      Join 54 = Room 2 chandelier brake      │
│                      Join 55 = Room 3 chandelier brake      │
├─────────────────────────────────────────────────────────────┤
│  HOIST DIRECTION:    Join 123 = UP (hold while moving)      │
│                      Join 124 = DOWN (hold while moving)    │
├─────────────────────────────────────────────────────────────┤
│  MOTOR ENABLES:      Joins 101-120 = M1-M20                 │
├─────────────────────────────────────────────────────────────┤
│  SCREENS:            Smart Objects (need join calculation)  │
├─────────────────────────────────────────────────────────────┤
│  CUECORES:           10.0.80.95-97 port 7000                │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Notes

### What We Can Control via CIP

**Available via CIP (for Crestron touchpanels):**
- Chandelier brake interlocks (joins 53-55) — *web controller uses DMX instead*
- Hoist motor enables (joins 101-120)
- Hoist direction (joins 123-124)

**Requires Smart Object join calculation:**
- Projection screens
- Curtains

> **Web Controller Note:** The web controller at `http://10.0.81.223/controller.html` bypasses Crestron for lysekrone control. It sends DMX directly via the `/channels` endpoint. Brakes are controlled via the SPEED channel (0=engaged, 255=released).

### Direct CueCore Control

For DMX-based functions, bypass Crestron and send TCP commands directly to CueCores:

```javascript
const net = require('net');
const client = new net.Socket();
client.connect(7000, '10.0.80.95', () => {
  client.write('core-pb-2-goto=1\r\n');  // Trigger cue
  client.end();
});
```

---

## Safety Considerations

1. **Brake before movement** - Always verify brake state before motor operations
2. **Motor limit** - System has MAX_motorEnable limit (respect it)
3. **Visual confirmation** - Never move hoists without visual confirmation of clear path
4. **Interlock logic** - The brake system uses interlock symbols for safety

---

## Files Reference

| File | Location | Contents |
|------|----------|----------|
| Jernbanetorget.smw | crestron-source/ | SIMPL program source |
| Jernbanetorget.sig | crestron-source/ | Signal list (binary) |
| TSW-760 Jernbanetorget.sgd_ | crestron-source/ | Touchpanel graphics |
| QueCore_DMX_control.cs | crestron-source/ | DMX control module |

---

## Unknown / To Verify

1. **Screen join numbers** - Need on-site traffic monitoring to confirm Smart Object join calculations
2. **Curtain joins 6-9** - Signal handles not found in source
3. **CurtainBack** - What is this physically? (Smart Object ID 28)
4. **Projector lift box joins** - Screen_4 box signals not found
5. **Screen 5-7 locations** - Physical location unknown

