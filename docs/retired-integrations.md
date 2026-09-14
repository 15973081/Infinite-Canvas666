# ComfyUI 与 ModelScope 移除记录

更新：2026-09-14，第 20 批。依据用户明确要求“comfyui 弃用”及“删掉 comfyui + modelscope 等”，调整升级范围；这不是用停用代替原计划交付，而是用户取消了两套集成。

## 删除范围

- 删除 ComfyUI 连接/工作流管理、执行模块和主机后端选择，移除 /api/generate、/api/upload、/api/workflows、/api/comfyui/instances 等旧入口。
- 删除 ModelScope 专用生成、轮询、默认供应商、环境密钥读取及 /api/config/token；通用图片和对话不再转入 ModelScope 专用分支。
- 删除 Z-Image、增强、Klein、视角、ComfyUI 设置页面与导航、iframe；删除 ModelScope 专用供应商引导和 LoRA 编辑器。
- 双画布移除 ComfyUI/ModelScope 新建和执行入口；LTX Director 同样依赖 ComfyUI，因此一并移除新建和执行。共享 CanvasApi 删除旧生成、上传与工作流管理方法。
- 保留通用供应商、图片/视频/对话、两种画布、画布工作流导入导出、素材及费用功能。RunningHub 此前已不在后端可用供应商列表，本批未扩大到删除其余独立遗留代码。

## 历史数据边界

不删除用户原始工作流 JSON、画布、素材、历史结果、费用记录或旧配置原件。历史画布节点仍可展示、导出和保存原参数；经典 ComfyUI、ModelScope 和 LTX 节点显示“功能已移除”。停止刷新 ComfyUI 工作流列表，不因无法找到已弃用工作流而擦除原节点标识。

旧供应商显式解析返回 410，不回退其他账号。独立后台隐藏遗留集成配置和分配，拒绝重新创建/分配/诊断/读取凭证；数据库中旧配置不自动物理删除。已存结果及费用保留，旧集成未完成的上游任务不能宣称仍可轮询恢复，需在后续迁移报告中人工核对。

仅保留历史展示和明确拒绝运行所需的兼容代码与字段，不提供恢复集成开关。通用模型中出现 Qwen、Klein 等模型名称不代表重建 ModelScope 集成，实际使用仍由明确配置的通用供应商决定。

## 验收

- PostgreSQL 全量：200 通过，含新增 4 项删除/旧配置用例；验证真实应用路由、通用任务入口仍在、旧配置无法恢复可用供应商、旧供应商不回退。
- 最后补齐旧默认供应商过滤后，删除边界专项复验 4 通过；日志 retired-integrations-final-boundary.log。
- Python：120 通过、200 云测试跳过、7 subtest 通过。
- CJS：237 通过，含新增 4 项旧页面/菜单、历史参数保留、执行零副作用和客户端接口移除用例。历史分页检查更新为仍保留的页面。
- 浏览器：新版工作台仅展示在线生图、对话、双画布入口及素材库；经典画布同时展示三种历史节点及移除提示，无执行按钮；智能画布引擎只有 API 和火山选项。未调用真实模型。

日志与截图：.local/cloud/acceptance/retired-integrations-final-{postgres,python,frontend}.log、retired-integrations-{workbench,historical-nodes,smart-menu}.png。独立预览使用 localhost:8772 和随机 workbench_ui_* schema，与用户 8768/8770 进程分开，已正常退出并确认 schema 已清理；新 tools/workbench_preview.py --port 8772 --browser-host localhost 支持这种验收方式。

## 计划与运行状态

ComfyUI 连接迁移、空间分配和 ModelScope 专用功能不再属于交付要求。M2 剩余工作为保留供应商的旧配置显式导入、任务处置、备份管理及旧工作台管理页移除；身份/权限、双画布协作、维护排空和 M4 恢复验收继续进行。

本批无新数据库迁移，开发 schema 尚未应用 004–012，.local TOS 模拟继续保留。第 20 批提交时用户服务尚未重启；随后已保留数据并加载新版后端。

## 运行服务更新（2026-09-14）

工作台 8768、第二工作台 8769、管理平台 8770 已全部加载移除后的代码，HTTP 200。新版管理产物的三个文件与源码 SHA-256 一致；浏览器验证原有成员、共享空间、已有画布列表和管理平台均可访问。旧 Z-Image、视角、增强、Klein 页面返回 404；已登录成员请求旧工作流、ComfyUI 实例和令牌接口被准入层以 403 拒绝。供应商摘要已没有旧集成字段。路由本身的删除由第 20 批应用 OpenAPI 测试覆盖，不能仅以 403 推断路由不存在。

原预览脚本默认退出会删 schema，已新增 --resume-schema：仅接受本地 canvas_cloud_test 库内的既有 workbench_ui_<32 hex>，核验目录和迁移版本，复用对象/临时/运行目录，不初始化成员、不执行迁移，正常退出和启动失败均保留 schema。默认一次性验收模式仍会清理自己的 schema。

重启前未发现运行/排队任务、上传、有效租约或已上报未保存页面；先创建当前 schema 的 pg_dump 自定义格式备份及目录副本，再核对旧进程身份并结束旧 wrapper 与两个子进程，避免触发旧脚本的删除清理。PostgreSQL 未停止。重启前后核对 38 张表的内容摘要，仅页面报告和服务心跳变化；3 个空间、3 名成员、5 张画布及其他业务数据保留。页面报告仅覆盖已上报页面，本次本地预览更新不代表完成全平台停库/恢复验收。

证据保存在 .local/cloud/backups/member-preview-2026-09-14T06-03-31-413Z/：preview.dump、files/、table-checks.json、after-restart-check.json、runtime-check.json、resume-tests.log。已验证备份目录清单可读取，本次没有执行全量恢复演练。新增 7 项恢复模式测试，联合既有测试运行 15 通过。当前服务清单位于 .local/cloud/runtime/active-member-preview.json，persistent=true；后续启动方式见[本地运行说明](management-platform-local.md)。
