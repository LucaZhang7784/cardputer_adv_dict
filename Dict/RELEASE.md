# Release notes / 发布说明

## Release contents / 发布内容

- Cardputer ADV offline dictionary application, menu integration, and MicroPython libraries.
- Built local dictionary indexes/data and manifest under `data/local/`.
- All 30,000 US-English pronunciation WAV files under `data/audio/`, tracked by Git LFS.
- Bilingual project documentation, Apache-2.0 license for original code/docs, and third-party attribution notices.
- Cardputer ADV 离线词典应用、菜单集成和 MicroPython 库；`data/local/` 下的已构建词库/索引；由 Git LFS 跟踪的 `data/audio/` 全部 30,000 个美音 WAV；中英文项目文档、适用于原创代码/文档的 Apache-2.0 许可及第三方声明。

## Repository size / 仓库体量

The audio payload is 2,328,267,506 bytes (approximately 2.17 GiB / 2.33 GB decimal). Git LFS stores the WAV content separately from ordinary Git history. A complete checkout still downloads every WAV and consumes similar LFS bandwidth. GitHub's current Free plan documentation lists 2 GB as the per-file LFS ceiling and 10 GiB included storage and bandwidth; these limits are account-plan dependent and may change.
音频数据共 2,328,267,506 字节（约 2.17 GiB / 2.33 GB 十进制）。Git LFS 将 WAV 内容与普通 Git 历史分开存储，但完整检出仍会下载全部 WAV 并消耗相近的 LFS 流量。GitHub 当前 Free 方案文档列出的单个 LFS 文件上限为 2 GB，包含存储和流量额度各 10 GiB；额度取决于账号方案且可能变化。

## Data rights note / 数据权利提示

The ECDICT and CC-CEDICT data retain separate licenses. The audio model page identifies the Piper voice package as MIT, but the Lessac/Blizzard training-data source has separate non-commercial terms. Whether those terms cover the generated WAVs has not been conclusively determined for this release. Keep the audio/model note visible and obtain rights-holder confirmation before presenting commercial reuse or broader redistribution as cleared.
ECDICT 和 CC-CEDICT 数据保留各自许可。Piper 语音包页面标注 MIT，但 Lessac/Blizzard 训练数据另有非商业条款；本次尚未确定该条款是否适用于生成 WAV。应保留音频/模型说明，并在宣称商业使用或更广泛再分发已获许可前取得权利方确认。

## Device status / 设备状态

The project owner reports that the app built successfully, was flashed, and passed functional testing. This repository preparation does not flash or alter the device.
项目所有者报告应用已成功构建、刷入并通过功能测试。本次仓库整理不刷写或更改设备。
