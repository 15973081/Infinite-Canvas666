# 真实交互性能诊断：Classic 框选与 Smart 下游刷新

基线为 `8b8ef5c`。本轮仅新增诊断工具、测量记录和方案，未修改生产脚本、图像或依赖算法、保存、任务及供应商协议，未引入 React。原始状态盘点和上一轮性能快照保留。

## 本轮选择

下一阶段只优化 **Classic 框选结束的呈现路径**：保留现有命中计算及选择所有者，用已有局部选择视觉入口替代全量节点重建。Smart 的下游刷新先作为独立候选保留，需要先证明哪些派生内容可以复用。

## 操作到调用的路径

| 真实入口 | 调用路径 | 当前影响范围 |
| --- | --- | --- |
| Classic Ctrl／R + 背景拖动，松手 | `bindClassicBoardEvents → startSelection → finishSelection → render` | 遍历命中范围后重建所有文字节点和占位节点；同步几何刷新一次，再排队两轮几何刷新 |
| Classic 普通节点单击 | `renderNode` 的 click 处理器 → `refreshSelectionVisuals` | 更新 selected class、连线及选择枢纽，保留节点 DOM |
| Classic 提示词输入 | textarea input → 计数器、`scheduleSave`、`refreshPromptDependents` | 依照业务依赖更新生成器输入视图，不直接调用全量 render；本轮无连接对照不代表复杂依赖输入成本 |
| Smart 提示词 LLM 开关 | `bindPromptNodeControls` → `refreshSmartNodes([id], {forceIds:[id]})` → `smartAffectedNodeIds` → `refreshSmartNodesImpl` | 遍历全部可达下游，重新创建其节点／占位 DOM，再排队两轮连线刷新 |
| Smart 提示词普通输入 | `.prompt-node-text.oninput` → 更新 text、`scheduleSave` | 该路径没有调用 `refreshSmartNodes`；不能把所有打字都归入整链刷新 |

Classic 的新增节点、复制／导入、删除连线、框选连接及切线完成等路径也调用全量 render；Smart 的供应商切换、系统提示词开关及部分循环控件也调用下游刷新。这些是源码定位结果，**本轮没有逐个测量，也不据此优化所有调用**。恢复文档、同步及任务回执仍维持原流程。

关键源码：Classic [框选](../static/js/canvas/classic/canvas-workspace.js#L3408)、[全量绘制](../static/js/canvas/classic/canvas-workspace.js#L951)、[局部选择视觉](../static/js/canvas/classic/canvas-workspace.js#L3829)；Smart [控件入口](../static/js/canvas/smart/smart-workspace.js#L2440)、[可达下游](../static/js/canvas/smart/smart-workspace.js#L2325)、[节点刷新](../static/js/canvas/smart/smart-workspace.js#L4991)。

## 测量方法与可信边界

工具为 [canvas_interaction_diagnostics.cjs](../tools/canvas_interaction_diagnostics.cjs)，使用生产 HTML、原脚本顺序和真实 Chrome 的 Playwright 鼠标／键盘事件，逐样本检查 `isTrusted`。API 是固定夹具，WebSocket 为夹具替身；这不是新一轮真实后端服务验收。没有付费生成、媒体解码或 GPU 负载。

Classic 正式文档是 99／999 个提示词节点接到一个生成节点的扇入图，共 100／1000 个节点及 99／999 条连线；每条 Classic 连线经过现有 `canConnect` 校验。输入对照为 1000 个无连接提示词节点。Smart 为 1000 个提示词节点、999 条手工端口可建立的链式连接，另有无连接对照。逐场景断言实际节点及连线数量；连线 ID 唯一。数据量和拓扑是人工压力场景，不代表用户操作频率或典型生产文档。

每场景预热 2 次、轻量采样 12 次；使用同一机器和串行浏览器。记录真实事件到处理器结束的同步耗时，以及到第一／第二个 requestAnimationFrame 回调的时间。第二帧是浏览器呈现机会，不是显示器上的端到端可见延迟。框选测量的是松手，不含用户拖动时间；节点单击行只测 click 处理器，之前的 mousedown／mouseup 及其保存入口不计入该行。输入行从 input 事件起算，不包含浏览器先行更新输入值的默认动作。

同步结束标记在实际处理器栈内安排 microtask，避免 capture listener 后的 microtask 检查点把处理器成本遗漏。轻量采样只包装少量操作及保存入口；包装器调用原方法，**没有替换保存实现**。各次操作之间等待原 debounce 完成，并核对实际 PUT 次数。Smart 控件放在画布原点右侧，避开夹具中 dormant composer 控件覆盖；不强制点击，不改 CSS，必要的视口调整在计时前完成。

每场景另取一次带函数／DOM 包装和 CDP trace 的样本，用于成本归属，**不纳入 p50／p95**。函数时间为包含子调用的时间，DOM 计时只覆盖工具列出的 API，包含可能由 DOM 读取触发的样式和布局；不能当纯 DOM 开销，也不能与 trace 布局相加。CDP 按主渲染线程、同步区间及随后观察区间分别合并事件时间段，避免同类别嵌套重复计算。RAF／Task 仍可能包含布局、样式，类别之间不得相加。后续窗口从操作完成后等待约 350 ms，包含几何帧和可能的视口定时器；后台保存不计入优化目标。

CDP `Performance` 增量是整个 Playwright gesture 加验证读取的辅助数据，单位中的 Duration 为秒；它包括 click 之前的指针事件，不能与精确 mark 区间的 trace 数字直接比较。

初始微任务结束标记和 Classic 提示词链样本均未作为正式结果使用；原历史报告不覆盖、不改写。修正夹具的可点击位置、Smart 视口 transform 以及点选保存去重断言后，逐场景继续测量，仅保留成功场景；记录有恢复批次时间。最终工具另做全部场景的短样本验收，不与正式 12 样本分位数混用。正式诊断记录单独保存。

## 实测结果

原始样本、调用计数、DOM 复用、保存请求和分阶段 trace 汇总见 [独立测量记录](canvas-interaction-performance-2026-10-05.json)。环境：Windows 10.0.19045、Ryzen 5 5600XT／12 逻辑核、Node 24.18.1、Headless Chrome 153、1280×900。所有数字为 ms。

| 场景 | 同步 p50 / p95 | 第二帧 p50 / p95 | 替换节点数 |
| --- | ---: | ---: | ---: |
| Classic 框选，100 节点／99 条扇入连接 | 28.3 / 39.8 | 39.8 / 59.2 | 100 |
| Classic 框选，1000 节点／999 条扇入连接 | 864.2 / 1029.2 | 1191.5 / 1403.9 | 1000 |
| Classic 输入，无连接 1000 节点 | 0.3 / 0.4 | 5.8 / 7.4 | 0 |
| Smart 链首 LLM 开关，1000 节点／999 条连接 | 1682.5 / 1815.2 | 1824.0 / 1944.1 | 1000 |
| Smart 链尾 LLM 开关，相同规模 | 4.2 / 4.8 | 20.0 / 27.2 | 1 |
| Smart LLM 开关，1000 个无连接节点 | 3.9 / 6.3 | 17.0 / 22.6 | 1 |
| Smart 普通输入，1000 节点／999 条连接 | 0.1 / 0.2 | 4.9 / 6.8 | 0 |
| Classic 单击选择处理器，1000 节点／999 条扇入连接 | 280.5 / 366.1 | 334.7 / 414.7 | 0 |

最后一行是现有局部呈现路径的对照，手势区间不同；**不是已实施框选优化后的数字**。它证明同一文档可以保持全部节点 DOM，并显示连线更新仍有数百毫秒成本。普通输入两行只用于确认实际调用范围，不代表复杂依赖、中文输入法或长文本的性能。

两条重路径的独立归属样本如下；这里有探针开销，不能用它们替代上表分位数：

| 成本／观察 | Classic 1000 节点框选 | Smart 链首开关 |
| --- | ---: | ---: |
| 同步处理器 | 1031.4 | 1792.6 |
| 同步样式重算 | 324.6 | 58.2 |
| 同步布局 | 606.2 | 1593.6 |
| 所列 DOM API 累计，覆盖整个观察窗、含嵌套浏览器工作 | 110.8 | 111.9 |
| 后续 RAF 回调累计，含子工作 | 327.7 | 94.5 |
| 后续样式／布局／Paint 与 PrePaint 合并 | 54.7 / 205.6 / 22.0 | 2.3 / 3.1 / 9.5 |

Classic 同步 `render` 为 1026.0 ms，实际节点构造函数共约 34.3 ms（16 个完整节点、984 个占位节点）；几何刷新总计 3 次，其中后续两轮约 312.6 ms。说明大量时间不在模板字符串或节点数组本身。全量 render 在每轮追加节点后调用 `isNodeInCanvasViewport`，该函数读取 `shell.clientWidth/clientHeight`；连线更新又交替读取端口位置与写入路径／按钮位置。这些读写交错与 trace 中大量样式、布局事件相符；本轮没有逐个重排浏览器读写顺序。

Smart 可达集合计算为 **0.2 ms**，HTML 构造约 **3.6 ms**，1000 次 `bindNodeEvents` 约 **41.6 ms**；仍发生 1000 次替换。`isSmartNodeInViewport` 同样读取布局尺寸，刷新循环又逐项替换节点，trace 中同步布局为 **1593.6 ms**。这组证据支持“广泛呈现和强制布局是主成本”，不支持“图遍历算法或所有打字都慢”。计时是包含关系，不能将上面各项相加。

保存未被 stub：两组框选均为零 PUT；输入及 Smart 开关每次更改各有一次 PUT，含 2 次预热共 14 次。Classic 节点头单击有 14 次原 `scheduleSave` 调用，夹具第一次持久化为一次 PUT，后续相同文档被原 `lastSavedCanvasSnapshot` 去重。测量没有为得到零写入而改变原行为。

收益排序：Classic 框选改变的只是选择，现有局部入口完整且影响边界小，因此先选它。Smart 的压力耗时更高，但派生内容的失效规则与焦点保护更复杂，风险大于当前单点方案；Classic 全量绘制的布局读写批处理也有价值，但涉及更多操作，本轮只记录为后续候选。

## 唯一实施方案：Classic 框选只更新选择呈现

1. 保留 `startSelection` 的焦点退出、Ctrl／R 手势、选择框、交叠判定、`selected` 更新及窗口指针解绑，不改坐标和命中算法。
2. 在 `finishSelection` 中以现有 `refreshSelectionVisuals()` 更新节点 selected class、连线选中控件、选择枢纽及 minimap，替代 `render()`。已有入口负责管理弹窗元信息更新，避免尾部再次重复更新。
3. 保留其他 render 调用，不新增选择副本、通用控制器或框架；不扩展为整套连线绘制优化。该局部入口仍可能读取所有端口并更新所有连线，这部分成本需要如实保留、单独观察。
4. 不调用新增保存或画布历史入口。框选保持零保存；节点单击原有指针释放保存路径维持原样。删除、连线修改、导入／恢复和生成回执的保存语义不纳入此次改动。

未来实施验收：真实 Ctrl／R 框选、空白框选清空、多选重选、缩放／平移后的命中、拖动退出、管理弹窗打开时元信息只更新一次；选择集合与现有基线一致，文字／占位节点 DOM 不替换，textarea 草稿与原有滚动、媒体播放及预览目标保留。检查连线按钮、选择枢纽、minimap、焦点退出和监听清理。框选不新增保存和 undo 记录；画布变更仍走原流程。

性能验收使用本轮相同合法图、鼠标手势和帧观察窗口，交替采样两个版本，至少重复两批；观察同步 p50／p95 和第二帧，不用单函数 render 时间代替交互成本。1000 节点样本以同步和第二帧 p50 至少下降 50% 作为试点目标，同时保证 100 节点场景不出现明确回退。此数值是下一阶段验收目标，**不是本轮已实现或已保证的收益**。若连线仍占主导，只记录剩余成本，不顺带扩大范围。

## 验证及剩余风险

本轮完成：

- **8 个正式浏览器诊断场景**，每个 2 次预热、12 次轻量采样和 1 次独立 trace；96 个正式样本，120 次实际计入验收的手势。逐场景验证真实事件、实际节点／连线数、预期替换范围、操作／保存次数及两帧回调。
- 最终工具重新跑 **全部 8 个短样本场景**（每场景 2 次预热、2 次采样、1 次 profile，共 40 次手势），验证修正后的夹具、保存调用与原保存去重断言；短样本分位数不纳入正式记录。
- `node --test tests/workspace-cache-ownership.cjs tests/workspace-cache.browser.cjs tests/test_canvas_prompt_dependencies.cjs`：**25 项通过，0 失败**，包括真实浏览器的缓存复用、文档替换、缓存返回及焦点延迟刷新保护。
- 工具语法检查及差异检查通过，`git diff --name-only -- static` 没有内容差异。两个既有 execution／session 换行标记保持原样。原始三份盘点 SHA256 与交付时相同，其他历史记录未改写。
- 本轮浏览器均由 fixture 的 finally 关闭。没有启动数据库／真实服务或供应商请求。

日志分别为 `.local/canvas-interaction-diagnostics-valid.log`、`.local/canvas-interaction-diagnostics-resumed.log`、`.local/canvas-interaction-diagnostics-last.log`、`.local/canvas-interaction-diagnostics-smoke.log`、`.local/canvas-interaction-related-tests.log`。生产代码未改，本轮未重跑全量 JavaScript、Python、数据库或真实服务验收，不沿用上一阶段 1260／52／86／6 的结果冒充本轮重跑。

复跑需项目既有 Playwright 依赖和 Chrome。当前 checkout 为基线时执行 `node tools/canvas_interaction_diagnostics.cjs --baseline-commit 8b8ef5c --samples 12 --output <新记录路径>`；如 checkout 已改变，先将该提交的 static 目录导出到独立目录，再加 `--source-root <导出目录>`。`--baseline-commit` 是来源标签，工具不会替用户检出该提交。计时应串行运行，不与其他测试或服务压力采样并行。`--only classic`／`--only smart-toggle` 可局部复跑；`--resume` 仅用于当前诊断批次的临时输出，不用于覆盖历史快照。

Smart 具有更大的压力样本开销，但缓存判断必须考虑节点对象身份、焦点延迟刷新、派生提示词／缩略图、连接和运行状态。已有全量 render 能复用相同对象和相同 HTML，局部 refresh 路径却直接替换可达目标；未来可研究呈现复用，不能直接砍掉业务下游依赖计算。本轮不实施。

单次归属 trace 有探针开销，12 个轻量样本的 p95 接近样本最大值，不能作为生产 SLO。真实用户分布、大媒体、跨设备和实际网络负载未测。保存／任务／供应商协议及 React 迁移继续保持独立范围。
