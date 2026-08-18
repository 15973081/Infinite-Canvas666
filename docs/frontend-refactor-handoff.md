# Infinite Canvas 前端重构交接文档

> 更新时间：2026-08-18
> 当前分支：`two-code`
> 远端：`origin/two-code`
> 当前基线提交：`9208d8c feat: complete stage 6 React islands`
> 当前进度：阶段 0～6 开发完成；阶段 7、8 待执行

## 1. 交接目标

本文件用于在另一台电脑上无上下文续接经典画布前端重构。接手者应从远端 `two-code` 分支开始，不重新实现阶段 0～6，也不要把 React 岛直接设为生产默认。

最终目标：在保持旧画布数据、后端协议和回滚能力的前提下，让纯 TypeScript 内核、Store 和 React UI 成为经典画布默认路径；完成稳定观察后，再删除确认无调用的旧路径。

## 2. 新电脑开始步骤

```powershell
git fetch origin
git switch two-code
git pull --ff-only origin two-code
git log -1 --oneline
```

最后一条命令应至少显示：

```text
9208d8c feat: complete stage 6 React islands
```

安装和验证前端：

```powershell
Set-Location frontend
npm ci
npm run check
```

Python 回归测试应使用仓库自带运行时：

```powershell
Set-Location ..
& '.\python\python.exe' -m unittest discover -s tests -v
```

当前验收基线：

- Vitest：42 个测试通过。
- Playwright：2 个端到端测试通过。
- Python unittest：21 个测试通过。
- `npm run check` 包含 typecheck、Vitest、生产构建和 Playwright。

## 3. 端口与进程安全

- `6003` 是用户正在使用的服务端口。重构、构建和测试不得停止、重启、替换或占用该进程。
- Playwright 测试服务使用 `6005`，由测试配置临时启动。
- 不要通过“杀掉所有 Python/Uvicorn/Node 进程”解决端口问题。
- 需要处理端口冲突时，先读取监听端口和 PID，只处理本次测试明确创建的 `6005` 进程。
- `npm run build` 只生成 `static/dist/`，不需要操作 `6003` 服务。

## 4. 总体架构约束

以下约束贯穿剩余阶段，不得为了加快迁移而绕过：

1. `canvas.js` 在 CanvasBoard V2 整体切换前仍是节点、连线、选择和文档修改的唯一写入者。
2. React 岛只能读取 Store 投影，或通过 `CanvasLegacyBridge.runCommand()` 发送白名单命令。
3. 禁止旧 DOM、React 和 Store 同时写同一份状态。
4. Graph 等无副作用逻辑可以影子比较；执行、任务提交和保存禁止双跑。
5. 旧文档打开并再次保存后，未知顶层字段、未知节点字段和未知节点类型不得丢失。
6. React、Store 和领域内核不得直接持有旧画布对象引用；边界使用深拷贝快照。
7. 新功能默认关闭，通过独立开关内部验证；旧路径必须随时可回退。
8. `static/dist/` 是发布制品的一部分，每次前端源码修改后必须重新构建并提交对应产物。
9. 不在剩余重构中同步进行视觉改版、后端协议重写或智能画布 UI 合并。

详细决策见 `docs/adr/0001-incremental-frontend-core.md`。

## 5. 已完成进度

| 阶段 | 状态 | 已完成内容 | 关键退出结果 |
|---|---|---|---|
| 阶段 0：基线与 ADR | 完成 | 建立迁移决策、功能等价原则、回退策略和执行回归保护 | 旧入口仍可独立运行 |
| 阶段 1：工具链 | 完成 | Vite、严格 TypeScript、Vitest、Playwright、构建产物接入 FastAPI 静态页面 | 一条 `npm run check` 验证前端 |
| 阶段 2：类型与 Graph | 完成 | 文档 codec、未知字段保留、GraphModel、环检测、级联和重试顺序 | 支持影子比较和独立灰度 |
| 阶段 3：Graph 灰度 | 完成 | 新旧顺序对比、`graph-order` 可选接管、失败自动回退 | 默认仍使用旧顺序 |
| 阶段 4：Execution | 完成 | 串行、并行、轮次、共享节点占用、停止排空、失败短路、显式状态机 | 同一次运行只有一个调度器 |
| 阶段 5：任务与持久化 | 完成 | TaskClient、CanvasRepository、轮询恢复、409 冲突、备份、M2 诊断 | 三个边界均可独立回退 |
| 阶段 6：Store 与 React 岛 | 完成 | Document/Session/Execution Store，执行状态栏，保存状态，低风险工具栏，日志/成本面板 | React 关闭时旧 UI 正常；开启后无状态双写 |

### 阶段 6 当前实现

- Document Store：读取 `canvas-legacy-document` 深拷贝快照，当前没有文档写权限。
- Session Store：投影 `canvas-legacy-status`，显示保存和通用页面状态。
- Execution Store：只投影 `canvas-modern-execution`，显示状态、进度和错误。
- 执行状态岛：停止和重试通过带 `targetId` 的 bridge command 回到现有调度器。
- 工具栏岛：迁移费用、日志和备份入口；实际副作用仍由旧函数执行。
- 活动面板岛：投影规范化后的日志和成本快照；React 挂载成功后隐藏旧面板，卸载时恢复。
- 经典画布没有独立属性侧栏，字段控件嵌在节点 DOM 内，因此节点属性随阶段 7 Board V2 整体迁移。

## 6. 当前功能开关

| 开关 | 作用 | 默认值 |
|---|---|---|
| `canvas_modern_core=shadow` | 新旧 Graph 顺序影子比较 | 关闭 |
| `canvas_modern_core=graph-order` | 使用现代 Graph 顺序，异常回退旧逻辑 | 关闭 |
| `canvas_modern_core=execution-shadow` | 只观察旧执行生命周期 | 关闭 |
| `canvas_execution_engine=1` | 启用现代 ExecutionEngine | 关闭 |
| `canvas_task_client=1` | 启用 TaskClient | 关闭 |
| `canvas_repository=1` | 启用 CanvasRepository | 关闭 |
| `canvas_m2=1` | 同时启用阶段 4、5 的三个边界 | 关闭 |
| `canvas_react_execution=1` | 执行状态、错误、停止和重试岛 | 关闭 |
| `canvas_react_status=1` | 保存/页面状态岛 | 关闭 |
| `canvas_react_toolbar=1` | 费用、日志、备份工具栏岛 | 关闭 |
| `canvas_react_activity=1` | 日志/成本 React 面板 | 关闭 |
| `canvas_react_islands=1` | 同时启用阶段 6 的四个 React 岛 | 关闭 |

内部完整验证地址：

```text
/static/canvas.html?canvas_m2=1&canvas_react_islands=1
```

注意：阶段 4～6 已“开发完成”，不等于已经满足生产默认门禁。默认地址仍必须走旧路径，直到真实灰度数据和稳定周期达标。

## 7. 下一步：阶段 7 CanvasBoard V2

### 7.1 先做 3～5 天渲染层 Spike

在进入正式节点迁移前，比较以下两条路径：

1. 保留当前自研画布交互，在 React 中重建 Board V2。
2. 使用 `@xyflow/react` 构建 Board V2。

Spike 只实现：

- 200 个混合节点、300 条边。
- 选择、框选、拖动、缩放、连线、组和 Output 中转。
- 视频/音频生命周期。
- LTX Director 或 Comfy 复杂节点外壳。
- 关键交互和性能采样，不接真实写入和外部任务。

只有以下条件同时满足，才选择 `@xyflow/react`：

- 核心交互功能等价。
- 200 节点基准不低于旧实现的 90%。
- 自定义连线、组和媒体生命周期不需要大量绕过库内部机制。
- 最终代码和维护成本确实减少。

不满足则保留自研交互。Spike 的目标是做出决策，不是强行引入新依赖。

### 7.2 Board V2 实施顺序

1. 新增独立的 `canvas_board_v2=1` 开关和完整 Board root；默认仍渲染 Legacy Board。
2. 实现视口、选择、拖动、连线、快捷键和节点类型注册表。
3. 让 Document Store 在 V2 路径中成为节点和连线的唯一所有者；Legacy 路径仍由 `canvas.js` 唯一拥有。
4. 迁移 Prompt、PromptGroup、Loop 等低风险节点。
5. 迁移 Generator、MsGen、Output。
6. 迁移 Video、Comfy、LLM。
7. 最后迁移 LTX Director 和具有复杂媒体生命周期的节点。

严禁在同一个节点 DOM 中混用 React 和旧事件处理。迁移单位必须是完整节点类型或完整 Board 路由，不允许“React 表单 + 旧节点容器”长期共存。

### 7.3 每批节点的完成条件

每一种节点迁移都必须同时满足：

- 使用同一 Domain 类型和 Store action。
- 保留当前 CSS 尺寸和数据字段契约。
- 输入编辑、选择、拖动、连线、运行、错误、复制、删除可用。
- 保存后刷新可以完整恢复。
- 未知扩展字段不丢失。
- 不把执行调度写进 React 组件。
- 有 Vitest 或 Playwright 行为测试。
- 关闭 V2 开关后旧节点仍可运行。

### 7.4 阶段 7 退出标准

- 核心节点类型和关键交互完成等价测试。
- 200 节点/300 连线基准不低于旧版 90%。
- 页面离开后无遗留事件监听、轮询和定时器。
- Legacy Board 与 V2 Board 不在同一页面同时写文档。
- 默认仍可一键回退完整 Legacy Board。

## 8. 阶段 8：默认切换、清理和稳定

执行顺序：

1. V2 先开发者启用，再内部 opt-in，再小范围默认。
2. 收集错误、任务数量、保存冲突、孤儿轮询、性能和回退次数。
3. 默认启用后保留旧路径至少两个稳定发布周期。
4. 用 CodeGraph、构建、测试和实际使用数据确认无调用后，分批删除旧代码。
5. 将剩余字符串型 Python 结构测试替换为 TypeScript/Playwright 行为测试。
6. 完成发布、故障排查、数据恢复和回滚说明。

阶段 8 完成条件：

- 连续两个发布周期无 P0/P1 回归。
- 旧路径使用率为零，且没有实际回滚需求。
- 12 个关键回归场景全部自动化通过。
- 历史画布 fixture 往返零字段损失。
- 外部任务请求数符合预期，无重复计费路径。
- 200 节点性能门禁通过。
- 可在一次部署内回滚到上一个完整制品。
- 删除旧路径后全套测试和构建仍通过。

## 9. 必须覆盖的关键回归

1. 普通 Run 只执行当前节点。
2. 一键运行只执行目标工作流，并遵守拓扑顺序。
3. 共享上游不会被并发工作流重复执行。
4. 停止级联后不再调度新节点或新轮次。
5. 已提交任务仍保留 pending 跟踪，不能宣称外部计费任务已撤销。
6. 可恢复任务失败不会继续执行下游。
7. 并行循环首个失败后不再调度新轮次。
8. Output 中转无法绕过环检测。
9. 重试执行失败节点及其可达下游，顺序正确。
10. 并行循环上下文互不污染。
11. 409 保存冲突不会覆盖其他客户端数据。
12. 页面刷新后 pending 图片/视频任务可恢复。
13. 旧画布往返保存后未知字段不丢失。
14. React/V2 开关关闭后旧 UI 和旧 Board 可独立运行。

## 10. 已知限制与暂不处理范围

- 当前后端没有真正取消外部生成任务的端点。“停止”只停止前端轮询和级联调度。
- 后端重启后，内存中的任务状态可能丢失；持久任务存储需另行设计。
- M2 和阶段 6 尚未通过真实环境的两个稳定发布周期，不能直接改为默认开启。
- 智能画布暂时只考虑复用 Types、Graph、Repository、TaskClient 和稳定执行能力，不与经典画布同步迁移 UI。
- 不在阶段 7 顺带进行大规模视觉改版、新节点研发、后端 API 重写或不可逆 schema 迁移。

## 11. 关键文件

| 文件/目录 | 用途 |
|---|---|
| `frontend/src/canvas/domain/` | 文档类型、codec、Graph 和 Execution 状态机 |
| `frontend/src/canvas/infrastructure/` | TaskClient、CanvasRepository、HTTP 边界 |
| `frontend/src/canvas/stores/` | Document、Session、Execution、Activity 投影 |
| `frontend/src/canvas/ui/` | 当前 React islands |
| `frontend/src/main.ts` | 功能开关、现代内核和 React root 挂载入口 |
| `frontend/e2e/m2-boundaries.spec.ts` | 默认回退、M2、React 岛和 bridge 主链 E2E |
| `static/js/canvas.js` | 当前 Legacy Board 与唯一旧文档写入者 |
| `static/canvas.html` | Legacy 容器、React root 容器和现代 bundle 入口 |
| `static/dist/` | Vite 构建产物，必须随源码提交 |
| `tests/test_canvas_run_entry.py` | 经典执行路径结构回归 |
| `tests/test_frontend_bridge_entry.py` | 构建入口、开关、bridge 和 fallback 回归 |
| `docs/adr/0001-incremental-frontend-core.md` | 已接受的架构约束和阶段决策 |

## 12. 提交与协作规则

- 继续在 `two-code` 上工作，除非负责人明确要求新分支。
- 每次提交只完成一个可验证切片，提交信息使用 `feat:`、`fix:`、`test:` 或 `docs:`。
- 修改前先检查 `git status`，不要暂存本地环境、素材、Python 运行时或 IDE 文件。
- 不要提交 `.codegraph/`、`.idea/`、`.reasonix/`、`python/Lib/`、`python/Scripts/`、`API/`、`assets/`、`data/`、`history.json` 或 `reasonix.toml`，除非负责人明确改变范围。
- 不使用 `git reset --hard` 或覆盖用户工作区。
- 每个实现提交前至少运行 `npm run check` 和 Python 全量测试。
- 推送后确认 `HEAD` 与 `origin/two-code` 指向同一提交。

## 13. 推荐的下一次提交切片

第一项工作不要直接迁移节点。建议先提交：

```text
docs/test: record CanvasBoard V2 renderer spike decision
```

该切片只包含：

1. 旧 Board 的 200 节点/300 连线性能基线。
2. 自研 React Board 与 `@xyflow/react` 两个最小原型的同口径结果。
3. 交互等价差异清单。
4. 最终采用或放弃 `@xyflow/react` 的 ADR。
5. 不改变生产默认，不接真实外部任务。

完成这个决策后，再创建 Board V2 外壳和 `canvas_board_v2=1` 开关。

## 14. 当前完成目标摘要

短期目标：完成阶段 7 Spike，确定渲染方案。
中期目标：完成 CanvasBoard V2 与节点分批迁移，保持整板回退。
最终目标：阶段 8 默认切换并稳定两个发布周期，确认零使用后删除 Legacy 路径。
安全底线：不重复提交外部任务、不丢画布字段、不覆盖保存冲突、不触碰 `6003` 生产/开发服务进程。
