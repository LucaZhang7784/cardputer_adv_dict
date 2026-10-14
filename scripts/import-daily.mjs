import { appendFile, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const TARGET_PER_DIRECTION = Number(process.env.IMPORT_TARGET_PER_DIRECTION ?? 30_000);
const DAY_LIMIT_ROWS_WRITTEN = Number(process.env.D1_DAILY_WRITE_BUDGET ?? 60_000);
const MAX_INPUT_ROWS = Number(process.env.IMPORT_MAX_ROWS ?? 2_000);
const LOCK_PATH = resolve("data/import/import.lock");
const STATE_PATH = resolve("data/import/state.json");
const LOG_PATH = resolve("data/import/daily-log.jsonl");
const MIGRATION_PATH = resolve("migrations/0003_add_import_identity.sql");

if (!Number.isInteger(DAY_LIMIT_ROWS_WRITTEN) || DAY_LIMIT_ROWS_WRITTEN < 1000 || DAY_LIMIT_ROWS_WRITTEN > 80_000) {
  throw new Error("D1 daily write budget must be between 1,000 and 80,000 rows, leaving free-tier headroom");
}
if (!Number.isInteger(TARGET_PER_DIRECTION) || TARGET_PER_DIRECTION < 1 || TARGET_PER_DIRECTION > 30_000) {
  throw new Error("IMPORT_TARGET_PER_DIRECTION must be between 1 and 30,000");
}
if (!Number.isInteger(MAX_INPUT_ROWS) || MAX_INPUT_ROWS < 1 || MAX_INPUT_ROWS > 2_000) {
  throw new Error("IMPORT_MAX_ROWS must be between 1 and 2,000");
}

await mkdir("data/import", { recursive: true });
let lock;
try {
  lock = await open(LOCK_PATH, "wx");
} catch {
  throw new Error("import lock exists; another import may be running");
}

try {
  const existing = await readFile(STATE_PATH, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return { ecdict: { offset: 0, complete: false }, ccCedict: { offset: 0, complete: false } };
    throw error;
  });
  const manifest = JSON.parse(await readFile("data/import/manifest.json", "utf8"));
  const sources = {
    ecdict: { path: "data/import/ecdict.jsonl", ...manifest.ecdict },
    ccCedict: { path: "data/import/cc-cedict.jsonl", ...manifest.ccCedict }
  };
  for (const [key, source] of Object.entries(sources)) {
    const rowReader = createInterface({ input: createReadStream(source.path, { encoding: "utf8" }), crlfDelay: Infinity });
    let fileRows = 0;
    for await (const line of rowReader) if (line.trim()) fileRows++;
    if (fileRows !== source.rows) throw new Error(`${key} dataset row count does not match manifest`);
    if (existing[key]?.source && existing[key].source !== source.source) throw new Error(`${key} source version changed; refuse resume`);
  }

  const dbName = process.env.CLOUDFLARE_D1_DATABASE ?? "cardputer-dictionary";
  if (!/^[A-Za-z0-9_-]+$/.test(dbName)) throw new Error("invalid D1 database name");
  const migration = await readFile(MIGRATION_PATH, "utf8");
  if (!migration.includes("entries_import_identity")) throw new Error("import identity migration is missing");
  const { execFileSync } = await import("node:child_process");
  // The upsert itself validates the unique index. A CLI preflight query is omitted
  // because Windows shell quoting can split SQL arguments into unsafe fragments.

  const todayUtc = new Date().toISOString().slice(0, 10);
  const priorLog = await readFile(LOG_PATH, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
  let usedRowsWritten = priorLog.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    .filter((record) => record.date?.slice(0, 10) === todayUtc)
    .reduce((total, record) => total + Number(record.rowsWritten || 0), 0);
  const results = [];
  let progressed;
  do {
    progressed = false;
    for (const key of ["ecdict", "ccCedict"]) {
    if (usedRowsWritten >= DAY_LIMIT_ROWS_WRITTEN) break;
    const source = sources[key];
    const state = existing[key] ?? { offset: 0, complete: false };
    const target = TARGET_PER_DIRECTION;
    if (state.complete || state.offset >= source.rows || state.offset >= target) continue;
    const allowance = Math.min(MAX_INPUT_ROWS, source.rows - state.offset, target - state.offset);
    const selected = [];
    const expectedDirection = key === "ecdict" ? "en-zh" : "zh-en";
    const stream = createInterface({ input: createReadStream(source.path, { encoding: "utf8" }), crlfDelay: Infinity });
    let index = 0;
    for await (const line of stream) {
      if (index >= state.offset && index < state.offset + allowance) {
        const row = JSON.parse(line);
        if (row.direction === expectedDirection) selected.push(row);
      }
      index++;
      if (index >= state.offset + allowance) break;
    }
    if (!selected.length) throw new Error(`${key} selected batch is empty`);
    const maxBatchWrites = selected.length * 4;
    if (usedRowsWritten + maxBatchWrites > DAY_LIMIT_ROWS_WRITTEN) continue;

    const sqlFile = resolve("data/import", `${key}-batch.sql`);
    const sql = selected.map((row) => {
      const esc = (value) => `'${String(value).replaceAll("'", "''")}'`;
      const normalizedHeadword = row.direction === "en-zh" ? row.headword.toLowerCase() : row.headword;
      const definitions = JSON.stringify(row.definitions);
      return `INSERT INTO entries (headword, normalized_headword, direction, phonetic, normalized_phonetic, definitions, source, source_license, attribution, is_demo) VALUES (${esc(row.headword)}, ${esc(normalizedHeadword)}, ${esc(row.direction)}, ${esc(row.phonetic)}, ${esc(row.normalizedPhonetic)}, ${esc(definitions)}, ${esc(row.source)}, ${esc(row.sourceLicense)}, ${esc(row.attribution)}, 0) ON CONFLICT(direction, source, normalized_headword, normalized_phonetic) DO UPDATE SET headword=excluded.headword, phonetic=excluded.phonetic, definitions=excluded.definitions, source_license=excluded.source_license, attribution=excluded.attribution, is_demo=0;`;
    }).join("\n");
    await writeFile(sqlFile, sql, "utf8");
    let output;
    try {
      const command = `npx wrangler d1 execute ${dbName} --remote --file "${sqlFile}"`;
      output = execFileSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: true });
    } catch (error) {
      throw new Error(`D1 batch failed for ${key} at offset ${state.offset}: ${error.stderr?.toString() ?? error.message}`);
    }
    const match = output.match(/"rows_written"\s*:\s*(\d+)/);
    if (!match) throw new Error(`Wrangler output missing rows_written for ${key}; cursor not advanced`);
    const rowsWritten = Number(match[1]);
    usedRowsWritten += rowsWritten;
    const estimateExceeded = rowsWritten > maxBatchWrites;

    state.offset += selected.length;
    state.source = source.source;
    state.rows = source.rows;
    state.complete = state.offset >= source.rows;
    existing[key] = state;
    const tempState = `${STATE_PATH}.tmp`;
    await writeFile(tempState, JSON.stringify(existing, null, 2) + "\n", "utf8");
    await rename(tempState, STATE_PATH);
    await appendFile(LOG_PATH, JSON.stringify({ date: new Date().toISOString(), source: key, start: state.offset - selected.length,
      imported: selected.length, rowsWritten, nextOffset: state.offset, complete: state.complete, estimateExceeded }) + "\n", "utf8");
    results.push({ source: key, direction: expectedDirection, imported: selected.length, rowsWritten,
      nextOffset: state.offset, targetPerDirection: target, total: source.rows, estimateExceeded });
    progressed = true;
    if (estimateExceeded) throw new Error("D1 row-write estimate exceeded; cursor saved and later batches stopped");
    }
  } while (progressed && usedRowsWritten < DAY_LIMIT_ROWS_WRITTEN);
  const reachedTarget = ["ecdict", "ccCedict"].every((key) => (existing[key]?.offset ?? 0) >= TARGET_PER_DIRECTION);
  process.stdout.write(`${JSON.stringify({ ok: true, usedRowsWritten, dayBudget: DAY_LIMIT_ROWS_WRITTEN, targetPerDirection: TARGET_PER_DIRECTION, results, reachedTarget, complete: Object.values(existing).every((state) => state.complete) })}\n`);
} finally {
  await lock.close();
  const { unlink } = await import("node:fs/promises");
  await unlink(LOCK_PATH).catch(() => {});
}
