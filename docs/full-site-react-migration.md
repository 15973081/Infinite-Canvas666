# 全站 React + TypeScript + Vite 迁移看板

更新日期：2026-08-19

## 完成口径

页面只有同时满足以下条件，才标记为“代码迁移完成”：

1. 页面入口由 Vite 构建的 TypeScript/TSX 模块拥有。
2. 正常路径不下载、不执行原页面 Legacy 业务脚本或内联全局函数。
3. API、状态、表单、上传、任务与恢复流程由 React/TypeScript 直接实现。
4. 至少有一条 Playwright 行为测试断言独立运行和旧脚本隔离。
5. `npm run check` 与 Python 全量回归通过。

生产灰度、真实供应商验收和稳定发布周期单独记录，不用于否定已经完成的代码迁移，也不能被“代码迁移完成”替代。

## Canvas 判定

Canvas 的代码迁移已经完成：V2 命中时由 `frontend/src/bootstrap.ts` 启动独立 React 管理器、画布、Store、Repository 和执行运行时；Playwright 明确断言该路径不存在 `CanvasApi`、`CanvasLegacyBridge`，且没有加载 `static/js/canvas.js`。Generator、ModelScope、Video、Comfy、LLM、LTX、Output 和基础节点均由 TypeScript 路径执行。

Canvas 尚未完成的是阶段 8 发布验收：默认 100% 切换、真实供应商与历史生产数据验证、重复计费核对及两个稳定发布周期。Legacy Canvas 仅作为整页回滚制品保留。

结论：Canvas 标记为“代码迁移完成，生产发布验收待完成”，全站重构主线不再等待 Canvas 阶段 8。

## 页面状态

| 页面 | 当前状态 | 新入口/下一步 |
|---|---|---|
| `canvas.html` | React/TS 代码迁移完成 | `frontend/src/bootstrap.ts`；阶段 8 待执行 |
| `comfyui-settings.html` | React/TS 代码迁移完成 | `frontend/src/pages/comfyui-settings.tsx` |
| `online.html` | React/TS 代码迁移完成 | `frontend/src/pages/online.tsx`，复用 ImageStudio |
| `zimage.html` | React/TS 代码迁移完成 | `frontend/src/pages/zimage.tsx`，复用 ImageStudio |
| `canvas-board-spike.html` | React/TS 测试工具 | 性能基线，不计生产页面 |
| `enhance.html` | React/TS 代码迁移完成 | ImageStudio 本地两阶段增强与 ModelScope 适配器 |
| `klein.html` | React/TS 代码迁移完成 | ImageStudio 多参考图、本地工作流与云端 LoRA 适配器 |
| `angle.html` | React/TS 代码迁移完成 | ImageStudio 视角 schema、本地/云端及长任务恢复适配器 |
| `api-settings.html` | React/TS 代码迁移完成 | `ProviderStudio` 平台、凭据、模型、价格、协议、LoRA 与连接检测 |
| `asset-manager.html` | React/TS 代码迁移完成 | `frontend/src/pages/asset-manager.tsx`，复用 `AssetStudio` |
| `gpt-chat.html` | React/TS 代码迁移完成 | `frontend/src/pages/gpt-chat.tsx`，复用 `ChatStudio` |
| `smart-canvas.html` | React/TS 代码迁移完成 | `frontend/src/pages/smart-canvas.tsx`，复用 Canvas V2 domain/runtime |
| `index.html` | React/TS 代码迁移完成 | `frontend/src/pages/index.tsx`，复用 `SiteShell` |

当前 12 个生产页面均已完成 React/TS/Vite 代码迁移，另有 1 个 React 性能测试入口。入口审计确认 13 个 HTML 均使用 Vite 模块，除 Canvas 阶段 8 的动态回滚机制外，正常生产入口不再加载页面 Legacy 业务脚本。

## 已形成的共享层

- `frontend/src/shared/`：HTTP、主题、跨页面事件、页面壳与通用状态。
- `frontend/src/features/image-studio/`：提示词、参考图上传、平台/模型、尺寸、质量、数量、异步任务、刷新恢复、输出、下载、历史与删除。
- `frontend/vite.site.config.ts`：多页面入口和共享 chunk，新增页面不再复制 React 运行时。

Online 与 Z-Image 的业务入口均小于 1KB，共享图片工作台约 12KB；React 运行时由所有站点入口共享。

## 后续发布顺序

1. 使用历史生产画布 fixture 和真实供应商凭据完成跨页面功能等价验收。
2. 执行 Canvas 阶段 8 小流量灰度、重复计费核对与两个稳定发布周期。
3. 稳定期达标后再删除 Legacy 回滚制品；当前不得把“全站代码迁移完成”等同于“生产发布验收完成”。

每批允许包含多个同构页面，但必须共享领域层或组件层；禁止用 React 外壳继续运行旧全局脚本冒充迁移。

## 2026-08-19 ImageStudio 第二批结果

Enhance、Klein、Angle 已在一个批次内完成迁移，三个业务入口各约 0.36KB，共享工作流 adapter chunk 约 6KB。ImageStudio 新增 schema 动态控件、按模式字段、最低参考图数量、Comfy 工作流上传、原图对比及长任务恢复。

- Enhance：本地增强工作流、可选第二阶段 2K/4K 放大、ModelScope Klein Enhance LoRA。
- Klein：最多三张参考图、本地 `Flux2-Klein.json`、ModelScope FLUX.2 Klein 和可调 LoRA。
- Angle：水平/垂直/景别控件、本地 `2511.json`、Qwen Image Edit 云端和超时续轮询。
- 自动化结果：80 个 Vitest、22 个 Playwright、41 个 Python unittest 全部通过。
- 三个旧页面共删除约 3200 行内联业务实现，正常路径只加载 Vite 模块。

## 2026-08-19 ProviderStudio 结果

API Settings 已切换到 `frontend/src/features/provider-studio/`。新产品域直接对应当前服务端 `ApiProviderPayload`，覆盖平台增删与主平台、Base URL、协议、图片请求格式、代理、API Key 替换/清除、火山素材 AK/SK、连接测试、异步协议探测、模型拉取分类、图片/视频价格、单模型协议和 ModelScope LoRA。

服务端 `app/providers/registry.py` 已明确把 `runninghub` 列入 `REMOVED_PROVIDER_IDS`，代码库也不存在旧页面调用的 RunningHub 路由，因此新页面没有迁移这部分无法执行的死 UI。后续若重新引入 RunningHub，必须先恢复独立后端契约，再作为 ProviderStudio 插件实现。

- `api-settings.html` 不再加载 Tailwind CDN、Lucide、旧主题脚本或 `static/js/api-settings.js`。
- ProviderStudio E2E 覆盖临时 Key 验证、上游模型拉取、模型协议、价格、LoRA 和保存 payload。
- 自动化结果：83 个 Vitest、23 个 Playwright、41 个 Python unittest 全部通过。

## 2026-08-19 AssetStudio 结果

Asset Manager 已切换到 `frontend/src/features/asset-studio/` 与独立 TSX 入口，正常路径不再下载或执行 `static/js/asset-manager.js`。新领域层统一管理素材库、工作流、提示词、本地上传、共享目录和 Canvas 素材，直接调用现有服务端契约。

- 素材库支持库/分组 CRUD、URL 入库、重命名、批量删除、批量移动和发送到 Smart Canvas。
- 工作流支持真实 JSON/ZIP 上传、分组与批量操作。
- 提示词支持库读取、分组、新建/编辑、搜索与批量删除。
- 本地素材支持目录浏览、新建目录、上传、删除、描述编辑；共享目录支持注册、目录树浏览与批量导入。
- Canvas 素材支持分类检索、发送到 Smart Canvas 与 ZIP 下载。
- 自动化结果：85 个 Vitest、24 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 9。

旧脚本继续作为整页回滚制品保留，但不是生产入口依赖。数字人素材认证、裁剪和本地图片自动反推描述属于 AssetStudio 后续增强项；它们不阻塞当前核心管理路径，但在补齐并完成真实平台验收前，不宣称 Asset Manager 已达到所有历史高级功能的生产等价。

## 2026-08-19 ChatStudio 结果

GPT Chat 已切换到 `frontend/src/features/chat-studio/` 与独立 TSX 入口；原页面约 83KB 的样式和内联全局脚本已退出生产路径。新领域层直接使用会话、配置、附件上传和 SSE 流式聊天接口。

- 支持会话列表、搜索、新建、切换、删除与上次会话恢复。
- 支持平台/模型选择、SSE 增量回复、停止接收、消息复制、失败状态和显式重试。
- 支持最多 4 个图片、文档、音频或视频附件，覆盖选择、粘贴、拖放、预览和视觉输入 payload。
- `gpt-chat.html` 只保留 React root 与 Vite 模块，不再声明或执行 `sendMessage` 等旧全局函数。
- 自动化结果：88 个 Vitest、26 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 10。

旧页面的“生图/Agent”选择最终仍强制提交 `mode: chat`，没有对应可执行生产链路，因此本次没有把该未接通 UI 搬入新页面。独立生图能力继续由 ImageStudio 页面提供；未来若增加正式 Agent 后端契约，应作为 ChatStudio 的显式 adapter 接入。

## 2026-08-19 SiteShell 结果

首页已切换到 `frontend/src/features/site-shell/` 与独立 TSX 入口，原页面约 126KB 的 CSS、内联脚本和全局函数已退出生产路径。SiteShell 统一拥有全站导航、Hash 路由、子页面生命周期、主题、跨页事件、运行状态和更新中心。

- 子页面按需创建 iframe，已访问页面保持挂载，避免切换时丢失编辑状态；当前页面写入 URL Hash 和 `studio_active_page`。
- Provider、工作流、素材、聊天和 Canvas 事件在同源边界内广播；Canvas 激活时发送 `canvas-focus`。
- 保留 WebSocket 在线人数/任务事件、队列轮询、自动重连和卸载清理。
- 更新中心接通应用信息、版本检测、双源连通性、GitHub/ModelScope 更新、备份列表和回滚接口；更新与回滚仍需用户明确确认。
- 响应式导航在移动端保留全部页面入口，不通过隐藏侧栏牺牲功能。
- 自动化结果：90 个 Vitest、27 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 11。

该批次完成时全站代码迁移只剩 `smart-canvas.html`；最终结果见下节。Canvas V2 的生产灰度与各外部服务真实链路验收仍是独立发布工作。

## 2026-08-19 Smart Canvas 与全站代码迁移结果

Smart Canvas 已切换到 `frontend/src/pages/smart-canvas.tsx`，正常入口只加载 `smart-canvas-modern.js`，不再下载或执行约 731KB 的 `static/js/smart-canvas.js`。页面没有建立第二套画布核心，而是复用 `CanvasAppV2`、`CanvasBoardV2`、Document Store、CanvasRepository、CanvasManagementClient 与 ModernCanvasRuntime。

- 管理器只展示和创建 `kind: smart` 的画布，支持 `?id=` 直接打开、锁、冲突安全保存、回收站、备份、费用、日志、资产库和工作流导入/导出。
- Generator、ModelScope、Video、Comfy、LLM、LTX、Output、Prompt、Loop 与媒体节点继续走同一套 TypeScript 运行时；Smart 专属入口增加素材收件箱按钮及 `Ctrl/Cmd+V` 导入。
- 历史 `smart-image`、`smart-prompt`、`smart-loop` 文档在读取时转换到 V2；旧媒体结果、连线和运行设置保留，旧生成目标转换为相应生成节点加 Output。
- Playwright 覆盖 Smart 新建 payload、经典/智能列表隔离、素材收件箱、保存、URL 直开、历史节点转换及旧脚本/全局隔离。
- 最终自动化结果：95 个 Vitest、29 个 Playwright、41 个 Python unittest 全部通过。

结论：12 个生产页面的 React + TypeScript + Vite 代码迁移全部完成。尚未完成的是生产级功能等价与发布验证，包括真实供应商链路、历史生产数据全量审计、灰度、计费核对和两个稳定发布周期。

## 阶段 8 发布前总检

运行 `python app/services/frontend_readiness.py` 可生成机器可读的全站发布准备报告；加 `--strict` 后，灰度关闭、遥测缺失或任一人工发布门禁未完成都会返回退出码 `2`。报告不会写入画布、灰度配置或遥测数据，也不会调用付费外部服务。

当前本机结果：`code_migration_ready=true`、12/12 生产入口通过、历史画布 1/1 兼容；`production_release_ready=false`，阻断项为灰度未启用、有效比例为 0、遥测为空，以及真实供应商验证、生产历史 fixture、计费核对和两个稳定发布周期。该结论是预期的安全状态。

供应商静态预检可单独运行 `python app/services/provider_readiness.py`；`--strict` 会在图片、视频、聊天、ModelScope 或 Comfy 工作流任一静态能力缺失时返回退出码 `2`。报告只包含平台 ID、布尔值、模型/实例/节点数量和缺失工作流名，不包含密钥、Token、URL、环境变量值或原始配置，并且不发起网络请求。总检已合并该报告，但静态配置齐全不能关闭 `real-provider-validation` 人工门禁。

当前本机静态预检：6/6 Comfy 工作流有效、声明 1 个 Comfy 实例；图片、视频、聊天和 ModelScope 尚无“启用平台 + 端点 + 模型 + 凭证”的完整组合，因此严格预检返回 `2`。本批全量结果：97 个 Vitest、29 个 Playwright、51 个 Python unittest 全部通过。

四个人工发布门禁现在由 `python app/services/stage8_release_evidence.py --strict` 校验。可复制 `docs/stage8-release-evidence.example.json` 为 `data/stage8_release_evidence.json` 后填写真实验收证据；缺失、损坏、未来时间、无审核人或无证据引用都会保持门禁关闭。真实供应商门禁要求 image、video、chat、ModelScope、Comfy 五项分别通过，稳定周期门禁要求两个不同发布版本。报告只输出状态、数量和问题代码，不回显审核人或证据引用内容。

本批全量结果：97 个 Vitest、29 个 Playwright、56 个 Python unittest 全部通过。

灰度遥测现在按“事件 × enabled/disabled 模式”联合聚合，避免 Legacy 事件污染 V2 失败率；新增保存成功、执行成功/失败/停止分母，以及页面级保存、执行、任务轮询与恢复计数。`python app/services/canvas_rollout_health.py --strict` 会评估挂载、保存、执行和任务轮询四类指标。默认晋级门槛分别为至少 20/20/10/50 个样本，最大失败率为 1%/2%/5%/5%；小样本为 `insufficient`，超阈值为 `unhealthy`，两者在灰度启用后都会阻止继续放量。

本批全量结果：97 个 Vitest、29 个 Playwright、63 个 Python unittest 全部通过。

历史生产数据现在可通过 `python app/services/canvas_production_coverage.py --strict` 生成匿名覆盖矩阵。报告只包含固定能力名称与数量，不包含目录、文件名、画布 ID、标题、提示词、URL 或未知节点类型文本。发布要求至少两份有效历史画布，并覆盖 Classic、Smart、连线图、Generator、ModelScope、Video、Comfy、LLM、LTX、Output、pending/recovery、计费与失败日志共 13 项核心路径；自动覆盖通过后仍保留人工历史样本证据门禁。

本批全量结果：97 个 Vitest、29 个 Playwright、67 个 Python unittest 全部通过。

ComfyUI 可通过 `python app/services/comfy_connectivity.py --network --strict` 执行只读真实实例预检。命令仅 GET `/queue`、`/system_stats`、`/object_info`，不会调用 `/prompt` 或提交工作流；它会核对 6 个生产工作流的全部 `class_type` 是否在每个已配置实例安装。报告仅包含实例序号、布尔状态、耗时和节点数量，不包含地址或异常详情。调度器可能使用任一实例，因此所有实例都通过才算就绪。

本批全量结果：97 个 Vitest、29 个 Playwright、71 个 Python unittest 全部通过。

发布前总检及历史 Smart 无类型节点兼容修复后的全量结果：96 个 Vitest、29 个 Playwright、44 个 Python unittest 全部通过。

## 计费与复杂 fixture 验收

`python app/services/canvas_billing_audit.py` 会只读扫描 Canvas 日志，以任务 ID、上游任务 ID、幂等键和请求 ID 检出重复成功记录，并分别汇总 Legacy 微元费用快照与 V2 CNY 字段。V2 执行及恢复日志已补齐上述标识；React 费用面板也已能正确显示 `cost.amount_micros`。

仓库新增两份复杂回归 fixture，覆盖经典多节点/pending/LTX 和 Legacy Smart 无类型媒体/生成目标转换。真实生产 fixture 与供应商账单仍是人工发布门禁，不能由合成数据自动关闭。

本批全量结果：97 个 Vitest、29 个 Playwright、47 个 Python unittest 全部通过。
