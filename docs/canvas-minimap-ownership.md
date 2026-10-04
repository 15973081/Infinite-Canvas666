# 缩略导航图状态封装

实施日期：2026-10-04。目标是继续降低原生 JavaScript 的全局状态和跨模块耦合，沿用素材库试点的明确归属、命令交互和资源清理方式。

## 修改范围

业务代码仅涉及 `static/js/canvas.js`、`static/js/smart-canvas.js` 和两套 `workspace` 文件。HTML、CSS、脚本数量与加载顺序保持原样，没有新增框架或通用状态管理层。保存、权限、生成、节点选择及其他手势的业务逻辑保持原样。

| 功能 | 所有者 | 私有数据与资源 |
| --- | --- | --- |
| Classic minimap | `createClassicMinimap()` 创建的 `classicMinimap` | 投影与节点尺寸缓存、布局失效标记、可取消帧句柄、帧代次、拖动目标及所属指针会话、三个 DOM 引用和自身监听 |
| Smart minimap | `createSmartMinimap()` 创建的 `smartMinimap` | 投影与节点尺寸缓存、待绘制更新类型、可取消帧句柄、帧代次、拖动目标、三个 DOM 引用和自身监听 |

两个入口各移除原先四个 minimap 状态绑定及三个 DOM 引用，保留一个冻结的命令对象。缓存和 DOM 不对外公开；工作区需要判断拖动状态时，只读 `dragging`。

节点、选择和视口仍由原工作区持有。minimap 读取它们，通过原有 `centerViewportOnWorldPoint()` 完成导航。

## 入口与行为

| 入口 | 意图与约束 |
| --- | --- |
| `layoutChanged()` | 布局或选择发生变化，下一帧重新测量；同帧重复请求合并 |
| `viewportChanged()` | 只更新视口，可复用节点尺寸缓存；不能降级已排队的布局更新 |
| `reset()` | 取消帧、结束旧拖动、释放投影和节点数组引用；下次更新重建缓存，不触发保存 |
| `destroy()` | 执行重置，移除自身监听并释放 DOM 引用；后续调用不再产生绘制和导航 |
| `bind()` | 按原初始化位置绑定，重复调用不重复注册 |
| `render()` / `eventToWorld()` | 保留立即绘制与坐标换算兼容入口；内部实现和缓存由功能自身持有 |

原 `scheduleMinimapRender()`、`scheduleSmartMinimapRender()` 与 `renderMinimap()` 保留为薄委托，现有布局和视口调用点无需了解帧句柄或缓存字段。Classic 入口退出画布时直接重置字段的代码改为 `reset()`；打开或创建画布、Smart 应用读取结果时，在替换画布前执行重置。

Classic 保留节点与视口共同决定边界、8% 或 240 世界单位的留白、3px 节点最小尺寸和 8px 视口最小尺寸。Smart 保留原边界、200 世界单位留白、4px 最小尺寸和按节点 ID 复用标记 DOM 的策略。两套几何算法和缓存有效性条件各自保持原样。

Classic 在拖动结束时调用原 `scheduleViewportSave()`；Smart 在按下和每次导航移动时由原视口操作调用 `scheduleSave()`。重置、退出或销毁不补发保存。

## 生命周期

- 每次排帧记录帧代次和画布 ID。重置、立即绘制和销毁取消句柄并改变代次；即使取消后的回调被调用，也不能绘制新画布或清除新帧。
- 拖动记录发起时的画布 ID 和节点数组。选择新的画布或替换节点数组后，旧拖动不能继续导航，也不能在抬起时保存新画布。
- Classic 继续使用现有窗口指针会话，帮助函数增加返回自身会话句柄。minimap 仅终止自己持有的会话；较新的节点或工作区手势会话不受其重置影响。
- Smart 的共享 `window.onmousemove` 和 `window.onmouseup` 委托 `move()`、`endDrag()`。minimap 销毁只清除自身的按下和页面生命周期监听，不移除或替换共享处理器。
- `pagehide` 为缓存页面时，暂停更新并重置资源；对应 `pageshow` 恢复后排一次布局更新。永久离开执行销毁。取消离开的 `beforeunload` 不销毁资源。

## 验证

针对性测试覆盖坐标基准、空画布、缓存复用、投影范围扩展、节点数组替换、布局与视口请求合并、取消后的回调、重复绑定、拖动中切换、保存时机、缓存页面恢复和其他手势监听保留。

浏览器验收使用真实 Chrome 和生产脚本，HTTP 服务由测试替身提供。新增四项浏览器测试覆盖 Classic 实际切换画布、Smart 实际重载、两套 200 节点的 120 次导航、保存触发次数，以及 Smart 销毁后的工作区平移。缓存页面恢复通过页面生命周期事件模拟。

验证结果：

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| minimap 状态边界、坐标、几何调度、缓存及媒体保护 | 54 项通过 | `.local/minimap-final-targets.log` |
| 新增 Chrome minimap 验收 | 4 项通过，已包含在全量结果中 | `.local/minimap-final-js.log` |
| 全量 JavaScript：`node --test --test-concurrency=1 tests/*.cjs` | 878 项通过，零失败、零跳过 | `.local/minimap-final-js.log` |
| 前端版本、生成入口、视频恢复与任务持久化 Python 回归 | 34 项通过 | `.local/minimap-python.log` |
| 四个业务文件语法检查、`git diff --check` | 通过 | 命令输出 |

Python 有一项原有 Starlette/httpx 弃用提示。最后补充的旧回调不得清除新帧句柄断言，已在 54 项针对性回归中再次验证。测试使用真实功能工厂和公开操作，不为测试公开缓存或 DOM。

## 剩余边界

本次验证缓存工作量与事件清理，没有开展真实大画布耗时、GPU 或长期内存基准，也没有通过实际浏览器前进后退确认各浏览器的 BFCache 策略。现有视口和保存入口继续承担各自原有规则。

服务端版本一致性属于独立后续事项；本阶段不延伸到该协议，也不继续整理其他手势。原 [状态盘点清单](canvas-global-state-inventory.json) 保留为实施前的声明与依赖快照。
