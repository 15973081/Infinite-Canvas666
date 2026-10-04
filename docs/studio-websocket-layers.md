# 外壳 WebSocket 分层（2026-10-05）

通信计划第 2 轮，基线 `c01832a`，单独验收与提交。

## 依赖与所有权

| 层 | 入口/所有者 | 责任 |
| --- | --- | --- |
| 连接 | `StudioStatsConnection.create()` | `/ws/stats` 的连接、就绪等待、重连、断线通知计时与关闭；没有 DOM 或画布业务依赖 |
| 解析 | `parseMessage(text)` | JSON 对象和字符串类型字段校验，保留原消息体；无 DOM、存储、连接副作用 |
| 业务 | 外壳 `handleStudioSocketMessage()`、`handleStudioConnected()` | stats 会话观察、维护快照处理、首连/重连维护刷新、调用消息路由 |
| 呈现 | `updateStudioOnlineCount()`、`hideServiceDisconnected()`、原维护呈现函数 | 原在线数字、维护提示及断开覆盖层 |
| iframe 路由 | 第 1 轮 `StudioFrameMessages` | 继续保留当前页与后台页范围差异 |

`connectStudioWebSocket()` 保留为旧入口薄委托。原 socket、retry timer、attempt 和 hasConnected 四个外壳可写字段进入私有闭包；同时私有化 pending startup 和断线提示 timer。外部只查询 `isOpen()` 或冻结的状态快照。

`CanvasSubscription` 已有画布/空间、序列、版本和心跳语义；stats 没有这些语义。本轮保留它，不套用其重连参数，也不新增全站统一连接系统。

## 行为与生命周期

地址仍在 `CanvasSession.ready` 后构造，保留协议、client_id 和 `CanvasSession.socketUrl()` 空间参数。原重连公式 **min(10000, 800 × 1.7^attempt)** 保留，成功连接重置 attempt；断线提示仍延迟 **700ms**，期间恢复不显示断开层。

首次成功连接和后续成功连接仍分别向外壳报告，外壳保留“重连或尚无维护状态时刷新”的规则。60 秒状态轮询、维护期间 2500ms 轮询以及业务 HTTP 请求原完成语义不改。结果、锁、素材和任务消息体不改。

重复 start 在等待会话及 OPEN/CONNECTING 时不叠加连接。连接回调核对当前 socket 和会话代次；旧 open/message/error/close 不影响新连接。取消的 retry/notice 回调即使被外部保存并强行调用也失效。

缓存离开暂停、清计时器、解绑并关闭当前 stats socket；返回仅恢复先前已启动的连接，重复 pageshow 不叠加。永久离开销毁自身生命周期监听，不能重新 start。关闭 stats socket 不关闭子页的 CanvasSubscription、任务连接或业务请求。

原 JSON null/数组等不合法对象可能使业务回调抛错，现在在解析层拒绝。会话就绪或 WebSocket 构造失败按原间隔重试并走断开提示，避免未处理启动异常；没有改变正常断线退避策略。

## 验收与限制

- 11 项连接单元测试覆盖 parser、等待就绪、重复启动、退避与封顶、700ms 提示、旧连接回调、缓存返回、永久退出及初始化失败。
- 8 项 Chrome 浏览器测试覆盖生产外壳路由、真实 iframe 与 postMessage，新增连接重复启动、注入断线/重连、数字与提示恢复、不合法消息和退出时取消 retry；连接事件由浏览器内替身注入，并非真实服务端故障演练。
- 第 1 轮协议和现有 CanvasSubscription 基线一同回归，相关合计 38 项通过。
- 相关 Python 51 项、50 个生产脚本语法与差异检查通过。
- 全量 JavaScript **1238 项通过，0 失败**（`.local/stats-layer-full-js.log`）。

维护 HTTP 回执仍使用原业务完成规则，本轮只限制连接回调与连接自身计时器。保存/历史、锁/同步、生成及服务端一致性仍独立。未引入 React 或通用事件总线；真实服务演练和大画布耗时仍须在迁移评估前补齐。
