#!/usr/bin/env python3
"""Write the small Tauri icon set used by the Plein Mac app."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "app" / "src-tauri" / "icons"


def chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def png(width: int, height: int) -> bytes:
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            inset = min(width, height) // 6
            inside = inset <= x < width - inset and inset <= y < height - inset
            if inside:
                row.extend((10, 132, 255))
            else:
                row.extend((29, 29, 31))
        rows.append(bytes(row))
    raw = b"".join(rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def ico(image: bytes, width: int, height: int) -> bytes:
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", width % 256, height % 256, 0, 0, 1, 32, len(image), 22)
    return header + entry + image


def icns(images: dict[bytes, bytes]) -> bytes:
    body = b""
    for tag, data in images.items():
        body += tag + struct.pack(">I", 8 + len(data)) + data
    return b"icns" + struct.pack(">I", 8 + len(body)) + body


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    sizes = {
        32: png(32, 32),
        128: png(128, 128),
        256: png(256, 256),
        512: png(512, 512),
    }
    (ICONS / "32x32.png").write_bytes(sizes[32])
    (ICONS / "128x128.png").write_bytes(sizes[128])
    (ICONS / "icon.png").write_bytes(sizes[512])
    (ICONS / "icon.ico").write_bytes(ico(sizes[32], 32, 32))
    (ICONS / "icon.icns").write_bytes(
        icns(
            {
                b"ic11": sizes[32],
                b"ic07": sizes[128],
                b"ic08": sizes[256],
                b"ic09": sizes[512],
            }
        )
    )


if __name__ == "__main__":
    main()
