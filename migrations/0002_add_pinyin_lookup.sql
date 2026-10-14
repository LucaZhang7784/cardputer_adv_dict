ALTER TABLE entries ADD COLUMN normalized_phonetic TEXT NOT NULL DEFAULT '';

CREATE INDEX entries_pinyin_lookup
  ON entries(direction, normalized_phonetic COLLATE NOCASE);
