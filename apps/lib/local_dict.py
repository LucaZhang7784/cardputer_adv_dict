# local_dict.py — offline dictionary lookup over SD-card packs.
# Format: Dict/DESIGN.md. Sorted fixed-width index + binary search, O(log n).
# Memory stays constant: only one fixed-width index record (~110–134 B) and one
# data record (<= ~1 KB) are buffered at a time. Never loads the whole index.
#
# Install to /flash/libs/local_dict.py so other apps can reuse it:
#   from libs.local_dict import DictPack
#   d = DictPack('/sd/cardputer/dictionary')
#   d.lookup('en-zh', 'apple')      -> [ (headword, phonetic, definitions), ... ]
#   d.lookup('zh-en', '安全')        -> [ (headword, phonetic, definitions), ... ]
#   d.suggest_pinyin('anquan', 12)  -> [ '安全', '安全掣', ... ]
import struct


class DictPack:
    def __init__(self, base):
        self.base = base
        import json
        with open(base + "/manifest.json", "r") as f:
            m = json.load(f)
        self.en = m["enZh"]
        self.zh = m["zhEn"]

    # ---- index primitives (mirror scripts/verify-local-dict.mjs) ----

    @staticmethod
    def _cmp_key(buf, target, keyw):
        # Compare fixed-width (0x00-padded) record key against target bytes.
        n = len(target) if len(target) < keyw else keyw
        for i in range(n):
            b = buf[i]
            t = target[i]
            if b < t:
                return -1
            if b > t:
                return 1
        if len(target) < keyw:
            return 0 if buf[len(target)] == 0 else 1
        return 0

    @staticmethod
    def _key_matches(buf, target):
        for i in range(len(target)):
            if buf[i] != target[i]:
                return False
        return buf[len(target)] == 0

    @staticmethod
    def _prefix_matches(buf, prefix):
        for i in range(len(prefix)):
            if buf[i] != prefix[i]:
                return False
        return True

    @staticmethod
    def _lower_bound(f, count, recsize, keyw, target):
        lo, hi = 0, count
        buf = bytearray(recsize)
        while lo < hi:
            mid = (lo + hi) // 2
            f.seek(mid * recsize)
            f.readinto(buf)
            if DictPack._cmp_key(buf, target, keyw) < 0:
                lo = mid + 1
            else:
                hi = mid
        return lo

    @staticmethod
    def _read_record(dat_path, offset, length):
        with open(dat_path, "rb") as f:
            f.seek(offset)
            data = f.read(length)
        i1 = data.find(b"\x00")
        i2 = data.find(b"\x00", i1 + 1)
        return (data[:i1].decode("utf-8"),
                data[i1 + 1:i2].decode("utf-8"),
                data[i2 + 1:].decode("utf-8"))

    # ---- public API ----

    def lookup(self, direction, word, max_results=3):
        if direction == "en-zh":
            meta = self.en
            key = word.lower().encode("utf-8")
            idx = self.base + "/en-zh.idx"
            dat = self.base + "/en-zh.dat"
        elif direction == "zh-en":
            meta = self.zh
            key = word.encode("utf-8")
            idx = self.base + "/zh-en.idx"
            dat = self.base + "/zh-en.dat"
        else:
            raise ValueError("direction")
        recsize = meta["indexRecordSize"]
        keyw = meta["keyWidth"]
        count = meta["count"]
        results = []   # common words (lowercase pinyin)
        proper = []    # proper nouns (capitalized pinyin, e.g. Apple company)
        fallback = []  # cross-reference ("see ...") entries
        with open(idx, "rb") as f:
            i = self._lower_bound(f, count, recsize, keyw, key)
            buf = bytearray(recsize)
            while i < count:
                f.seek(i * recsize)
                f.readinto(buf)
                if not self._key_matches(buf, key):
                    break
                off = struct.unpack_from("<I", buf, keyw)[0]
                ln = struct.unpack_from("<H", buf, keyw + 4)[0]
                rec = self._read_record(dat, off, ln)
                defs = rec[2]
                ph = rec[1]
                if defs.startswith("see "):
                    fallback.append(rec)
                elif direction == "zh-en" and ph and "A" <= ph[0] <= "Z":
                    proper.append(rec)   # proper noun: demote below common words
                else:
                    results.append(rec)
                i += 1
        # Return ALL matching senses in a sensible order (common -> proper ->
        # cross-reference); the app pages through them, so nothing is dropped.
        return (results + proper + fallback)[:max_results]

    def suggest_pinyin(self, pinyin, limit=12):
        meta = self.zh["pinyin"]
        recsize = meta["indexRecordSize"]
        pw = meta["pinyinWidth"]
        hw = meta["headWidth"]
        count = meta["count"]
        idx = self.base + "/zh-en.pinyin.idx"
        prefix = pinyin.lower().encode("utf-8")
        heads = []
        seen = set()
        with open(idx, "rb") as f:
            i = self._lower_bound(f, count, recsize, pw, prefix)
            buf = bytearray(recsize)
            while i < count and len(heads) < limit:
                f.seek(i * recsize)
                f.readinto(buf)
                if not self._prefix_matches(buf, prefix):
                    break
                h = buf[pw:pw + hw]
                e = h.find(b"\x00")
                word = h[:e].decode("utf-8")
                if word not in seen:
                    seen.add(word)
                    heads.append(word)
                i += 1
        return heads
