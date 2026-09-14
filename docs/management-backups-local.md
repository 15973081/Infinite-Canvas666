# 管理平台备份与空间导出

独立管理平台提供备份记录、明确请求、排队/执行/完成/失败状态及审计，追加 migration 015。后台 API 不接受文件路径或命令；备份由独立执行器处理，不依赖工作台或生成 worker。

## 范围与权限

| 范围 | 权限 | 归档内容 |
|---|---|---|
| 平台全库备份 | backup.platform | PostgreSQL 一致性快照，以及快照内所有 ready 对象的固定版本、大小与校验值；含成员、角色和全部空间数据 |
| 空间共享数据导出 | backup.request 发起；backup.read 查看记录 | 目标空间画布、共享素材、素材引用/旧路径别名、画布目录、共享目录、提示词库、素材库、画布备份和五张费用账本兼容表 |

空间导出明确排除私人对话、身份/登录会话、供应商配置与凭证、任务执行状态和内部结果检查点。它是共享资料归档，不是可直接恢复数据库的备份。全库备份及数据库恢复继续属于平台运维范围，原有 M4 完整恢复要求不变。

全库备份复用 app/storage/backup.py 的快照与不可变对象校验。空间导出在单一 REPEATABLE READ 事务内按目标空间导出固定表和文档白名单，再复制快照中的对象版本；包括已保留的删除数据，不触发物理清理。不完整上传只记录数量，不冒充已备份字节；原件校验失败则整个请求失败。

两类操作都要求管理站点会话；请求时、执行前和成功发布前复核权限。同一请求 ID 绑定发起会话、空间及说明，重试返回同一任务；同一范围只允许一份排队或执行中的请求。所有状态变化留审计，不在管理 API 中回显内部路径、数据库连接信息或原始对象存储错误。

执行器使用数据库会话锁覆盖整个导出过程，避免大文件导出期间被其他执行器抢走。进程退出后锁自动释放；下一次执行将遗留 running 记录标记为中断失败，保留已有文件，重新请求使用新编号和目录。页面不提供数据库恢复或未授权归档下载。

## 启动与取用

先受控完成待执行迁移，再为管理进程和备份执行器配置同一绝对目录。不要把该目录放进公开静态目录。下面使用独立本地备份路径：

~~~powershell
$env:STORAGE_ENV_FILE = Join-Path (Get-Location) '.local/cloud/storage.env'
$env:MANAGEMENT_BACKUP_ROOT = Join-Path (Get-Location) '.local/cloud/managed-backups'
.\python\python.exe tools\management_backup_worker.py --watch
~~~

不带 --watch 时只处理一项请求并退出。--stop-file 可让执行器在当前任务完成后停止轮询。管理进程仍使用原独立启动命令；它只接受请求，不自行启动备份执行器。

归档由运维在 MANAGEMENT_BACKUP_ROOT / 数据库 schema / 请求编号 目录取用。页面显示请求编号用于核对：

- 平台：database.dump、database.objects.json 和 database.objects/；使用 tools/cloud_storage.py verify-backup --source 指向 dump 验证。
- 空间：workspace/，包含各表 JSONL、objects.jsonl、objects/ 和最后发布的 manifest.json；使用 tools/management_backup_worker.py --verify-workspace 指向 workspace 目录离线验证。

Windows 本地路径应保持简短，避免旧运行时的 MAX_PATH 限制。归档没有自动保留期限删除；凭证加密主密钥的独立保管、数据库恢复后的会话失效与维护状态检查仍按完整恢复计划执行。

## 本地验收

隔离浏览器命令：

~~~powershell
.\python\python.exe tools\management_preview.py --backup
~~~

仅此预览选项会同时启动一份独立的备份执行器，数据库强制使用 canvas_cloud_test 中随机 management_ui_* schema，素材和归档进入本轮 .local/cloud/backup-preview/ 短路径。打印的 stop_file 会让 Web 和执行器收尾，再清理测试 schema；归档及截图保留作为证据。

浏览器已完成平台请求和空间请求：两项均由独立进程完成，分别校验 1 个对象、33 字节。空间导出包含 1 张画布和对应引用、目录；切换其他空间看不到该记录。实库确认 2 个成功任务、6 条备份审计、0 生成任务和 0 付费提交。截图和 database-evidence.json 位于 .local/cloud/acceptance/management_ui_567eaa397d6d49f7be7153fe3e3d611b/。

独立预览和执行器已正常结束，临时 schema 已核实清理；服务停止后，两份归档仍通过离线校验，结果保存为 offline-verification.json。全量测试中的真实全库备份使用独立 schema 与本地对象目录，避免把其他协议测试故意保留的模拟 TOS 版本当作本地文件。

自动回归日志位于 .local/cloud/acceptance/backup-control-*.log。专项覆盖范围隔离、权限拆分、撤权、请求去重、并发执行互斥、中断记录、损坏检测、真实 pg_dump 和对象校验。最终全量 PostgreSQL 236 通过；Python 127 通过、236 云测试跳过、7 subtest 通过；CJS 249 通过。

## 当前运行边界

本批未迁移或重启用户当前服务；现有用户预览仍为 migration 012，需要受控应用 013–015 并配置执行器后才能使用新功能。开发库仍未应用 004–015，本地 TOS 模拟与原数据保留。

备份管理已接入，完整发布排空、旧工作台管理页面迁出、历史身份映射以及数据库恢复与会话失效的整体验收仍未完成。
