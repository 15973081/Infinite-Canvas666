# PostgreSQL + TOS 本地实现与验收

存储实现已在提交 `b3c39b6` 接入，登录页与会话在 `3ef1780` 接入。本版是共享工作区的可运行改造，保留默认本地模式；不包含独立账号、团队权限或实时协同扩容。

本地目标计划已完成并复验，最终结果为 **52 项实库、120 项 Python、158 项前端测试通过**。以下分阶段记录保留当时的结果；最新完整证据及明确边界见[最终验收](postgresql-tos-acceptance.md)。

2026-09-14 计划升级：新增[线上成员与画布协作计划](online-collaboration-upgrade-plan.md)，并扩展[独立管理平台、空间权限与维护计划](management-platform-upgrade-plan.md)。统一顺序为 M1+C1 身份/空间/权限 → M2 独立管理平台 → C2 PostgreSQL 编辑租约 → C3 两种画布交接及断线恢复 → M3 维护中心 → M4 联合验收。本页“已完成”仅指上述存储基线；新增协作及管理功能尚未实施，本次未改变运行代码、数据库或 `.local/cloud` 配置。

## 本机已配置

| 项目 | 位置 / 配置 |
|---|---|
| PostgreSQL | 16.15，`127.0.0.1:54329`，仅监听本机 |
| 模拟应用 | `http://127.0.0.1:6004`，共享登录页与 Cookie 会话，兼容脚本 HTTP Basic |
| 开发数据库 | `canvas_cloud_dev`，schema `canvas_cloud` |
| 自动测试数据库 | `canvas_cloud_test`；仅允许显式回环主机，每轮独立 schema，结束后只清理本轮 schema |
| 自动测试文件 | 系统临时目录内独立的运行文件、对象、暂存文件及登录会话 SQLite；结束后清理 |
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

访问 `http://127.0.0.1:6004`，在登录页输入 `CLOUD_ACCESS_USER` 和 `CLOUD_ACCESS_PASSWORD`，详见[登录说明](login.md)。停止前台应用用 Ctrl+C；PostgreSQL 可独立管理：

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
- 两种画布的上传统一使用 staging 分片协议：每片 8 MiB，按片计算 SHA-256，已确认的分片可以续传。`.local` 模拟使用受限签名 PUT；真实 TOS 适配使用官方原生 multipart 与绑定分片编号、大小的公网签名 PUT。确认时封存 staging 版本、检查实际大小、逐片哈希及媒体格式，通过后发布独立原件 key。重复确认返回同一素材；旧上传凭证不能改变 ready 原件。原 `/api/ai/upload` 和 multipart form 上传继续兼容。
- 图片、视频、缩略图、裁剪和工作流 ZIP 入对象存储。FFmpeg 使用按操作下载的临时文件；工作流导出使用磁盘 ZIP，不整包驻留内存。
- 任务请求、状态、供应商任务 ID、费用快照和输入输出媒体 ID 持久化。消费者通过 `SKIP LOCKED` 领取，独立心跳续租，状态和输出发布均验证租约。
- 视频已有上游 ID 时只恢复查询；提交结果不明进入 `needs_review`，前端停止轮询并显示错误。未确认可恢复的图片请求不自动重新提交。
- 原五张费用账本兼容迁移，金额、毫秒时间、价格快照、别名、冲突、导入记录和 revision 保留；恢复预览会回滚，不修改账本。
- 素材库、画布文件夹、提示词库、对话、历史、备份、供应商非密钥配置与维护开关接入 PostgreSQL。图片历史支持时间戳/ID 游标分页，五个图库按页加载；对话目录每页最多 200 条且只返回摘要。画布目录查询只取展示字段；内部文档扫描分批读取。素材库/文件夹继续保留单文档树形兼容结构。
- 原件没有自动物理删除。移除目录条目、画布回收站或清理临时目录，不删除对象版本。云端“永久删除画布”保留隐藏墓碑以便恢复和账本关联。

## 迁移原数据

先停写并制作完整备份目录，保持原目录层级：`data/canvases/`、`data/canvases/backups/`、两个 SQLite 文件、素材及其他 JSON。SQLite 导入使用只读连接的 backup API，包含已提交 WAL；跨 JSON、SQLite、素材的一致性仍要求源备份制作期间停写。

```bat
python\python.exe tools\cloud_storage.py migrate --source D:\canvas-backup --report .local\cloud\reports\preview.json
python\python.exe tools\cloud_storage.py migrate --source D:\canvas-backup --apply --report .local\cloud\reports\applied.json
```

第一条只盘点和写报告，第二条才导入。首次写入前检查所有支持的 JSON/SQLite，路径越出备份目录、无效 JSON 或缺失表会报错。报告包括类别数量/字节数、文件哈希、来源命名空间、对象版本、带源文件及 JSON 指针的引用问题、五张账本表数量及按币种/价格状态分组金额。备份、对话、历史、任务和账本日志中的媒体引用均参与审计；原日志内容与费用不重写。缺失文件、未验证外链、未知 JSON 会返回 `needs_review`。外链报告剔除用户凭证与查询参数，保留原 URL 的 SHA-256，不执行网络下载。报告必须写到源备份以外。

维护状态支持 `data/maintenance_state.json`。浏览器 localStorage 不包含在服务端备份中：可把人工导出放在备份根目录 `localStorage.json` 供盘点，报告标记需人工选择保留项，不自动将浏览器令牌和偏好导入共享文档；没有导出时明确标记 `not_provided`。服务端 `complete` 只代表所提供且支持的服务端数据通过审计，不能当作浏览器数据已迁移。

同一批次可以重复执行，已导入的画布不会覆盖云端新编辑；源内容变化会明确报冲突。首次切换应采用最终停写快照；当前没有自动合并持续变化的本地与云端增量，也不双写。多台来源机器使用不同的 `ASSET_SOURCE_NAMESPACE`。迁移失败允许根据报告重试，但不要修改已应用的 SQL migration。

## 备份和临时空间

```bat
python\python.exe tools\cloud_storage.py backup
python\python.exe tools\cloud_storage.py cleanup-temp
python\python.exe tools\cloud_storage.py cleanup-uploads
```

备份产生 `.dump`、`.objects.json` 和同名 `.objects/` 目录，三者一起保留。数据库导出和对象清单使用同一 PostgreSQL snapshot，随后按固定 version ID 下载全部 ready 对象（包括保留的原件），逐个校验大小和 SHA-256。清单最后发布，代表备份完成；对象读取失败不会生成完成清单。旧版只有 dump/清单的备份不具备独立对象恢复能力，新校验命令会拒绝将它当作完整备份。

```bat
python\python.exe tools\cloud_storage.py backup
python\python.exe tools\cloud_storage.py verify-backup --source .local\cloud\backups\<备份名>.dump
python\python.exe tools\cloud_storage.py restore-objects --source .local\cloud\backups\<备份名>.dump --destination .local\cloud\restore-<备份名>\objects
```

后两条离线命令不加载私有连接配置、不访问原数据库/对象目录。恢复目标必须是新目录；损坏的对象、数据库校验不符、路径越界或覆盖已有目录均拒绝。对象恢复当前支持 filesystem 本地模拟，沿用原 key/version，数据库记录不需要重映射。真实 TOS 备份可导出固定版本字节，但恢复到新 TOS 桶的版本重映射仍是云端联调项。

数据库使用 `pg_restore --exit-on-error --no-owner --dbname=<新建隔离数据库> <备份名>.dump` 恢复，连接凭证通过受保护的环境配置提供；禁止对日常库执行覆盖式恢复。验收进程同时指定该新数据库和新 `OBJECT_STORE_ROOT`，禁用任务消费者，核验旧画布与含素材导出后再考虑切换。未完成上传的 staging/分片不纳入持久备份，灾难恢复后需重新发起上传；ready 原件全部纳入。备份不自动删除任何历史文件，异盘/异地保留和定时运行由部署安排。

临时目录正常结束即删除。进程崩溃后，清理只处理带本应用 owner 标记、超过一小时、且所属进程已不存在的 `op-*` 目录；不对不明目录或活跃进程目录做递归删除。启动时也执行这项清理。

`cleanup-uploads` 只处理已超过上传有效期及一小时宽限期、没有活跃确认租约的 staging。清理先禁止继续写入，再删除本次上传登记的暂存分片/版本；ready 原件不删除。正常上传凭证默认有效 24 小时，单次分片 URL 最长 15 分钟。分片声明、已确认分片、上传会话与确认租约均存 PostgreSQL 的 `media_uploads` / `media_upload_parts`；增量 migration `002_staged_uploads.sql` 不修改已有 migration 001。

确认中断后保持 `verifying`，可通过同一 complete 接口重试：已落库的 staging version 保持不变；TOS 合并响应丢失时通过服务端独占 staging key 的 HEAD 取回固定版本，不重复创建上传任务。确认过程最多持有十分钟租约，过期执行者不能发布 ready。浏览器在同一标签页保留续传标识，失败后重新选择原文件即可续传；若关闭标签页或上传过期，则开始新上传。

默认单文件 2 GiB、临时目录总预算 10 GiB、两个任务消费者、数据库池上限 10。预算检查能拒绝空间不足，但同步 FFmpeg 等在途输出仍可能短时增长；生产需独立临时盘、操作系统磁盘配额和监控。尚未做 200 人负载测试。

## 切换真实火山 TOS

复制 `storage.env.example` 为服务器私有配置，设置 `STORAGE_ENV_FILE`。需要 PostgreSQL 连接、已开启版本控制的私有 Bucket、地域、内外网 Endpoint、受限 AK/SK 或 STS 凭证；当前 SDK 适配器的 STS 凭证需要外部刷新后重启，不包含实例角色自动轮换。

后端读写走内网 Endpoint，浏览器和供应商临时链接走公网 HTTPS Endpoint。对象保存固定 version ID，每次写入尝试使用独立 key。开启版本控制时不能依赖 `forbid_overwrite` 禁止覆盖，因此实现以独立 key、固定版本和数据库 ready 状态共同保证原件引用不变。[TOS 官方覆盖写参数说明](https://www.volcengine.com/docs/6349/74859?lang=zh)

云端启动前先执行 `init-db`，再执行 `check`。运行账户建议与建表账户分开，数据库使用验证服务器证书的 TLS，示例密码必须替换。共享入口经 HTTPS 反向代理访问，模型密钥通过环境变量或独立运行目录提供。

首版保持一个 Web 进程。需要独立任务进程时，把 Web 的 `CLOUD_EMBEDDED_WORKER=false`，另运行 `tools/cloud_storage.py worker`。任务领取已支持多个数据库连接竞争；此处是存储基线说明；升级中的编辑租约已迁入数据库，WebSocket 广播等剩余跨进程联动仍待完成，所以不能宣称增加多个 Web 实例即可完整扩容。ComfyUI 与 ModelScope 已按 2026-09-14 用户要求移除；第三方素材注册和保留供应商实际拉取私有素材仍需对应服务的真实联调。

## 验收记录

```bat
python\python.exe tools\cloud_test.py
python\python.exe -m pytest -o pythonpath=. tests/test_cloud_test_runner.py -q
python\python.exe -m pytest -o pythonpath=. tests -q
node --test tests/test_canvas_resumable_upload.cjs
node --check static\js\canvas.js
node --check static\js\smart-canvas.js
```

本机 PostgreSQL 16 集成覆盖：并发画布保存、账本去重/冲突、队列竞争和旧租约拒绝、共享入口、上传/签名/Range/过期、缩略图、参考图、画布备份、真实 FFmpeg 裁剪、含素材工作流往返、模拟供应商中断与恢复、重复迁移、文档版本冲突、对象写入失败、真实 pg_dump/pg_restore、TOS SDK 参数契约和图片消费者。

真实 TOS 网络、权限、配额、供应商拉取和云端性能尚未验证；本地模拟不能替代这部分验收。

2026-09-14 复验结果：真实 PostgreSQL 16.15 + 本地对象模拟集成测试 **16 项通过**，包含新增的登录、会话访问及退出失效验证；验收脚本隔离测试 **8 项通过**。完整 Python 回归 **116 项通过、1 项既有断言失败、16 项云测试跳过**，另有 7 项 subtest 通过。失败仍为 `tests/test_canvas_run_entry.py` 断言旧的双参数签名，而现有函数为 `generatorSources(gen, loopCtx=null, graph=null)`；本次没有更改该函数。两份画布 JavaScript 语法检查及 `git diff --check` 通过。

本轮补强：测试连接使用 psycopg 解析，替换数据库名时保留密码转义、TLS 等连接参数；拒绝非回环主机、远程 hostaddr 和 service 配置。测试独立生成入口凭证和签名密钥，登录会话不再写入日常 `.local/auth.sqlite3`。仅导入验收模块不会加载私有配置或切换数据库。数据库初始化失败时也尝试清理本轮 schema，并始终关闭连接池；脚本退出恢复原进程环境。此脚本只做本地验收，不能用于真实 TOS 或远程云数据库验收。

### 目标计划继续实施：分片上传（2026-09-14）

- 云存储集成已扩展为 **26 项通过**：新增分片续传、超限/篡改、格式检查、并发确认、过期发布拒绝、确认后对象写入失败重试、过期 staging 清理和 preview variant；TOS 签名绑定及合并响应丢失使用真实 SDK + 模拟网络响应验证。
- 前端上传专项 **4 项通过**：普通本地模式兼容、断线重选后跳过已确认分片、内容变化拒绝和 HTTP 局域网无 Web Crypto digest 时的 SHA-256 边界用例。
- 完整 Python 回归 **116 通过、1 项既有断言失败、26 项云集成跳过**。CJS 全量首次复验 **152 通过、3 项失败**；失败位置为既有视频请求测试夹具缺少 `window` / `canvasId`，本轮没有修改它们提取的两份画布代码。后续又增加并通过 1 项前端哈希兼容测试，全量 CJS 未因此重复运行。
- `.local/cloud/pgdata` 开发库已先备份，再应用 migration 002。备份为 `.local/cloud/backups/20260914-052038.dump` 及同名对象清单。
- 浏览器通过登录页在普通/智能画布各上传一个人工图片：667 字节单片及 9,735,104 字节双片，图片预览实际加载成功。数据库中的两张画布均已保存，原件大小及 SHA-256 再读一致。证据位于 `.local/cloud/acceptance/storage-check.json`、`classic-upload.png`、`smart-upload.png`。
- 当前阶段的实现不代表整个目标计划已完成，剩余逐项审计见[实施进度](postgresql-tos-progress.md)。

真实 TOS 的 multipart 合并协议参照[官方分片上传说明](https://www.volcengine.com/docs/6349/127742?lang=zh)；本地对象模拟仍然使用 `.local/cloud/objects`，不要求开通云资源。

### 独立对象备份与恢复验收（2026-09-14）

云存储集成 **29 项通过**。恢复测试现在使用独立 PostgreSQL 数据库和独立对象目录，覆盖两种画布读取、含素材 ZIP 导出和字节一致性；新增损坏备份、导出中断、路径越界与覆盖拒绝用例。

开发库实测备份：`.local/cloud/backups/20260914-054255.dump`、同名 `.objects.json`、`.objects/`，共 7 个 ready 对象、10,029,722 字节。验收报告 `.local/cloud/acceptance/restore-20260914-054255/report.json`，同目录保留 `classic.zip`、`smart.zip`；恢复普通画布 revision 3、智能画布 revision 4，各包含 1 个原始素材。验收数据库已删除，备份与恢复对象目录保留，日常连接配置未更改。

随后核对并修复回归夹具：旧签名断言加入现有 graph 参数，保留 loopContext 与 graph 的传递检查；视频测试补齐 window/canvasId，并检查智能画布提交的画布 ID 和客户端任务 ID。画布业务函数没有为适应测试修改。最新全量结果：Python **117 通过、29 跳过、7 项 subtest 通过**，CJS **156 通过**；29 项跳过的云集成在专用 runner 中全部通过。

### 结果入库恢复（2026-09-14）

- `app/storage/finalization.py` 在素材下载前保存供应商结果、来源及已有费用快照到私有固定版本对象。大块 base64 图片随来源对象保存，不塞入任务 JSON。来源对象具有按任务生成的固定 ID，数据库状态提交丢失时可重新发现。
- 消费者优先恢复已有来源。输出 ID 由任务 ID 和输出序号生成，ready 输出直接复用，未完成输出继续下载/入库。恢复不创建新供应商任务、不轮询已有完整结果、不重新定价。来源对象与其他 ready 媒体一样纳入独立备份。
- 普通图片任务、通用视频以及 Agnes/玉玉专用视频路径接入；默认 local 模式保持既有执行方式。图片任务历史按任务 ID 唯一保存；PostgreSQL 任务状态、历史和账本在同一事务内提交，账本失败不会留下已成功任务。
- 临时入库故障按指数间隔重试，最多 5 次后进入 `needs_review`；来源明确过期/无权限等错误直接待核对。处理故障后，可执行 `python\python.exe tools\cloud_storage.py retry-finalization --task-id <ID>`，只允许有持久来源、无活跃租约的待核对/入库任务，绝不触发付费生成。没有持久来源时禁止通过此命令自动重发。
- 来源检查点完成前的供应商响应丢失不能保证恢复；多图生成尚未全部返回时也不会凭猜测重发整批。此边界与上游不确定提交一样需要人工核对，不能宣称外部 API 恰好执行一次。

新增 **7 项**实库故障测试，总计 **36 项云集成通过**：第二张图片入库中断、账本失败原子回滚、来源对象完成但状态提交丢失、视频已有结果恢复与费用快照、过期来源、旧租约拒绝、重试上限和人工重试门槛。视频模拟响应保留 108900 completion tokens 与 7623000 微元金额，恢复时禁止生成、轮询和重新计价。测试均不调用付费接口。

已提交前一阶段上传/备份/回归基线：`fc971fd`；后续按通过验收的阶段继续独立提交。

### 任务请求规范化与账号引用（2026-09-14）

- 对结构化媒体输入，已迁移旧路径、本站签名地址、本站绝对地址，以及数据库中可对应到 bucket/key/version 的 TOS 地址，统一保存为 `/api/media/<ID>/content`。签名刷新不改变幂等指纹，素材重命名也不改变引用。提示词、名称、供应商 `asset://` 和 registrations 保持原内容。未知外链保留完整请求语义，不能用删除全部查询参数冒充规范化；TOS 未知版本/变换地址拒绝当作原件。
- 新任务校验并按 ID 排序锁住所有已知媒体输入，锁持续到任务创建提交。未迁移、未上传完成、已删除素材不能入队；内嵌 data URL 需先经上传接口变成媒体 ID。执行前再次检查；成功状态提交也校验输出 ready。历史导入使用显式历史模式保留旧请求，不能将未知历史素材/账号伪造成已就绪或已识别。
- 请求递归剔除大小写/连字符/下划线变体的 API Key、AK/SK、Authorization、Cookie 及访问/刷新/会话凭证字段，保留 `max_tokens` 等模型参数。含用户名/密码的媒体 URL 拒绝写入新任务。
- 新任务固定当时实际选中的供应商，避免默认供应商变更后漂移。账号引用写入现有 `provider_account_ref` 列：默认是环境键名及密钥指纹，不保存密钥本身；可在私有环境配置中给 `<供应商密钥环境变量>_ACCOUNT_REF` 设置稳定的非密钥账号标识，例如 `ARK_API_KEY_ACCOUNT_REF=ark-main`。使用显式标识时，同账号正常轮换密钥可保留标识；切换真实账号必须变更标识。未显式配置时，密钥变化会触发执行前的待核对保护。历史账号缺失保持未知。
- 图片和视频创建接口都接受对应前缀的 `client_task_id`；同 ID、同规范请求返回已有任务，内容变化返回 409。省略 ID 时仍由服务端生成。失败的任务创建不会提前写入内存任务缓存。

验收：新增 **9 项**实库测试，总计 **45 项通过**。覆盖签名/别名等价、TOS 固定版本、输入 ready/删除/缺失、两种任务 API 幂等、凭证或输入变化时禁止调用供应商、上游轮询账号保护、并发素材行锁与未完成输出拒绝。全量 Python 回归 **117 项通过、45 项云测试跳过、7 项 subtest 通过**；云测试通过专用隔离 runner 单独执行。已提交上一阶段结果恢复：`3f54aca`。
