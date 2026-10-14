import { readFile } from "node:fs/promises";

export function makeImportRow(row) {
  const headword = String(row.headword ?? "").normalize("NFC").trim();
  const direction = row.direction;
  const definitions = Array.isArray(row.definitions)
    ? row.definitions.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (!headword || !["en-zh", "zh-en"].includes(direction) || !definitions.length) {
    throw new Error("invalid dictionary row");
  }
  const normalizedHeadword = direction === "en-zh" ? headword.toLowerCase() : headword;
  const normalizedPhonetic = String(row.normalizedPhonetic ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const source = String(row.source ?? "").trim();
  const sourceLicense = String(row.sourceLicense ?? "").trim();
  const attribution = String(row.attribution ?? "").trim();
  if (!source || !sourceLicense || !attribution) throw new Error("missing source metadata");

  return {
    headword,
    normalizedHeadword,
    direction,
    phonetic: String(row.phonetic ?? ""),
    normalizedPhonetic,
    definitions: JSON.stringify(definitions),
    source,
    sourceLicense,
    attribution
  };
}

export async function parseJsonl(text) {
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid JSONL at line ${index + 1}: ${error.message}`);
    }
    rows.push(makeImportRow(parsed));
  }
  return rows;
}

export async function loadJsonl(path) {
  return parseJsonl(await readFile(path, "utf8"));
}

export async function importRows(db, rows, batchSize = 50) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error("batchSize must be between 1 and 50");
  }
  let written = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const statements = batch.map((row) => db.prepare(`INSERT INTO entries
      (headword, normalized_headword, direction, phonetic, normalized_phonetic,
       definitions, source, source_license, attribution, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(direction, source, normalized_headword, normalized_phonetic)
      DO UPDATE SET headword=excluded.headword, phonetic=excluded.phonetic,
        definitions=excluded.definitions, source_license=excluded.source_license,
        attribution=excluded.attribution, is_demo=0`)
      .bind(row.headword, row.normalizedHeadword, row.direction, row.phonetic,
        row.normalizedPhonetic, row.definitions, row.source, row.sourceLicense, row.attribution));
    const result = await db.batch(statements);
    written += batch.length;
    if (!Array.isArray(result) || result.length !== batch.length || result.some((item) => item?.success === false)) {
      throw new Error(`D1 batch failed at row ${offset + 1}`);
    }
  }
  return written;
}
