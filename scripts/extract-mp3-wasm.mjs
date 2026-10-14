import { writeFile } from "node:fs/promises";
import EmscriptenWASM from "../node_modules/mpg123-decoder/src/EmscriptenWasm.js";
import { WASMAudioDecoderCommon } from "../node_modules/@wasm-audio-decoders/common/index.js";

new WASMAudioDecoderCommon();
const decoder = new EmscriptenWASM(WASMAudioDecoderCommon);
const wasm = await WASMAudioDecoderCommon.inflateDynEncodeString(EmscriptenWASM.wasm);
if (wasm[0] !== 0 || wasm[1] !== 97 || wasm[2] !== 115 || wasm[3] !== 109) {
  throw new Error("MP3 decoder payload is not a WebAssembly module");
}
await writeFile(new URL("../src/mpg123.wasm", import.meta.url), wasm);
process.stdout.write(`Extracted ${wasm.length} decoder bytes.\n`);
