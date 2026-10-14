# pinyin_ime.py — lightweight reusable pinyin input method.
# Backed by DictPack.suggest_pinyin; holds no dictionary of its own.
# Real-time candidates: refresh on every keystroke (local binary search).
#
#   ime = PinyinIME(dict_pack)
#   ime.type_char('z'); ime.type_char('h'); ...  ime.page() -> ['中', '种', ...]
try:
    from libs.cn_common import COMMON_BITMAP, CJK_START, CJK_N
except ImportError:
    COMMON_BITMAP = None


def _renderable(word):
    if COMMON_BITMAP is None:
        return True
    for ch in word:
        idx = ord(ch) - CJK_START
        if 0 <= idx < CJK_N:
            if not ((COMMON_BITMAP[idx // 8] >> (idx % 8)) & 1):
                return False
    return True


class PinyinIME:
    def __init__(self, dict_pack, page_size=3, max_candidates=24):
        self.dict = dict_pack
        self.page_size = page_size
        self.max_candidates = max_candidates
        self.reset()

    def reset(self):
        self.buffer = ""
        self.candidates = []
        self.offset = 0
        self.selected = None

    def type_char(self, ch):
        if len(self.buffer) < 32 and "a" <= ch <= "z":
            self.buffer += ch
            self.candidates = []
            self.offset = 0

    def refresh(self):
        self._refresh()

    def backspace(self):
        if self.buffer:
            self.buffer = self.buffer[:-1]
            self._refresh()

    def _refresh(self):
        if len(self.buffer) >= 2:
            # fetch more than needed, then drop glyphs the device font can't render
            cands = self.dict.suggest_pinyin(self.buffer, self.max_candidates * 3)
            if COMMON_BITMAP is not None:
                cands = [c for c in cands if _renderable(c)]
            self.candidates = cands[:self.max_candidates]
        else:
            self.candidates = []
        self.offset = 0

    def page(self):
        end = self.offset + self.page_size
        return self.candidates[self.offset:end]

    def page_num(self):
        if not self.candidates:
            return 0
        return (self.offset // self.page_size) + 1

    def page_count(self):
        if not self.candidates:
            return 0
        return (len(self.candidates) + self.page_size - 1) // self.page_size

    def next_page(self):
        if self.candidates:
            self.offset = min(self.offset + self.page_size, len(self.candidates) - self.page_size)

    def prev_page(self):
        self.offset = max(0, self.offset - self.page_size)

    # pick the 1-based index within the current page; commits the candidate.
    def pick(self, index):
        pos = self.offset + index - 1
        if 0 <= pos < len(self.candidates):
            self.selected = self.candidates[pos]
            self.candidates = []
            return self.selected
        return None
