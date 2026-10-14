#!/usr/bin/env python3
# Push files from PC to the Cardputer ADV via raw REPL (pyserial, no mpremote).
# UIFlow2 boots into its launcher loop; Ctrl-C during boot drops it into raw REPL
# ("raw REPL; CTRL-B to exit"). We then exec code with the raw REPL protocol:
#   send code + Ctrl-D, read until "\x04" terminator.
#
# Usage:
#   python device_transfer.py COM4 <local_dir_or_file> <remote_dir>
import sys
import os
import time
import serial


def drain(s, dur=0.2):
    out = b""
    end = time.time() + dur
    while time.time() < end:
        while s.in_waiting:
            out += s.read(s.in_waiting)
        time.sleep(0.01)
    return out


def enter_raw_repl(s):
    # Try Ctrl-A first (already in raw repl).
    s.write(b"\x01")
    out = drain(s, 0.6)
    if b"raw REPL" in out:
        return
    # Otherwise soft-reset then interrupt boot into (normal or raw) repl.
    s.write(b"\x04")  # Ctrl-D soft reset
    time.sleep(0.35)
    s.write(b"\x03")  # Ctrl-C interrupt boot
    out = drain(s, 1.2)
    if b"raw REPL" in out:
        return
    if b">>>" in out:
        # normal REPL: Ctrl-A enters raw REPL
        s.write(b"\x01")
        out = drain(s, 0.6)
        if b"raw REPL" in out:
            return
    raise RuntimeError("could not enter raw REPL: %r" % out[-120:])


def raw_exec(s, code, timeout=10.0):
    s.write(code.encode() + b"\x04")
    out = b""
    end = time.time() + timeout
    while time.time() < end:
        while s.in_waiting:
            out += s.read(s.in_waiting)
        # raw REPL ends an exec with \x04; a fresh ">" prompt follows.
        if b"\x04" in out and (b"OK" in out or b"Traceback" in out):
            time.sleep(0.08)  # settle: let stdout + terminator arrive
            while s.in_waiting:
                out += s.read(s.in_waiting)
            return out
        time.sleep(0.02)
    return out


def write_file(s, remote, data):
    hx = data.hex()  # bytes.fromhex is builtin in MicroPython (no base64 module)
    raw_exec(s, "f=open(%r,'wb')" % remote)
    CHUNK = 720  # hex chars per write (360 data bytes); keeps each exec small
    for i in range(0, len(hx), CHUNK):
        raw_exec(s, "f.write(bytes.fromhex(%r))" % hx[i:i + CHUNK])
    raw_exec(s, "f.close()")
    r = raw_exec(s, "import os; print(os.stat(%r)[6])" % remote)
    return r


def main():
    port = sys.argv[1]
    src = sys.argv[2]
    remote_dir = sys.argv[3]
    s = serial.Serial(port, 115200, timeout=0.3, write_timeout=None)
    s.reset_input_buffer()

    print("entering raw REPL...", flush=True)
    enter_raw_repl(s)
    raw_exec(s, "import os")

    # M5.begin() initializes the SPI bus and auto-mounts SD on this firmware.
    raw_exec(s, "import M5; M5.begin()", timeout=8.0)
    r = raw_exec(s, "import os; os.listdir('/sd')", timeout=6.0)
    if b"ENODEV" in r or b"OSError" in r or b"Traceback" in r:
        print("mounting SD...", flush=True)
        r = raw_exec(s, "import os,machine; os.mount(machine.SDCard(slot=3, width=1, sck=40, miso=39, mosi=14, cs=12, freq=20000000),'/sd'); print(os.listdir('/sd'))", timeout=8.0)
    print("sd:", r.replace(b"\r", b"").replace(b"\n", b" ").decode("utf-8", "replace")[-160:], flush=True)

    files = []
    if os.path.isdir(src):
        for name in sorted(os.listdir(src)):
            p = os.path.join(src, name)
            if os.path.isfile(p):
                files.append((p, name))
    else:
        files.append((src, os.path.basename(src)))

    total = sum(os.path.getsize(p) for p, _ in files)
    print("transferring %d files, %d bytes -> %s" % (len(files), total, remote_dir), flush=True)
    # MicroPython os has no makedirs; mkdir single level (parent must exist).
    raw_exec(s, "import os\ntry:\n    os.mkdir(%r)\nexcept OSError:\n    pass" % remote_dir)

    done = 0
    for local, name in files:
        data = open(local, "rb").read()
        remote = remote_dir.rstrip("/") + "/" + name
        r = write_file(s, remote, data)
        done += len(data)
        tail = r.replace(b"\r", b"").replace(b"\n", b" ").decode("utf-8", "replace")
        print("  %-24s %8d B  %s" % (name, len(data), tail[-60:]), flush=True)
    print("done: %d/%d bytes" % (done, total), flush=True)
    s.close()


if __name__ == "__main__":
    main()
