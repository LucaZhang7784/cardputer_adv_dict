# US-English pronunciation audio / 美式英语发音音频

This directory contains the project's complete 30,000-file US-English WAV set. Files are named from lowercase headwords; punctuation and other non-alphanumeric characters are replaced with `_`. Windows-reserved basenames such as `aux` and `con` have a leading `_` so they can be tracked and copied on Windows. The device app looks for the files under `/sd/cardputer/dictionary/audio/`.
本目录包含完整的 30,000 个美式英语 WAV 文件。文件名由小写词头生成，标点及其他非字母数字字符替换为 `_`。Windows 保留名称（如 `aux` 和 `con`）会在开头加 `_`，以便在 Windows 上跟踪和复制。设备应用从 `/sd/cardputer/dictionary/audio/` 读取音频。

- Count / 数量: **30,000 WAV files**
- Total / 总大小: **2,328,267,506 bytes** (about 2.33 GB decimal)
- Format / 格式: **48 kHz, 16-bit, mono WAV**
- Voice / 语音: **Piper `en_US-lessac-medium`**, US English
- Selection / 选词: ECDICT English headwords ranked with `wordfreq`; list is `data/audio-words.txt`

## Copyright notice / 音频版权声明

**Copyright © 2026 Luca Zhang.** These WAV recordings were generated for this project with Piper `en_US-lessac-medium`. This notice applies to the project-specific generated audio as a recording collection; it does not claim ownership of Piper, the voice model, or its source/training materials, and it does not replace their separate terms.
**版权所有 © 2026 Luca Zhang。** 本批 WAV 音频由 Piper `en_US-lessac-medium` 为本项目生成。本声明针对本项目生成音频及其汇编，不主张拥有 Piper、语音模型或模型来源/训练材料的权利，也不取代其各自许可条款。

The WAVs are tracked using Git LFS. A full clone or checkout retrieves the complete audio pack. To copy it to the card, preserve filenames and copy the `.wav` files into `<SD>:/cardputer/dictionary/audio/`.
WAV 由 Git LFS 跟踪；完整克隆或检出会下载全部音频。复制到 SD 卡时保留文件名，并将 `.wav` 文件放入 `<SD>:/cardputer/dictionary/audio/`。

## Regenerate the list and audio / 重新生成词表和音频

This repository does not include the source ECDICT dump or the Piper model. Obtain them separately under their respective terms. The list can then be generated and audio synthesized with:
本仓库不含 ECDICT 原始转储或 Piper 模型，请按各自许可另行获取。准备好源数据和模型后，可运行：

```bash
python scripts/build-wordlist.py 30000 data/audio-words.txt
python scripts/build-audio.py data/audio-words.txt data/audio
```

Python dependencies include `wordfreq`, `piper-tts`, and `numpy`. For the model location and exact licensing notes, see [Third-party notices](../../docs/THIRD_PARTY_NOTICES.md). The voice model hosting metadata says MIT, but the referenced Lessac/Blizzard source-data page has separate non-commercial terms. This project has not conclusively established how those terms affect redistribution of generated WAV files. The Apache-2.0 license does not apply to the voice model or audio.
Python 依赖包括 `wordfreq`、`piper-tts` 和 `numpy`。模型来源及许可说明见[第三方声明](../../docs/THIRD_PARTY_NOTICES.md)。语音模型托管页标注 MIT，但其指向的 Lessac/Blizzard 源数据另有非商业条款。本项目尚未确定这些条款对生成 WAV 再分发的具体适用范围。Apache-2.0 不适用于语音模型或音频。
