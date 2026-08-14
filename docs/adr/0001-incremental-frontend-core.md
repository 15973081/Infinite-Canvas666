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
