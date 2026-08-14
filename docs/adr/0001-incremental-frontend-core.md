# ADR 0001：渐进式前端内核迁移

- 状态：已接受
- 日期：2026-08-14
- 范围：经典画布

## 决策

1. 先迁移文档编解码、图查询和执行调度，React UI 不作为可靠性内核的前置条件。
2. CanvasBoard V2 切换前，`canvas.js` 仍是节点、连线和选择状态的唯一写入者。
3. 新模块只能通过 `CanvasLegacyBridge.getDocumentSnapshot()` 读取 JSON 快照；不得持有或修改旧对象引用。
4. React 岛阶段只投影执行和展示状态。Document Store 在 V2 Board 整体切换时才成为唯一所有者。
5. 有副作用的 Graph 逻辑先影子比较；执行和保存永不双跑。
6. Vite 是开发和发布时工具。最终下载包必须包含 `static/dist/`，运行程序不要求用户安装 Node.js。
7. 首期“任务恢复”只保证浏览器刷新后、后端进程仍存活时恢复。后端重启后的任务恢复需要持久任务存储，另行决策。
8. React、Zustand、Playwright 和新的画布渲染库在出现实际使用点时再安装。

## 第一里程碑退出条件

- 旧画布在移除现代模块脚本后可原样运行。
- TypeScript 严格模式、单元测试和生产构建均由一条命令验证。
- 文档 codec 往返保留未知顶层字段、未知节点类型和节点扩展字段。
- GraphModel 覆盖线性、分支、汇合、Output 中转和环检测。
- 新旧级联顺序可针对当前画布按需比较，但比较过程无副作用。

## 后续决策门

完成 Graph、Execution、Persistence 和浏览器回归后，再决定是否继续 React Board。可靠性指标达标时，允许停止 UI 框架迁移。

## Graph 影子模式

直接打开 `/static/canvas.html?canvas_modern_core=shadow` 可在真实级联运行和失败重试开始前比较新旧图顺序。比较不替换调度、不发送数据，结果可通过 `CanvasModernCore.getShadowReport()` 查看；最多保留 50 条差异。

## Graph 顺序灰度启用

直接打开 `/static/canvas.html?canvas_modern_core=graph-order` 时，级联和失败重试改用 GraphModel 计算顺序。默认地址继续使用旧实现；快照缺失、解码失败或现代模块异常时自动回退旧顺序，执行器和保存链路保持不变。

## Execution 生命周期影子模式

直接打开 `/static/canvas.html?canvas_modern_core=execution-shadow` 时，现代内核只观察旧调度器的开始、停止请求和结束事件，并对串行级联、重试及并行循环追加逐节点状态校验；并行轮次按 loop index 隔离，停止后允许已在途节点完成回报但禁止启动新节点。影子模式不调用节点执行器、不发送请求、不修改旧运行状态；结果可通过 `CanvasModernCore.getExecutionShadowReport()` 查看。

## Execution 有序运行内核

串行级联和失败重试共用 `runOrderedExecution`，通过 `mode` 区分运行语义，并按状态转换同步发出观察事件。兼容入口和共享节点保留执行均委托给同一实现；AbortSignal 会产生显式的 `stopping`、在途节点排空和 `stopped` 序列。默认路径仍使用旧调度器；灰度开启后，旧节点执行函数仍是唯一副作用来源。

## 阶段 4：ExecutionEngine 灰度

通过 `canvas_execution_engine=1` 独立启用现代执行器。串行级联、失败重试和并行循环仍调用原有节点执行函数，但调度、并发上限、失败短路、共享节点保护和 AbortSignal 生命周期由现代内核负责；旧 DOM 适配器继续投影节点状态。开关关闭时完整回退旧调度器，同一次运行不会同时进入两套调度循环。Engine 转换会发送 `canvas-modern-execution` 事件，供后续 Store/React 岛订阅。

## 阶段 5：任务与持久化边界灰度

- `canvas_task_client=1`：图片和视频任务通过 TaskClient 提交和查询；TaskClient 统一处理超时、404、服务端错误、有限轮询重试、去重观察和刷新后恢复。
- `canvas_repository=1`：画布读取、保存、409 冲突、创建/列出/恢复备份通过 CanvasRepository；文档在边界处解码并保留未知字段。
- 两个开关关闭时分别回退 `window.CanvasApi` 原调用，后端协议不变，也不需要数据迁移。

当前后端没有画布生成任务取消端点。因此“取消”明确表示停止前端轮询和级联调度，已经提交的外部任务继续由后端跟踪，并保留在画布 pending 数据中供恢复；不得向用户宣称外部计费任务已经撤销。后端进程重启后内存任务丢失仍按既定范围报告为不可恢复，持久任务存储留待独立后端决策。

## M2 中期 Go/No-Go

结论：**Go（内部全开灰度）/ No-Go（默认切换与阶段 6）**。

阶段 4 和阶段 5 的代码、回退开关、领域/契约测试及 mock 网络的 Playwright 主链已经齐备，可以在内部同时开启三个 M2 开关收集真实差异、错误和性能数据。默认地址继续使用旧路径；在内部样本无重复任务、无孤儿轮询、无字段损失，并经历两个稳定发布周期前，不默认启用新边界，也不启动 React 状态所有权迁移。

内部灰度可使用 `/static/canvas.html?canvas_m2=1` 一次启用 ExecutionEngine、TaskClient 和 CanvasRepository；三个原有独立开关仍保留，便于单项回退。`CanvasModernCore.getM2Report()` 返回当前开关和现代执行的活动数、终态计数及转换数，供灰度验收采样；默认地址不受影响。
