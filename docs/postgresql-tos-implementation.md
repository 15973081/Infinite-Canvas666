# PostgreSQL + TOS 本地实现与验收

分支：`codex/postgres-tos-local`。本版是共享工作区的可运行改造，保留默认本地模式；不包含独立账号、团队权限或实时协同扩容。

## 本机已配置

| 项目 | 位置 / 配置 |
|---|---|
| PostgreSQL | 16.15，`127.0.0.1:54329`，仅监听本机 |
| 模拟应用 | `http://127.0.0.1:6004`，共享 HTTP Basic 入口 |
| 开发数据库 | `canvas_cloud_dev`，schema `canvas_cloud` |
| 自动测试数据库 | `canvas_cloud_test`；每轮独立 schema，结束后只清理本轮 schema |
| 私有对象模拟 | `.local/cloud/objects/`，独立对象 key 和不可变版本 |
| 临时文件 | `.local/cloud/tmp/`，按请求或任务创建，响应发送结束后清理 |
| 配置与访问凭证 | `.local/cloud/storage.env`，已加入 Git 忽略 |
| 运行文件 / 模型密钥 | `.local/cloud/runtime/`；不复用原 `API/.env` |
| PostgreSQL 程序 | `%LOCALAPPDATA%/Temp/canvas-cloud-runtime/pgsql/` |

对象模拟是应用存储接口的实现，不冒充 TOS 服务端。真实 TOS 使用官方 Python SDK 适配器；目前没有连接真实 Bucket、没有创建收费云资源，也没有调用付费模型。

原 `data/`、`assets/`、`output/` 没有执行真实迁移。迁移验收使用人工构造的备份副本，演示库只有测试画布。

## 启动

在仓库根目录执行。Windows 自带的便携 Python 需要显式路径：

```bat
python\python.exe -m pip install -r requirements-cloud.txt
python\python.exe tools\cloud_local.py init
python\python.exe tools\cloud_storage.py init-db
python\python.exe tools\cloud_demo.py
python\python.exe tools\cloud_storage.py serve
```

`cloud_local.py init` 会在缺少程序时下载 PostgreSQL 16 Windows 压缩包，生成随机本机密码，初始化独立数据目录。下载来源：[PostgreSQL Windows 页面](https://www.postgresql.org/download/windows/)、[EDB 官方二进制发布页](https://www.enterprisedb.com/download-postgresql-binaries)。已有配置与数据库不会覆盖。

访问 `http://127.0.0.1:6004`，用户名看 `CLOUD_ACCESS_USER`，密码看 `CLOUD_ACCESS_PASSWORD`。停止前台应用用 Ctrl+C；PostgreSQL 可独立管理：

```bat
python\python.exe tools\cloud_local.py status
python\python.exe tools\cloud_local.py stop
python\python.exe tools\cloud_local.py start
```

正常本地模式仍可按原启动方式运行。只有明确加载 `STORAGE_ENV_FILE` 或设置 `DATABASE_BACKEND=postgres` 才启用新存储。配置错误、数据库或对象存储故障会报错，不会静默退回本地形成两份数据。

## 已实现的行为

- 画布节点、连线和视口存 JSONB，保留原字段；保存原子检查 revision。旧前端使用 `base_updated_at` 精确匹配适配，新客户端可传 `base_revision`。缺少版本返回 400，版本冲突返回 409。
- 素材索引、版本、大小、SHA-256、MIME 和派生关系存 PostgreSQL。画布引用索引与画布正文在同一事务更新。
- 稳定 URL 使用 `/assets/cloud/ast_<id>/<文件名>`，保留现有前端的媒体类型识别；也支持 `/api/media/<id>/content`。不把短期签名链接保存到画布。
- 原 `/assets/`、`/output/` 按完整路径查询迁移别名，禁止仅按文件名匹配。供应商 `asset://` 和 `registrations` 保留原语义。
- 新上传经应用后端流式接收，上传校验后才标记 ready。重复确认返回同一素材；客户端不能覆盖 ready 对象。首版没有浏览器直传 staging 或 TOS 分片上传，需要大文件直传时再补对应协议。
- 图片、视频、缩略图、裁剪和工作流 ZIP 入对象存储。FFmpeg 使用按操作下载的临时文件；工作流导出使用磁盘 ZIP，不整包驻留内存。
- 任务请求、状态、供应商任务 ID、费用快照和输入输出媒体 ID 持久化。消费者通过 `SKIP LOCKED` 领取，独立心跳续租，状态和输出发布均验证租约。
- 视频已有上游 ID 时只恢复查询；提交结果不明进入 `needs_review`，前端停止轮询并显示错误。未确认可恢复的图片请求不自动重新提交。
- 原五张费用账本兼容迁移，金额、毫秒时间、价格快照、别名、冲突、导入记录和 revision 保留；恢复预览会回滚，不修改账本。
- 素材库、画布文件夹、提示词库、对话、历史、备份、供应商非密钥配置与维护开关接入 PostgreSQL。现有大目录接口仍以兼容结构返回，不属于已完成分页优化。
- 原件没有自动物理删除。移除目录条目、画布回收站或清理临时目录，不删除对象版本。云端“永久删除画布”保留隐藏墓碑以便恢复和账本关联。

## 迁移原数据

先停写并制作完整备份目录，保持原目录层级：`data/canvases/`、`data/canvases/backups/`、两个 SQLite 文件、素材及其他 JSON。SQLite 导入使用只读连接的 backup API，包含已提交 WAL；跨 JSON、SQLite、素材的一致性仍要求源备份制作期间停写。

```bat
python\python.exe tools\cloud_storage.py migrate --source D:\canvas-backup --report .local\cloud\reports\preview.json
python\python.exe tools\cloud_storage.py migrate --source D:\canvas-backup --apply --report .local\cloud\reports\applied.json
```

第一条只盘点和写报告，第二条才导入。报告包括文件哈希、对象版本、缺失引用、五张账本表数量及按币种/价格状态分组金额。存在缺失引用会返回 `needs_review`，不能当作完整迁移验收。

同一批次可以重复执行，已导入的画布不会覆盖云端新编辑；源内容变化会明确报冲突。首次切换应采用最终停写快照；当前没有自动合并持续变化的本地与云端增量，也不双写。多台来源机器使用不同的 `ASSET_SOURCE_NAMESPACE`。迁移失败允许根据报告重试，但不要修改已应用的 SQL migration。

## 备份和临时空间

```bat
python\python.exe tools\cloud_storage.py backup
python\python.exe tools\cloud_storage.py cleanup-temp
```

备份产生 `.dump` 和 `.objects.json`。数据库导出和对象清单使用同一 PostgreSQL snapshot；清单不包含对象字节，真实上线还要单独保留或备份对应对象版本。恢复到隔离数据库，确认旧画布可打开、文件哈希一致后再切换连接。

临时目录正常结束即删除。进程崩溃后，清理只处理带本应用 owner 标记、超过一小时、且所属进程已不存在的 `op-*` 目录；不对不明目录或活跃进程目录做递归删除。启动时也执行这项清理。

默认单文件 2 GiB、临时目录总预算 10 GiB、两个任务消费者、数据库池上限 10。预算检查能拒绝空间不足，但同步 FFmpeg 等在途输出仍可能短时增长；生产需独立临时盘、操作系统磁盘配额和监控。尚未做 200 人负载测试。

## 切换真实火山 TOS

复制 `storage.env.example` 为服务器私有配置，设置 `STORAGE_ENV_FILE`。需要 PostgreSQL 连接、已开启版本控制的私有 Bucket、地域、内外网 Endpoint、受限 AK/SK 或 STS 凭证；当前 SDK 适配器的 STS 凭证需要外部刷新后重启，不包含实例角色自动轮换。

后端读写走内网 Endpoint，浏览器和供应商临时链接走公网 HTTPS Endpoint。对象保存固定 version ID，每次写入尝试使用独立 key。开启版本控制时不能依赖 `forbid_overwrite` 禁止覆盖，因此实现以独立 key、固定版本和数据库 ready 状态共同保证原件引用不变。[TOS 官方覆盖写参数说明](https://www.volcengine.com/docs/6349/74859?lang=zh)

云端启动前先执行 `init-db`，再执行 `check`。运行账户建议与建表账户分开，数据库使用验证服务器证书的 TLS，示例密码必须替换。共享入口经 HTTPS 反向代理访问，模型密钥通过环境变量或独立运行目录提供。

首版保持一个 Web 进程。需要独立任务进程时，把 Web 的 `CLOUD_EMBEDDED_WORKER=false`，另运行 `tools/cloud_storage.py worker`。任务领取已支持多个数据库连接竞争；编辑锁、WebSocket 广播和部分旧 ComfyUI 队列仍是进程内实现，所以不能宣称增加多个 Web 实例即可完整扩容。ComfyUI、第三方素材注册和供应商实际拉取私有素材仍需对应服务的真实联调。

## 验收记录

```bat
python\python.exe tools\cloud_test.py
python\python.exe -m pytest -o pythonpath=. tests -q
node --check static\js\canvas.js
node --check static\js\smart-canvas.js
```

本机 PostgreSQL 16 集成覆盖：并发画布保存、账本去重/冲突、队列竞争和旧租约拒绝、共享入口、上传/签名/Range/过期、缩略图、参考图、画布备份、真实 FFmpeg 裁剪、含素材工作流往返、模拟供应商中断与恢复、重复迁移、文档版本冲突、对象写入失败、真实 pg_dump/pg_restore、TOS SDK 参数契约和图片消费者。

真实 TOS 网络、权限、配额、供应商拉取和云端性能尚未验证；本地模拟不能替代这部分验收。

本次执行结果：新增集成测试 **15 项通过**；原有 Python 回归 **103 项通过、1 项既有断言失败**（另有云测试在普通模式跳过）。已核对 HEAD：`generatorSources(gen, loopCtx=null, graph=null)` 原本就有第三个参数，而 `tests/test_canvas_run_entry.py` 仍断言旧的双参数签名；本次没有更改该函数。两份画布 JavaScript 语法检查及 `git diff --check` 通过。
