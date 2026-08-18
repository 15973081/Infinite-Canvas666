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
| `asset-manager.html` | Legacy | 独立迁移资产、提示词、共享目录与批量操作域 |
| `gpt-chat.html` | Legacy | 迁移会话、流式消息、视觉输入和附件域 |
| `smart-canvas.html` | Legacy | 最后复用 Canvas V2 domain/runtime，避免重复画布实现 |
| `index.html` | Legacy | 在子页面稳定后迁移外壳、导航、iframe 生命周期与主题 |

当前生产页面完成 8 个，另有 1 个 React 性能测试入口。页面数量只是进度参考；资产管理和 Smart Canvas 的工作量远高于普通生成页。

## 已形成的共享层

- `frontend/src/shared/`：HTTP、主题、跨页面事件、页面壳与通用状态。
- `frontend/src/features/image-studio/`：提示词、参考图上传、平台/模型、尺寸、质量、数量、异步任务、刷新恢复、输出、下载、历史与删除。
- `frontend/vite.site.config.ts`：多页面入口和共享 chunk，新增页面不再复制 React 运行时。

Online 与 Z-Image 的业务入口均小于 1KB，共享图片工作台约 12KB；React 运行时由所有站点入口共享。

## 下一批顺序

1. Asset Manager：按资产、提示词、共享目录三个子域拆分提交。
2. GPT Chat、首页外壳、Smart Canvas。

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
