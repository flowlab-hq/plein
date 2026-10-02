#!/usr/bin/env python3
"""Rasterize the locked B2 Plein mark into the Tauri Mac icon set.

Dock, Finder, and About read `app/src-tauri/icons/icon.icns`. The DMG
bundler copies that same file and passes it to `bundle_dmg` as `--volicon`,
so the volume icon and the app inside the installer window match. The in-app
toolbar uses the same geometry as a vector at `app/ui/mark.svg`, so the
18px chrome mark stays sharp on retina instead of downsampling a PNG.
Browser and shared preview (`npm run app:preview`, served from `app/ui`)
get the same raster as `app/ui/favicon.ico`, so the tab icon is the B2
mark and `/favicon.ico` is not a 404.

Geometry is the B2 monogram (off-white rounded tile, blue open P, coral
node) traced from `scripts/mac/assets/plein-logo-B2.jpg`. The curves are
embedded below so this script stays stdlib-only and does not upscale the
JPEG. Every PNG is 8-bit RGBA: Tauri's generate_context! rejects anything
else (`icon …/32x32.png is not RGBA`).
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "app" / "src-tauri" / "icons"
TOOLBAR_MARK = ROOT / "app" / "ui" / "mark.svg"
PREVIEW_FAVICON = ROOT / "app" / "ui" / "favicon.ico"
# Plate side the corner radius and node were measured on.
PLATE = 524

# PNG IHDR color type 6 = RGBA.
PNG_COLOR_TYPE_RGBA = 6

# Plate measured on the locked JPEG: origin (378, 80), side 524.
# Corner radius 125px on that side. Colors are the median of interior pixels.
PLATE_RGB = (251, 249, 250)
BLUE_RGB = (17, 112, 254)
CORAL_RGB = (254, 111, 101)
CORNER = 125 / 524

# Coral node: centroid and bbox radius, in tile units.
DOT = (0.448186, 0.773338, 0.057252)

# Open-P outline, tile units, origin top-left, y down.
# potrace alphamax=1, opttolerance=0.2 on the blue mask. One simple curve
# (the counter opens through the gap beside the node, so there is no hole).
P_START = (0.260273, 0.831294)
P_SEGS = [
    ("C", (0.249244, 0.826158), (0.241817, 0.817534), (0.238748, 0.806298)),
    ("C", (0.237283, 0.800935), (0.236665, 0.713780), (0.236671, 0.513359)),
    ("L", (0.236679, 0.228053), (0.241286, 0.218157)),
    ("C", (0.244477, 0.211305), (0.248390, 0.206609), (0.254009, 0.202890)),
    ("L", (0.262124, 0.197519), (0.429249, 0.196990)),
    ("C", (0.534893, 0.196656), (0.600991, 0.197170), (0.608925, 0.198387)),
    ("C", (0.638740, 0.202963), (0.672209, 0.215938), (0.698473, 0.233101)),
    ("C", (0.718063, 0.245903), (0.750936, 0.280238), (0.763803, 0.301336)),
    ("C", (0.817670, 0.389660), (0.806970, 0.499071), (0.737084, 0.574555)),
    ("C", (0.706030, 0.608096), (0.660252, 0.632568), (0.611961, 0.641443)),
    ("C", (0.605488, 0.642633), (0.568797, 0.644144), (0.530426, 0.644800)),
    ("L", (0.460661, 0.645992), (0.446456, 0.653047)),
    ("C", (0.430074, 0.661183), (0.416340, 0.673574), (0.404388, 0.691003)),
    ("L", (0.395992, 0.703244), (0.395422, 0.654580)),
    ("C", (0.394803, 0.601718), (0.396128, 0.589225), (0.403997, 0.573695)),
    ("C", (0.410264, 0.561327), (0.425107, 0.545792), (0.436668, 0.539499)),
    ("C", (0.454843, 0.529608), (0.463145, 0.528626), (0.528626, 0.528626)),
    ("C", (0.576570, 0.528626), (0.591185, 0.528029), (0.600105, 0.525706)),
    ("C", (0.647859, 0.513267), (0.681782, 0.469301), (0.681782, 0.419847)),
    ("C", (0.681782, 0.372537), (0.651971, 0.331693), (0.605587, 0.315453)),
    ("L", (0.590649, 0.310222), (0.472328, 0.310168)),
    ("L", (0.354008, 0.310115), (0.353053, 0.560115)),
    ("C", (0.352345, 0.745784), (0.351526, 0.811097), (0.349870, 0.813931)),
    ("C", (0.346018, 0.820528), (0.335207, 0.829841), (0.327828, 0.832919)),
    ("C", (0.322619, 0.835091), (0.313997, 0.835873), (0.295386, 0.835859)),
    ("C", (0.272709, 0.835843), (0.269009, 0.835362), (0.260273, 0.831294)),
]

# Supersample the master, then box-filter down. 1024 is the retina @2x
# size macOS wants for a 512pt icon (ic10).
MASTER = 1024
SUPERSAMPLE = 4

# icns OSTypes. Retina entries share pixels with the 1x size (ic13 is
# 128pt @2x = 256px, same bitmap as ic08). minimumSystemVersion is 12,
# which reads PNG-encoded icns.
ICNS_ENTRIES = (
    (b"icp4", 16),
    (b"icp5", 32),
    (b"ic11", 32),
    (b"icp6", 64),
    (b"ic12", 64),
    (b"ic07", 128),
    (b"ic08", 256),
    (b"ic13", 256),
    (b"ic09", 512),
    (b"ic14", 512),
    (b"ic10", 1024),
)


def chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def png(width: int, height: int, rgba: bytes) -> bytes:
    if len(rgba) != width * height * 4:
        raise SystemExit(f"RGBA buffer is {len(rgba)} bytes, expected {width * height * 4}")
    rows = []
    stride = width * 4
    for y in range(height):
        rows.append(b"\x00" + rgba[y * stride : (y + 1) * stride])
    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, PNG_COLOR_TYPE_RGBA, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def png_info(data: bytes) -> tuple[int, int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise SystemExit("not a PNG")
    width, height, bit, color = struct.unpack(">IIBB", data[16:26])
    return width, height, color


def ico(images: list[tuple[int, bytes]]) -> bytes:
    """PNG-in-ICO. Width byte 0 means 256, which is the largest classic slot."""
    count = len(images)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = b""
    blobs = b""
    for size, image in images:
        byte = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", byte, byte, 0, 0, 1, 32, len(image), offset)
        offset += len(image)
        blobs += image
    return header + entries + blobs


def icns(images: dict[bytes, bytes]) -> bytes:
    body = b""
    for tag, data in images.items():
        body += tag + struct.pack(">I", 8 + len(data)) + data
    return b"icns" + struct.pack(">I", 8 + len(body)) + body


def _mid(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _dist_to_chord(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    den = dx * dx + dy * dy
    if den == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def _flatten_cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    tol: float,
    out: list[tuple[float, float]],
) -> None:
    if _dist_to_chord(p1, p0, p3) <= tol and _dist_to_chord(p2, p0, p3) <= tol:
        out.append(p3)
        return
    p01, p12, p23 = _mid(p0, p1), _mid(p1, p2), _mid(p2, p3)
    p012, p123 = _mid(p01, p12), _mid(p12, p23)
    p0123 = _mid(p012, p123)
    _flatten_cubic(p0, p01, p012, p0123, tol, out)
    _flatten_cubic(p0123, p123, p23, p3, tol, out)


def monogram_points(size: int) -> list[tuple[float, float]]:
    pts = [(P_START[0] * size, P_START[1] * size)]
    cx, cy = pts[0]
    for seg in P_SEGS:
        kind = seg[0]
        if kind == "L":
            corner = (seg[1][0] * size, seg[1][1] * size)
            end = (seg[2][0] * size, seg[2][1] * size)
            if math.hypot(corner[0] - cx, corner[1] - cy) > 1e-3:
                pts.append(corner)
            pts.append(end)
            cx, cy = end
        else:
            p1 = (seg[1][0] * size, seg[1][1] * size)
            p2 = (seg[2][0] * size, seg[2][1] * size)
            p3 = (seg[3][0] * size, seg[3][1] * size)
            _flatten_cubic((cx, cy), p1, p2, p3, 0.35, pts)
            cx, cy = p3
    if math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1e-3:
        pts.pop()
    return pts


def tile_points(size: int) -> list[tuple[float, float]]:
    radius = CORNER * size
    steps = 48

    def arc(cx: float, cy: float, a0: float, a1: float) -> list[tuple[float, float]]:
        return [
            (cx + radius * math.cos(a0 + (a1 - a0) * i / steps), cy + radius * math.sin(a0 + (a1 - a0) * i / steps))
            for i in range(steps + 1)
        ]

    # Screen y grows downward. Each arc runs from the incoming flat side to the next.
    pts: list[tuple[float, float]] = []
    pts += arc(radius, radius, math.pi, 1.5 * math.pi)
    pts += arc(size - radius, radius, 1.5 * math.pi, 2 * math.pi)
    pts += arc(size - radius, size - radius, 0, 0.5 * math.pi)
    pts += arc(radius, size - radius, 0.5 * math.pi, math.pi)
    return pts


def circle_points(size: int) -> list[tuple[float, float]]:
    cx, cy, radius = DOT
    steps = 96
    return [
        ((cx + radius * math.cos(2 * math.pi * i / steps)) * size, (cy + radius * math.sin(2 * math.pi * i / steps)) * size)
        for i in range(steps)
    ]


def rasterize(points: list[tuple[float, float]], size: int) -> bytearray:
    """Even-odd fill. Pixel is covered when its center lies inside the polygon."""
    mask = bytearray(size * size)
    edges = []
    count = len(points)
    for i in range(count):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % count]
        if y0 != y1:
            edges.append((x0, y0, x1, y1))
    for y in range(size):
        sy = y + 0.5
        xs = []
        for x0, y0, x1, y1 in edges:
            if (y0 <= sy < y1) or (y1 <= sy < y0):
                xs.append(x0 + (sy - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        row = y * size
        for i in range(0, len(xs) - 1, 2):
            left = max(0, math.ceil(xs[i] - 0.5))
            right = min(size, math.floor(xs[i + 1] - 0.5) + 1)
            if right > left:
                mask[row + left : row + right] = b"\x01" * (right - left)
    return mask


def coverage(mask: bytearray, big: int, scale: int) -> bytearray:
    size = big // scale
    area = scale * scale
    out = bytearray(size * size)
    for y in range(size):
        for x in range(size):
            total = 0
            for dy in range(scale):
                row = ((y * scale + dy) * big) + x * scale
                total += sum(mask[row : row + scale])
            out[y * size + x] = (total * 255 + area // 2) // area
    return out


def composite(plate: bytearray, blue: bytearray, coral: bytearray) -> bytearray:
    """Premultiplied RGBA. Later shapes paint over earlier ones."""
    count = len(plate)
    out = bytearray(count * 4)
    layers = ((plate, PLATE_RGB), (blue, BLUE_RGB), (coral, CORAL_RGB))
    for i in range(count):
        dr = dg = db = da = 0
        for cov_map, (sr, sg, sb) in layers:
            cov = cov_map[i]
            if cov == 0:
                continue
            inv = 255 - cov
            dr = (sr * cov + 127) // 255 + (dr * inv + 127) // 255
            dg = (sg * cov + 127) // 255 + (dg * inv + 127) // 255
            db = (sb * cov + 127) // 255 + (db * inv + 127) // 255
            da = cov + (da * inv + 127) // 255
        out[i * 4 : i * 4 + 4] = bytes((dr, dg, db, da))
    return out


def unpremultiply(premul: bytes) -> bytes:
    out = bytearray(len(premul))
    for i in range(0, len(premul), 4):
        r, g, b, a = premul[i : i + 4]
        if a == 0:
            continue
        out[i] = min(255, (r * 255 + a // 2) // a)
        out[i + 1] = min(255, (g * 255 + a // 2) // a)
        out[i + 2] = min(255, (b * 255 + a // 2) // a)
        out[i + 3] = a
    return bytes(out)


def halve(premul: bytes, width: int, height: int) -> tuple[bytes, int, int]:
    if width % 2 or height % 2:
        raise SystemExit(f"cannot halve {width}x{height}")
    nw, nh = width // 2, height // 2
    src = premul
    out = bytearray(nw * nh * 4)
    for y in range(nh):
        for x in range(nw):
            sr = sg = sb = sa = 0
            for dy in range(2):
                for dx in range(2):
                    i = ((y * 2 + dy) * width + (x * 2 + dx)) * 4
                    sr += src[i]
                    sg += src[i + 1]
                    sb += src[i + 2]
                    sa += src[i + 3]
            o = (y * nw + x) * 4
            out[o] = (sr + 2) // 4
            out[o + 1] = (sg + 2) // 4
            out[o + 2] = (sb + 2) // 4
            out[o + 3] = (sa + 2) // 4
    return bytes(out), nw, nh


def pixel(rgba: bytes, size: int, nx: float, ny: float) -> tuple[int, int, int, int]:
    x = min(size - 1, max(0, int(nx * size)))
    y = min(size - 1, max(0, int(ny * size)))
    i = (y * size + x) * 4
    return tuple(rgba[i : i + 4])  # type: ignore[return-value]


def assert_mark(rgba: bytes, size: int) -> None:
    corner = pixel(rgba, size, 0.0, 0.0)
    if corner[3] != 0:
        raise SystemExit(f"{size}px corner is opaque {corner}; tile should be rounded")
    if size < 32:
        blues = corals = 0
        for i in range(0, len(rgba), 4):
            r, g, b, a = rgba[i : i + 4]
            if a < 200:
                continue
            if b > 180 and r < 80:
                blues += 1
            if r > 200 and g < 170 and b < 170:
                corals += 1
        if blues < 4 or corals < 1:
            raise SystemExit(f"{size}px lost the monogram (blue={blues}, coral={corals})")
        return
    stem = pixel(rgba, size, 0.29, 0.55)
    if not (stem[2] > 200 and stem[0] < 60 and stem[3] == 255):
        raise SystemExit(f"{size}px stem is {stem}, expected solid blue")
    node = pixel(rgba, size, DOT[0], DOT[1])
    if not (node[0] > 220 and node[1] < 160 and node[2] < 160 and node[3] == 255):
        raise SystemExit(f"{size}px coral node is {node}")
    tile = pixel(rgba, size, 0.12, 0.50)
    if not (tile[0] > 240 and tile[1] > 240 and tile[3] == 255 and abs(tile[0] - tile[2]) < 8):
        raise SystemExit(f"{size}px tile is {tile}, expected off-white")


def _svg_coord(unit: float) -> str:
    text = f"{unit * PLATE:.3f}".rstrip("0").rstrip(".")
    return text or "0"


def toolbar_mark_svg() -> str:
    """B2 monogram as SVG. Same fills and curves as the Dock raster."""
    parts = [f"M {_svg_coord(P_START[0])} {_svg_coord(P_START[1])}"]
    for seg in P_SEGS:
        if seg[0] == "L":
            parts.append(f"L {_svg_coord(seg[1][0])} {_svg_coord(seg[1][1])}")
            parts.append(f"L {_svg_coord(seg[2][0])} {_svg_coord(seg[2][1])}")
        else:
            coords = " ".join(f"{_svg_coord(point[0])} {_svg_coord(point[1])}" for point in seg[1:])
            parts.append(f"C {coords}")
    plate = "#{:02x}{:02x}{:02x}".format(*PLATE_RGB)
    blue = "#{:02x}{:02x}{:02x}".format(*BLUE_RGB)
    coral = "#{:02x}{:02x}{:02x}".format(*CORAL_RGB)
    cx, cy, radius = DOT
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 524 524">\n'
        f'  <rect width="524" height="524" rx="{round(CORNER * PLATE)}" fill="{plate}"/>\n'
        f'  <path fill="{blue}" d="{" ".join(parts)} Z"/>\n'
        f'  <circle cx="{_svg_coord(cx)}" cy="{_svg_coord(cy)}" r="{_svg_coord(radius)}" fill="{coral}"/>\n'
        "</svg>\n"
    )


def render_master() -> dict[int, bytes]:
    big = MASTER * SUPERSAMPLE
    plate = coverage(rasterize(tile_points(big), big), big, SUPERSAMPLE)
    blue = coverage(rasterize(monogram_points(big), big), big, SUPERSAMPLE)
    coral = coverage(rasterize(circle_points(big), big), big, SUPERSAMPLE)
    premul = composite(plate, blue, coral)
    straight = unpremultiply(premul)
    assert_mark(straight, MASTER)
    sizes = {MASTER: straight}
    width = height = MASTER
    current = premul
    while width > 16:
        current, width, height = halve(current, width, height)
        image = unpremultiply(current)
        assert_mark(image, width)
        sizes[width] = image
    return sizes


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    mark = toolbar_mark_svg()
    for color in ("#fbf9fa", "#1170fe", "#fe6f65"):
        if color not in mark:
            raise SystemExit(f"toolbar mark SVG is missing {color}")
    TOOLBAR_MARK.write_text(mark)
    sizes = render_master()
    encoded = {size: png(size, size, image) for size, image in sizes.items()}
    for size, blob in encoded.items():
        width, height, color = png_info(blob)
        if (width, height, color) != (size, size, PNG_COLOR_TYPE_RGBA):
            raise SystemExit(f"{size}px PNG header is {width}x{height} color {color}")

    (ICONS / "32x32.png").write_bytes(encoded[32])
    (ICONS / "128x128.png").write_bytes(encoded[128])
    (ICONS / "128x128@2x.png").write_bytes(encoded[256])
    (ICONS / "icon.png").write_bytes(encoded[1024])
    ico_bytes = ico([(size, encoded[size]) for size in (256, 128, 64, 32, 16)])
    (ICONS / "icon.ico").write_bytes(ico_bytes)
    # Same bytes the Mac app icon uses. Preview is a static server rooted at
    # app/ui, and browsers request /favicon.ico when the document does not
    # name another icon — or even when they do, as a fallback.
    PREVIEW_FAVICON.write_bytes(ico_bytes)
    (ICONS / "icon.icns").write_bytes(icns({tag: encoded[size] for tag, size in ICNS_ENTRIES}))

    icns_bytes = (ICONS / "icon.icns").read_bytes()
    if icns_bytes[:4] != b"icns":
        raise SystemExit("icon.icns missing magic")
    total = struct.unpack(">I", icns_bytes[4:8])[0]
    if total != len(icns_bytes):
        raise SystemExit(f"icon.icns length {len(icns_bytes)} != header {total}")
    found = set()
    cursor = 8
    while cursor < total:
        tag = icns_bytes[cursor : cursor + 4]
        length = struct.unpack(">I", icns_bytes[cursor + 4 : cursor + 8])[0]
        payload = icns_bytes[cursor + 8 : cursor + length]
        width, height, color = png_info(payload)
        if color != PNG_COLOR_TYPE_RGBA or width != height:
            raise SystemExit(f"icns {tag!r} is {width}x{height} color {color}")
        found.add((tag, width))
        cursor += length
    expected = set(ICNS_ENTRIES)
    if found != expected:
        raise SystemExit(f"icns entries {found} != {expected}")


if __name__ == "__main__":
    main()
