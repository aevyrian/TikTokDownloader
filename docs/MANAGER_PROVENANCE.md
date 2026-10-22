# 项目核查（2026-10-22）

- 开发目标：aevyrian/TikTokDownloader，默认分支 master，基线 `473c90ff70c663cfb69310fff2b8d5192f200661`。GitHub REST 元数据核实 fork=true，parent/source 均为 JoeanAmier/TikTokDownloader，license=GPL-3.0。
- README、pyproject 和源码常量均标明原项目 JoeanAmier/TikTokDownloader（DouK-Downloader 5.8），根目录 license 为 GPLv3。新增管理器沿用该许可证。
- 本地旧副本位于 `2026-09-04/github-clxj-tiktokdownloader-x20/work/TikTokDownloader`，remote 为 Clxj/TikTokDownloader；没有改动该目录。
- 在当前工作区、文档、Downloads、OneDrive 的文件名，以及 ChatGPT 项目文档内容中查找，未找到可核实的 douyin-download-manager 源码或专属浏览器扩展。仅在对话/提示词记录中找到名称。不能认定其与 TikTokDownloader 相同，不能声称保留了尚未找到的独有分流规则。
- 此仓库已有账号分页（src/interface/account.py、template.py）、下载分类（src/downloader）、历史 ID（src/manager/database.py、recorder.py）。新增模块不覆盖这些实现，提供只读历史导入。
- README 的 Web UI 清单与实际状态不同：当前 UI 入口禁用，根 API 页面跳转 GitHub；新管理器提供单独入口。
- 现有签名代码包含 Evil0ctal 项目的 Apache-2.0 来源声明。本阶段不改写签名算法；平台拒绝或空响应须明确失败，不能记作下载成功。
- 与 X 下载器无共享目录、分支或数据库。

## 实施阶段

1. 记录来源，隔离分支及目录。
2. SQLite 队列、解析适配、下载、恢复、重试、去重、分类和 API 测试。
3. 中文面板、油猴用户脚本、Docker Compose、使用文档及实际验证。按用户明确纠正，网页端使用已有油猴/脚本猫，不新开发浏览器扩展；初版扩展目录已从当前分支移除。

历史管理器找到后应先比较许可证和数据格式，再有选择地迁移，不能直接覆盖。
