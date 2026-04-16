#!/usr/bin/env python3
"""Chandelier Controller v4 — disconnect/reconnect support."""

import asyncio
import json
import pyads
import websockets
import http.server
import threading
import os
import time
import traceback

AMS_NET_ID = os.environ.get('AMS_NET_ID', '192.168.2.5.1.1')
PLC_IP = os.environ.get('PLC_IP', '100.92.43.22')
PLC_PORT = pyads.PORT_TC3PLC1
TOTAL_MOTORS = 54
POLL_INTERVAL = float(os.environ.get('POLL_INTERVAL', '0.5'))
HTTP_PORT = int(os.environ.get('HTTP_PORT', '8070'))
WS_PORT = int(os.environ.get('WS_PORT', '8071'))

plc = None
intentional_disconnect = False
state = {'connected': False, 'intentionalDisconnect': False, 'plcState': 0, 'sto': False, 'chandeliers': [], 'motors': [], 'timestamp': 0}
clients = set()

BATCH_SYMBOLS = []
BATCH_SYMBOLS.append('GVL.bSTO')
for c in range(1, 7):
    BATCH_SYMBOLS.append(f'GVL.bEnableChandelier[{c}]')
    BATCH_SYMBOLS.append(f'GVL.bEnableDMX[{c}]')
for i in range(1, TOTAL_MOTORS + 1):
    BATCH_SYMBOLS.append(f'GVL.arrActPos[{i}]')
    BATCH_SYMBOLS.append(f'GVL.arrUpper[{i}]')
    BATCH_SYMBOLS.append(f'GVL.arrLower[{i}]')
    BATCH_SYMBOLS.append(f'GVL.arrErrorMotor[{i}]')
    BATCH_SYMBOLS.append(f'GVL.bEnableStepper[{i}]')
    BATCH_SYMBOLS.append(f'GVL.arrHomeDone[{i}]')


def disconnect_plc():
    global plc, intentional_disconnect
    intentional_disconnect = True
    state['intentionalDisconnect'] = True
    if plc:
        try:
            plc.close()
        except:
            pass
        plc = None
    state['connected'] = False
    state['plcState'] = 0
    state['sto'] = False
    state['chandeliers'] = []
    state['motors'] = []
    print("Disconnected from PLC (intentional)")


def connect_plc():
    global plc, intentional_disconnect
    intentional_disconnect = False
    state['intentionalDisconnect'] = False
    try:
        if plc:
            try:
                plc.close()
            except:
                pass
        plc = pyads.Connection(AMS_NET_ID, PLC_PORT, PLC_IP)
        plc.open()
        info = plc.read_device_info()
        st = plc.read_state()
        print(f"Connected to PLC: {info[0]}, state={st[0]}")
        state['connected'] = True
        state['plcState'] = st[0]
        return True
    except Exception as e:
        print(f"PLC connection failed: {e}")
        state['connected'] = False
        return False


def poll_plc():
    if not plc or not state['connected']:
        return
    try:
        st = plc.read_state()
        state['plcState'] = st[0]

        data = plc.read_list_by_name(BATCH_SYMBOLS)

        idx = 0
        state['sto'] = bool(data[BATCH_SYMBOLS[idx]]); idx += 1

        chands = []
        for c in range(1, 7):
            chands.append({
                'id': c,
                'enabled': bool(data[BATCH_SYMBOLS[idx]]),
                'dmx': bool(data[BATCH_SYMBOLS[idx+1]]),
            })
            idx += 2
        state['chandeliers'] = chands

        motors = []
        ring_names = ['Ytre', 'Midt', 'Indre']
        for i in range(1, TOTAL_MOTORS + 1):
            c = ((i - 1) // 9) + 1
            r = ((i - 1) % 9) // 3 + 1
            m = ((i - 1) % 3) + 1
            motors.append({
                'i': i, 'c': c, 'r': r, 'm': m, 'rn': ring_names[r-1],
                'p': round(float(data[BATCH_SYMBOLS[idx]]), 1),
                'u': bool(data[BATCH_SYMBOLS[idx+1]]),
                'l': bool(data[BATCH_SYMBOLS[idx+2]]),
                'e': int(data[BATCH_SYMBOLS[idx+3]]),
                'en': bool(data[BATCH_SYMBOLS[idx+4]]),
                'h': bool(data[BATCH_SYMBOLS[idx+5]]),
            })
            idx += 6
        state['motors'] = motors
        state['timestamp'] = time.time()
    except Exception as e:
        print(f"Poll error: {e}")
        traceback.print_exc()
        state['connected'] = False


def handle_command(cmd):
    action = cmd.get('action')
    print(f"Command: {action} {cmd}")

    if action == 'disconnect':
        disconnect_plc()
        return {'ok': True}

    if action == 'reconnect':
        connect_plc()
        return {'ok': state['connected']}

    if not plc or not state['connected']:
        return {'ok': False, 'error': 'Not connected'}

    try:
        if action == 'enableChandelier':
            plc.write_by_name(f'GVL.bEnableChandelier[{int(cmd["id"])}]', bool(cmd['value']), pyads.PLCTYPE_BOOL)
        elif action == 'enableDMX':
            plc.write_by_name(f'GVL.bEnableDMX[{int(cmd["id"])}]', bool(cmd['value']), pyads.PLCTYPE_BOOL)
        elif action == 'jog':
            plc.write_by_name(f'GVL.arrJogMotorSpeed[{int(cmd["motor"])}]', int(cmd['direction']), pyads.PLCTYPE_BYTE)
        elif action == 'jogRing':
            ch, ring, d = int(cmd['chandelier']), int(cmd['ring']), int(cmd['direction'])
            base = (ch - 1) * 9 + (ring - 1) * 3
            for m in range(1, 4):
                plc.write_by_name(f'GVL.arrJogMotorSpeed[{base+m}]', d, pyads.PLCTYPE_BYTE)
        elif action == 'jogChandelier':
            ch, d = int(cmd['chandelier']), int(cmd['direction'])
            base = (ch - 1) * 9
            for m in range(1, 10):
                plc.write_by_name(f'GVL.arrJogMotorSpeed[{base+m}]', d, pyads.PLCTYPE_BYTE)
        elif action == 'reset':
            plc.write_by_name('GVL.bReset', True, pyads.PLCTYPE_BOOL)
            time.sleep(0.15)
            plc.write_by_name('GVL.bReset', False, pyads.PLCTYPE_BOOL)
        else:
            return {'ok': False, 'error': f'Unknown: {action}'}
        return {'ok': True}
    except Exception as e:
        print(f"Command error [{action}]: {e}")
        traceback.print_exc()
        return {'ok': False, 'error': str(e)}


async def ws_handler(websocket):
    clients.add(websocket)
    print(f"Client connected ({len(clients)} total)")
    # Send current state immediately
    await websocket.send(json.dumps({'type': 'state', **state}))
    try:
        async for message in websocket:
            cmd = json.loads(message)
            result = handle_command(cmd)
            await websocket.send(json.dumps({'type': 'cmdResult', **result}))
            if not intentional_disconnect:
                poll_plc()
            await broadcast_state()
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)
        print(f"Client disconnected ({len(clients)} total)")


async def broadcast_state():
    if clients:
        msg = json.dumps({'type': 'state', **state})
        await asyncio.gather(*[c.send(msg) for c in clients], return_exceptions=True)


async def poll_loop():
    while True:
        if not intentional_disconnect:
            if not state['connected']:
                connect_plc()
            if state['connected']:
                poll_plc()
                await broadcast_state()
        await asyncio.sleep(POLL_INTERVAL)


def serve_http():
    web_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(web_dir)
    handler = http.server.SimpleHTTPRequestHandler
    httpd = http.server.HTTPServer(('0.0.0.0', HTTP_PORT), handler)
    print(f"HTTP server on :{HTTP_PORT}")
    httpd.serve_forever()


async def main():
    threading.Thread(target=serve_http, daemon=True).start()
    connect_plc()
    async with websockets.serve(ws_handler, '0.0.0.0', WS_PORT):
        print(f"WebSocket server on :{WS_PORT}")
        await poll_loop()

if __name__ == '__main__':
    asyncio.run(main())
