#!/usr/bin/env python3
"""
CIP-to-WebSocket Bridge
Maintains a persistent CIP connection to the Crestron processor
and bridges commands/events to/from a browser via WebSocket.

Usage:
    python3 bridge.py

Runs on port 8765 (WebSocket) and port 8080 (HTTP for the UI).
Connects to CP2 (10.0.80.71) as IP ID 0xB9 on demand.
"""

import asyncio
import json
import socket
import struct
import threading
import time
import http.server
import os
from pathlib import Path

# Try to import websockets
try:
    import websockets
except ImportError:
    print("Installing websockets...")
    import subprocess
    subprocess.check_call(["pip3", "install", "websockets"])
    import websockets

# ============================================================================
# CIP Protocol
# ============================================================================

CIP_HOST = "10.0.80.71"
CIP_PORT = 41794
CIP_IPID = 0xB9  # default, overridden by client

# Dead-man's switch: held joins must be refreshed within this window or auto-release
HOLD_TIMEOUT = 0.6  # seconds
WATCHDOG_INTERVAL = 0.2  # seconds

class CIPClient:
    def __init__(self, host, port, ip_id):
        self.host = host
        self.port = port
        self.ip_id = ip_id
        self.sock = None
        self.connected = False
        self.registered = False
        self.lock = threading.Lock()
        self.event_callback = None
        self.recv_thread = None
        self.heartbeat_thread = None
        self.running = False
        self.digital_states = {}
        self.analog_states = {}
        self.serial_states = {}
        self.so_states = {}
        self.active_holds = {}  # {join: last_refresh_time}
        self.watchdog_thread = None

    def connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(10)
        self.sock.connect((self.host, self.port))
        self.connected = True
        self.running = True
        self.recv_thread = threading.Thread(target=self._recv_loop, daemon=True)
        self.recv_thread.start()
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self.heartbeat_thread.start()
        self.watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.watchdog_thread.start()

    def release_all_holds(self):
        """Emergency release: send LOW for every held join."""
        holds = list(self.active_holds.keys())
        self.active_holds.clear()
        for join in holds:
            print(f"SAFETY: releasing held join {join}")
            self.send_digital(join, False)

    def hold_join(self, join, state):
        """Set or release a held join with dead-man's switch tracking."""
        if state:
            self.active_holds[join] = time.time()
            self.send_digital(join, True)
        else:
            self.active_holds.pop(join, None)
            self.send_digital(join, False)

    def disconnect(self):
        self.release_all_holds()
        self.running = False
        self.connected = False
        self.registered = False
        if self.sock:
            try: self.sock.close()
            except: pass

    def _send(self, data):
        if self.sock and self.connected:
            try: self.sock.sendall(data)
            except: self.connected = False

    def _recv_loop(self):
        buf = b""
        while self.running and self.connected:
            try:
                self.sock.settimeout(1)
                chunk = self.sock.recv(8192)
                if not chunk:
                    self.connected = False
                    break
                buf += chunk
                while len(buf) >= 3:
                    pt = buf[0]
                    pl = (buf[1] << 8) | buf[2]
                    ttl = pl + 3
                    if len(buf) < ttl: break
                    pkt = buf[:ttl]
                    buf = buf[ttl:]
                    self._handle(pt, pkt[3:], pkt)
            except socket.timeout:
                continue
            except:
                self.connected = False
                break

    def _handle(self, pt, payload, raw):
        if pt == 0x0F:  # WHOIS
            signon = bytes([0x01,0x00,0x0B,0x00,0x00,0x00,0x00,0x00,
                          self.ip_id,0x40,0xFF,0xFF,0xF1,0x01])
            self._send(signon)

        elif pt == 0x02:  # CONNECT result
            if payload and payload[0] != 0xFF:
                self.registered = True
                self._send(bytes([0x05,0x00,0x05,0x00,0x00,0x02,0x03,0x00]))
            else:
                self.connected = False

        elif pt == 0x05:  # DATA
            if len(payload) >= 4:
                sub = payload[3]
                if (sub == 0x00 or sub == 0x27) and len(payload) >= 6:
                    lo = payload[4]; hi = payload[5]
                    j = (((hi & 0x7F) << 8) | lo) + 1
                    st = not bool(hi & 0x80)
                    self.digital_states[j] = st
                    self._emit({"type": "digital", "join": j, "state": st})

                elif sub == 0x14 and len(payload) >= 8:
                    j = ((payload[4] << 8) | payload[5]) + 1
                    v = (payload[6] << 8) | payload[7]
                    self.analog_states[j] = v
                    self._emit({"type": "analog", "join": j, "value": v})

                elif sub == 0x38 and len(payload) >= 12:
                    so_id = payload[7]
                    isub = payload[9]
                    if so_id not in self.so_states:
                        self.so_states[so_id] = {}
                    if (isub == 0x00 or isub == 0x27) and len(payload) >= 12:
                        lo = payload[10]; hi = payload[11]
                        j = (((hi & 0x7F) << 8) | lo) + 1
                        st = not bool(hi & 0x80)
                        self.so_states[so_id][f"d{j}"] = st
                        self._emit({"type": "so_digital", "so_id": so_id, "join": j, "state": st, "ip_id": f"{self.ip_id:02X}"})
                    elif isub == 0x14 and len(payload) >= 15:
                        j = ((payload[11] << 8) | payload[12]) + 1
                        v = (payload[13] << 8) | payload[14]
                        self.so_states[so_id][f"a{j}"] = v
                        self._emit({"type": "so_analog", "so_id": so_id, "join": j, "value": v})

                elif sub == 0x03 and len(payload) >= 5:
                    if payload[4] == 0x1C:  # end of query
                        self._send(bytes([0x05,0x00,0x05,0x00,0x00,0x02,0x03,0x1D]))
                        self._send(bytes([0x0D,0x00,0x02,0x00,0x00]))
                        self._emit({
                            "type": "state_dump",
                            "digitals": len(self.digital_states),
                            "analogs": len(self.analog_states),
                            "smart_objects": len(self.so_states),
                            "ip_id": f"{self.ip_id:02X}",
                            "digital_states": {str(k): v for k, v in self.digital_states.items()},
                            "so_states": {
                                str(k): v for k, v in self.so_states.items()
                            }
                        })

                elif sub == 0x15 and len(payload) >= 8:
                    j = ((payload[4] << 8) | payload[5]) + 1
                    txt = payload[7:].decode('utf-8', errors='replace')
                    self.serial_states[j] = txt
                    self._emit({"type": "serial", "join": j, "text": txt})

        elif pt == 0x12:  # SERIAL
            if len(raw) >= 12 and raw[8] == 0x34:
                j = ((raw[9] << 8) | raw[10]) + 1
                txt = raw[12:].decode('utf-8', errors='replace')
                self.serial_states[j] = txt
                self._emit({"type": "serial", "join": j, "text": txt})

    def _emit(self, event):
        if self.event_callback:
            try: self.event_callback(event)
            except: pass

    def _watchdog_loop(self):
        """Dead-man's switch: release any hold not refreshed within HOLD_TIMEOUT."""
        while self.running and self.connected:
            time.sleep(WATCHDOG_INTERVAL)
            now = time.time()
            expired = [j for j, t in self.active_holds.items() if now - t > HOLD_TIMEOUT]
            for join in expired:
                print(f"WATCHDOG: join {join} expired ({now - self.active_holds[join]:.1f}s since last refresh)")
                self.active_holds.pop(join, None)
                self.send_digital(join, False)

    def _heartbeat_loop(self):
        while self.running and self.connected:
            time.sleep(15)
            if self.connected and self.registered:
                self._send(bytes([0x0D,0x00,0x02,0x00,0x00]))

    def so_press(self, so_id, join, hold=0.2):
        cj = join - 1
        lo = cj & 0xFF; hi = (cj >> 8) & 0x7F
        hi_off = hi | 0x80
        on = bytes([0x05,0x00,0x0C,0x00,0x00,0x09,0x38,0x00,0x00,0x00,
                    so_id,0x03,0x27,lo,hi])
        off = bytes([0x05,0x00,0x0C,0x00,0x00,0x09,0x38,0x00,0x00,0x00,
                     so_id,0x03,0x27,lo,hi_off])
        self._send(on)
        time.sleep(hold)
        self._send(off)

    def send_digital(self, join, state):
        cj = join - 1
        lo = cj & 0xFF; hi = (cj >> 8) & 0x7F
        if not state:
            hi |= 0x80
        pkt = bytes([0x05,0x00,0x06,0x00,0x00,0x03,0x27,lo,hi])
        self._send(pkt)

    def send_analog(self, join, value):
        cj = join - 1
        payload = bytes([0x00,0x00,0x05, 0x14,
            (cj >> 8) & 0xFF, cj & 0xFF,
            (value >> 8) & 0xFF, value & 0xFF])
        pkt = bytes([0x05, (len(payload)>>8)&0xFF, len(payload)&0xFF]) + payload
        self._send(pkt)

    def d_press(self, join, hold=0.2):
        cj = join - 1
        lo = cj & 0xFF; hi = (cj >> 8) & 0x7F
        hi_off = hi | 0x80
        on = bytes([0x05,0x00,0x06,0x00,0x00,0x03,0x27,lo,hi])
        off = bytes([0x05,0x00,0x06,0x00,0x00,0x03,0x27,lo,hi_off])
        self._send(on)
        time.sleep(hold)
        self._send(off)


# ============================================================================
# WebSocket + HTTP Server
# ============================================================================

cip = None
ws_clients = set()
event_loop = None

def on_cip_event(event):
    """Called from CIP thread — schedule broadcast on asyncio loop."""
    if event_loop and ws_clients:
        asyncio.run_coroutine_threadsafe(broadcast(event), event_loop)

async def broadcast(event):
    msg = json.dumps(event)
    dead = set()
    for ws in ws_clients:
        try:
            await ws.send(msg)
        except:
            dead.add(ws)
    ws_clients -= dead

async def ws_handler(websocket):
    global cip
    ws_clients.add(websocket)
    print(f"WebSocket client connected ({len(ws_clients)} total)")

    try:
        async for message in websocket:
            data = json.loads(message)
            cmd = data.get("cmd")

            if cmd == "connect" or (cmd == "so_press" and (cip is None or not cip.connected)) or (cmd == "d_press" and (cip is None or not cip.connected)):
                # Auto-connect on first command
                ip_id = data.get("ip_id", CIP_IPID)
                if isinstance(ip_id, str):
                    ip_id = int(ip_id, 16)
                if cip is None or not cip.connected or cip.ip_id != ip_id:
                    if cip and cip.connected:
                        cip.disconnect()
                    cip = CIPClient(CIP_HOST, CIP_PORT, ip_id)
                    cip.event_callback = on_cip_event
                    try:
                        cip.connect()
                        await websocket.send(json.dumps({
                            "type": "connected",
                            "host": CIP_HOST,
                            "ip_id": f"{ip_id:02X}"
                        }))
                    except Exception as e:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "message": f"Connection failed: {e}"
                        }))
                        continue
                elif cmd == "connect":
                    # CIP already connected with same IP ID — tell the client
                    await websocket.send(json.dumps({
                        "type": "connected",
                        "host": CIP_HOST,
                        "ip_id": f"{ip_id:02X}",
                        "reused": True
                    }))

            if cmd == "so_press":
                if cip and cip.registered:
                    threading.Thread(target=cip.so_press,
                                   args=(data["so_id"], data["join"]),
                                   daemon=True).start()

            elif cmd == "d_press":
                if cip and cip.registered:
                    threading.Thread(target=cip.d_press,
                                   args=(data["join"],),
                                   daemon=True).start()

            elif cmd == "d_hold":
                if cip and cip.registered:
                    cip.hold_join(data["join"], data["state"])

            elif cmd == "analog":
                if cip and cip.registered:
                    cip.send_analog(data["join"], data["value"])

            elif cmd == "disconnect":
                if cip:
                    cip.disconnect()
                    cip = None

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        # SAFETY: release all held joins when any WebSocket client disconnects
        if cip and cip.connected and cip.active_holds:
            print(f"WS disconnect: releasing {len(cip.active_holds)} held joins")
            cip.release_all_holds()
        ws_clients.discard(websocket)
        print(f"WebSocket client disconnected ({len(ws_clients)} total)")

def run_http(port=8080):
    """Serve the static HTML."""
    web_dir = Path(__file__).parent
    os.chdir(web_dir)
    handler = http.server.SimpleHTTPRequestHandler
    httpd = http.server.HTTPServer(("0.0.0.0", port), handler)
    print(f"HTTP server on http://0.0.0.0:{port}")
    httpd.serve_forever()

async def main():
    global event_loop
    event_loop = asyncio.get_event_loop()

    # Start HTTP server in thread
    http_thread = threading.Thread(target=run_http, daemon=True)
    http_thread.start()

    # Start WebSocket server
    print(f"WebSocket server on ws://0.0.0.0:8765")
    async with websockets.serve(ws_handler, "0.0.0.0", 8765):
        print("\nReady. Open http://<your-ip>:8080 in a browser.")
        print("The CIP connection will be established on first button press.\n")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
