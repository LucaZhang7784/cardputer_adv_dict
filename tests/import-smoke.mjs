import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeImportRow, parseJsonl, importRows } from "../src/import.js";

const fixture = await readFile(new URL("./import-fixture.jsonl", import.meta.url), "utf8");
const rows = await parseJsonl(fixture);
assert.equal(rows.length, 2);
assert.equal(rows[0].normalizedHeadword, "apple");
assert.equal(rows[1].normalizedPhonetic, "pingguo");
assert.throws(() => makeImportRow({ headword: "x", direction: "en-zh", definitions: ["test"] }), /metadata/);
await assert.rejects(() => parseJsonl('{"headword":'), /line 1/);

const data = new Map();
const db = {
  prepare(sql) {
    return { sql, values: [], bind(...values) { this.values = values; return this; } };
  },
  async batch(statements) {
    for (const statement of statements) {
      const [headword, normalizedHeadword, direction, phonetic, normalizedPhonetic,
        definitions, source, sourceLicense, attribution] = statement.values;
      const key = [direction, source, normalizedHeadword, normalizedPhonetic].join("\0");
      data.set(key, { headword, normalizedHeadword, direction, phonetic,
        normalizedPhonetic, definitions, source, sourceLicense, attribution, is_demo: 0 });
    }
    return statements.map(() => ({ success: true }));
  }
};

assert.equal(await importRows(db, rows, 1), 2);
assert.equal(await importRows(db, rows, 1), 2);
assert.equal(data.size, 2, "re-import must update existing rows, not duplicate them");
assert.equal([...data.values()].filter((entry) => entry.is_demo).length, 0);
await assert.rejects(() => importRows(db, rows, 51), /batchSize/);
console.log("Dictionary import smoke check passed (format, metadata, batching, repeat-import idempotence).");
