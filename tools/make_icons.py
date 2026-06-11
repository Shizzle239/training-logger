"""Generate PWA icons (barbell on dark bg) using only the Python stdlib.
Run from repo root:  python tools/make_icons.py
"""
import os
import struct
import zlib

BG = (15, 17, 21)        # #0f1115
BAR = (207, 214, 226)    # light gray
PLATE = (52, 210, 123)   # accent green


def write_png(path, w, h, pix):
    raw = b"".join(b"\x00" + bytes(pix[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(typ, data):
        out = struct.pack(">I", len(data)) + typ + data
        return out + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def rounded_rect_cov(px, py, cx, cy, hw, hh, r):
    """Coverage (0..1) of point in rounded rect via signed distance."""
    dx = abs(px - cx) - (hw - r)
    dy = abs(py - cy) - (hh - r)
    ox = max(dx, 0.0)
    oy = max(dy, 0.0)
    d = (ox * ox + oy * oy) ** 0.5 + min(max(dx, dy), 0.0) - r
    return min(1.0, max(0.0, 0.5 - d))


def make_icon(size, content_scale=1.0):
    s = float(size)
    cx = s / 2.0
    cy = s / 2.0
    k = content_scale

    def sc(v):  # scale relative unit -> px around center
        return v * s * k

    shapes = []
    # bar (drawn first, plates on top)
    shapes.append((BAR, cx, cy, sc(0.38), sc(0.030), sc(0.025)))
    # plates: (offset-from-center, half-width, half-height)
    for off, hw, hh in ((0.225, 0.042, 0.225), (0.315, 0.034, 0.16)):
        for sgn in (-1, 1):
            shapes.append((PLATE, cx + sgn * sc(off), cy, sc(hw), sc(hh), sc(0.02)))

    pix = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            r, g, b = BG
            px = x + 0.5
            py = y + 0.5
            for color, scx, scy, hw, hh, rad in shapes:
                c = rounded_rect_cov(px, py, scx, scy, hw, hh, rad)
                if c > 0:
                    r = r + (color[0] - r) * c
                    g = g + (color[1] - g) * c
                    b = b + (color[2] - b) * c
            i = (y * size + x) * 4
            pix[i] = int(r)
            pix[i + 1] = int(g)
            pix[i + 2] = int(b)
            pix[i + 3] = 255
    return pix


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    icons = os.path.join(os.path.dirname(here), "icons")
    os.makedirs(icons, exist_ok=True)
    write_png(os.path.join(icons, "icon-192.png"), 192, 192, make_icon(192))
    print("icon-192.png done")
    write_png(os.path.join(icons, "icon-512.png"), 512, 512, make_icon(512))
    print("icon-512.png done")
    write_png(os.path.join(icons, "maskable-512.png"), 512, 512, make_icon(512, content_scale=0.66))
    print("maskable-512.png done")


if __name__ == "__main__":
    main()
