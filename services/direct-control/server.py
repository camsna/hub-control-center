#!/usr/bin/env python3
"""
Direct Device Control — POC Server
Bypasses Crestron CPs, talks to hardware natively.

Runs alongside the existing CIP-based crestron-central UI.
"""

import asyncio
import json
import logging
import http.server
import os
import threading
from pathlib import Path

try:
    import websockets
except ImportError:
    import subprocess
    subprocess.check_call(["pip3", "install", "websockets"])
    import websockets

from drivers import SamsungMDC, HelvarUDP, QueCoreUDP, PanasonicProjector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("server")

# =============================================================================
# Device Registry
# =============================================================================

# Think Outside The Box — Samsung displays
TOTB_TVS = {
    "tv1": SamsungMDC("10.0.80.187", name="TOTB TV1"),
    "tv2": SamsungMDC("10.0.80.188", name="TOTB TV2"),
    "tv3": SamsungMDC("10.0.80.189", name="TOTB TV3"),
    "tv4": SamsungMDC("10.0.80.190", name="TOTB TV4"),
}

# Think Outside The Box — Helvar lighting
# UDP goes to Helvar gateway at 10.0.81.101 (VLAN 81 address per SIMPL source)
TOTB_HELVAR = HelvarUDP("10.0.81.101", port=50001, name="TOTB Helvar")

# Think Outside The Box — Arduino Yun relay controller (TV elevator)
TOTB_ARDUINO_IP = "10.0.80.193"
TOTB_ARDUINO_PORT = 1023

async def arduino_command(cmd):
    """Send command to Arduino Yun — original protocol, no newline.
    Protocol: {channel}@{value}{type}
    Motor: 1@1m (up), 1@2m (down), 1@0m (stop)
    """
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(TOTB_ARDUINO_IP, TOTB_ARDUINO_PORT), timeout=3
        )
        writer.write(cmd.encode())  # No newline — original protocol
        await writer.drain()
        writer.close()
        await writer.wait_closed()
        return "ok"
    except Exception as e:
        log.error(f"Arduino ({TOTB_ARDUINO_IP}): {e}")
        return f"error:{e}"

# Jernbanetorget — QueCore CueCore 1 (Sal A, Universe 6)
JERN_CUECORE1 = QueCoreUDP("10.0.80.95", port=7000, name="CueCore Sal A")

# Jernbanetorget — Panasonic projectors (for future use)
JERN_PROJECTORS = {
    "main1": PanasonicProjector("10.0.80.83", name="RZ21K Main 1"),
    "main2": PanasonicProjector("10.0.80.84", name="RZ21K Main 2"),
    "side_a": PanasonicProjector("10.0.80.85", name="RZ970 Side Sal A"),
    "side_b": PanasonicProjector("10.0.80.86", name="RZ970 Side Sal B"),
    "side_c": PanasonicProjector("10.0.80.87", name="RZ970 Side Sal C"),
}

# =============================================================================
# WebSocket handler
# =============================================================================

ws_clients = set()
event_loop = None


async def broadcast(msg):
    data = json.dumps(msg)
    dead = set()
    for ws in ws_clients:
        try:
            await ws.send(data)
        except:
            dead.add(ws)
    ws_clients -= dead


async def handle_command(data):
    """Route a command to the right driver. Returns response dict."""
    target = data.get("target")
    action = data.get("action")

    # --- Think Outside The Box: Samsung TVs ---
    if target == "totb_tv":
        tv_id = data.get("tv", "all")
        tvs = [TOTB_TVS[tv_id]] if tv_id in TOTB_TVS else list(TOTB_TVS.values())

        if action == "power_on":
            await asyncio.gather(*[tv.power_on() for tv in tvs])
            return {"ok": True, "action": "power_on", "tvs": len(tvs)}
        elif action == "power_off":
            await asyncio.gather(*[tv.power_off() for tv in tvs])
            return {"ok": True, "action": "power_off", "tvs": len(tvs)}
        elif action == "volume":
            level = data.get("level", 20)
            await asyncio.gather(*[tv.set_volume(level) for tv in tvs])
            return {"ok": True, "action": "volume", "level": level}
        elif action == "source":
            src = data.get("source", 0x21)  # default HDMI1
            await asyncio.gather(*[tv.set_source(src) for tv in tvs])
            return {"ok": True, "action": "source", "source": src}

    # --- Think Outside The Box: Helvar Lights ---
    elif target == "totb_light":
        group = data.get("group")
        level = data.get("level", 100)
        fade = data.get("fade", 50)
        if group is not None:
            await TOTB_HELVAR.set_group(group, level, fade)
            return {"ok": True, "action": "set_group", "group": group, "level": level}
        elif action == "recall":
            block = data.get("block", 1)
            scene = data.get("scene", 1)
            await TOTB_HELVAR.recall_block(block, scene, fade)
            return {"ok": True, "action": "recall", "block": block, "scene": scene}

    # --- Think Outside The Box: TV Elevator (Arduino Yun) ---
    # Original protocol: {channel}@{value}{type}
    # Motor 1: 1@1m=up, 1@2m=down, 1@0m=stop
    elif target == "totb_elevator":
        if action == "up":
            resp = await arduino_command("1@1m")
            return {"ok": True, "action": "elevator_up", "response": resp}
        elif action == "down":
            resp = await arduino_command("1@2m")
            return {"ok": True, "action": "elevator_down", "response": resp}
        elif action == "stop":
            resp = await arduino_command("1@0m")
            return {"ok": True, "action": "elevator_stop", "response": resp}

    # --- Jernbanetorget: CueCore Sal A DMX ---
    elif target == "jern_dmx":
        if action == "set_channel":
            ch = data.get("channel", 1)
            val = data.get("value", 0)
            await JERN_CUECORE1.set_dmx(ch, val)
            return {"ok": True, "action": "set_dmx", "channel": ch, "value": val}
        elif action == "set_playback":
            pb = data.get("playback", 1)
            intensity = data.get("intensity", 0.0)
            await JERN_CUECORE1.set_playback(pb, intensity)
            return {"ok": True, "action": "set_playback", "pb": pb, "intensity": intensity}
        elif action == "blackout":
            for ch in range(1, 25):
                await JERN_CUECORE1.set_dmx(ch, 0)
            return {"ok": True, "action": "blackout"}
        elif action == "full":
            for ch in range(1, 25):
                await JERN_CUECORE1.set_dmx(ch, 255)
            return {"ok": True, "action": "full"}

    # --- Jernbanetorget: Projectors ---
    elif target == "jern_projector":
        proj_id = data.get("projector")
        if proj_id in JERN_PROJECTORS:
            proj = JERN_PROJECTORS[proj_id]
            if action == "power_on":
                resp = await proj.power_on()
                return {"ok": True, "action": "power_on", "response": resp}
            elif action == "power_off":
                resp = await proj.power_off()
                return {"ok": True, "action": "power_off", "response": resp}
            elif action == "av_mute_on":
                resp = await proj.av_mute_on()
                return {"ok": True, "action": "av_mute_on", "response": resp}
            elif action == "av_mute_off":
                resp = await proj.av_mute_off()
                return {"ok": True, "action": "av_mute_off", "response": resp}

    # --- Status ---
    elif target == "status":
        return {
            "ok": True,
            "devices": {
                "totb_tvs": {k: v.info() for k, v in TOTB_TVS.items()},
                "totb_helvar": TOTB_HELVAR.info(),
                "jern_cuecore1": JERN_CUECORE1.info(),
                "jern_projectors": {k: v.info() for k, v in JERN_PROJECTORS.items()},
            }
        }

    return {"ok": False, "error": f"Unknown target/action: {target}/{action}"}


async def ws_handler(websocket):
    ws_clients.add(websocket)
    log.info(f"Client connected ({len(ws_clients)} total)")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                log.info(f"<<< {data.get('target')}/{data.get('action')}")
                result = await handle_command(data)
                await websocket.send(json.dumps(result))
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"ok": False, "error": "Invalid JSON"}))
            except Exception as e:
                log.error(f"Command error: {e}")
                await websocket.send(json.dumps({"ok": False, "error": str(e)}))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        ws_clients.discard(websocket)
        log.info(f"Client disconnected ({len(ws_clients)} total)")


# =============================================================================
# HTTP server for static files
# =============================================================================

def run_http(port=8090):
    web_dir = Path(__file__).parent
    os.chdir(web_dir)
    handler = http.server.SimpleHTTPRequestHandler
    httpd = http.server.HTTPServer(("0.0.0.0", port), handler)
    log.info(f"HTTP on http://0.0.0.0:{port}")
    httpd.serve_forever()


# =============================================================================
# Main
# =============================================================================

async def main():
    global event_loop
    event_loop = asyncio.get_event_loop()

    # Connect UDP drivers
    await TOTB_HELVAR.connect()
    await JERN_CUECORE1.connect()

    # Start HTTP in thread
    threading.Thread(target=run_http, daemon=True).start()

    # Start WebSocket
    log.info("WebSocket on ws://0.0.0.0:8091")
    async with websockets.serve(ws_handler, "0.0.0.0", 8091):
        log.info("Direct Control POC ready.")
        log.info("  TOTB: 4 Samsung TVs + Helvar lights")
        log.info("  Jernbanetorget: CueCore Sal A (Universe 6)")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
