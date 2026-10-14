INSERT INTO entries (
  headword, normalized_headword, direction, phonetic, definitions,
  source, source_license, attribution, is_demo, normalized_phonetic
) VALUES
  ('apple', 'apple', 'en-zh', '/ˈæp.əl/', '["苹果"]', 'smoke-test-en-zh', 'test-only', 'local smoke fixture', 1, ''),
  ('苹果', '苹果', 'zh-en', 'píng guǒ', '["apple"]', 'smoke-test-zh-en', 'test-only', 'local smoke fixture', 1, 'pingguo');
