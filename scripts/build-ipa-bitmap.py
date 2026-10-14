#!/usr/bin/env python3
# Render IPA glyphs to a 1bpp bitmap table (Python module) so the device can
# draw phonetics WITHOUT loadFont (which corrupts EFontCN24 rendering).
import json
from PIL import Image, ImageDraw, ImageFont

FONT = "C:/Windows/Fonts/DejaVuSans.ttf"
SIZE = 16
OUT = "apps/lib/ipa_bitmap.py"

# Only the IPA/Latin/Greek glyphs actually present in ECDICT phonetics.
# ASCII is rendered by DejaVu12, CJK by EFontCN24, Cyrillic lookalikes are
# mapped away at display time. Keeping this list small is critical: the device
# has only ~41 KB of free heap.
cps = [
    0x00E6,  # æ
    0x00F0,  # ð
    0x014B,  # ŋ
    0x0250, 0x0251, 0x0252, 0x0254, 0x0259, 0x025A,  # ɐ ɑ ɒ ɔ ə ɚ
    0x025B, 0x025C, 0x025D,  # ɛ ɜ ɝ
    0x0261, 0x026A,  # ɡ ɪ
    0x0275, 0x0279,  # ɵ ɹ
    0x0283, 0x028A, 0x028C, 0x0292,  # ʃ ʊ ʌ ʒ
    0x02C8, 0x02CA, 0x02CC, 0x02D0,  # ˈ ˊ ˌ ː
    0x03B8, 0x03B5,  # θ ε
]
cps = sorted(set(cps))

font = ImageFont.truetype(FONT, SIZE)
glyphs = []
for cp in cps:
    ch = chr(cp)
    bbox = font.getbbox(ch)
    if bbox is None or (bbox[2] - bbox[0]) <= 0 or (bbox[3] - bbox[1]) <= 0:
        continue
    w = bbox[2] - bbox[0]
    img = Image.new("1", (w, SIZE), 0)
    d = ImageDraw.Draw(img)
    d.text((-bbox[0], -bbox[1]), ch, font=font, fill=1)
    glyphs.append((cp, w, img.tobytes().hex()))

lines = [
    "# Auto-generated IPA glyph bitmap table (1bpp). Do not edit by hand.",
    "# Each entry: codepoint -> (width, hex_of_bitmap_rows). Height fixed at 16.",
    "GLYPH_H = 16",
    "GLYPHS = {",
]
for cp, w, hx in glyphs:
    lines.append(f'  0x{cp:x}: ({w}, "{hx}"),')
lines.append("}")
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print(f"wrote {OUT} with {len(glyphs)} glyphs")
