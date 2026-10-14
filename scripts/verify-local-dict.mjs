// Independent read-only verification of the on-disk SD format.
// Mirrors the MicroPython access pattern: open file, seek to fixed-width
// index records, binary search the key column, then read the .dat record.
import { readFile, open } from "node:fs/promises";
import path from "node:path";

const OUT = process.env.DICT_OUT_DIR || "data/local";

function keyToBytes(s) { return Buffer.from(s.normalize("NFC"), "utf8"); }

// Fixed-width record read at index `i`.
async function readIndexRecord(fh, recSize, i, buf) {
  await fh.read(buf, 0, recSize, i * recSize);
  return buf;
}

// Compare fixed-width (0x00-padded) record key against a target byte string.
// Returns -1 (record < target), 0 (equal), or 1 (record > target).
function keyCompare(buf, keyBytes, keyLen) {
  const n = Math.min(keyBytes.length, keyLen);
  for (let i = 0; i < n; i++) {
    if (buf[i] !== keyBytes[i]) return buf[i] < keyBytes[i] ? -1 : 1;
  }
  if (keyBytes.length < keyLen) {
    // The key is 0x00-padded: an exact key has a 0x00 right after the bytes.
    return buf[keyBytes.length] === 0 ? 0 : 1;
  }
  return 0;
}

// Lower bound: first index whose key >= target.
async function lowerBound(fh, count, recSize, keyBytes, keyLen, buf) {
  let lo = 0, hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    await readIndexRecord(fh, recSize, mid, buf);
    const cmp = keyCompare(buf, keyBytes, keyLen);
    if (cmp < 0) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function matchKey(buf, keyBytes, keyLen) {
  if (keyBytes.length >= keyLen) return false;
  for (let i = 0; i < keyBytes.length; i++) if (buf[i] !== keyBytes[i]) return false;
  return buf[keyBytes.length] === 0;
}

function prefixMatch(buf, prefixBytes) {
  for (let i = 0; i < prefixBytes.length; i++) if (buf[i] !== prefixBytes[i]) return false;
  return true;
}

async function lookupDict(fhIdx, fhDat, meta, targetKey, { prefix = false } = {}) {
  const { count, recordSize, keyWidth } = meta;
  const keyBytes = keyToBytes(targetKey);
  const buf = Buffer.alloc(recordSize);
  let idx = await lowerBound(fhIdx, count, recordSize, keyBytes, keyWidth, buf);
  const results = [];
  const limit = prefix ? 12 : 8;
  while (idx < count && results.length < limit) {
    await readIndexRecord(fhIdx, recordSize, idx, buf);
    const ok = prefix ? prefixMatch(buf, keyBytes) : matchKey(buf, keyBytes, keyWidth);
    if (!ok) break;
    const offset = buf.readUInt32LE(keyWidth);
    const length = buf.readUInt16LE(keyWidth + 4);
    const dat = Buffer.alloc(length);
    await fhDat.read(dat, 0, length, offset);
    const parts = [];
    let start = 0;
    for (let i = 0; i <= dat.length; i++) {
      if (i === dat.length || dat[i] === 0) { parts.push(dat.slice(start, i).toString("utf8")); start = i + 1; if (parts.length === 3) break; }
    }
    results.push({ headword: parts[0], phonetic: parts[1], definitions: parts[2]?.slice(0, 80) });
    idx++;
  }
  return results;
}

async function lookupPinyin(fhIdx, meta, pinyinPrefix, limit = 12) {
  const { count, recordSize, pinyinWidth, headWidth } = meta;
  const prefix = keyToBytes(pinyinPrefix);
  const buf = Buffer.alloc(recordSize);
  let idx = await lowerBound(fhIdx, count, recordSize, prefix, pinyinWidth, buf);
  const results = [];
  while (idx < count && results.length < limit) {
    await readIndexRecord(fhIdx, recordSize, idx, buf);
    if (!prefixMatch(buf, prefix)) break;
    const head = buf.slice(pinyinWidth, pinyinWidth + headWidth);
    const headEnd = head.indexOf(0);
    results.push(head.slice(0, headEnd < 0 ? undefined : headEnd).toString("utf8"));
    idx++;
  }
  return results;
}

async function run() {
  const manifest = JSON.parse(await readFile(path.join(OUT, "manifest.json"), "utf8"));
  const en = manifest.enZh, zh = manifest.zhEn;

  const fhEnIdx = await open(path.join(OUT, "en-zh.idx"), "r");
  const fhEnDat = await open(path.join(OUT, "en-zh.dat"), "r");
  const fhZhIdx = await open(path.join(OUT, "zh-en.idx"), "r");
  const fhZhDat = await open(path.join(OUT, "zh-en.dat"), "r");
  const fhPin = await open(path.join(OUT, "zh-en.pinyin.idx"), "r");

  const checks = [];
  const enMeta = { count: en.count, recordSize: en.indexRecordSize, keyWidth: en.keyWidth };

  for (const word of ["aero", "apple", "China", "hello", "zzzzzzqqq"]) {
    const r = await lookupDict(fhEnIdx, fhEnDat, enMeta, word.toLowerCase());
    checks.push(`en "${word}" -> ${r.length ? r[0].headword + " | " + r[0].phonetic : "(not found)"}`);
  }

  const zhMeta = { count: zh.count, recordSize: zh.indexRecordSize, keyWidth: zh.keyWidth };
  for (const word of ["安全", "中国", "苹果", "不存在词"]) {
    const r = await lookupDict(fhZhIdx, fhZhDat, zhMeta, word);
    checks.push(`zh "${word}" -> ${r.length ? r[0].headword + " | " + r[0].phonetic + " | " + r[0].definitions : "(not found)"}`);
  }

  const pinMeta = { count: zh.pinyin.count, recordSize: zh.pinyin.indexRecordSize, pinyinWidth: zh.pinyin.pinyinWidth, headWidth: zh.pinyin.headWidth };
  for (const py of ["anquan", "zhongguo", "pinguo", "nihao"]) {
    const r = await lookupPinyin(fhPin, pinMeta, py);
    checks.push(`pinyin "${py}" -> [${r.slice(0, 8).join(", ")}${r.length > 8 ? ", ..." : ""}]`);
  }

  await Promise.all([fhEnIdx.close(), fhEnDat.close(), fhZhIdx.close(), fhZhDat.close(), fhPin.close()]);

  console.log("=== on-disk binary search verification ===");
  for (const c of checks) console.log("  " + c);
  console.log("en-zh entries:", en.count, "| zh-en entries:", zh.count, "| pinyin entries:", zh.pinyin.count);
}

run().catch((e) => { console.error(e); process.exit(1); });
