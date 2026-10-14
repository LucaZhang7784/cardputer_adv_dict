import assert from "node:assert/strict";

const base = process.env.DICTIONARY_URL ?? "http://127.0.0.1:8787";

const health = await fetch(`${base}/health`).then((r) => r.json());
assert.equal(health.ok, true);

const english = await fetch(`${base}/api/lookup?word=Apple&direction=en-zh`).then((r) => r.json());
assert.equal(english.found, true);
assert.equal(english.entries[0].headword, "apple");
assert.equal(english.entries[0].definitions[0], "苹果");
assert.equal(english.entries[0].demo, true);

const chinese = await fetch(`${base}/api/lookup?word=%E8%8B%B9%E6%9E%9C&direction=zh-en`).then((r) => r.json());
assert.equal(chinese.found, true);
assert.equal(chinese.entries[0].definitions[0], "apple");

const pinyin = await fetch(`${base}/api/suggest?pinyin=pi%CC%81ng%20guo%CC%8C`).then((r) => r.json());
assert.equal(pinyin.found, true);
assert.equal(pinyin.candidates[0].headword, "苹果");

const invalid = await fetch(`${base}/api/lookup?word=apple&direction=bad`);
assert.equal(invalid.status, 400);

const missing = await fetch(`${base}/api/lookup?word=not-in-dictionary&direction=en-zh`).then((r) => r.json());
assert.equal(missing.found, false);

console.log("Local Worker smoke check passed.");
