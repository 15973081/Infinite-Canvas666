# 本机维护恢复工具

日期：2026-09-14。对应 M3 第 26 批。

当工作台和管理 Web 服务停止或无法使用，而 PostgreSQL 与已有成员身份正常时，可在项目服务器运行 tools/maintenance_recovery.py。工具不依赖 HTTP，不导入业务或管理 Web 入口，不启动消费者，不创建账号、重置密码、迁移数据库或提供免认证恢复。

## 使用

需要已初始化的管理员账号、对应范围的 maintenance.platform 或 maintenance.space 权限，以及与当前代码一致的数据库 migration。明确指定配置文件、预期数据库名、schema 和目标范围；环境中已导出的配置优先于文件，但实际数据库/schema 仍必须匹配命令参数。

以下为开发库示例，执行前按实际配置替换账号、数据库和 schema；用户正在使用的预览属于另一 schema，不能照抄开发库目标操作它。

~~~powershell
$maintenanceTarget = @('--storage-env', '.local/cloud/storage.env', '--database', 'canvas_cloud_dev', '--schema', 'canvas_cloud', '--platform', '--username', 'your-admin')
.\python\python.exe tools\maintenance_recovery.py status @maintenanceTarget
~~~

工具通过不回显的终端读取密码。不要把密码加入命令行或保存到日志；无安全终端时明确拒绝回显降级。自动化可以显式使用 --password-stdin，从安全来源提供一行密码；不接受 --password 参数，也不输出登录令牌。

status 返回当前控制状态、有效限制、版本和发布检查，并记录本机读取审计。它不会重置维护状态。

完成更新和初步运行检查后，使用刚读到的版本进入恢复检查。下面的 3 和 4 是示例，必须替换为实际 control.version：

~~~powershell
.\python\python.exe tools\maintenance_recovery.py recover @maintenanceTarget --expected-version 3 --reason '完成更新，进入恢复检查'
.\python\python.exe tools\maintenance_recovery.py status @maintenanceTarget
~~~

recover 只进入 recovering，仍限制普通成员业务访问。核对业务、数据库、对象、队列与备份恢复方案后，明确恢复开放：

~~~powershell
.\python\python.exe tools\maintenance_recovery.py reopen @maintenanceTarget --expected-version 4 --reason '运行和数据恢复检查完成' --confirm-recovery
~~~

reopen 要求当前状态为 recovering，不能直接从 offline/draining 跳到 normal；没有确认参数则拒绝。版本变化时重新读取并核对，不自动重试更改。命令中断、依赖错误或响应不确定时先运行 status，不能假定此前未提交。

空间操作将 --platform 替换为 --workspace SPACE_ID。恢复空间不能解除仍有效的平台维护。来自服务器本机本身不赋予权限；普通成员、已撤权成员、停用账号及其他空间的维护人员均不能越权恢复。

## 会话、审计与错误

每次命令创建自己的 management 会话，不复用浏览器会话；登录后将其有效期缩短到最多 5 分钟，退出时仅撤销该私有会话。即使执行期间成员被停用，仍尝试撤销自己的会话。若撤销时数据库不可用，输出 local_session_cleanup_unconfirmed 警告；已提交的维护变更不因此伪报失败。命令意外被强杀时不能承诺 finally 已执行。

维护变更复用共享授权锁、状态转换、版本检查和 maintenance.change 审计；本机来源的 maintenance.local.recover/reopen 记录与状态更改在同一事务提交。读取与私有会话关闭也有对应审计。不记录密码、令牌或连接字符串。

| 退出码 | 含义 |
|---|---|
| 0 | 命令已完成，读取 JSON 结果 |
| 2 | 参数、明确确认、密码输入方式或目标匹配不满足要求 |
| 3 | 登录、限流或当前权限拒绝 |
| 4 | 版本或维护状态转换冲突 |
| 5 | 数据库/配置依赖不可用，先检查状态与依赖 |
| 130 | 用户中断，先重新检查状态 |

异常输出只包含稳定错误码，不显示异常堆栈、连接串或意外传入的参数内容。工具不能恢复不可用的数据库；完整数据库恢复仍走受控运维流程。

## 验收与边界

新增 7 项 PostgreSQL CLI 测试及 5 项密码/错误边界测试。专项筛选 8 通过，其中包含既有“维护恢复不复活旧编辑令牌”测试；新 CLI 场景验证独立子进程、两步恢复、公告保留、版本冲突、只读检查不清空状态、目标防错、空间权限和撤权、并发仅一次提交、平台限制优先、私有会话到期与撤销、无令牌/密码/连接串输出。

全量 PostgreSQL **261 通过**，Python **132 通过、261 云测试跳过、7 subtest 通过**。结果记录于 .local/cloud/acceptance/maintenance-recovery-postgres-full.log 与 maintenance-recovery-python.log；本批没有前端变更，前端基线沿用第 25 批 256 通过。本批验收通过真实隔离 PostgreSQL 和独立命令进程完成，不需要浏览器，不调用模型或重启用户服务。

工具不授权停库、不自动完成备份校验，不处理残留任务租约或不明供应商提交事实；这些恢复核对与真实进程/数据库连接检查、M4 完整恢复演练仍保留。既定 M1/M2/C2/C3 其他范围不变。

本批无新 migration，未操作真实使用数据。用户预览仍待 013–015 与新后端，开发库仍待 004–015；必须完成相应部署前置条件才能对这些环境使用本工具。
