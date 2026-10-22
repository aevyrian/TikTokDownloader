# 验证与交接（2026-10-22）

## 已完成

- 目标仓库 `aevyrian/TikTokDownloader`，开发分支 `feat/personal-download-manager`，目录为当前仓库 `TikTokDownloader-dev`；未改本地 Clxj 旧副本或 X 下载器。
- Python 3.12 隔离环境安装成功。首次依赖下载校验失败，丢弃该包；清缓存重新下载指定版本后安装通过，没有跳过包校验。
- `python -m pytest tests/test_manager.py -q`：10 项通过。覆盖实际 API、认证、分页、任务恢复、文件传输、下载历史导入、重试退避、去重、CDN 跳转校验、图集与高画质选择、并发任务 Cookie 参数隔离。网络传输使用可控 fixture；不能替代平台实测。
- 扩展和面板 JavaScript 语法检查通过。
- 本机后台已启动：`http://127.0.0.1:8787`；ego(lite) 实际打开面板、填写本地令牌、提交真实作品、点击重试并观察任务状态。
- 扩展共享客户端真实请求后台：认证、提交、重复识别与错误令牌拒绝通过。浏览器 popup 的 activeTab/权限申请尚未实际安装验证。
- 真实作品 `7696820220854052965`：最初 HTTP 403，定位到适配器缺少原程序初始化的 UIFID/msToken 参数。补上每请求独立参数，使用 ego 已打开抖音页的访客 Cookie（仅 UIFID/ttwid/__ac_nonce/__ac_signature 等白名单，未获取登录会话 Cookie）后，详情 API HTTP 200，解析得到 1 个视频地址。
- 通过面板重试完成真实 CDN 下载：文件 `downloads/WRP先生/7696820220854052965/001.mp4`，8,583,883 字节；数据库 state=completed，progress=total=8583883，下载历史已写入。实际媒体和访客 Cookie 仅留在被忽略的本地数据目录，没有提交。
- 实测发现面板每 2 秒重建任务按钮导致点击时元素断开，已改为数据无变化时不重绘，重试按钮实际点击通过。

## 尚未完成 / 限制

- 未找到 douyin-download-manager 原始源码、原扩展或独有分流规则，不能认定原功能已迁移。现有 TikTokDownloader 分页/历史/分类代码保留；新增按作者/类型分流。
- 本机未找到 Docker 命令、安装目录或 Docker 服务。已添加 GitHub CI 进行镜像构建、容器健康检查、重启持久化与扩展客户端联动；结果以 PR 检查为准，不能把文件写好当作构建成功。
- 扩展已提供标准 Manifest V3 安装目录；ego 的 task.cdp 仅支持 Target/Browser 域，不能以 Extensions.loadUnpacked 自动加载。未更换浏览器或启用额外调试参数；用户可按安装说明加载扩展后完成 popup 权限与当前标签页联动验收。
- 实际平台验证仅 1 条公开视频。账号多页与图集传输已有代码/fixture 覆盖，尚未完成真实平台多页和图集验收；平台兼容性不保证长期不变。访客 Cookie 过期时需更新。
- 单实例进程内 1–4 个工作任务；不支持多个后台进程共享同一数据库。新队列中断后整项重试，不提供断点续传。
- 测试有一条 Starlette/AnyIO 兼容性弃用警告，不影响结果。

## 本地继续使用

运行环境 `.venv`，数据 `manager-data`，令牌 `manager-data/access-token`，后台日志 `test-results/server2.*.log`；均未提交。停止时先确定 8787 端口所属的本项目 Python 进程再结束，重启用 `.venv/Scripts/python -m manager`。不结束其他 Python 或浏览器进程。

新增内容仅本仓库代码、隔离环境、本地后台进程和 ego 任务空间。没有安装 Docker、系统服务、云资源或其他浏览器。
