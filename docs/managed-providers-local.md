# 独立后台供应商配置与空间分配验收

更新：2026-09-14。M2 第十七批，整体迁移仍在进行。

## 已接入的行为

独立管理站点增加“供应商与分配”：创建及编辑供应商、启用/停用、图片/视频/对话模型列表、端口/代理/价格等高级配置，以及 API Key、火山素材 AK/SK 的写入、替换和明确清除。凭证输入留空表示保留原值；页面只显示已配置的凭证项，不回显原值或片段。

供应商配置属于平台；空间只取得明确分配的使用资格和默认供应商。平台权限 provider.configure 控制配置，分配还要求 space.assign；普通成员通过 provider.use 使用本空间配置。保存和分配都要求当前版本及操作原因，过期页面返回冲突；变更与审计在同一事务提交。

migration 012 新增 managed_providers、workspace_provider_sets、workspace_provider_grants。凭证通过 Fernet 认证加密保存在独立字段中；API 列表、审计及请求验证错误不包含明文凭证。新增 ID 必须采用规范的小写标识，避免存储 ID 与运行配置 ID 不一致。

成员模式从当前空间的已分配、已启用配置读取模型及运行凭证，不再合并默认供应商或回退到主机全局密钥。成员摘要仅返回模型、价格、名称、默认项及 enabled/has_key 布尔状态；不返回服务地址、环境变量名或密钥预览。has_key 只表示已保存 API Key，不代表连接测试已通过。修复了摘要缺少该字段而被智能画布筛掉的问题。

## 在途任务边界

任务保存实际供应商 ID 和账号绑定摘要。改名、模型或价格变化不改变账号绑定；凭证、接口、代理或火山项目/区域变化会改变绑定。

取消分配或停用后，未提交任务不能再取得新的付费准入。已有明确上游任务 ID 的 polling/finalizing 任务，仅在服务端工作线程持有本空间该任务有效执行租约、且原账号绑定仍一致时，可继续用原供应商查询结果；成员请求不能自行声明这一例外。账号变化返回冲突，不能换账号盲目查询或再次生成。本批不保存旧凭证版本，也不提供自动密钥轮换或人工任务恢复页面。

## 部署配置

安装 requirements-cloud.txt 中新增的 cryptography 依赖。管理进程、成员工作台与任务 worker 必须注入同一个稳定的 PROVIDER_SECRET_KEY，格式为 Fernet 所需的 URL-safe Base64 编码的 32 字节随机密钥。可通过进程环境或已有 STORAGE_ENV_FILE 注入，避免提交到 Git。仅测试工具为每轮隔离数据库生成临时加密密钥。

加密主密钥缺失、格式错误或无法解密时，凭证读写拒绝执行，不回退到旧环境凭证。配置列表仍能读取。备份时必须另行保管与数据库密文对应的主密钥；不能每次启动随机生成新值。本批未生成真实部署密钥，也未迁移旧供应商配置及私有凭证。

开发库仍只有 001–003，未应用 004–012；真实切换须先按既定备份/迁移流程完成全部待执行版本和供应商显式导入、空间分配。旧配置不会自动对所有空间开放。本地 TOS 模拟仍在 .local/cloud/objects。

## 验收

新增 8 项 PostgreSQL/HTTP 测试，覆盖：密文和脱敏、空间分配及默认选择、未知供应商拒绝、替换/清除与禁止主机回退、账号绑定、已提交任务恢复边界、权限撤销、非法配置/缺失主密钥、审计回滚及并发版本冲突。

最终回归命令及结果：

- python tools/cloud_test.py --tb=line：154 通过。
- python -m pytest -o pythonpath=. tests -q --tb=line：120 通过，154 云测试跳过，7 subtest 通过。
- node --test tests/*.cjs：226 通过。
- 独立管理前端构建及 JavaScript 语法检查通过。

浏览器使用两轮 workbench_ui_* 临时 schema 和合成账号。首轮完成后台无凭证供应商创建及空间分配；第二轮由测试服务写入不可用的合成凭证，再通过实际后台分配、改名/修改模型（凭证留空保留）、停用和查询审计。智能画布显示获分配模型，重开后显示修改值；另一空间不显示该供应商，停用后原空间不再显示可用模型。未点击生成或调用真实供应商。

截图位于 .local/cloud/acceptance/：managed-provider-admin-assigned.png、managed-provider-edit.png、managed-provider-smart-assigned.png、managed-provider-smart-updated.png、managed-provider-other-space.png、managed-provider-disabled.png、managed-provider-audit.png。日志为 managed-providers-verified-postgres.log、managed-providers-verified-python.log 和 managed-providers-final-frontend.log。两轮临时预览已结束；关机后恢复数据库再次查询，两份验收 schema 均不存在。停止前核实第二轮生成任务与付费提交记录均为 0。

## 尚未完成

本批完成供应商配置、凭证和分配的首条管理/运行链路。供应商模型列表检测与选择导入已在[下一批](provider-probes-local.md)接入；协议诊断已在[第十九批](provider-diagnostics-local.md)接入，ComfyUI 与 ModelScope 已按用户要求[移除](retired-integrations.md)。保留供应商的旧配置显式导入、工作台旧管理页面移除、任务处置和备份管理仍未完成。经典画布及全部生成入口的完整供应商浏览器流程、在途配置变更自动提醒、完整维护恢复和正式迁移仍按总计划继续，不能以本批验收宣称 M2 或线上切换完成。

旧配置与凭证显式导入已接入，支持受控预览、分项选择、完整价格历史和重试回执，见[导入说明与验收](provider-imports-local.md)。
