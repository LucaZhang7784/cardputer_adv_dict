// Build a small deterministic sample pack (test words + random sample) for
// device-side verification of the binary-search lookup without a full transfer.
// Writes data/sample/*.jsonl; then build with:
//   DICT_IN_DIR=data/sample DICT_OUT_DIR=data/sample-built node scripts/build-local-dict.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const IN = "data/import";
const OUT = "data/sample";
const RANDOM = 500; // random rows per direction
const SEED = 20261014;

const EN_TEST = ["aero", "apple", "hello", "china", "book", "good", "abandon", "zoo", "a", "zzz", "water", "dictionary"];
const ZH_TEST = ["安全", "安全带", "安全帽", "中国", "中国银行", "苹果", "你好", "词典", "电脑", "爱", "学习", "110", "水", "字典"];

// Deterministic PRNG (mulberry32) so the sample is reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function sample(lines, testWords, rand) {
  const picked = new Map();
  for (const line of lines) {
    let head = "";
    try { head = JSON.parse(line).headword ?? ""; } catch { continue; }
    if (testWords.includes(head)) picked.set(line, true);
  }
  // random fill
  const rng = mulberry32(rand);
  const indices = [...lines.keys()];
  while (picked.size < testWords.length + RANDOM) {
    const i = indices[(rng() * indices.length) | 0];
    picked.set(lines[i], true);
  }
  return [...picked.keys()];
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const en = (await readFile(`${IN}/ecdict.jsonl`, "utf8")).split(/\r?\n/).filter(Boolean);
  const zh = (await readFile(`${IN}/cc-cedict.jsonl`, "utf8")).split(/\r?\n/).filter(Boolean);
  const enOut = await sample(en, EN_TEST, SEED);
  const zhOut = await sample(zh, ZH_TEST, SEED + 1);
  await writeFile(`${OUT}/ecdict.jsonl`, enOut.join("\n") + "\n", "utf8");
  await writeFile(`${OUT}/cc-cedict.jsonl`, zhOut.join("\n") + "\n", "utf8");
  console.error(`sample en-zh: ${enOut.length} rows, zh-en: ${zhOut.length} rows`);
}

run().catch((e) => { console.error(e); process.exit(1); });
