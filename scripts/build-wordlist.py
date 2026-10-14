#!/usr/bin/env python3
# Build a frequency-ordered word list for audio generation.
# Reads ECDICT headwords, keeps plain lowercase words, ranks by wordfreq,
# and writes the top N to a wordlist file (one word per line).
import sys
import re
import json
from wordfreq import zipf_frequency

WORD_RE = re.compile(r"^[a-z]+$")


def main():
    ec = "data/import/ecdict.jsonl"
    top_n = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    out = sys.argv[2] if len(sys.argv) > 2 else "data/audio-words.txt"

    seen = set()
    with open(ec, encoding="utf-8") as f:
        for line in f:
            try:
                hw = json.loads(line)["headword"].strip().lower()
            except Exception:
                continue
            if WORD_RE.match(hw) and hw not in seen:
                seen.add(hw)

    print("candidate words:", len(seen), flush=True)
    scored = []
    for w in seen:
        try:
            z = zipf_frequency(w, "en")
        except Exception:
            z = 0.0
        scored.append((z, w))
    scored.sort(reverse=True)
    top = [w for z, w in scored[:top_n]]
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(top) + "\n")
    print("wrote %d words to %s" % (len(top), out))
    print("sample:", top[:20])


if __name__ == "__main__":
    main()
