# 独立管理平台本地运行与当前边界

管理入口为 `management_main:app`，前端源文件位于 `management/frontend/`，构建命令为 `python tools/build_management.py`。产物默认写入 `.local/management-dist/`；工作台入口不挂载这份产物。管理进程复用 PostgreSQL 身份/授权服务，不导入 `main.py`，不启动生成 worker，不自动迁移或重置维护状态。

## 使用已有本地数据库

先完成原有备份流程并应用全部待执行 migration（当前为 004–015），再通过 `tools/member_admin.py bootstrap` 初始化真实管理员。新版管理入口会核验全部迁移版本，未初始化时拒绝启动，没有网页登录初始化或共享密码后门。这里的运行说明不代表已对开发库执行迁移，也不表示工作台已完成多空间切换。

在项目根目录的 PowerShell 中运行：

```powershell
$env:STORAGE_ENV_FILE = Join-Path (Get-Location) '.local/cloud/storage.env'
$env:MANAGEMENT_BASE_URL = 'http://127.0.0.1:8766'
.\python\python.exe tools\build_management.py
.\python\python.exe -m uvicorn management_main:app --host 127.0.0.1 --port 8766
```

`MANAGEMENT_BASE_URL` 必须与浏览器打开的 origin 一致，包含端口；本地允许回环 HTTP，部署时使用 HTTPS。管理前端的写请求需同源 Origin，不配置跨站 CORS。管理 Cookie 为 HttpOnly、SameSite=Strict、host-only；HTTPS 下设置 Secure。管理与工作台的 Cookie 名称和 audience 分离，两个站点分别登录。

自定义静态产物目录可配置 `MANAGEMENT_STATIC_DIR`。独立管理进程只要求数据库和身份表可用；不需要启动业务 Web 或生成消费者。数据库错误返回脱敏的 503，页面支持重新检查，不尝试回退到本地 SQLite 或绕过授权。

## 隔离页面验收

```powershell
.\python\python.exe tools\management_preview.py
```

此工具从本地配置取得回环 PostgreSQL 地址，强制使用 `canvas_cloud_test` 库和随机 `management_ui_*` schema。它创建一次性的 `preview-admin` / `preview-only-password-12345` 合成账号，管理页面仅监听 `http://127.0.0.1:8767`。没有真实付费模型调用，也不会迁移开发 schema。

工具打印本轮 `stop_file` 路径。向该路径写入文件即可结束服务并删除本轮临时 schema；也可以正常 Ctrl+C 退出。异常强杀进程可能跳过清理，需按已记录的随机 schema 核验后再清理，不允许全库清空。

自动接口验收：`python tools/cloud_test.py --tb=line`。新增测试覆盖独立导入与构建、会话 audience、旧 Basic 拒绝、跨端口 Origin、成员/空间/角色生命周期、版本冲突、撤权、最后管理员、审计空间限制及依赖故障脱敏。

2026-09-14 浏览器已验收：登录、创建成员/展示激活凭证、创建空间、创建角色、分配到空间、角色停用影响与替代角色、审计、退出。首轮验证完整成员链路，第二轮复验按管理员账号创建空间、受影响成员姓名和首次打开登录提示。两轮预览进程均正常退出并清理隔离 schema。截图保存在 `.local/cloud/acceptance/management-spaces.png` 与 `management-role-impact.png`，只包含合成测试数据。

## 尚未完成

本批为 M2 的成员/空间/角色管理入口，**不是 M2/M3 整体完成**。供应商配置、加密凭证及空间分配已接入，运行所需主密钥与验收范围见[供应商说明](managed-providers-local.md)；供应商模型列表检测与选择导入已接入，见[检测验收](provider-probes-local.md)；协议/任务端点只读诊断及明确采用已接入，见[协议诊断验收](provider-diagnostics-local.md)；ComfyUI 与 ModelScope 已按用户要求[移除](retired-integrations.md)；保留供应商的旧配置与凭证显式导入已接入，见[导入验收](provider-imports-local.md)；任务处置与原结果恢复已接入，见[任务处置验收](task-reviews-local.md)；备份请求、独立执行与空间导出已接入，见[备份管理说明](management-backups-local.md)；维护中心已接入控制底座和[逐项发布检查](maintenance-readiness-local.md)，并提供[本机恢复工具](maintenance-recovery-local.md)，完整画布联动、真实进程/连接核验和恢复演练仍在实施；旧工作台管理页面已[迁出并封闭接口](workbench-management-migration-local.md)，最新部署验证仍待完成。当前“概览”仅统计可管理范围与权限，不伪报业务服务健康或备份结果。

工作台的个人激活界面、空间选择、数据库画布租约和双画布草稿已分批接入；剩余业务路由迁移、完整协作/维护联调及全链路恢复验收仍按总计划继续。开发库和原 `.local/cloud/objects` 保持原状，尚未对真实使用环境启用成员模式。最新交付范围见[实施记录](management-platform-progress.md)。

## 保留现有工作台预览数据后重新启动

当前用户预览使用 8768 / 8769 / 8770，记录见 .local/cloud/runtime/active-member-preview.json。已从一次性验收进程切换为保留数据模式；关闭服务不会删除 schema。后续启动前核对服务已停止，并读取记录中的 schema：

    $previewRecord = Get-Content -LiteralPath '.local/cloud/runtime/active-member-preview.json' -Raw | ConvertFrom-Json
    ./python/python.exe tools/workbench_preview.py --two-members --management --resume-schema $previewRecord.schema

该模式不创建 schema、不迁移、不重置账号/画布，复用原对象目录并重建管理前端。仍存在 stop 文件时拒绝启动，应先确认它是本次预览记录指向的停止标记，再清理该标记。不要对未带 --resume-schema 的旧进程使用停止标记来保留数据：旧模式会删除自己的临时 schema。

这是本地预览续用工具，仍使用 canvas_cloud_test 和原有本地配置，不承担生产部署或主密钥管理；需要持续保存加密供应商凭证时须按供应商说明配置固定主密钥。运行与备份证据见[移除与服务更新记录](retired-integrations.md)。
