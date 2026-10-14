import decoderModule from "./mpg123.wasm";

const DIRECTIONS = new Set(["en-zh", "zh-en"]);
const MAX_WORD_LENGTH = 96;
const MAX_PRONUNCIATION_LENGTH = 96;
const MAX_AUDIO_BYTES = 512_000;

function pcmToWav(decoded) {
  const samples = decoded.samplesDecoded;
  const channels = decoded.channelData;
  const outputRate = 8000;
  const outputSamples = Math.min(Math.floor(samples * outputRate / decoded.sampleRate), 10_000);
  if (!samples || !channels?.length || samples > decoded.sampleRate * 8) {
    throw new Error("invalid_audio");
  }

  const dataBytes = outputSamples;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  const bytes = new Uint8Array(wav);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + dataBytes, true);
  bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, dataBytes, true);
  const left = channels[0];
  const right = channels[1];
  const scale = decoded.sampleRate / outputRate;
  for (let i = 0; i < outputSamples; i++) {
    const start = Math.floor(i * scale);
    const end = Math.min(samples, Math.floor((i + 1) * scale));
    let total = 0;
    for (let j = start; j < end; j++) total += right ? (left[j] + right[j]) / 2 : left[j];
    const sample = end > start ? total / (end - start) : 0;
    bytes[44 + i] = Math.round((Math.max(-1, Math.min(1, sample)) + 1) * 127.5);
  }
  return wav;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

function normalize(word, direction) {
  const normalized = word.normalize("NFC").trim();
  return direction === "en-zh" ? normalized.toLowerCase() : normalized;
}

function normalizePinyin(value) {
  return value
    .toLowerCase()
    .replace(/u:/g, "v")
    .replace(/ü/g, "v")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    if (url.pathname === "/health") return json({ ok: true, service: "cardputer-dictionary" });
    if (url.pathname === "/api/pronounce") {
      const word = url.searchParams.get("word")?.normalize("NFC").trim() ?? "";
      const direction = url.searchParams.get("direction");
      const accent = url.searchParams.get("accent") === "uk" ? "uk" : "us";
      if (!word) return json({ error: "missing_word" }, 400);
      if ([...word].length > MAX_PRONUNCIATION_LENGTH) return json({ error: "word_too_long" }, 400);
      if (!direction || !DIRECTIONS.has(direction)) return json({ error: "invalid_direction" }, 400);
      if (direction === "en-zh" && !/^[A-Za-z][A-Za-z' -]*$/.test(word)) {
        return json({ error: "invalid_english_word" }, 400);
      }
      if (direction === "zh-en" && !/\p{Script=Han}/u.test(word)) {
        return json({ error: "invalid_chinese_word" }, 400);
      }

      const audioUrl = new URL("https://dict.youdao.com/dictvoice");
      audioUrl.searchParams.set("audio", word);
      if (direction === "en-zh") audioUrl.searchParams.set("type", accent === "uk" ? "1" : "2");
      else audioUrl.searchParams.set("le", "zh");

      const audioResponse = await fetch(audioUrl, { headers: { accept: "audio/mpeg" } });
      if (!audioResponse.ok || !audioResponse.headers.get("content-type")?.startsWith("audio/")) {
        return json({ error: "pronunciation_unavailable" }, 502);
      }

      if (Number(audioResponse.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) {
        return json({ error: "audio_too_large" }, 502);
      }
      const mp3 = new Uint8Array(await audioResponse.arrayBuffer());
      if (!mp3.length || mp3.length > MAX_AUDIO_BYTES) return json({ error: "audio_unavailable" }, 502);
      if (!globalThis.Worker) globalThis.Worker = class {};
      const { MPEGDecoder } = await import("mpg123-decoder");
      MPEGDecoder.module = decoderModule;
      const decoder = new MPEGDecoder();
      let wav;
      try {
        await decoder.ready;
        wav = pcmToWav(decoder.decode(mp3));
      } finally {
        decoder.free();
      }
      return new Response(wav, {
        status: 200,
        headers: {
          "content-type": "audio/wav",
          "cache-control": "public, max-age=86400",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS"
        }
      });
    }
    if (url.pathname === "/api/suggest") {
      const rawPinyin = url.searchParams.get("pinyin")?.trim() ?? "";
      const pinyin = normalizePinyin(rawPinyin);
      if (pinyin.length < 1 || pinyin.length > 32) return json({ error: "invalid_pinyin" }, 400);

      const db = env.DICTIONARY_DB;
      let rows = (await db
        .prepare(`SELECT headword, phonetic
                  FROM entries
                  WHERE direction = 'zh-en' AND normalized_phonetic = ?
                  LIMIT 8`)
        .bind(pinyin)
        .all()).results ?? [];
      if (!rows.length) rows = (await db
        .prepare(`SELECT headword, phonetic
                  FROM entries
                  WHERE direction = 'zh-en' AND normalized_phonetic LIKE ?
                  ORDER BY length(normalized_phonetic), headword
                  LIMIT 8`)
        .bind(`${pinyin}%`)
        .all()).results ?? [];

      const candidates = rows.map((row) => ({
        headword: row.headword,
        phonetic: row.phonetic
      }));
      return json({ query: rawPinyin, normalizedPinyin: pinyin, found: candidates.length > 0, candidates });
    }
    if (url.pathname !== "/api/lookup") return json({ error: "not_found" }, 404);

    const word = url.searchParams.get("word")?.trim();
    const direction = url.searchParams.get("direction");
    if (!word) return json({ error: "missing_word" }, 400);
    if ([...word].length > MAX_WORD_LENGTH) return json({ error: "word_too_long" }, 400);
    if (!direction || !DIRECTIONS.has(direction)) return json({ error: "invalid_direction" }, 400);

    const result = await env.DICTIONARY_DB
      .prepare(`SELECT headword, direction, phonetic, definitions
                FROM entries
                WHERE direction = ? AND normalized_headword = ?
                LIMIT 1`)
      .bind(direction, normalize(word, direction))
      .all();

    const entries = (result.results ?? []).map((row) => ({
      headword: row.headword,
      direction: row.direction,
      phonetic: row.phonetic,
      definitions: JSON.parse(row.definitions)
    }));

    return json({ query: word, direction, found: entries.length > 0, entries });
  }
};
