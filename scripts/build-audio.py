#!/usr/bin/env python3
# Generate US-English pronunciation audio via Piper TTS (batch, single model load).
# Output: 48 kHz / 16-bit mono WAV (matches the Cardputer Speaker default rate).
#
# Usage: python scripts/build-audio.py <wordlist.txt> <out_dir>
import sys
import os
import io
import wave
import numpy as np
from piper import PiperVoice

MODEL = "data/audio-models/en_US-lessac-medium.onnx"
TARGET_RATE = 48000

_voice = None


def get_voice():
    global _voice
    if _voice is None:
        _voice = PiperVoice.load(MODEL)
    return _voice


def synth_int16(word):
    """Return (sample_rate, int16 mono numpy array) for a word."""
    chunks = list(get_voice().synthesize(word))
    audio = np.concatenate([c.audio_float_array for c in chunks])
    int16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    return chunks[0].sample_rate, int16


def resample(audio, rate, target_rate):
    if rate == target_rate:
        return audio
    n = int(len(audio) * target_rate / rate)
    return np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.int16)


def build_wav(word):
    rate, audio = synth_int16(word)
    audio = resample(audio, rate, TARGET_RATE)
    # Fade out the last 10 ms to silence.
    fade_n = int(TARGET_RATE * 0.01)
    if fade_n > 0 and len(audio) > fade_n:
        fade = np.linspace(1.0, 0.0, fade_n).astype(np.float32)
        audio = audio.astype(np.float32)
        audio[-fade_n:] *= fade
        audio = audio.astype(np.int16)
    # Append 100 ms silence so end-of-buffer pop is inaudible.
    pad_n = int(TARGET_RATE * 0.1)
    audio = np.concatenate([audio, np.zeros(pad_n, dtype=np.int16)])
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setframerate(TARGET_RATE)
        w.setsampwidth(2)
        w.writeframes(audio.tobytes())
    return out.getvalue()


def fname(word):
    name = "".join(ch if ch.isalnum() else "_" for ch in word.lower())
    # Windows reserves DOS device basenames (even when an extension follows).
    if name in ("aux", "con", "nul", "prn") or (
        len(name) == 4 and name[:3] in ("com", "lpt") and name[3] in "123456789"
    ):
        name = "_" + name
    return name + ".wav"


def main():
    words_file = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    words = [ln.strip() for ln in open(words_file, encoding="utf-8") if ln.strip()]
    ok = fail = 0
    for word in words:
        try:
            wav = build_wav(word)
            with open(os.path.join(out_dir, fname(word)), "wb") as f:
                f.write(wav)
            ok += 1
        except Exception as e:
            fail += 1
            print("FAIL %s: %s" % (word, e))
        if (ok + fail) % 100 == 0:
            print("progress: %d ok / %d fail" % (ok, fail), flush=True)
    print("done: %d ok, %d fail" % (ok, fail))


if __name__ == "__main__":
    main()
