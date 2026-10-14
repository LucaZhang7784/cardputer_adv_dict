# Cardputer ADV Offline Dictionary / Cardputer ADV 离线词典

**A two-way English–Chinese and Chinese–English dictionary for M5Stack Cardputer ADV, with local pinyin input, IPA display, and US-English pronunciation.**
**面向 M5Stack Cardputer ADV 的英汉/汉英双向词典，支持本地拼音输入、IPA 音标和美式英语发音。**

The dictionary runs from the device and SD card without a network connection. The project was built and flashed to a Cardputer ADV running UIFlow2.0 Cardputer-Adv v2.5.3; device acceptance was reported by the project owner.
词典运行所需代码和数据位于设备与 SD 卡，不依赖网络。项目已在 UIFlow2.0 Cardputer-Adv v2.5.3 上构建并刷入；设备功能验收结果由项目所有者确认。

## Features / 功能

- English → Chinese lookup using an ECDICT-derived local index (768,739 entries).
- Chinese → English lookup using CC-CEDICT-derived data (125,264 entries).
- On-device pinyin composition and candidate selection, with displayable-character filtering.
- IPA rendered from a compact bitmap table for the device screen.
- 30,000 locally stored US-English WAV pronunciations; speaker volume configured to 200/255.
- Result paging, query restart, and full screen redraw on exit.
- 英译汉与汉译英均在本地检索；拼音候选在设备端组合与筛选；IPA 使用位图绘制；提供 30,000 个本地美音 WAV；扬声器音量设为 200/255；支持释义翻页、重新查询和退出后全屏重绘。

## Dictionary and audio data / 词库与音频

| Pack / 数据包 | Contents / 内容 | License / 许可 |
|---|---|---|
| `data/local/en-zh.*` | ECDICT snapshot `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`, 768,739 entries / ECDICT 快照，768,739 条 | MIT |
| `data/local/zh-en.*` and `zh-en.pinyin.idx` | CC-CEDICT snapshot `2026-10-13`, 125,264 entries / CC-CEDICT 快照，125,264 条 | CC BY-SA 4.0 |
| `data/audio/*.wav` | 30,000 US-English word pronunciations / 30,000 个美式英语单词发音 | See the model/data notice in [Third-party notices](docs/THIRD_PARTY_NOTICES.md) / 许可说明见第三方声明 |

The five binary index/data files and `manifest.json` are included in Git. The 30,000 WAV files are included through Git LFS. **A full clone downloads about 2.33 GB of audio**; GitHub LFS bandwidth quotas apply. Install Git LFS before cloning, or run `git lfs pull` after cloning.
五个二进制索引/词库文件和 `manifest.json` 随 Git 提交；30,000 个 WAV 通过 Git LFS 提供。**完整克隆将下载约 2.33 GB 音频**，受 GitHub LFS 流量额度限制。克隆前请安装 Git LFS，或克隆后执行 `git lfs pull`。

> The repository's Apache-2.0 license covers original project code and documentation only. It does not replace the separate licenses for dictionary data, the voice model/audio, firmware, or third-party components. Review [LICENSE](LICENSE), [NOTICE](NOTICE), and [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) before redistribution.
> 仓库的 Apache-2.0 仅适用于本项目原创代码和文档，不取代词库、语音模型/音频、固件及第三方组件各自的许可。再次分发前请阅读 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和 [第三方声明](docs/THIRD_PARTY_NOTICES.md)。

## Repository layout / 目录说明

```text
apps/                 Cardputer app, launcher integration, and device libraries / 设备端应用、菜单集成和库
data/local/           Built offline dictionary packs and manifest / 离线词库包及清单
data/audio/           30,000 US-English WAV files / 30,000 个美音 WAV
data/ipa-font/        IPA bitmap build input / IPA 位图构建输入
scripts/              Dataset, audio, bitmap, verification, and device-transfer utilities / 数据与设备工具
src/, migrations/     Optional legacy Cloudflare Worker API / 可选的旧版 Cloudflare Worker API
Dict/                 Design and release notes / 设计与发布说明
docs/                 Third-party notices / 第三方声明
```

The Cardputer app uses the local files on the SD card. The Cloudflare Worker code is retained as an optional legacy/backend experiment; it is not required by the offline dictionary app.
Cardputer 应用使用 SD 卡上的本地文件。仓库保留的 Cloudflare Worker 代码属于可选的旧后端实验，离线词典不依赖它。

## Install the data on SD card / 将数据复制到 SD 卡

Copy the contents of `data/local/` to `<SD>:/cardputer/dictionary/`, and copy all WAV files to `<SD>:/cardputer/dictionary/audio/`. Keep the filenames unchanged.
将 `data/local/` 中的文件复制到 `<SD>:/cardputer/dictionary/`，再把全部 WAV 复制到 `<SD>:/cardputer/dictionary/audio/`，不要改动文件名。

## Build / 构建

The app is written for the UIFlow2.0 Cardputer ADV firmware APIs. PC-side dataset builders are in `scripts/`. Rebuilding dictionary packs requires the source datasets, which are not included in this repository; rebuilding audio requires Piper dependencies and the separately obtained voice model. See [Dict/DESIGN.md](Dict/DESIGN.md) and [data/audio/README.md](data/audio/README.md).
设备端程序使用 UIFlow2.0 Cardputer ADV 固件接口。PC 端构建工具位于 `scripts/`。重新构建词库需要本仓库未附带的源数据；重新生成音频需要 Piper 依赖及单独获取的语音模型。详见 [设计文档](Dict/DESIGN.md) 和 [音频说明](data/audio/README.md)。

## Controls / 按键

| Action / 操作 | Keys / 按键 |
|---|---|
| Switch English/Chinese input / 切换中英文输入 | `Tab` |
| Search / 查询 | `Enter` |
| Select pinyin candidate / 选择拼音候选 | `Space`, then `1`–`3` / 空格，再按 `1`–`3` |
| Play pronunciation / 播放发音 | `1` on result screen / 结果页按 `1` |
| New query / 重新查询 | `2` on result screen / 结果页按 `2` |
| Return to start / 返回初始页 | `3` on result screen / 结果页按 `3` |

## License and acknowledgements / 许可与致谢

Original project code and documentation: Apache License 2.0. Third-party datasets and components retain their respective terms; see the bilingual [third-party attribution table](docs/THIRD_PARTY_NOTICES.md).
本项目原创代码和文档采用 Apache License 2.0。第三方词库和组件继续适用各自许可，详见中英双语的[第三方致谢表](docs/THIRD_PARTY_NOTICES.md)。

## 中文社区发布文案

See [小红书宣传文案.md](小红书宣传文案.md).
宣传文案见 [小红书宣传文案.md](小红书宣传文案.md)。
