# AI 对话数据的存储、访问和删除边界

## 数据存在哪里

| 数据 | 成员／PostgreSQL 部署 | 旧版本地共享部署 |
| --- | --- | --- |
| Skill 原包 | PostgreSQL `prompt_skill_versions.source_bytes` | Skill 库不支持 |
| Skill 解析正文及参考文字 | PostgreSQL `prompt_skill_versions.content` | Skill 库不支持 |
| 安装和个人启用偏好 | `workspace_skill_installs`、`member_skill_preferences` | 不适用 |
| 对话及本次 Skill 文字快照 | `workspace_documents`，`kind=conversation`，键为成员 ID／对话 ID，按空间隔离 | `APP_RUNTIME_DIR/data/conversations/<user_id>/<id>.json`；未设置运行目录时在项目 `data/conversations` 下 |
| 新对话附件原文件 | 版本化对象存储；生产为所配置的私有 TOS 桶，本地模拟为 `OBJECT_STORE_ROOT`；对象键 `media/<workspace>/<asset_id>/...` | 通用上传写入 `APP_RUNTIME_DIR/assets/input`，默认项目 `assets/input` |
| 附件元数据和所有者 | PostgreSQL `assets`，`role=chat-attachment`；`metadata.chat_owner` 为服务端取得的登录成员，`chat_shared` 默认 false | 共享模式没有可靠的成员所有权，不能承诺本人私有 |
| DOCX/XLSX 转换出的 Markdown | 仅在本次处理内存和模型请求中，不另存解析缓存；模型回答可能包含附件文字并写入对话 | 同左 |
| 对象下载／解析临时文件 | `MEDIA_TEMP_DIR`，默认系统临时目录下 `infinite-canvas-media/op-*`；请求及流式响应结束后移除，包括失败请求 | 原文件直接读取，不产生永久解析缓存 |
| 用量及账本 | `ai_chat_calls`、账本等，仅记录模型、计费快照及用量，独立于对话删除 | 按原有部署能力 |

这些表位于实际配置的 `DATABASE_SCHEMA`，默认 `canvas_cloud`。生产数据库连接、桶、对象根目录由服务器环境配置决定，不能根据开发机推断生产路径。备份可包含原文件、数据库正文和历史快照，需要按独立保留策略处理。

## 谁能读取、共享、删除

成员模式的新附件使用独立 `/api/chat/attachments` 上传。默认仅上传者在当前空间可读取、列出及删除，即使同空间成员拿到链接也不能读取。所有者可在 AI 对话顶部“附件管理”主动共享给当前空间；其他空间始终不可读，非上传者不能修改共享或删除。分享原文件不分享上传者的私有对话或 Skill 快照。

原文件及预览继承相同所有权。浏览器读取经过平台成员验证并使用 `private, no-store`，不向浏览器发放 TOS 直链；取消共享后旧平台链接重新鉴权。私有附件不能悄悄写入共享画布、素材库、备份或任务，须先主动共享。正在被共享资源引用的附件不能直接取消共享。

历史通用上传继续保持原来的空间共享语义；无法证明所有者的旧文件不自动归给最后一个使用者。旧版无成员认证部署继续使用通用上传，不显示私有附件管理。需要私有边界时应启用 PostgreSQL 和成员登录。

空间共享导出排除尚未共享的对话附件及预览；明确共享后才随空间导出。运维级全库备份仍可能包含私有数据，需要单独限制访问和保留时间。

## 如何删除

1. 输入框的“×”仅取消本次引用。未发送、发送失败或关闭页面的附件仍可在“附件管理”找到并彻底删除。
2. 删除对话默认只删消息和其中的 Skill 文字快照，保留原附件。可勾选“同时删除本人上传且未被其他地方引用的附件”；不属于本人、仍被其他对话或共享资源引用、或物理清理失败的文件会明确保留，用户可到附件管理处理。
3. 附件“彻底删除”先校验所有者及对话、画布、任务、素材库、备份等引用，再持久化 `deleting` 状态停止读取，删除准确的对象版本及预览。失败返回 503 并提供重试；成功后元数据保留最小删除状态，清除原文件名，不再计为可用附件。没有执行整个桶或目录的批量删除。
4. Skill 的“撤下发布”阻止新安装，不删除已安装固定版本；“卸载”仅解除当前空间安装和启用偏好。新增“彻底删除原包”要求先撤下并由所有空间卸载，之后删除原包字节、解析内容和目录记录。历史对话的独立 Skill 快照仍须通过删除对应对话移除。
5. 任何操作都不承诺删除已导出的文件、用户已下载的副本、独立备份或供应商已收到的输入。上传附件后，提取的正文会随明确发送的对话传给所选模型；备份保留与供应商的数据处理规则需要分别管理。

## 部署及验证

新增 `030_private_chat_attachments.sql` 仅建立私有附件列表索引，不自动改写历史媒体所有权。在部署环境应用正常数据库迁移，再重启后端并更新前端静态资源。Skill 和附件的删除入口均需用户明确确认，新增功能不会自动删除现有数据。

```powershell
.\.venv\Scripts\python.exe tools/cloud_test.py -k "chat_private or chat_delete_conversation or chat_default_conversation or chat_shared_documents or chat_skill_purge or skill or member_chat" --tb=short
node --test tests/skills.browser.cjs
```

## 仍需产品层面决定的保留策略

个人存储额度、未发送附件的自动到期、账号注销时的批量清理、备份保留期和恢复后删除状态重放尚未自动化。当前提供本人文件列表与手动删除，避免未确认保留期限就自动删用户数据。实际生产需确定这些期限，并配合运维备份流程处理已撤回内容；恢复旧备份不能被视为已删除数据永久消失的保证。
