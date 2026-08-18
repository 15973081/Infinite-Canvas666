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
| `enhance.html` | Legacy | 扩展 ImageStudio 的增强/放大适配器 |
| `klein.html` | Legacy | 扩展 ImageStudio 的多参考图/LoRA 适配器 |
| `angle.html` | Legacy | 复用 ImageStudio 媒体、历史和输出，增加视角控制域 |
| `api-settings.html` | Legacy | 独立迁移 Provider/Model/RunningHub 配置域 |
| `asset-manager.html` | Legacy | 独立迁移资产、提示词、共享目录与批量操作域 |
| `gpt-chat.html` | Legacy | 迁移会话、流式消息、视觉输入和附件域 |
| `smart-canvas.html` | Legacy | 最后复用 Canvas V2 domain/runtime，避免重复画布实现 |
| `index.html` | Legacy | 在子页面稳定后迁移外壳、导航、iframe 生命周期与主题 |

当前生产页面完成 4 个，另有 1 个 React 性能测试入口。页面数量只是进度参考；Canvas、API 设置、资产管理和 Smart Canvas 的工作量远高于普通生成页。

## 已形成的共享层

- `frontend/src/shared/`：HTTP、主题、跨页面事件、页面壳与通用状态。
- `frontend/src/features/image-studio/`：提示词、参考图上传、平台/模型、尺寸、质量、数量、异步任务、刷新恢复、输出、下载、历史与删除。
- `frontend/vite.site.config.ts`：多页面入口和共享 chunk，新增页面不再复制 React 运行时。

Online 与 Z-Image 的业务入口均小于 1KB，共享图片工作台约 12KB；React 运行时由所有站点入口共享。

## 下一批顺序

1. Enhance + Klein：复用 ImageStudio，增加增强链、LoRA 和多参考图规则。
2. Angle：复用上传、输出和历史，单独抽视角控制组件。
3. API Settings：先抽 Provider/Model schema 和 RunningHub client，再迁移 UI。
4. Asset Manager：按资产、提示词、共享目录三个子域拆分提交。
5. GPT Chat、首页外壳、Smart Canvas。

每批允许包含多个同构页面，但必须共享领域层或组件层；禁止用 React 外壳继续运行旧全局脚本冒充迁移。
