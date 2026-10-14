CREATE UNIQUE INDEX entries_import_identity
  ON entries(direction, source, normalized_headword, normalized_phonetic);
