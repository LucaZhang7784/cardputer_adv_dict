import { createReadStream } from "node:fs";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

const ECDICT_SOURCE = "ECDICT@bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b";
const ECDICT_ATTRIBUTION = "ECDICT (skywind3000/ECDICT), pinned commit bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b";
const CEDICT_SOURCE = "CC-CEDICT@20261013";
const CEDICT_ATTRIBUTION = "CC-CEDICT, MDBG snapshot 2026-10-13";
const OUT = "data/import";

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value); value = "";
    } else value += char;
  }
  if (quoted) throw new Error("unterminated CSV quoted field");
  values.push(value);
  return values;
}

function asJsonl(row, stream) {
  stream.write(`${JSON.stringify(row)}\n`);
}

async function prepareEcdict(path) {
  const input = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  const output = createWriteStream(`${OUT}/ecdict.jsonl`, { encoding: "utf8" });
  let header;
  let count = 0;
  for await (const line of input) {
    if (!header) { header = parseCsvLine(line); continue; }
    if (!line) continue;
    const values = parseCsvLine(line);
    const row = Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
    const headword = row.word?.trim();
    const definitions = row.translation?.split(/\r?\n/).map((part) => part.trim()).filter(Boolean) ?? [];
    if (!headword || !definitions.length) continue;
    asJsonl({
      headword,
      direction: "en-zh",
      phonetic: row.phonetic || "",
      normalizedPhonetic: "",
      definitions: [definitions.join("\n")],
      source: ECDICT_SOURCE,
      sourceLicense: "MIT",
      attribution: ECDICT_ATTRIBUTION
    }, output);
    count++;
    if (count % 100000 === 0) process.stderr.write(`ECDICT normalized ${count}\n`);
  }
  output.end();
  await new Promise((resolve, reject) => { output.on("finish", resolve); output.on("error", reject); });
  return count;
}

function normalizePinyin(syllables) {
  const numberless = syllables.toLowerCase().replace(/[1-5]/g, "");
  return numberless.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/g, "");
}

async function prepareCedict(path, gzip) {
  const input = createInterface({
    input: gzip ? createGunzipStream(path) : createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  const output = createWriteStream(`${OUT}/cc-cedict.jsonl`, { encoding: "utf8" });
  const pattern = /^([^\s]+)\s+([^\s]+)\s+\[([^\]]+)\]\s+\/(.*)\/$/;
  let count = 0;
  for await (const line of input) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(pattern);
    if (!match) throw new Error(`unrecognized CC-CEDICT line: ${line.slice(0, 120)}`);
    const [, traditional, simplified, pinyin, rawDefinitions] = match;
    const definitions = rawDefinitions.split("/").map((part) => part.trim()).filter(Boolean);
    asJsonl({
      headword: simplified,
      direction: "zh-en",
      phonetic: pinyin,
      normalizedPhonetic: normalizePinyin(pinyin),
      definitions,
      source: CEDICT_SOURCE,
      sourceLicense: "CC BY-SA 4.0",
      attribution: CEDICT_ATTRIBUTION,
      traditional
    }, output);
    count++;
    if (count % 25000 === 0) process.stderr.write(`CC-CEDICT normalized ${count}\n`);
  }
  output.end();
  await new Promise((resolve, reject) => { output.on("finish", resolve); output.on("error", reject); });
  return count;
}

function createGunzipStream(path) {
  return createReadStream(path).pipe(createGunzip()).setEncoding("utf8");
}

await mkdir(OUT, { recursive: true });
const args = process.argv.slice(2);
const ecdictPath = args[0];
const cedictPath = args[1];
if (!ecdictPath || !cedictPath) {
  throw new Error("usage: node scripts/prepare-datasets.mjs <ecdict.csv> <cedict.txt-or-gz>");
}
const ecdictRows = await prepareEcdict(ecdictPath);
const cedictRows = await prepareCedict(cedictPath, cedictPath.toLowerCase().endsWith(".gz"));
await writeFile(`${OUT}/manifest.json`, `${JSON.stringify({
  ecdict: { source: ECDICT_SOURCE, rows: ecdictRows },
  ccCedict: { source: CEDICT_SOURCE, rows: cedictRows }
}, null, 2)}\n`, "utf8");
process.stdout.write(`Prepared ${ecdictRows} ECDICT rows and ${cedictRows} CC-CEDICT rows.\n`);
