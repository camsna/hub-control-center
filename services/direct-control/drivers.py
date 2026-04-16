"""
Direct device drivers — bypass Crestron CP entirely.
Each driver speaks the native protocol to the hardware.
"""

import asyncio
import struct
import logging

log = logging.getLogger("drivers")


# =============================================================================
# Samsung MDC (Multi Display Control) — TCP port 1515
# Binary protocol: 0xAA + cmd + display_id + data_len + data + checksum
# =============================================================================

class SamsungMDC:
    """Control Samsung commercial displays via MDC protocol."""

    def __init__(self, ip, display_id=0, name="Samsung"):
        self.ip = ip
        self.port = 1515
        self.display_id = display_id
        self.name = name
        self._writer = None
        self._reader = None

    def _checksum(self, data):
        """Sum of all bytes after header, modulo 256."""
        return sum(data) & 0xFF

    def _packet(self, cmd, *args):
        data = bytes([cmd, self.display_id, len(args)] + list(args))
        return bytes([0xAA]) + data + bytes([self._checksum(data)])

    async def _ensure_connected(self):
        """Maintain a persistent connection. Reconnect if dropped."""
        if self._writer and not self._writer.is_closing():
            return True
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.ip, self.port), timeout=3
            )
            return True
        except Exception as e:
            log.error(f"{self.name} ({self.ip}) connect: {e}")
            self._writer = None
            return False

    async def _send(self, cmd, *args):
        pkt = self._packet(cmd, *args)
        if not await self._ensure_connected():
            return None
        try:
            self._writer.write(pkt)
            await self._writer.drain()
            resp = await asyncio.wait_for(self._reader.read(64), timeout=2)
            return resp
        except Exception as e:
            log.error(f"{self.name} ({self.ip}) send: {e}")
            self._writer = None
            return None

    async def _send_fast(self, cmd, *args):
        """Write-only — no drain, no response read. Maximum speed."""
        pkt = self._packet(cmd, *args)
        if not await self._ensure_connected():
            return
        try:
            self._writer.write(pkt)
        except Exception as e:
            log.error(f"{self.name} ({self.ip}) fast send: {e}")
            self._writer = None

    async def power_on(self):
        return await self._send(0x11, 0x01)

    async def power_off(self):
        return await self._send(0x11, 0x00)

    async def set_volume(self, level):
        """Volume 0-100. Uses persistent connection, no response wait."""
        await self._send_fast(0x12, max(0, min(100, level)))

    async def set_source(self, source_code):
        """Source select. Common: 0x21=HDMI1, 0x23=HDMI2, 0x60=MagicInfo."""
        return await self._send(0x14, source_code)

    async def get_status(self):
        resp = await self._send(0x11)
        if resp and len(resp) >= 6:
            return {"power": resp[4] == 0x01}
        return None

    def info(self):
        return {"type": "samsung_mdc", "ip": self.ip, "name": self.name}


# =============================================================================
# Helvar — UDP port 50001
# ASCII commands to Helvar 905/910 routers
# =============================================================================

class HelvarUDP:
    """Control Helvar lighting via UDP ASCII commands."""

    def __init__(self, ip, port=50001, name="Helvar"):
        self.ip = ip
        self.port = port
        self.name = name
        self._transport = None
        self._protocol = None

    async def connect(self):
        loop = asyncio.get_event_loop()

        class Proto(asyncio.DatagramProtocol):
            def datagram_received(self, data, addr):
                log.debug(f"Helvar response from {addr}: {data}")

        self._transport, self._protocol = await loop.create_datagram_endpoint(
            Proto, remote_addr=(self.ip, self.port)
        )
        log.info(f"{self.name}: UDP endpoint ready → {self.ip}:{self.port}")

    async def set_group(self, group, level, fade_cs=50):
        """
        Set lighting group to level with fade time.
        group: Helvar group number
        level: 0-100 (percentage)
        fade_cs: fade time in centiseconds (50 = 0.5s)
        """
        cmd = f">V:1,C:13,G:{group},L:{level},F:{fade_cs}#"
        if self._transport:
            self._transport.sendto(cmd.encode())
            log.info(f"{self.name}: {cmd}")
        else:
            log.error(f"{self.name}: not connected")

    async def recall_block(self, block, scene, fade_cs=50):
        """Recall a scene block (preset)."""
        cmd = f">V:1,C:11,B:{block},S:{scene},F:{fade_cs}#"
        if self._transport:
            self._transport.sendto(cmd.encode())
            log.info(f"{self.name}: {cmd}")

    async def disconnect(self):
        if self._transport:
            self._transport.close()
            self._transport = None

    def info(self):
        return {"type": "helvar_udp", "ip": self.ip, "port": self.port, "name": self.name}


# =============================================================================
# QueCore / CueCore — UDP port 7000
# ASCII commands for DMX and playback control
# =============================================================================

class QueCoreUDP:
    """Control Visual Productions QueCore/CueCore via UDP."""

    def __init__(self, ip, port=7000, name="QueCore"):
        self.ip = ip
        self.port = port
        self.name = name
        self._transport = None

    async def connect(self):
        loop = asyncio.get_event_loop()

        class Proto(asyncio.DatagramProtocol):
            def datagram_received(self, data, addr):
                log.debug(f"QueCore response from {addr}: {data}")

        self._transport, _ = await loop.create_datagram_endpoint(
            Proto, remote_addr=(self.ip, self.port)
        )
        log.info(f"{self.name}: UDP endpoint ready → {self.ip}:{self.port}")

    async def set_dmx(self, channel, value):
        """Set DMX channel (1-based) to value 0-255."""
        value = max(0, min(255, value))
        cmd = f"core-dmx-{channel}={value}"
        if self._transport:
            self._transport.sendto(cmd.encode())
            log.info(f"{self.name}: {cmd}")

    async def set_playback(self, pb, intensity):
        """Set playback intensity 0.0-1.0."""
        intensity = max(0.0, min(1.0, intensity))
        if intensity >= 1.0:
            val = "1.0"
        else:
            val = f"0.{int(intensity * 100):02d}"
        cmd = f"core-pb-{pb}-intensity={val}"
        if self._transport:
            self._transport.sendto(cmd.encode())
            log.info(f"{self.name}: {cmd}")

    async def disconnect(self):
        if self._transport:
            self._transport.close()
            self._transport = None

    def info(self):
        return {"type": "quecore_udp", "ip": self.ip, "port": self.port, "name": self.name}


# =============================================================================
# Panasonic Projector — TCP port 1024
# ASCII commands
# =============================================================================

class PanasonicProjector:
    """Control Panasonic projectors via TCP ASCII."""

    def __init__(self, ip, port=1024, name="Panasonic"):
        self.ip = ip
        self.port = port
        self.name = name

    async def _send(self, cmd):
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.ip, self.port), timeout=5
            )
            writer.write(f"{cmd}\r".encode())
            await writer.drain()
            resp = await asyncio.wait_for(reader.read(256), timeout=3)
            writer.close()
            await writer.wait_closed()
            return resp.decode(errors="replace").strip()
        except Exception as e:
            log.error(f"{self.name} ({self.ip}): {e}")
            return None

    async def power_on(self):
        return await self._send("00PON")

    async def power_off(self):
        return await self._send("00POF")

    async def av_mute_on(self):
        return await self._send("00OSH:1")

    async def av_mute_off(self):
        return await self._send("00OSH:0")

    async def query_power(self):
        return await self._send("00QPW")

    def info(self):
        return {"type": "panasonic", "ip": self.ip, "name": self.name}
