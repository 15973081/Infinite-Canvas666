# PostgreSQL 与本地对象备份恢复

日期：2026-09-14。M4 恢复验收，第 27 批。

新增 tools/cloud_restore.py，使用既有格式 2 的可信 pg_dump + 对象清单包，将数据库和 .local 文件对象模拟恢复到独立空数据库、新目录。只支持 filesystem 模拟备份；原生 TOS 的版本恢复/映射仍需单独流程，不把新上传产生的版本号当作原版本。

## 前置条件和执行

恢复前离线运行 tools/cloud_storage.py verify-backup --source PATH.dump。备份包必须来自可信运维来源；清单校验能发现不一致，不会把任意 SQL 归档变成可信代码。

维护人员预先创建一个空目标数据库，并准备其连接配置。工具不会创建数据库，不接受覆盖、clean 或 force，不操作原库；目标数据库名必须与明确指定的 --database 一致，不能使用 postgres/template0/template1。目标不能有任何应用 schema/public 表或函数，也不能有其他已连接客户端。输出目录必须不存在，且与备份包分离。

通过受控进程环境提供 RESTORE_DATABASE_URL，不把连接串或密码写在命令参数中。例如在已配置该环境变量的项目终端：

~~~powershell
.\python\python.exe tools\cloud_restore.py --source '.local/cloud/backups/example.dump' --database canvas_recovered --destination '.local/cloud/recovered/example' --reason '从核验备份恢复到独立目标'
~~~

工具依赖 PostgreSQL 的 pg_restore、psql；沿用项目的本地工具定位。退出 0 才表示已写入 restore-complete.json。失败返回 restore_incomplete_keep_target_isolated，保留新目标/目录以便核对，不自动删除或覆盖。中断、超时、配置文件写入失败时先检查目标和回执，不假定数据库完全没有变化，也不要直接开放服务。

## 原子恢复与恢复后的状态

对象先恢复到新目录，并按固定 key/version、大小和 SHA256 核验。数据库 SQL 和后置处理通过 psql 单事务执行：数据库记录、旧凭证失效和恢复限制一起提交；不会先提交仍可使用旧会话的裸恢复库。事务内再次核对全部 migration 版本/摘要，以及资产记录与对象清单是否完全匹配。旧版本备份不能直接当作当前版本启动；不在恢复命令中自动迁移。

恢复后：

- 所有旧成员/管理会话被撤销，成员授权版本递增；未使用的旧激活令牌失效。
- 画布租约基于备份中的代次递增并清除持有凭证；待交接申请拒绝，旧交接凭证到期。画布内容和修订、空间、角色、分配与历史费用保持。
- 所有未完成任务，包括备份中的 queued，进入 needs_review，执行租约清除。快照后的真实供应商提交情况尚需核对，不自动重新付费或继续查询。已有提交记录和价格/费用事实不重写。
- 未完成上传明确中止，临时分片不当作已恢复原件；已有 ready 对象保持原 key/version/字节。生成的新配置使用全新 MEDIA_SIGNING_KEY，旧本地素材签名失效。
- 备份中排队的备份请求取消，执行中的备份标记失败；历史成功记录保留。旧服务心跳清除，不冒充目标库的在线服务。
- 平台进入 recovering，保留各空间控制记录；不会在服务启动时自动 normal。新增数据库恢复审计及画布凭证失效事件，记录恢复编号、备份摘要和原因。

同一恢复事务发生错误时整批数据库 DDL/数据/失效处理回滚；未发布完成回执。对象目录可能已准备好，但不能据此判断数据库恢复完成。

## 接入恢复目标

新目录包括 objects、storage.env、restore-complete.json，以及用于诊断的 database.sql/fence.sql。这些都是私有运维文件，包含数据库资料；不要放到 Web 静态目录或公开仓库。

storage.env 固定新库、新 schema、新对象目录及新签名密钥，并默认 AUTH_MODE=members、CLOUD_EMBEDDED_WORKER=false。它不复制供应商解密主密钥，也不决定业务/管理站点地址；维护人员须从原受控密钥存储提供 PROVIDER_SECRET_KEY，并配置 PUBLIC_BASE_URL/MANAGEMENT_BASE_URL。

在没有遗留原库 DATABASE_URL/DATABASE_SCHEMA/OBJECT_STORE_ROOT 等导出变量的专用进程环境中加载新配置；项目配置规则仍是“已导出的环境变量优先”。先用本机恢复工具 status 明确核对目标数据库和 schema，防止误连原库：

~~~powershell
.\python\python.exe tools\maintenance_recovery.py status --storage-env '.local/cloud/recovered/example/storage.env' --database canvas_recovered --schema BACKUP_SCHEMA --platform --username your-admin
~~~

新登录可进入管理恢复流程，普通业务保持限制。核对对象、空间与授权、任务、备份后的增量和外部供应商事实，再按[本机恢复工具](maintenance-recovery-local.md)明确恢复开放。仅有本次备份不能证明已经保全备份之后的增量，原环境仍有新写入时不能直接切换到旧快照。

## 验收

使用真实 pg_dump/pg_restore/psql，在独立源 schema 与新目标数据库测试。源数据有两个业务空间、三名已激活成员与一名待激活成员、自定义审核角色、四张普通/智能画布、不可变原件、历史费用和加密供应商配置。

专项已验证业务表逐行保持、旧会话/激活/编辑凭证拒绝、旧签名拒绝、新登录仍受恢复限制、明确恢复开放后可重新领取租约并读取原版本字节、原库会话保持有效。另覆盖现有目录/数据拒绝、错误目标和活跃连接拒绝、清单/迁移不一致拒绝，以及失效处理失败后整批回滚。命令行通过环境接收连接串，输出不包含连接串。

首轮遇到 Windows 测试临时目录过长，已改用 .local/cloud/r27-* 短目录；失败夹具增加 finally 清理，首轮留下的四个 schema 在逐项核实合成成员和画布后已移除。第二轮修正测试 Cookie 域重复，随后完整恢复专项 4 通过；新增防错用例由最终全量回归覆盖。

新增 7 项实库恢复测试；最终全量 PostgreSQL **268 通过**，Python **132 通过、268 云测试跳过、7 subtest 通过**。所有本批 restore_fixture_* 源 schema 和 cloud_restore_* 目标测试库均核实清理。用户 8768/8769/8770 均返回 HTTP 200。

日志位于 .local/cloud/acceptance/database-restore-postgres-full.log 和 database-restore-python.log。本批无前端变更，不新开浏览器预览；HTTP 登录、维护限制、素材读取和编辑凭证行为由真实恢复库上的 ASGI 测试验证。

本批无新 migration，未恢复或切换用户数据库，未重启原有服务。用户预览 013–015、开发库 004–015 仍待应用。实际切换/增量保全、原生 TOS 恢复、进程/连接停服核验和完整多成员浏览器故障矩阵仍待完成，整体目标未完成。
