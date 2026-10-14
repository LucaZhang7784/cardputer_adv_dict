INSERT INTO entries (
  headword, normalized_headword, direction, phonetic, normalized_phonetic,
  definitions, source, source_license, attribution, is_demo
) VALUES
  ('apple', 'apple', 'en-zh', '/ˈæp.əl/', '', '["苹果"]',
   'ECDICT@bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b', 'MIT',
   'ECDICT (skywind3000/ECDICT), pinned commit bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b', 0),
  ('苹果', '苹果', 'zh-en', 'píng guǒ', 'pingguo', '["apple"]',
   'CC-CEDICT@20261013', 'CC BY-SA 4.0',
   'CC-CEDICT, MDBG snapshot 2026-10-13', 0)
ON CONFLICT(direction, source, normalized_headword, normalized_phonetic)
DO UPDATE SET headword=excluded.headword, phonetic=excluded.phonetic,
  definitions=excluded.definitions, source_license=excluded.source_license,
  attribution=excluded.attribution, is_demo=0;
