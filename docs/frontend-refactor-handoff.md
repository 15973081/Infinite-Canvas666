# Infinite Canvas 前端重构交接文档

> 更新时间：2026-08-19
> 当前分支：`two-code`
> 远端：`origin/two-code`
> 当前功能基线提交：`f35cc16 feat(canvas): complete v2 node migration`
> 当前进度：阶段 0～7 的代码迁移完成；阶段 8 灰度发布与两个稳定周期待执行

## 1. 交接目标

本文件用于在另一台电脑上无上下文续接经典画布前端重构。接手者应从远端 `two-code` 分支开始，不重新实现阶段 0～6 或阶段 7 已提交的第一版骨架，也不要把 React 岛或 CanvasBoard V2 直接设为生产默认。

最终目标：在保持旧画布数据、后端协议和回滚能力的前提下，让纯 TypeScript 内核、Store 和 React UI 成为经典画布默认路径；完成稳定观察后，再删除确认无调用的旧路径。

## 2. 新电脑开始步骤

```powershell
git fetch origin
git switch two-code
git pull --ff-only origin two-code
git log -2 --oneline
```

最后一条命令的输出应包含当前功能基线：

```text
f35cc16 feat(canvas): complete v2 node migration
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

- Vitest：59 个测试通过。
- Playwright：14 个端到端测试通过。
- Python unittest：31 个测试通过。
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
| `canvas_board_v2=1` | 独立 CanvasBoard V2 root | 关闭 |

内部完整验证地址：

```text
/static/canvas.html?canvas_m2=1&canvas_react_islands=1&canvas_board_v2=1
```

注意：阶段 4～6 已开发完成；阶段 7 目前只完成第一版迁移骨架和主要字段，尚未满足生产级功能等价门禁。默认地址仍必须走旧路径。

## 7. 阶段 7 CanvasBoard V2（第一版实现已提交，生产级验收进行中）

### 7.1 渲染层 Spike（已完成）

结论：CanvasBoard V2 采用自研 React Board，`@xyflow/react` 仅保留在决策原型中，不进入正式路径。200/300 基准、交互与媒体生命周期结果见 `docs/canvas-board-v2-renderer-spike.md`，决策见 `docs/adr/0002-canvas-board-v2-renderer.md`。下一实施项为 7.2 的独立 `canvas_board_v2=1` Board root。

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

第一批第一版已完成：新增独立 `canvas_board_v2=1` root；开关关闭时只走 Legacy Board，开启后隐藏 Legacy Board 并挂载 V2。Board 支持节点/连线外壳、选择、拖动、画布平移与缩放；页面离开或挂载失败时恢复完整 Legacy Board。

第二批第一版已完成：V2 Document Store 成为开关路径内节点位置和连线的唯一写入者；同画布的 Legacy 投影不会覆盖 V2 修改。节点移动、创建/选择/删除连线和删除节点通过 Store action 更新，并由 CanvasRepository 串行保存最新状态；保存失败时保留本地修改并显示错误。GraphModel 统一执行类型兼容、重复连线和环检测门禁，Delete/Backspace/Escape 与基础节点注册表已接入。

第三批第一版已完成：Prompt、PromptGroup、Loop 已进入 V2 路径。Prompt 支持 20,000 字编辑与既有模板库；Loop 保留次数、串并行、图片/提示词输入、起始序号、批量和计数变量字段，并按输入开关动态清理无效连线；PromptGroup 支持多选分组、成员联动移动、复制粘贴和递归删除。旧工具栏的新增 Prompt/Loop、分组和模板回填在 V2 开启时转发到 Document Store，未知扩展字段继续保留。Vitest 和 Playwright 覆盖当前已实现行为，但不代表完整生产功能等价。

第四批已完成代码强化：Generator、MsGen、Output 已进入 V2 路径并继续通过唯一 Legacy executor 执行。本轮补入参考媒体预览与尺寸适配、MsGen 自定义模型/比例/尺寸/LoRA、Output pending、全局灯箱/对比和拖拽输出；平台真实生成与完整模型约束仍需环境验收。

第五批已完成代码强化：Video、Comfy、LLM 已进入 V2 路径并共用唯一 Legacy executor。本轮补入手动 URL/云链准备、完整动态字段分类与随机参数、视觉媒体输入、消息复制/回车发送和级联失败控制；真实视频恢复、Comfy 工作流、聊天/视觉失败重试仍需环境验收。

第六批已完成代码强化：Image、Group、LTX Director 已进入 V2 路径。LTX Director 继续复用完整时间线编辑器，本轮补入全局提示词、显示模式、自定义音频、压缩、Epsilon、整除参数和 Noise Seed；复杂音频/图片段时间线及长任务恢复仍需环境验收。阶段 7 尚未达到生产级退出标准。

1. 新增独立的 `canvas_board_v2=1` 开关和完整 Board root；默认仍渲染 Legacy Board。
2. 实现视口、选择、拖动、连线、快捷键和节点类型注册表。
3. 让 Document Store 在 V2 路径中成为节点和连线的唯一所有者；Legacy 路径仍由 `canvas.js` 唯一拥有。
4. 迁移 Prompt、PromptGroup、Loop 等低风险节点。
5. 迁移 Generator、MsGen、Output。
6. 迁移 Video、Comfy、LLM。
7. 最后迁移 LTX Director 和具有复杂媒体生命周期的节点。

严禁在同一个节点 DOM 中混用 React 和旧事件处理。迁移单位必须是完整节点类型或完整 Board 路由，不允许“React 表单 + 旧节点容器”长期共存。

### 7.3 已知功能等价与验收缺口

- 本轮已补齐：参考媒体预览与尺寸适配、MsGen 自定义模型/尺寸/LoRA、Output 灯箱/对比/pending 展示/拖拽、Video 手动 URL/云链入口、Comfy 动态字段分类与随机参数、LLM 视觉媒体输入与消息操作、LTX 高级参数、级联/重试/停止控制。
- 本轮已补齐：后台任务使用独立 `canvas-legacy-execution-document` 投影，只合并运行字段，避免恢复结果覆盖 V2 并发编辑。
- 本轮已补齐：历史生产画布 fixture 往返测试，覆盖未知节点/字段、LoRA、云链、Comfy 随机参数、LTX 音频段和 pending 任务。
- 本轮已补齐：经典画布保存冲突接入 TypeScript 三方合并器；不同节点或字段的并发修改自动 rebase 并重试，同字段冲突继续阻止覆盖并要求人工处理。
- 本轮已补齐：图像/视频任务使用端到端幂等键，服务端复用已创建任务，现代任务客户端对并发提交去重并对丢失响应执行一次安全重试。
- 本轮已补齐：`canvas_v2_rollout` 百分比分桶、`canvas_v2=0/1` 强制覆盖和诊断数据，可成组灰度 Board V2、执行引擎、任务客户端与 Repository；默认仍为 0%。
- 本轮已补齐：画布图像/视频任务注册表原子落盘、启动恢复和七天 TTL 清理；服务重启时未完成任务会恢复为可操作的 interrupted 状态，Classic/V2 均提供重新生成入口，不再直接退化为 404。
- 本轮已补齐：历史画布只读批量审计服务、`/api/canvas-audit` 诊断接口和 CLI。未知节点/字段按兼容告警保留，损坏 JSON、重复节点 ID、断裂连线和非法结构会阻断灰度。

灰度前可执行真实目录审计：

```powershell
.\python\python.exe app/services/canvas_audit.py --directory data/canvases --summary-only
```

退出码 `0` 表示完整扫描且全部结构兼容，退出码 `1` 表示至少存在一个阻断项，退出码 `2` 表示达到文件上限、扫描不完整；审计过程不会修改画布文件。
- 仍待真实环境验收：各平台完整模型约束、ModelScope LoRA 真实生成、视频云链和任务恢复、Comfy 真实工作流、LLM 真实聊天/视觉失败重试、LTX 长时间线与长任务。
- 仍待真实环境验收：保存冲突人工演练、外部请求数与重复计费核对、刷新恢复抽样以及历史业务画布批量验证。

自动化测试通过只证明当前第一版实现和已有契约没有回归，不代表上述能力已经完成或达到生产功能等价。

### 7.4 每批节点的完成条件

每一种节点迁移都必须同时满足：

- 使用同一 Domain 类型和 Store action。
- 保留当前 CSS 尺寸和数据字段契约。
- 输入编辑、选择、拖动、连线、运行、错误、复制、删除可用。
- 保存后刷新可以完整恢复。
- 未知扩展字段不丢失。
- 不把执行调度写进 React 组件。
- 有 Vitest 或 Playwright 行为测试。
- 关闭 V2 开关后旧节点仍可运行。

### 7.5 阶段 7 退出标准

当前状态：计划内节点类型已具备 V2 第一版入口，现有自动化、200/300 基准和开关回退测试通过；但 7.3 所列生产功能等价与真实链路验收尚未完成，因此阶段 7 尚未退出，不能进入默认灰度。

- 核心节点类型和关键交互完成等价测试。
- 200 节点/300 连线基准不低于旧版 90%。
- 页面离开后无遗留事件监听、轮询和定时器。
- Legacy Board 与 V2 Board 不在同一页面同时写文档。
- 默认仍可一键回退完整 Legacy Board。

### 7.6 服务端灰度发布门禁

阶段 9 的发布门禁已落地，但默认保持关闭。`GET /api/canvas-rollout` 会合并发布配置、环境变量与历史画布审计结果；前端启动时读取该策略，只有门禁放行后才按稳定客户端桶启用 V2。策略读取失败时继续安全回退，不影响 Legacy Board 启动。

可在 `data/canvas_rollout.json` 写入：

```json
{
  "enabled": true,
  "percentage": 5,
  "kill_switch": false,
  "require_audit": true,
  "max_audit_files": 20000
}
```

发布控制优先级为：服务端 `kill_switch` > URL `canvas_v2=0/1` > URL `canvas_v2_rollout` > 服务端有效百分比 > 浏览器本地回退值。审计未完成、存在不兼容历史画布、配置无效或发布未启用时，服务端把有效百分比强制降为 `0`。紧急回滚可设置 `CANVAS_V2_KILL_SWITCH=true`，无需重新构建前端；另可用 `CANVAS_V2_ROLLOUT_ENABLED` 和 `CANVAS_V2_ROLLOUT_PERCENTAGE` 临时覆盖文件配置。

灰度前至少确认：

```powershell
Invoke-RestMethod http://localhost:6003/api/canvas-rollout
.\python\python.exe app/services/canvas_audit.py --directory data/canvases --summary-only
```

响应中的 `effective_percentage` 必须符合计划，且 `blocked_reasons` 必须为空。该门禁只提供安全发布能力，不代表阶段 7 的真实外部链路验收已经完成。

灰度遥测已接入 `POST /api/canvas-rollout/events`，只聚合固定事件、启用模式、策略来源、标准原因和诊断计数，不上传画布 ID、提示词或供应商响应。当前覆盖灰度决策、Board 挂载/失败、保存冲突、自动 rebase、保存失败及页面退出汇总。聚合结果原子保存到 `data/canvas_rollout_metrics.json`，可通过下列接口检查：

```powershell
Invoke-RestMethod http://localhost:6003/api/canvas-rollout/metrics
```

放量时重点观察 `board-mount-failed`、`save-failed`、`repository_errors`、`task_poll_errors` 与 `execution_errors`；指标上升时应先触发 kill switch，再保留现场排查。当前接口提供本机聚合证据，后续生产部署仍需把这些指标接入正式监控与告警系统。自动化或只读环境可设置 `CANVAS_ROLLOUT_METRICS_DISABLED=true`，事件仍返回已接收但不会写入指标文件。

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
- 14 个关键回归场景全部自动化通过。
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
- 本地任务注册表已经持久化；后端重启时未完成任务会转为可操作的 `interrupted` 状态，但尚不能自动续接所有供应商的上游轮询，仍需真实平台恢复能力或重新生成。
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

阶段 7 第一版已提交，但生产级验收尚未完成。下一切片应从 7.3 缺口中选择一个可独立验证的纵向能力，连同真实链路或历史画布 fixture 一起补齐；阶段 7 退出标准达成前不要开始默认灰度，也不要删除 Legacy executor。

## 14. 当前完成目标摘要

短期目标：完成阶段 7 生产级功能等价和真实链路验收，重点补齐历史画布恢复、冲突、重复计费与长任务数据。
中期目标：阶段 7 退出后开始阶段 8 灰度；V2 保持整板回退，在稳定周期达标后切换默认入口。
最终目标：阶段 8 默认切换并稳定两个发布周期，确认零使用后删除 Legacy 路径。
安全底线：不重复提交外部任务、不丢画布字段、不覆盖保存冲突、不触碰 `6003` 生产/开发服务进程。

## 15. 2026-08-19 Canvas 完整代码迁移结果（覆盖前文旧状态）

本节是当前有效结论；前文“第一版骨架”“继续复用 Legacy executor”“阶段 7 尚未退出”等描述仅保留为迁移历史，不再代表代码现状。

- `/static/canvas.html` 由 `frontend/src/bootstrap.ts` 先读取灰度策略。V2 命中时不下载 `canvas-core.js`、`canvas-api.js`、`ltx-director-timeline.js` 或 `canvas.js`；未命中或 kill switch 生效时才动态加载完整 Legacy 路径。
- V2 使用独立 React 管理器、Document Store、CanvasRepository、CanvasManagementClient 和 ModernCanvasRuntime；列表、新建、回收站、锁、保存冲突合并、备份、费用、日志、提示词模板、资产库及工作流导入/导出均不依赖 Legacy DOM。
- Generator、ModelScope、Video、Comfy、LLM、LTX Director 由 TypeScript runtime 直接执行；包含参考媒体、生成数量、LoRA、视频手动 URL/云链、Comfy 动态字段/随机参数/媒体上传、LLM 聊天与视觉输入、LTX 图片/音频时间线、级联、停止、重试、pending 和任务结果投影。
- Image、Prompt、PromptGroup、Loop、Group、Output 以及所有 Board 交互由 React/Store 单独拥有。V2 页面不会创建 `CanvasApi` 或 `CanvasLegacyBridge`。
- Playwright 已增加独立路径门禁：打开真实 V2 管理器和画布、断言旧脚本与全局桥不存在，并通过 mock 后端完成 Generator 任务和持久化。
- Legacy 代码仍作为阶段 8 的整页回滚制品保留；它不再是 V2 的运行依赖。未经两个稳定发布周期和生产指标确认，不删除该回滚路径。

阶段划分现在是：

1. 阶段 7“代码迁移”完成。
2. 阶段 8“发布验证”未完成：真实供应商凭据链路、历史生产数据全量审计、小流量灰度、重复计费核对和两个稳定发布周期必须在实际环境执行。
3. 只有阶段 8 达标后，才能把服务端默认百分比提高到 100%，并另行删除 Legacy 制品。

推荐验收命令：

```powershell
Set-Location frontend
npm run check
Set-Location ..
& '.\python\python.exe' -m unittest discover -s tests -v
& '.\python\python.exe' app/services/canvas_audit.py --directory data/canvases --summary-only
```

## 16. 2026-08-19 全站迁移启动：ComfyUI 设置页

最终目标已经从 Canvas 单页扩展为全站 React + TypeScript + Vite。当前静态页面清单共 13 个；Canvas 已完成独立 V2 代码路径，本批次完成了第二个生产页面 `/static/comfyui-settings.html` 的迁移。

- 新入口为 `frontend/src/pages/comfyui-settings.tsx`，页面不再加载 `static/js/comfyui-settings.js`、Tailwind CDN、Lucide 或旧 `theme.js`。
- React 页面直接拥有 ComfyUI 后端实例管理、工作流上传/删除、工作流图浏览、动态字段暴露、字段类型与范围配置、媒体上传、随机参数、配置保存和真实运行测试。
- `frontend/vite.site.config.ts` 建立了可继续增加页面入口的站点多入口构建；新增页面应放在 `frontend/src/pages/`，共享基础设施放在 `frontend/src/shared/`。
- Legacy `static/js/comfyui-settings.js` 暂时只作为回滚制品保留，正常页面路径不再下载或执行它。
- 自动化结果：75 个 Vitest、17 个 Playwright、41 个 Python unittest 全部通过。Comfy 页面 E2E 明确断言旧全局函数和旧脚本不存在，并覆盖后端保存、字段暴露、配置保存和运行结果展示。

全站剩余页面按风险和复用价值建议依次迁移：API 设置与资产管理、GPT Chat、图片增强与各生成页、首页外壳/路由、Smart Canvas。每个页面切换时必须保持独立 E2E，且不得以 React 外壳继续执行原页面全局脚本冒充迁移完成。

## 17. 2026-08-19 全站共享层与双页面迁移

Canvas 已正式判定为“代码迁移完成，阶段 8 生产发布验收待完成”；详细口径和全站页面看板见 `docs/full-site-react-migration.md`。

本批新增 `frontend/src/shared/` 统一主题、跨页面事件和页面壳，并新增 `frontend/src/features/image-studio/` 统一图片生成页的提示词、参考图、平台/模型、尺寸、异步任务、刷新恢复、结果、下载和历史逻辑。`online.html` 与 `zimage.html` 已切换到独立 TSX 入口，不再执行原页面的大段内联脚本或旧 UI 依赖。

最新自动化结果：79 个 Vitest、19 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数为 4：Canvas、ComfyUI Settings、Online、Z-Image；Canvas Board Spike 是 React 性能测试工具，不计生产页面。

## 18. 2026-08-19 ImageStudio 三页面批量迁移

Enhance、Klein、Angle 已由同一个 `frontend/src/features/image-studio/` 产品能力层接管，页面入口只负责选择 adapter。共享层新增 schema 字段、Comfy 上传、本地/云端模式、原图比较、两阶段增强、LoRA 和 Angle 长任务恢复。三个页面不再加载原 Tailwind CDN、Lucide、Three.js、HistoryBulkManager 或内联业务脚本。

最新自动化结果：80 个 Vitest、22 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 7：Canvas、ComfyUI Settings、Online、Z-Image、Enhance、Klein、Angle。

## 19. 2026-08-19 ProviderStudio 与 API Settings

API Settings 已由 `frontend/src/features/provider-studio/` 接管，覆盖当前后端实际支持的 Provider、密钥、火山凭据、连接检测、模型拉取、价格、单模型协议和 ModelScope LoRA。正常入口不再执行 `static/js/api-settings.js`。旧 RunningHub UI 因服务端已经移除 Provider 和全部对应路由而不迁移；该部分是不可执行死代码，不属于有效功能回归。

最新自动化结果：83 个 Vitest、23 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 8。

## 20. 2026-08-19 AssetStudio 与 Asset Manager

`/static/asset-manager.html` 已改为独立 React + TypeScript + Vite 入口，正常路径不再加载 `static/js/asset-manager.js`。`frontend/src/features/asset-studio/` 现在集中承载素材库、工作流、提示词、本地素材、共享目录和 Canvas 素材的类型、领域函数、HTTP 客户端与 UI，后续页面可以复用媒体网格、选择、搜索和批量操作语义。

当前已接通现有后端的库/分组/条目 CRUD、批量移动与删除、工作流上传、本地上传和描述保存、共享目录导入、Canvas ZIP 下载及 Smart Canvas 收件箱。Playwright 断言页面不执行 Legacy 脚本，并覆盖真实请求 payload。

最新自动化结果：85 个 Vitest、24 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 9。数字人认证、裁剪和自动反推描述仍列为高级功能补齐项，不能据此宣称完整生产功能等价；下一批优先迁移 GPT Chat。

## 21. 2026-08-19 ChatStudio 与 GPT Chat

`/static/gpt-chat.html` 已改为独立 React + TypeScript + Vite 入口，旧页面约 83KB 的内联实现不再进入正常路径。`frontend/src/features/chat-studio/` 统一承载会话、平台模型、附件、SSE 解析、流式状态、停止、失败和重试。

当前接通会话列表/创建/读取/删除、`/api/config`、`/api/ai/upload` 和 `/api/chat/stream`。视觉与文档输入直接进入 `reference_images`，SSE parser 保留跨网络分片的半帧数据，失败后重新读取服务端会话并保留可重试草稿。旧页面未真正接通的生图/Agent 模式没有迁移；独立图片生成继续由 ImageStudio 负责。

最新自动化结果：88 个 Vitest、26 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 10。下一批迁移首页外壳与导航，随后处理 Smart Canvas。

## 22. 2026-08-19 SiteShell 与首页外壳

`/static/index.html` 已改为独立 React + TypeScript + Vite 入口，旧页面约 126KB 的内联外壳不再执行。`frontend/src/features/site-shell/` 统一管理 10 个子页面入口、Hash 路由、懒加载 iframe、主题和语言同步、跨页事件、Canvas focus、WebSocket 状态与更新中心。

SiteShell 会保留已访问 iframe，切换页面不会重建编辑状态；页面 ID 同步到 Hash 和 localStorage。在线人数、队列状态、云端任务和画布/素材事件继续由 WebSocket 与受限消息白名单转发。更新中心直接调用现有应用信息、版本检测、双源网络检测、更新、备份和回滚接口，所有写操作保持用户确认。

最新自动化结果：90 个 Vitest、27 个 Playwright、41 个 Python unittest 全部通过。生产页面代码迁移完成数增至 11；全站代码迁移只剩 Smart Canvas，下一批应直接复用 Canvas V2 domain/runtime，禁止重写第二套画布核心。

## 23. 2026-08-19 Smart Canvas 与全站代码迁移收口

`/static/smart-canvas.html` 已切换到独立 Vite TSX 入口，正常路径不再加载约 731KB 的 `static/js/smart-canvas.js`。Smart Canvas 复用 CanvasAppV2、CanvasBoardV2、Document Store、Repository、Management Client 和 ModernCanvasRuntime，不维护第二套节点、执行或持久化实现。

Smart 管理器按 `kind: smart` 隔离列表和新建请求，支持 `?id=` 直开及素材库收件箱导入。历史 `smart-image`、`smart-prompt`、`smart-loop` 会转换为 V2 Output/Prompt/Loop；带输入或运行设置的旧图片目标会补出对应 Generator、ModelScope、Video 或 Comfy 节点并重连到 Output。

最终入口审计：`static/` 共 13 个 HTML，其中 12 个生产页面和 1 个性能测试页面均由 Vite 模块拥有；非 Canvas 页面正常入口的 Legacy 业务脚本引用为 0。Canvas 仍保留阶段 8 动态回滚制品。

最新自动化结果：95 个 Vitest、29 个 Playwright、41 个 Python unittest 全部通过。至此“全站 React + TypeScript + Vite 代码迁移”完成；下一阶段只做生产功能等价、真实供应商/历史数据验收、Canvas 灰度、计费核对与两个稳定发布周期。不得把代码迁移完成表述为生产发布完成。

## 24. 2026-08-19 阶段 8 发布前总检

新增只读命令 `app/services/frontend_readiness.py`，一次汇总 12 个生产 HTML 的 Vite 入口与构建产物、Legacy 业务脚本隔离、历史画布兼容审计、Smart 旧节点转换数量、服务端灰度策略、灰度遥测和人工发布门禁：

```powershell
& '.\python\python.exe' app/services/frontend_readiness.py
& '.\python\python.exe' app/services/frontend_readiness.py --strict
```

普通模式只在代码/数据存在硬阻断时返回非零；`--strict` 会在任一生产发布门禁未关闭时返回 `2`，适合正式放量前的 CI 门禁。当前报告为 `code_migration_ready=true`、`production_release_ready=false`：12/12 入口通过，历史目录 1/1 兼容；灰度仍关闭、遥测为空，真实供应商、历史生产 fixture、计费核对和两个稳定周期仍待人工完成。

同时修正了一个历史 Smart Canvas 边界：旧实现允许图片节点缺少 `type`，Document Codec 现在仅对 `kind: smart` 将其规范为 `smart-image`，随后交给 Smart V2 迁移器处理；经典画布仍严格拒绝缺失类型。Canvas audit 会把 `smart-image`、`smart-prompt`、`smart-loop` 及无类型 Smart 图片计为“可转换 Legacy Smart 节点”，不再误报未知节点，但仍保留可追踪 warning。

本批全量结果：96 个 Vitest、29 个 Playwright、44 个 Python unittest 全部通过。

## 25. 2026-08-19 计费证据链与复杂历史 fixture

新增只读命令 `app/services/canvas_billing_audit.py`，按上游任务 ID、Canvas 任务 ID、幂等键、请求 ID 的稳定优先级扫描画布日志，报告成功日志、未识别日志、未定价日志、重复计费组及可能重复金额。失败/取消日志不会被计入账单：

```powershell
& '.\python\python.exe' app/services/canvas_billing_audit.py
```

ModernCanvasRuntime 现在把 `canvasTaskId`、`upstreamTaskId`、`idempotencyKey` 和任务返回的费用快照写入成功、失败及恢复日志；React Canvas 的费用面板同时支持 Legacy `cost.amount_micros` 与 V2 `cost_cny`。`frontend_readiness.py` 已合并计费审计，发现无效文件或重复计费记录时会新增发布阻断原因。

`tests/fixtures/canvases/` 新增经典与 Legacy Smart 两份复杂回归文档，覆盖 Generator、Video、Comfy、LLM、LTX 时间线、Output pending、费用日志、无类型 Smart 媒体、Prompt、Loop、历史生成目标和连线转换。它们用于稳定回归，不能替代真实生产数据抽样。

当前本机 `data/canvases` 计费审计结果：1 个文件、0 条成功计费日志、0 个重复组；因此只能证明当前样本没有重复记录，不能替代供应商账单对账。完成真实供应商调用后必须重新运行，并与供应商账单按上游任务 ID 核对。

本批全量结果：97 个 Vitest、29 个 Playwright、47 个 Python unittest 全部通过。

## 26. 2026-08-19 供应商与工作流静态预检

新增只读命令 `app/services/provider_readiness.py`，在不联网、不调用付费服务的前提下检查图片、视频、聊天、ModelScope 凭证/端点/模型声明，以及 Comfy 实例和六个生产工作流：

```powershell
& '.\python\python.exe' app/services/provider_readiness.py
& '.\python\python.exe' app/services/provider_readiness.py --strict
```

输出严格限制为平台 ID、布尔状态、数量和缺失工作流名；不会输出 Key、Token、AK/SK、URL、环境变量值、代理或原始配置。`frontend_readiness.py` 已合并该静态证据，能力缺失会形成 `provider-capability-missing:*` 发布阻断，但不会改变“代码迁移完成”的判定。即使全部静态能力通过，也必须保留 `real-provider-validation`，直到在实际发布环境完成人工生成、聊天、视频长任务和恢复验收。

当前本机结果：6/6 Comfy 工作流有效、声明 1 个实例；图片、视频、聊天和 ModelScope 静态能力缺失，严格预检按设计返回 `2`。总检仍为 `code_migration_ready=true`、`production_release_ready=false`。本批全量结果：97 个 Vitest、29 个 Playwright、51 个 Python unittest 全部通过。

## 27. 2026-08-19 阶段 8 验收证据门禁

新增只读校验器 `app/services/stage8_release_evidence.py` 和模板 `docs/stage8-release-evidence.example.json`。正式验收时将模板复制到 `data/stage8_release_evidence.json`，填写真实证据后运行：

```powershell
& '.\python\python.exe' app/services/stage8_release_evidence.py --strict
& '.\python\python.exe' app/services/frontend_readiness.py --strict
```

四个门禁不再是无法追踪的固定字符串：真实供应商验证必须分别具备 image、video、chat、ModelScope、Comfy 的通过状态和证据引用；历史生产数据必须记录抽样数量；账单对账必须记录已比较任务且重复扣费为 0；稳定发布必须提供两个不同版本的有效周期。所有门禁还要求有效完成时间、审核人和证据引用。缺文件、JSON 损坏、版本错误、未来时间或字段不完整均采用 fail-closed，继续阻断发布。

发布总检只输出通过状态、计数和问题代码，不输出审核人、工单链接、上游任务 ID 或其他证据值。当前仓库没有伪造或自动生成本机验收文件，因此四个门禁仍全部待完成，灰度状态没有变化。

本批全量结果：97 个 Vitest、29 个 Playwright、56 个 Python unittest 全部通过。

## 28. 2026-08-19 灰度健康门禁

原灰度指标只分别聚合事件和模式，无法判断失败来自 V2 还是 Legacy。本批在保持低基数和不采集画布内容的前提下，新增 `event_dimensions` 与 `event_counters`，按事件和 `enabled/disabled` 联合统计；旧指标文件继续兼容读取，新字段会在后续事件到达时自然补齐。

React Canvas 新增 `save-succeeded`、`execution-succeeded`、`execution-failed`、`execution-stopped` 事件；页面退出汇总新增执行总数/失败数、成功保存、任务提交、轮询和恢复数。所有内部事件的模式与策略来源由 Modern Core 强制填写，调用方不能覆盖模式归属。

只读健康检查命令：

```powershell
& '.\python\python.exe' app/services/canvas_rollout_health.py
& '.\python\python.exe' app/services/canvas_rollout_health.py --strict
```

默认检查四类指标：Board 挂载至少 20 次且失败率不高于 1%；保存至少 20 次且失败率不高于 2%；执行至少 10 次且失败率不高于 5%；任务轮询至少 50 次且错误率不高于 5%。灰度未启用时状态为 `inactive`，不重复增加阻断；灰度启用后，`insufficient` 或 `unhealthy` 会由总检产生对应发布阻断，只有 `healthy` 可进入下一档放量。

当前本机灰度仍为 0%，健康状态为 `inactive`，联合遥测没有真实样本；没有自动开启或修改灰度配置。

本批全量结果：97 个 Vitest、29 个 Playwright、63 个 Python unittest 全部通过。
