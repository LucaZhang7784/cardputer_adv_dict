# Design / 设计说明

## Goal / 目标

An offline, two-way English–Chinese dictionary for the M5Stack Cardputer ADV. Dictionary data, pinyin candidates, IPA glyphs, and pronunciation playback are local; the app does not need a network connection.
为 M5Stack Cardputer ADV 提供离线英汉/汉英双向词典。词库、拼音候选、IPA 字形和发音均在本地，应用运行不需要网络。

## Runtime layout / 运行时布局

- Device flash: `apps/dictionary.py`, launcher integration, and `apps/lib/` modules.
- SD card: `/sd/cardputer/dictionary/` contains the data/index pack and `audio/` contains WAVs.
- Flash 中放置主程序、菜单集成和 `apps/lib/` 模块；SD 卡 `/sd/cardputer/dictionary/` 放词库索引，`audio/` 子目录放 WAV。

## Lookup / 检索

The ESP32-S3 has constrained RAM, so the app does not load a database into memory. Fixed-width sorted indexes use binary search and read only a single index record and the selected definition from the data file. This keeps memory usage bounded and supports the full dataset from SD.
ESP32-S3 内存有限，程序不会把词库整体载入内存。定宽排序索引使用二分查找，每次只读取单条索引和命中的释义，从而在 SD 卡上检索完整数据并控制内存占用。

| File / 文件 | Contents / 内容 |
|---|---|
| `en-zh.idx`, `en-zh.dat` | English headword index and records / 英文词头索引与词条 |
| `zh-en.idx`, `zh-en.dat` | Chinese headword index and records / 中文词头索引与词条 |
| `zh-en.pinyin.idx` | Pinyin-to-headword candidate index / 拼音到词头的候选索引 |
| `manifest.json` | Dataset versions, licenses, record widths, counts, and SHA-256 digests / 数据版本、许可、记录宽度、数量和 SHA-256 |

The current build contains 768,739 ECDICT English–Chinese records and 125,264 CC-CEDICT Chinese–English records. These datasets have distinct licenses.
当前数据包含 768,739 条 ECDICT 英汉词条和 125,264 条 CC-CEDICT 汉英词条。两组数据适用不同许可。

## Pinyin input / 拼音输入

Pinyin is composed character by character. Space displays candidates for the current syllable; numeric keys select a candidate. Candidate filtering avoids characters outside the device's supported common-character bitmap, and repeated characters are de-duplicated.
拼音按字逐个组合；空格显示当前音节的候选，数字键选择候选。候选会按设备常用字位图过滤，并去除重复字符。

## IPA rendering / IPA 绘制

The app uses a compact pre-rendered 1-bit IPA glyph table generated on a PC. The device draws those glyphs from `apps/lib/ipa_bitmap.py` and `ipa_render.py`, avoiding runtime font loading for IPA.
IPA 字形在 PC 端预先生成成紧凑的 1-bit 位图表。设备端通过 `apps/lib/ipa_bitmap.py` 和 `ipa_render.py` 绘制，避免运行时加载 IPA 字体。

## Pronunciation / 发音

The app plays one local WAV file on demand through the M5Stack speaker API. The checked-in audio set contains 30,000 US-English word files at 48 kHz, 16-bit, mono. The configured speaker volume is `200` on a `0–255` scale. No British-English or Mandarin audio is included.
应用按需通过 M5Stack 扬声器接口播放本地 WAV。仓库音频集包括 30,000 个美式英语单词文件，格式为 48 kHz、16-bit、单声道。扬声器音量配置为 `0–255` 中的 `200`。不含英音或普通话音频。

The WAVs were generated with the Piper `en_US-lessac-medium` voice. Its hosting metadata labels the model MIT, while the referenced Lessac/Blizzard source-data terms are separate and include non-commercial conditions. The scope of those conditions for generated WAV redistribution has not been conclusively established here. See the caution in [Third-party notices](../docs/THIRD_PARTY_NOTICES.md); do not present the audio as Apache-licensed.
WAV 使用 Piper `en_US-lessac-medium` 语音生成。托管页面标注模型为 MIT，但其引用的 Lessac/Blizzard 训练数据另有许可，其中包括非商业条件。本项目尚未确认这些条件对生成 WAV 再分发的具体适用范围。请见[第三方声明](../docs/THIRD_PARTY_NOTICES.md)中的提示，不要将音频标注为 Apache 许可。

## SD and display behavior / SD 卡与显示行为

The app mounts the Cardputer SD card and checks that `/sd/cardputer/dictionary` is available before lookup. Leaving the dictionary requests a full redraw of the launcher screen. The Cardputer ADV SD wiring/configuration in the implementation is `slot=3, width=1, sck=40, miso=39, mosi=14, cs=12, freq=20 MHz`.
应用挂载 Cardputer SD 卡，并在查词前检查 `/sd/cardputer/dictionary` 是否可用。退出词典时请求完整重绘启动器。实现中的 Cardputer ADV SD 参数为 `slot=3, width=1, sck=40, miso=39, mosi=14, cs=12, freq=20 MHz`。

## Build tools / 构建工具

- `scripts/prepare-datasets.mjs` prepares ECDICT and CC-CEDICT source data.
- `scripts/build-local-dict.mjs` builds the binary index/data pack.
- `scripts/verify-local-dict.mjs` verifies the generated pack.
- `scripts/build-wordlist.py` selects frequent words, and `scripts/build-audio.py` generates WAVs.
- `scripts/build-ipa-bitmap.py` generates the IPA bitmap table.
- `scripts/device_transfer.py` transfers files to a device over a selected serial port.
- `scripts/prepare-datasets.mjs` 预处理 ECDICT 与 CC-CEDICT 源数据；`build-local-dict.mjs` 构建索引/词库；`verify-local-dict.mjs` 校验数据包；`build-wordlist.py` 和 `build-audio.py` 生成词表与音频；`build-ipa-bitmap.py` 生成 IPA 位图；`device_transfer.py` 按指定串口传输文件。

Source dataset dumps, the Piper model, test samples, and device backups are intentionally excluded from the repository. Rebuilding those artifacts requires obtaining the corresponding source data/model separately.
原始词库转储、Piper 模型、测试样本和设备备份不纳入仓库。重新构建这些产物需要另行获取对应源数据或模型。

## Hardware safety boundary / 硬件操作边界

No installation or serial-transfer command is run as part of this source publication. If a future operator chooses to transfer files, they must identify the Cardputer port first. The project boundary explicitly forbids touching DaHui One and COM8 (StackChan).
本次源码发布不执行设备安装或串口传输。后续如需传输，必须先确认 Cardputer 对应串口。项目边界明确禁止操作 DaHui One 和 COM8（StackChan）。
