CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  headword TEXT NOT NULL,
  normalized_headword TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('en-zh', 'zh-en')),
  phonetic TEXT NOT NULL DEFAULT '',
  definitions TEXT NOT NULL,
  source TEXT NOT NULL,
  source_license TEXT NOT NULL,
  attribution TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))
);

CREATE INDEX IF NOT EXISTS entries_lookup
  ON entries(direction, normalized_headword);
