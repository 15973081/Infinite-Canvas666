# 管理平台资源概览与本地验收

2026-09-15，第 41 批。对应管理平台升级计划第 3、5 节的空间资源统计与概览；继续使用 PostgreSQL 和 .local 对象存储模拟。

## 行为

独立管理服务新增 GET /api/overview，概览不再只显示权限点数量。选择空间后显示成员状态数量、经典/智能画布及回收站数量、就绪素材原件与派生预览数量、登记容量、任务状态汇总、有效维护状态、业务服务心跳及最新备份结果。空间列表可直接进入该空间资源概览；维护和备份卡片可进入对应管理页。

各项权限独立核对：成员管理、画布读取、素材读取、任务核对、维护和备份读取互不代替。平台管理身份不会自动获得跨空间画布/素材/任务统计。平台概览仅显示获准的平台统计，空间统计必须指定可管理空间。已归档空间保留名称和归档提示，暂停资源统计；未授权显示“未授权”，实际零值仍为零。

统计使用同一授权事务，不返回画布正文、任务提示词、对象键或版本、备份原因和文件路径。请求须使用管理会话，禁止缓存；数据库故障返回脱敏的 503。各查询反映读取时的数据库状态，不承诺所有资源在同一瞬间冻结。前端切换空间、账号或页面后丢弃迟到响应；失败提供重试。

容量是数据库中未删除、已就绪原件与预览的 size_bytes 合计，排除 task-result-source 内部结果来源。它不是物理磁盘用量：未完成上传、内部对象、备份或孤立文件不在其中；界面明确说明。字节数使用十进制字符串传输，以 BigInt 换算，避免大数精度丢失。服务心跳按在线、失联未确认和已记录停止汇总，属于全局业务服务状态，不能作为停库许可。

## 验收

- PostgreSQL 专项 5 项：真实多空间资源与状态统计、正文不泄露、独立权限、即时撤销、平台管理边界、非法范围、零值、归档、服务心跳新鲜度、平台维护覆盖、会话受众隔离、数据库故障脱敏；统计读取不追加管理审计事件。
- 前端专项 8 项：真实计数与入口动作、零值和未授权、大整数格式、平台范围、归档、空间/账号/页面代次变化后的迟到结果、重试与旧错误、服务端范围不符拒绝显示。
- 完整 PostgreSQL：335 通过，47 条现有依赖弃用警告，进程正常退出。
- 完整 Python：180 通过、335 云测试跳过、7 subtest 通过。
- 完整 CJS：485 通过。

复验命令：

~~~text
python/python.exe tools/cloud_test.py
python/python.exe -c "import sys;sys.path.insert(0,'.');import pytest;raise SystemExit(pytest.main(['tests','-q']))"
node --test tests/*.cjs
~~~

浏览器使用 localhost:8774 的独立验收库。设计空间显示 3 位成员、2 张画布、1 份原件、1 份预览、3.0 KiB、4 个任务及一条失败备份；切换制作空间后素材/容量/任务归零，备份为空。只具备成员管理和素材读取权限的成员仍能看到成员/素材，画布、任务、维护和备份明确显示未授权。截图和 DOM 记录留在 .local/cloud/acceptance。临时浏览器页面已关闭，服务正常退出，自有 schema workbench_ui_87b52589d018436689efc3d36125bfd1 已核实清理。没有真实供应商调用。

本地证据：management-overview-targeted.log、management-overview-postgres.log、management-overview-python.log、management-overview-frontend.log；management-overview-space.dom.txt、management-overview-other-space.dom.txt、management-overview-limited.dom.txt；management-overview-space.png、management-overview-limited.png；management-overview-user-before.json、management-overview-user-after.json、management-overview-user-http.json。

## 本地部署与剩余范围

现有预览有一条未保存页面报告，因此只更新独立管理服务 8770，保留画布 8768/8769 的原进程和连接，未重新加载用户页面。更新前没有排队/运行中的备份，复用原数据库、对象目录和供应商加密密钥，无迁移或数据恢复覆盖。独立 HTTP 管理会话验证了平台及全部三个空间的新概览和前端文件，随后登出。三个入口均 HTTP 200；5 张画布、9 份素材、供应商表的更新前后摘要一致。

当前管理进程独立于原预览父进程：启动入口 .local/cloud/runtime/management-only-batch41.py，进程身份及说明已记录到 active-member-preview.json。后续整体重启必须先按记录核实并停止此独立管理进程，再恢复原持久预览，避免 8770 端口占用。不要只依赖旧父进程的子进程清理。

本批完成概览统计，不代表完整管理平台或总体升级完成。旧业务入口/历史身份映射、完整协作与维护故障矩阵、手动查询/LLM 等剩余异步路径、正式迁移切换及原生 TOS 恢复继续按原计划保留。
