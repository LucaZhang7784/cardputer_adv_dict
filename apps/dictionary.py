# UIFlow2.0 Cardputer ADV — offline bilingual dictionary app.
# Reads the SD-card pack via libs/local_dict (binary search, no network).
# Chinese pinyin input is local and real-time via libs/pinyin_ime.
# Pronunciation: US-English only (no British, no Mandarin) — audio pack comes
# in a later stage; until then the Speak key reports "audio not ready".

import sys
import gc
import os
import time
import M5
from M5 import Widgets, Speaker
from hardware import MatrixKeyboard

DICT_DIR = "/sd/cardputer/dictionary"
AUDIO_DIR = DICT_DIR + "/audio"
VOLUME = 200  # 0-255

# ---- state ----
query = ""
direction = "en-zh"
last_word = ""
last_direction = ""
last_entries = []       # list of (headword, phonetic, definitions)
result_index = 0        # current sense being shown
page = "search"         # search | candidates | result
status = "SD mounting..."
running = True
d = None                # DictPack
ime = None              # PinyinIME
ipa_render = None
COMMON_BITMAP = None
CJK_START = 0x4E00
CJK_N = 0
sd_ok = False


def mount_sd():
    # M5.begin() can reset the SPI bus, leaving a stale empty /sd mount. Always
    # re-mount and verify the data directory actually appears.
    try:
        if "cardputer" in os.listdir("/sd"):
            return True
    except Exception:
        pass
    try:
        os.umount("/sd")
    except Exception:
        pass
    try:
        import machine
        sd = machine.SDCard(slot=3, width=1, sck=40, miso=39, mosi=14, cs=12, freq=20000000)
        os.mount(sd, "/sd")
        return "cardputer" in os.listdir("/sd")
    except Exception:
        return False


def normalize_phonetic(s):
    # ECDICT stores IPA glyphs as Cyrillic lookalikes / full-width punctuation.
    # Map them to canonical codepoints the bitmap/ASCII font can render.
    m = {0x04D9: 0x0259,  # Cyrillic ә -> schwa ə
         0x0454: 0x025B,  # Cyrillic є -> open e ɛ
         0x0439: None,    # Cyrillic й -> drop
         0x00A0: 0x20,    # nbsp -> space
         0xFF08: 0x28, 0xFF09: 0x29,  # full-width parens
         0xFF1B: 0x3B, 0xFF0C: 0x2C,  # full-width ; ,
         0x00B4: 0x27, 0x02B9: 0x27, 0x2019: 0x27,  # accents -> '
         0x2011: 0x2D,    # non-breaking hyphen -> -
         0xE143: None,    # private-use -> drop
         0x00E3: 0x61, 0x012D: 0x69, 0x016B: 0x75, 0x00E9: 0x65}  # ã ĩ ū é
    out = []
    for ch in s:
        cp = ord(ch)
        if cp in m:
            if m[cp] is not None:
                out.append(chr(m[cp]))
        else:
            out.append(ch)
    return "".join(out)


def clean_gloss(s):
    # Strip CC-CEDICT classifier note ("; CL:...") which contains CJK glyphs the
    # small ASCII font can't render; keep the English gloss itself.
    i = s.find("; CL:")
    if i > 0:
        s = s[:i]
    return s


def use_font(name):
    if name == "cn":
        M5.Lcd.setFont(Widgets.FONTS.EFontCN24)
    else:
        M5.Lcd.setFont(Widgets.FONTS.DejaVu12)


def filter_renderable(s):
    # Drop CJK glyphs the device font can't render (traditional/rare chars),
    # keeping ASCII and GB2312 level-1 CJK so mixed EN/CN glosses stay readable.
    if COMMON_BITMAP is None:
        return s
    out = []
    for ch in s:
        cp = ord(ch)
        if cp < 128:
            out.append(ch)
        elif CJK_START <= cp < CJK_START + CJK_N:
            if (COMMON_BITMAP[(cp - CJK_START) // 8] >> ((cp - CJK_START) % 8)) & 1:
                out.append(ch)
        else:
            out.append(ch)
    return "".join(out)


def draw():
    Widgets.fillScreen(0x000000)
    M5.Lcd.setTextColor(0xFFFFFF, 0x000000)
    M5.Lcd.setTextSize(1)

    if page == "candidates":
        use_font("en")
        M5.Lcd.setCursor(8, 4)
        M5.Lcd.print(("Pinyin: " + ime.buffer)[:26])
        use_font("cn")
        for index, cand in enumerate(ime.page()):
            M5.Lcd.setCursor(8, 24 + index * 28)
            M5.Lcd.print(str(index + 1) + " " + cand[:8])
        use_font("en")
        M5.Lcd.setCursor(8, 118)
        M5.Lcd.print("1-3 select  ,/. page  Back edit")
        return

    use_font("en")
    M5.Lcd.setCursor(8, 8)
    M5.Lcd.print("Dictionary  " + ("EN->CN" if direction == "en-zh" else "CN->EN"))

    if page == "search":
        M5.Lcd.setCursor(8, 34)
        if direction == "zh-en":
            use_font("cn")
            M5.Lcd.print("> " + query[-8:])
            use_font("en")
            M5.Lcd.setCursor(8, 50)
            M5.Lcd.print(("Pinyin: " + (ime.buffer if ime else ""))[:26])
            M5.Lcd.setCursor(8, 70)
            M5.Lcd.print(status[:32])
        else:
            M5.Lcd.print("> " + query[-28:])
            M5.Lcd.setCursor(8, 62)
            M5.Lcd.print(status[:32])
        M5.Lcd.setCursor(8, 104)
        M5.Lcd.print(("Type pinyin, Space: choose" if direction == "zh-en" else "Type word, Enter to search"))
        M5.Lcd.setCursor(8, 120)
        M5.Lcd.print("Tab: EN/CN  Esc: menu")
        return

    # result page
    if last_direction == "zh-en":
        use_font("cn")
        M5.Lcd.setCursor(8, 24)
        M5.Lcd.print(last_word[:8])
    else:
        use_font("en")
        M5.Lcd.setCursor(8, 24)
        M5.Lcd.print(last_word[:28])

    if last_entries:
        entry = last_entries[result_index]
        definitions = entry[2]
        if last_direction == "zh-en":
            # CN->EN: skip the pinyin line; show the English gloss in the small font.
            use_font("en")
            M5.Lcd.setCursor(8, 52)
            M5.Lcd.print(clean_gloss(definitions)[:64])
        else:
            # EN->CN: IPA phonetic + Chinese gloss.
            if ipa_render is not None:
                ipa_render.draw_ipa(M5.Lcd, normalize_phonetic(entry[1])[:31], 8, 52)
            use_font("cn" if any(ord(c) > 0x2E80 for c in definitions) else "en")
            M5.Lcd.setCursor(8, 68)
            M5.Lcd.print(definitions[:9] if any(ord(c) > 0x2E80 for c in definitions) else definitions[:32])
    else:
        use_font("en")
        M5.Lcd.setCursor(8, 52)
        M5.Lcd.print(status[:34])

    use_font("en")
    M5.Lcd.setCursor(8, 98)
    if len(last_entries) > 1:
        M5.Lcd.print("S%d/%d  [ ]: page" % (result_index + 1, len(last_entries)))
    elif last_direction == "en-zh":
        M5.Lcd.print("1 Speak(US)  2 Search")
    else:
        M5.Lcd.print("2 Search")  # no Mandarin pronunciation
    M5.Lcd.setCursor(8, 118)
    M5.Lcd.print("3 Home")


def do_lookup(word):
    global status, last_word, last_direction, last_entries, result_index, page
    if not d:
        status = "No SD dictionary"
        return
    word = word.strip()
    if not word:
        status = "Type a word first"
        return
    results = d.lookup(direction, word, 10)
    if not results:
        status = "No entry found"
        last_word = ""
        last_entries = []
        result_index = 0
    else:
        last_word = word
        last_direction = direction
        last_entries = results
        result_index = 0
        status = "Found"
    page = "result"


def audio_filename(word):
    # MicroPython str has no isalnum(); check ASCII ranges manually.
    out = []
    for ch in word.lower():
        o = ord(ch)
        out.append(ch if (48 <= o <= 57) or (97 <= o <= 122) else "_")
    name = "".join(out)
    # Windows reserves DOS device basenames (even when an extension follows).
    # Prefix those WAVs so Git/LFS and SD-card copies work on Windows too.
    if name in ("aux", "con", "nul", "prn") or (
        len(name) == 4 and name[:3] in ("com", "lpt") and name[3] in "123456789"
    ):
        name = "_" + name
    return name + ".wav"


def do_speak():
    global status
    if not last_word:
        status = "Search a word first"
        return
    if last_direction != "en-zh":
        status = "No Chinese audio"  # US-only requirement
        return
    path = AUDIO_DIR + "/" + audio_filename(last_word)
    try:
        if not Speaker.isRunning():
            Speaker.begin()
        Speaker.playWavFile(path)
        status = "Playing"
    except Exception:
        status = "Audio missing"


def on_key(value):
    global query, direction, status, page, last_word, last_entries, result_index, last_direction, running
    if value == 27:  # Esc -> exit to launcher
        running = False
        return
    if value == 9:  # Tab toggles EN/CN
        direction = "zh-en" if direction == "en-zh" else "en-zh"
        query = ""
        if ime:
            ime.reset()
        page = "search"
        status = "Type pinyin" if direction == "zh-en" else "Type an English word"
        draw()
        return

    if page == "candidates":
        if ord("1") <= value <= ord("3"):
            sel = ime.pick(value - ord("1") + 1)
            if sel:
                query += sel      # accumulate the chosen word
                ime.reset()       # clear pinyin buffer, ready for next word
                page = "search"
                status = "Enter: search" if query else "Type pinyin"
                draw()
                return
        elif 65 <= value <= 90 or 97 <= value <= 122:
            ime.type_char(chr(value).lower())
            ime.refresh()
        elif value == 32:
            ime.refresh()
        elif value in (ord("."), 183, 182):  # . / right / down -> next page
            ime.next_page()
        elif value in (ord(","), 180, 181):  # , / left / up -> prev page
            ime.prev_page()
        elif value in (8, 127):
            ime.backspace()
            if not ime.buffer:
                page = "search"
                status = "Edit pinyin"
        draw()
        return

    if page == "result":
        if value in (93, 182, 183, 46):  # ] / down / right / . -> next sense
            if result_index < len(last_entries) - 1:
                result_index += 1
        elif value in (91, 181, 180, 44):  # [ / up / left / , -> prev sense
            if result_index > 0:
                result_index -= 1
        elif value == ord("1") and last_direction == "en-zh":
            do_speak()
        elif value == ord("2"):
            page = "search"
            status = "Edit, then Enter"
        elif value == ord("3"):
            page = "search"
            query = ""
            if ime:
                ime.reset()
            direction = "en-zh"
            last_word = ""
            last_entries = []
            result_index = 0
            status = "Ready"
        draw()
        return

    # search page
    if value in (10, 13):  # Enter
        do_lookup(query)
    elif value in (8, 127):  # Backspace
        if direction == "zh-en" and ime and ime.buffer:
            ime.backspace()
        elif query:
            query = query[:-1]
            if direction == "zh-en":
                ime.reset()
        status = ""
    elif direction == "zh-en":
        if value == 32:  # Space -> show candidates
            if ime and ime.buffer:
                ime.refresh()
                if ime.candidates:
                    page = "candidates"
                    status = ""
                else:
                    status = "No candidate"
        elif 65 <= value <= 90 or 97 <= value <= 122:
            if ime:
                ime.type_char(chr(value).lower())
                status = ""
    elif 32 <= value <= 126:
        query += chr(value)
        status = ""
    draw()


def normalize_key(event):
    # UIFlow2.5.3 Tab is HID 43, colliding with ASCII '+'; use physical position.
    return 9 if (event.row, event.col) == (1, 0) else event.keycode


def read_key():
    driver = kb._keyboard
    if hasattr(driver, "_keyevents"):
        return normalize_key(driver._keyevents.pop(0)) if driver._keyevents else None
    return kb.get_key()


# ---- boot ----
M5.begin()
M5.Lcd.setRotation(1)
Widgets.fillScreen(0x000000)
M5.Lcd.setTextColor(0xFFFFFF, 0x000000)
M5.Lcd.setTextSize(1)

try:
    Speaker.setVolume(VOLUME)
except Exception:
    pass

sd_ok = mount_sd()

if "/flash/libs" not in sys.path:
    sys.path.append("/flash/libs")

try:
    from libs import ipa_render
except Exception:
    ipa_render = None

try:
    from libs.cn_common import COMMON_BITMAP, CJK_START, CJK_N
except Exception:
    COMMON_BITMAP = None

if sd_ok:
    try:
        from libs.local_dict import DictPack
        from libs.pinyin_ime import PinyinIME
        d = DictPack(DICT_DIR)
        ime = PinyinIME(d)
        status = "Ready"
    except Exception as e:
        status = "Dict init failed"
else:
    status = "SD mount failed"

kb = MatrixKeyboard()
kb.set_callback(None)
draw()

while running:
    M5.update()
    kb.tick()
    value = read_key()
    if value:
        on_key(value)
    if M5.BtnA.wasClicked():
        running = False
    time.sleep_ms(20)

# exit: clear the screen fully so the launcher redraws clean (no residual).
Widgets.fillScreen(0x000000)
gc.collect()
