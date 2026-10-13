# 外壳与 iframe 消息边界（2026-10-05）

基线：`ae150ab`。这是通信计划的第 1 轮；历史状态盘点保留为历史记录，不随新代码覆盖。

## 2026-10-14 更新

平台现在只使用固定深色外观。`studio-theme` 协议、`StudioTheme`、主题偏好读取和切换过渡已移除；`studio-display.js` 接管原 `theme.js` 中的界面缩放功能，仍通过 `studio-ui-scale` 同步子页。以下主题行为和验证数字为原轮次的历史记录。

## 协议与路由盘点

| 消息 | 发送入口 | 范围 | 接收职责 |
| --- | --- | --- | --- |
| `cloud_status`, `canvas_updated` | 外壳 `/ws/stats` 回调 | 发送时的当前 iframe | 各页保留原业务处理；未订阅类型忽略 |
| `canvas_locked`, `canvas_unlocked`, `asset_library_updated` | 同上 | 全部 iframe，包括后台页 | 画布原锁/素材处理；未订阅类型忽略 |
| `maintenance_changed` | 外壳维护快照处理 | 全部 iframe | 原有处理保留；未增加新消费者 |
| `providers-changed`, `workflows-changed`, `comfy-instances-changed` | 外壳接收 iframe 或 `studio-api` 通知 | 全部 iframe | Classic/Smart 配置刷新；在线页仍只接收原两种配置消息 |
| `canvas-focus` | 外壳切换到 Classic 画布 | 该 iframe | Classic 原配置刷新和远端同步 |
| `studio-theme` | 主题广播、切页和加载同步 | 指定页或全部页 | `theme.js`，Smart/素材管理页保留原应用职责 |
| `studio-lang` | 语言广播、切页和加载同步 | 指定页或全部页 | 在线/GPT 页原中文界面刷新 |
| `studio-ui-scale` | `theme.js` 设置或自动缩放 | 全部 iframe | 子页 `theme.js`；不再继续广播收到的缩放消息 |

同源主题直接调用 `StudioTheme.apply()` 保留：主题过渡需要在外壳截图前同步更新子页，消息回退仍走统一发送入口。

原代码的 `message` 接收中，Classic/Smart/外壳只检查非空 origin；主题、在线、GPT 和素材管理未检查来源。本轮接收要求 **origin 等于当前 origin**，子页只接受 parent，外壳只接受当前 DOM 中 iframe 的 contentWindow。发送使用当前 origin，替代 `*`。不接受同源兄弟 iframe 或外壳自身伪造的 iframe 消息。

`studio-api` 是同源 BroadcastChannel，独立于 iframe 来源规则。其原消息体、页面过滤差异和可能同时来自频道与外壳转发的通知均保留；本轮未引入跨通道去重或改变刷新策略。

## 所有者与入口

`studio-frame-messages.js` 在六个已有页面的 `theme.js` 前同步加载，原业务脚本顺序保持。`StudioFrameMessages` 每个页面只初始化一次，公开冻结入口：

- `send(frame, data)`、`broadcast(data)`：只发送固定协议中的消息，原消息体不重组。
- `forwardUpdate(data)`：表达当前页更新或全页锁/素材通知；连接回调不再选择 iframe 或直接调用 postMessage。
- `subscribe(types, callback)`：返回取消函数；同一回调重复注册只保留一份。每个页面仍处理原业务分支。
- `subscribeApi(callback)`：固定 `studio-api` 频道，返回取消函数，最后一个取消时关闭频道。不形成任意事件总线。
- `watchFrameLoads(callback)`：接管已有四个 iframe 的加载同步监听，重复注册不累积。
- `pause/resume/destroy` 和只读 `state`：仅管理这些消息、频道和 iframe load 监听，保留工作区等其他处理器。

缓存 pagehide 暂停并关闭频道/加载监听；pageshow 恢复一次，不重放消息或自动切页。永久 pagehide 销毁，不可恢复。频道和 load 回调记录代次，已保存的旧回调在返回后仍失效。监听回调异常按浏览器原错误报告路径报告，不阻止其他订阅者。

## 验证

- 协议单元测试 13 项：路由、原消息体、来源、取消、重复绑定、消费者失败隔离、缺少 BroadcastChannel、缓存返回、旧频道/load 回调和永久销毁。
- Chrome 浏览器 5 项：生产外壳 + 同源观察 iframe 的切页/广播/真实 postMessage/频道；Classic/Smart 完整页面嵌入父页后的实际接收、主题、缓存返回及永久退出。生命周期事件用真实浏览器 PageTransitionEvent 注入，未声称验证 Chrome 原生 bfcache 命中率。
- 主题过渡相关测试 25 项通过。
- 相关 Python 51 项通过。
- 全量 JavaScript **1224 项通过，0 失败**（`.local/frame-boundary-full-js.log`）；49 个生产脚本语法及差异检查通过，三个原历史盘点哈希未变。

## 剩余边界

不改变 `/ws/stats` 的重连、维护轮询或 `CanvasSubscription`；后续第 2 轮再分离外壳连接、解析、业务与呈现。正在执行的订阅业务 Promise 保留其原完成规则，本协议只阻止已暂停/销毁后的新投递，不取消保存、生成或锁操作。

同源 iframe 跨文档导航使用浏览器 WindowProxy；现有消息没有文档版本字段，不能区分同一窗口导航前已排队的有效协议消息。本轮来源约束、离开暂停和旧频道回调保护不等同于服务端版本或任务代次校验。动态新增 iframe 的 load 监听需要显式重新调用 watchFrameLoads，当前外壳四个固定 iframe 无此需求。

未移除 iframe、未引入 React、未引入通用事件总线；生成服务与大画布耗时基准仍待迁移评估阶段补齐。
