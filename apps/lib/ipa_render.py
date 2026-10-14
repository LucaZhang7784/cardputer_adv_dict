# ipa_render.py — draw phonetic strings without loadFont.
# ASCII characters use the built-in DejaVu12 font; IPA glyphs are drawn from a
# pre-rendered 1bpp bitmap table (ipa_bitmap.py). This avoids loadFont entirely,
# which corrupts EFontCN24 rendering on UIFlow2.5.3.
import M5
from M5 import Widgets
from libs.ipa_bitmap import GLYPHS, GLYPH_H

_FONT_ASCII = None


def _ascii_font():
    global _FONT_ASCII
    if _FONT_ASCII is None:
        _FONT_ASCII = Widgets.FONTS.DejaVu12
    return _FONT_ASCII


def _draw_bitmap(lcd, hx, w, x, y, color):
    rows = bytes.fromhex(hx)
    row_bytes = (w + 7) // 8
    for r in range(GLYPH_H):
        base = r * row_bytes
        col = 0
        while col < w:
            bit = (rows[base + col // 8] >> (7 - col % 8)) & 1
            if bit:
                start = col
                while col < w and ((rows[base + col // 8] >> (7 - col % 8)) & 1):
                    col += 1
                lcd.fillRect(x + start, y + r, col - start, 1, color)
            else:
                col += 1


def _draw_run(lcd, seg, cx, y):
    lcd.setCursor(cx, y)
    lcd.print(seg)
    return cx + lcd.textWidth(seg)


def draw_ipa(lcd, s, x, y, color=0xFFFFFF):
    """Draw a phonetic string at (x, y). Returns the x cursor after drawing."""
    cx = x
    i = 0
    n = len(s)
    while i < n:
        cp = ord(s[i])
        if cp < 128:
            j = i
            while j < n and ord(s[j]) < 128:
                j += 1
            lcd.setFont(_ascii_font())
            cx = _draw_run(lcd, s[i:j], cx, y)
            i = j
        elif 0x4E00 <= cp <= 0x9FFF:
            # CJK run (e.g. 英/美/意 labels in ECDICT phonetics) -> EFontCN24
            j = i
            while j < n and 0x4E00 <= ord(s[j]) <= 0x9FFF:
                j += 1
            lcd.setFont(Widgets.FONTS.EFontCN24)
            cx = _draw_run(lcd, s[i:j], cx, y)
            i = j
        else:
            g = GLYPHS.get(cp)
            if g is not None:
                w, hx = g
                _draw_bitmap(lcd, hx, w, cx, y, color)
                cx += w + 1
            else:
                cx += 12  # unknown glyph: leave a gap
            i += 1
    return cx
