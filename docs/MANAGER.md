# 个人下载管理器

新增管理器独立启动，原终端/API/下载器入口保持可用。源码来源见 [项目核查](MANAGER_PROVENANCE.md)，沿用 GPLv3。

## 本机启动

需要 Python 3.12（复用现有 Python 即可）：

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-manager.txt
.venv/Scripts/python -m manager
```

打开 http://127.0.0.1:8787。第一次启动自动生成 `manager-data/access-token`；将该文件内容填入面板，点击“连接后台”。不把令牌放进网址、截图或版本库。Ctrl+C 停止；再次启动可恢复未完成队列。仅运行一个管理器进程，不使用多个 uvicorn worker。

支持完整视频/图集链接、分享文案、作品 ID、多条批量输入、用户主页。主页逐页抓取，受设置的最大页数限制；新作品加入队列。默认 2 个并发任务，最多 4 个；更改并发数后重启。分页、失败状态、下载字节进度、手动与自动重试可在面板查看。

平台拒绝请求、Cookie 失效或解析不兼容时显示失败。有效 Cookie 可在设置中填写，不会回显。管理器复用仓库现有解析接口，不新增签名破解、第三方付费解析或自动购买服务。仅采集当前有权访问的媒体。

按作者或视频/图集类型归档，文件保存在 `manager-data/downloads`。传输先写 `.part`，校验非空、响应类型及长度后原子改名；失败不写下载历史。重启/重试重新下载当前作品，不承诺断点续传。数据库记录的完成只代表传输校验通过，不包含播放器逐帧验证。

## 浏览器扩展（独立安装）

1. 在支持 Manifest V3 的浏览器扩展管理页打开“开发者模式”。
2. 选择“加载已解压的扩展程序”，选择仓库 `extension` 目录。扩展不运行在 Docker 内。
3. 打开扩展，后台地址填写 `http://127.0.0.1:8787`，令牌填写上面的本机令牌，点击“保存并连接”。浏览器弹出权限提示时允许访问该后台。
4. 在抖音作品页点击“提交当前作品”；或“收集本页链接”，检查文本框后提交。收集的是当前已加载 DOM 内的作品，不会自动无限滚动；主页批量请提交主页链接给后台分页处理。

扩展只在用户点击时访问当前页，后台访问权限按配置地址申请。令牌保存在当前浏览器的本地扩展存储，不使用云同步；卸载扩展可清理。不同电脑使用 NAS 的内网地址和该 NAS 的令牌。普通 HTTP 只适用于可信内网；远程使用 HTTPS 反向代理。

## Docker / NAS

```sh
docker compose -f compose.manager.yaml up -d --build
docker compose -f compose.manager.yaml exec douyin-manager cat /data/access-token
```

命名卷 `douyin-data` 保存配置、令牌、SQLite 和下载文件。停止用 `docker compose -f compose.manager.yaml down`（保留数据卷）。不要使用 `down -v`，它会删除卷。备份前停止服务，备份整个数据卷，恢复到同名卷后启动。

默认仅绑定宿主机回环地址；NAS 内网访问时把 Compose 端口改为 `NAS内网IP:8787:8787`。容器运行在非 root 用户 UID 10001；改成宿主目录绑定时需赋予该用户写权限。不要暴露公网裸端口。健康检查访问 `/health`，所有任务/配置/文件 API 都要求 Bearer 令牌。

环境变量：`DOUYIN_DATA` 数据目录、`DOUYIN_HOST` 监听地址、`DOUYIN_PORT` 端口；可选 `DOUYIN_TOKEN` 覆盖文件令牌（至少 16 字符）。不把真实值写入 Compose 或提交到 Git。管理器没有任意媒体 URL 下载接口，仅接收抖音链接，CDN 跳转逐次校验。

## 旧历史

复制原项目 `Volume/DouK-Downloader.db` 到管理器数据目录 `legacy/DouK-Downloader.db`，面板点击“导入旧历史”。以只读方式读取 `download_data.ID`，旧文件不变；重复导入无副作用。只有 ID 的历史会跳过下载，但没有新文件路径，因此不会提供不存在的保存链接。尚未找到的 douyin-download-manager 数据格式暂不支持。

去重以作品 ID 为准，分享链接解析后再次归并。失败任务需要点击“重试”；已完成/已导入历史不会自动重下。手动移动/删除下载文件后，历史不会自动重建；保存文件时会明确报告不存在。

## 测试与限制

```sh
python -m pip install pytest==8.3.5
python -m pytest tests/test_manager.py -q
node tests/extension-integration.cjs http://127.0.0.1:8787 manager-data/access-token
```

第二条命令测试扩展的共享 HTTP 客户端与真实后台的认证、提交和去重，不等于浏览器已安装扩展。使用测试 ID 会产生一个真实队列任务；请仅在隔离验证实例运行该联动检查。

实际验收结果及未完成事项见 [验证记录](MANAGER_VALIDATION.md)。
