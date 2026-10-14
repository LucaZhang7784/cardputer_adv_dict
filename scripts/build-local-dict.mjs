// Build compact on-device dictionary packs (SD-card format) from the prepared JSONL.
// Non-destructive: reads data/import/*.jsonl, writes data/local/*.
// Output format is documented in Dict/DESIGN.md.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const OUT = process.env.DICT_OUT_DIR || "data/local";
const IN = process.env.DICT_IN_DIR || "data/import";
const MIN_KEY = 16;

async function loadJsonl(file) {
  const text = await readFile(file, "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

// Normalize a word headword into a byte-sortable UTF-8 key.
function keyBytes(s) {
  return Buffer.from(s.normalize("NFC"), "utf8");
}

// Stable sort by multiple byte-key columns.
function sortBy(rows, keyOf) {
  return rows
    .map((row, i) => ({ row, i, keys: keyOf(row) }))
    .sort((a, b) => {
      for (let k = 0; k < a.keys.length; k++) {
        const cmp = Buffer.compare(a.keys[k], b.keys[k]);
        if (cmp) return cmp;
      }
      return a.i - b.i;
    })
    .map((x) => x.row);
}

// Compute max byte width of a key column, rounded up to 4, with a minimum.
function keyWidth(rows, keyOf) {
  let max = 0;
  for (const row of rows) {
    const len = keyOf(row).length;
    if (len > max) max = len;
  }
  const w = Math.max(MIN_KEY, max + 1);
  return Math.ceil(w / 4) * 4;
}

function writeU32(buf, off, v) { buf.writeUInt32LE(v >>> 0, off); }
function writeU16(buf, off, v) { buf.writeUInt16LE(v & 0xffff, off); }

// Build one dictionary: <base>.idx + <base>.dat. Returns { count, keyW, bytes }.
async function buildDict(base, rows, { keyOf, recordOf }) {
  const sorted = sortBy(rows, keyOf);
  const K = keyWidth(sorted, (r) => keyOf(r)[0]);
  const recSize = K + 6;
  const idxPath = path.join(OUT, base + ".idx");
  const datPath = path.join(OUT, base + ".dat");

  const idxStream = createWriteStream(idxPath);
  const datStream = createWriteStream(datPath);
  let dataOffset = 0;

  for (const row of sorted) {
    const rec = recordOf(row); // fresh Buffer per call
    const key = keyOf(row)[0];
    const idxBuf = Buffer.alloc(recSize); // fresh per record: streams hold references
    key.copy(idxBuf, 0, 0, Math.min(key.length, K));
    idxBuf.fill(0, key.length, K);
    writeU32(idxBuf, K, dataOffset);
    writeU16(idxBuf, K + 4, rec.length);
    if (!idxStream.write(idxBuf)) await new Promise((r) => idxStream.once("drain", r));

    if (!datStream.write(rec)) await new Promise((r) => datStream.once("drain", r));
    dataOffset += rec.length;
  }
  await new Promise((r) => idxStream.end(r));
  await new Promise((r) => datStream.end(r));

  return { count: sorted.length, keyW: K, recordSize: recSize, dataBytes: dataOffset };
}

function cstr(s) { return Buffer.from(s ?? "", "utf8"); }
function cdefs(arr, sep) {
  return cstr((Array.isArray(arr) ? arr : []).join(sep));
}

// en-zh record: headword \0 phonetic \0 definitions
function enRecord(row) {
  const headword = cstr(row.headword);
  const phonetic = cstr(row.phonetic);
  const defs = cdefs(row.definitions, "\n");
  return Buffer.concat([headword, Buffer.from([0]), phonetic, Buffer.from([0]), defs]);
}
// zh-en record: headword \0 phonetic \0 definitions
function zhRecord(row) {
  const headword = cstr(row.headword);
  const phonetic = cstr(row.phonetic);
  const defs = cdefs(row.definitions, "; ");
  return Buffer.concat([headword, Buffer.from([0]), phonetic, Buffer.from([0]), defs]);
}

// pinyin index: [pinyin P][headword H][offset u32][len u16], sorted (pinyin, headword)
async function buildPinyinIndex(base, rows, { keyOf, recordOf }) {
  const sorted = sortBy(rows, keyOf);
  const P = keyWidth(sorted, (r) => keyOf(r)[0]);
  const H = keyWidth(sorted, (r) => keyOf(r)[1]);
  const recSize = P + H + 6;
  const idxPath = path.join(OUT, base + ".pinyin.idx");

  const stream = createWriteStream(idxPath);
  for (const row of sorted) {
    const [pin, head] = keyOf(row);
    const rec = recordOf(row);
    const buf = Buffer.alloc(recSize); // fresh per record: streams hold references
    pin.copy(buf, 0, 0, Math.min(pin.length, P));
    buf.fill(0, pin.length, P);
    head.copy(buf, P, 0, Math.min(head.length, H));
    buf.fill(0, P + head.length, P + H);
    writeU32(buf, P + H, row._offset);
    writeU16(buf, P + H + 4, rec.length);
    if (!stream.write(buf)) await new Promise((r) => stream.once("drain", r));
  }
  await new Promise((r) => stream.end(r));
  return { count: sorted.length, pinyinW: P, headW: H, recordSize: recSize };
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function run() {
  await mkdir(OUT, { recursive: true });
  console.error("Loading ECDICT JSONL...");
  const enRows = await loadJsonl(path.join(IN, "ecdict.jsonl"));
  console.error("Loading CC-CEDICT JSONL...");
  const zhRows = await loadJsonl(path.join(IN, "cc-cedict.jsonl"));

  console.error("Building en-zh...");
  const en = await buildDict("en-zh", enRows, {
    keyOf: (r) => [keyBytes(r.headword.toLowerCase()), keyBytes(r.headword)],
    recordOf: enRecord
  });
  console.error("Building zh-en...");
  const zh = await buildDict("zh-en", zhRows, {
    keyOf: (r) => [keyBytes(r.headword), keyBytes(r.phonetic)],
    recordOf: zhRecord
  });

  // pinyin index reuses zh-en .dat offsets; recompute offsets deterministically.
  // Re-run the zh-en sort to get offsets aligned with zh-en.idx.
  const zhSorted = sortBy(zhRows, (r) => [keyBytes(r.headword), keyBytes(r.phonetic)]);
  let off = 0;
  const pinyinRows = [];
  for (const row of zhSorted) {
    const rec = zhRecord(row);
    pinyinRows.push({ ...row, _offset: off, _len: rec.length });
    off += rec.length;
  }
  console.error("Building zh-en pinyin index...");
  const pinyin = await buildPinyinIndex("zh-en", pinyinRows, {
    keyOf: (r) => [keyBytes(r.normalizedPhonetic || ""), keyBytes(r.headword)],
    recordOf: (r) => zhRecord(r)
  });

  const files = ["en-zh.idx", "en-zh.dat", "zh-en.idx", "zh-en.dat", "zh-en.pinyin.idx"];
  const hashes = {};
  for (const f of files) hashes[f] = await sha256(path.join(OUT, f));

  const manifest = {
    format: "cardputer-dict-local-v1",
    generated: new Date().toISOString(),
    enZh: {
      source: "ECDICT@bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
      license: "MIT",
      attribution: "ECDICT (skywind3000/ECDICT), pinned commit bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
      count: en.count,
      keyWidth: en.keyW,
      indexRecordSize: en.recordSize,
      dataBytes: en.dataBytes
    },
    zhEn: {
      source: "CC-CEDICT@20261013",
      license: "CC BY-SA 4.0",
      attribution: "CC-CEDICT, MDBG snapshot 2026-10-13",
      count: zh.count,
      keyWidth: zh.keyW,
      indexRecordSize: zh.recordSize,
      dataBytes: zh.dataBytes,
      pinyin: {
        pinyinWidth: pinyin.pinyinW,
        headWidth: pinyin.headW,
        indexRecordSize: pinyin.recordSize,
        count: pinyin.count
      }
    },
    sha256: hashes
  };
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.error("en-zh:", en.count, "entries, idx", en.recordSize, "B/rec, dat", en.dataBytes, "B");
  console.error("zh-en:", zh.count, "entries, idx", zh.recordSize, "B/rec, dat", zh.dataBytes, "B");
  console.error("pinyin:", pinyin.count, "entries, rec", pinyin.recordSize, "B");
  console.log(JSON.stringify(manifest));
}

run().catch((e) => { console.error(e); process.exit(1); });
