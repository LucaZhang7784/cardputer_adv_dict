# Dictionary project notes / 词典项目说明

This folder contains the technical design and release summary for the Cardputer ADV offline dictionary. The complete user-facing setup and controls are in the repository-root [README](../README.md); third-party licenses are in [docs/THIRD_PARTY_NOTICES.md](../docs/THIRD_PARTY_NOTICES.md).
本目录记录 Cardputer ADV 离线词典的技术设计和发布概况。面向使用者的完整说明与按键操作见仓库根目录 [README](../README.md)；第三方许可见 [docs/THIRD_PARTY_NOTICES.md](../docs/THIRD_PARTY_NOTICES.md)。

## Current release / 当前版本

- Offline English–Chinese and Chinese–English lookup / 离线英汉与汉英查询
- On-device pinyin candidates and IPA bitmap rendering / 设备端拼音候选与 IPA 位图绘制
- Local US-English pronunciation set: 30,000 WAV files, distributed with Git LFS / 本地美音包：30,000 个 WAV，通过 Git LFS 分发
- Built for UIFlow2.0 Cardputer-Adv v2.5.3 / 面向 UIFlow2.0 Cardputer-Adv v2.5.3
- Project owner reports successful build, flashing, and functional acceptance / 项目所有者报告已成功构建、刷机并通过功能验收

## Files / 文件

- [DESIGN.md](DESIGN.md): architecture, data format, runtime constraints, and hardware boundary / 架构、数据格式、运行约束及硬件边界
- [RELEASE.md](RELEASE.md): release contents, size, and outstanding third-party rights note / 发布内容、体积和第三方权利提示
- [`../data/audio/README.md`](../data/audio/README.md): audio format, copyright note, and LFS details / 音频格式、版权声明和 LFS 说明
