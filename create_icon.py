"""
Creates electron/icon.ico using only Python stdlib (no Pillow needed).
Generates a multi-size ICO (16x16, 32x32, 48x48) with a blue badge.
"""
import struct
import math
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "electron", "icon.ico")


def _make_bmp_image(size: int) -> bytes:
    """Return a DIB (BITMAPINFOHEADER + XOR + AND) for a circular blue badge."""
    W = H = size

    # HERKO blue: #1e56db  →  BGRA bytes: 0xdb, 0x56, 0x1e, 0xff
    BG_B, BG_G, BG_R, BG_A = 0xDB, 0x56, 0x1E, 0xFF   # inside circle
    EM_B, EM_G, EM_R, EM_A = 0x00, 0x00, 0x00, 0x00    # outside (transparent)

    cx = cy = (W - 1) / 2.0
    radius = cx - 0.5

    # XOR map: 32-bit BGRA, bottom-up rows
    xor_rows = []
    for y in range(H - 1, -1, -1):
        row = bytearray()
        for x in range(W):
            if math.hypot(x - cx, y - cy) <= radius:
                row += bytes([BG_B, BG_G, BG_R, BG_A])
            else:
                row += bytes([EM_B, EM_G, EM_R, EM_A])
        xor_rows.append(bytes(row))
    xor_data = b"".join(xor_rows)

    # AND mask: 1-bit per pixel, 0 = opaque, 1 = transparent; rows padded to 4 bytes
    and_stride = ((W + 31) // 32) * 4
    and_rows = []
    for y in range(H - 1, -1, -1):
        bits = bytearray(and_stride)
        for x in range(W):
            if math.hypot(x - cx, y - cy) > radius:
                byte_idx = x // 8
                bit_idx = 7 - (x % 8)
                bits[byte_idx] |= 1 << bit_idx
        and_rows.append(bytes(bits))
    and_data = b"".join(and_rows)

    # BITMAPINFOHEADER (40 bytes)
    dib_header = struct.pack(
        "<IiiHHIIiiII",
        40,             # biSize
        W,              # biWidth
        H * 2,          # biHeight (XOR + AND combined)
        1,              # biPlanes
        32,             # biBitCount
        0,              # biCompression (BI_RGB)
        len(xor_data),  # biSizeImage
        0, 0,           # biXPelsPerMeter, biYPelsPerMeter
        0, 0,           # biClrUsed, biClrImportant
    )
    return dib_header + xor_data + and_data


def create_ico(path: str, sizes=(16, 32, 48)):
    images = [(s, _make_bmp_image(s)) for s in sizes]
    count = len(images)

    # ICONDIR
    icon_dir = struct.pack("<HHH", 0, 1, count)

    # Calculate where image data starts
    # ICONDIR(6) + count * ICONDIRENTRY(16)
    data_offset = 6 + count * 16

    entries = b""
    for size, data in images:
        w = size if size < 256 else 0  # 256 stored as 0
        entries += struct.pack(
            "<BBBBHHII",
            w, w,           # width, height
            0,              # color count (0 = more than 256 or 32-bit)
            0,              # reserved
            1,              # planes
            32,             # bit count
            len(data),      # size of image data
            data_offset,    # offset from beginning of file
        )
        data_offset += len(data)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(icon_dir)
        f.write(entries)
        for _, data in images:
            f.write(data)

    size_kb = os.path.getsize(path) // 1024
    print(f"Icon created: {path}  ({size_kb} KB, sizes={sizes})")


if __name__ == "__main__":
    # electron-builder requires at least 256x256
    create_ico(OUT_PATH, sizes=(16, 32, 48, 256))
