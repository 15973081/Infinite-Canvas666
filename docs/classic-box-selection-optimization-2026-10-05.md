# Classic 框选结束的局部呈现

诊断工具、记录及方案已先单独提交为 `8bcffe0`。本阶段生产改动只有 [Classic workspace](../static/js/canvas/classic/canvas-workspace.js#L3430) 的 `finishSelection()`：用 `refreshSelectionVisuals()` 替代 `render()`，删除末尾重复的 `updateWorkflowTransferMeta()`。命中遍历、选择集合、焦点退出、选择框和指针 AbortController 清理原样保留。

现有局部入口负责选中 class、连线及删除按钮、选择枢纽、管理弹窗元信息和 minimap。其他全量绘制、连线算法、Smart 依赖、保存、撤销、媒体预览及生成核心均未修改；未增加状态所有者、框架或 React。两个既有 Classic execution/session 换行标记没有纳入本次实现。

## 行为验收

新增 [classic-box-selection.browser.cjs](../tests/classic-box-selection.browser.cjs) 的 **7 个真实浏览器回归通过**，使用原页面、鼠标和键盘事件，核对实际选中集合及 DOM：

- Ctrl／R 框选、空框清空、重新框选；变换视口后的命中结果。
- 所有文字、媒体卡片和视口外占位节点的 DOM 身份保持；textarea 的 DOM 草稿和真实非零滚动保持，开始框选仍退出焦点。
- 选中 class 与集合一致；连线按钮、minimap 调度更新；退休指针会话不响应额外 mouseup。模拟窗口失焦后，真实 mouseup 不提交新的选择。
- 拖动途中打开管理弹窗，松手只更新一次元信息，显示对应节点和连线数量。
- 拖动途中打开原音频／视频预览，真实播放器加载并播放后松手：目标有效、播放器仍连接、同一 DOM、播放速率保持，currentTime 继续前进。没有修改遮罩或使用强制点击穿透，鼠标抬起由已经建立的窗口指针会话处理。
- 框选没有 `scheduleSave`／`pushUndo` 调用，undo／redo 长度不变；等待原保存 debounce 后也没有 PUT。保存和撤销均调用原实现来观察，没有为了得到零写入替换为空函数。

## 两批交替性能验证

工具 [classic_box_selection_benchmark.cjs](../tools/classic_box_selection_benchmark.cjs) 驱动既有诊断工具；基线从 `git archive 8b8ef5c static` 导出，修改版为 `8bcffe0` 加上述 production patch。工具首先断言整个 workspace 文件只有指定替换，原始文件 SHA256 存入 [新性能记录](classic-box-selection-performance-2026-10-05.json)。保存旧诊断快照，不覆盖原始盘点。

执行顺序为 **第一批基线→修改版，第二批基线→修改版**，串行运行，没有同时运行回归测试。每组均为合法的 100／1000 节点扇入图、99／999 条有唯一 ID 的连接，2 次预热、12 次采样，另取一次带探针的 trace。共 96 个正式轻量样本、8 个独立 profile，连同预热共 120 次真实 Ctrl 背景框选。分别断言基线全量绘制一次并替换所有节点、修改版局部入口一次并替换零节点；两版均选中 `node-0`，保存调用和 PUT 为零。

每组保留加载资源清单及原始 SHA256。已有 CRLF／LF 差异按文本规范化后核对相同，二进制资源必须逐字节相同；唯一内容差异为 workspace 的指定修改。首批资源检查在原始哈希差异处停止，核对为纯换行后恢复检查和第二批，未改变已测量的生产代码或采样数据。具体资源与恢复时间保留在 JSON。

环境为 Windows 10.0.19045、Ryzen 5 5600XT／12 逻辑核、Node 24.18.1、Headless Chrome 153、1280×900。下表单位为 ms；第二帧表示从真实 mouseup 到第二个 requestAnimationFrame 回调的时间，包含同步处理和其后的调度机会，不是显示器可见延迟。

| 批次／规模 | 版本 | 同步 p50 / p95 | 第二帧 p50 / p95 |
| --- | --- | ---: | ---: |
| 1／100 节点 | 基线 | 28.2 / 37.7 | 42.2 / 53.5 |
| 1／100 节点 | 修改版 | 11.4 / 14.0 | 14.8 / 18.2 |
| 1／1000 节点 | 基线 | 810.5 / 885.4 | 1109.2 / 1189.1 |
| 1／1000 节点 | 修改版 | 286.4 / 365.8 | 326.9 / 410.9 |
| 2／100 节点 | 基线 | 28.2 / 53.8 | 41.0 / 72.0 |
| 2／100 节点 | 修改版 | 12.0 / 15.2 | 16.5 / 20.2 |
| 2／1000 节点 | 基线 | 802.3 / 825.8 | 1097.4 / 1165.5 |
| 2／1000 节点 | 修改版 | 289.4 / 341.1 | 319.2 / 384.2 |

1000 节点同步 p50 分别下降 **64.7%／63.9%**，第二帧 p50 分别下降 **70.5%／70.9%**；p95 两批也下降。100 节点同步 p50 下降 **59.6%／57.4%**，第二帧下降 **64.9%／59.8%**，没有出现本批可见的回退。两批达到 50% 试点目标，结论仅适用于这项框选呈现操作和这些样本。

带探针的独立 trace 中，1000 节点后续 RAF 总时间从约 **326–328 ms** 降至 **13 ms**。修改版同步仍有约 **94–95 ms 布局、180–187 ms 样式重算**；这些类别存在包含关系，不与函数或 RAF 时间相加。节点没有重建后，既有 `renderLinks()` 的全端口读取及路径／按钮写入仍是主要剩余成本，因此修改版同步仍约 286–289 ms。没有为进一步达标而修改连线算法。

复跑命令：`node tools/classic_box_selection_benchmark.cjs --baseline-root <8b8ef5c 导出的根目录> --samples 12 --output <新路径>`。需要现有 Playwright 和 Chrome。当前 checkout 的 workspace 必须与基线仅有批准的替换，否则工具拒绝采样。`--resume` 仅恢复当前临时批次，并核对两份 workspace 哈希；不要用它改写交付快照。

## 回归与范围确认

全量 JavaScript **1267 项通过，零跳过**（文件并发数 2，约 239 秒），包含新增的 7 项框选浏览器回归。相关 Python `tests/test_classic_canvas_audio_lightbox.py` **7 项通过**。工具及生产文件语法检查、差异检查通过。生产差异为 workspace **1 行新增、2 行删除**；辅助改动仅新增行为回归和交替测量工具，以及诊断工具的版本断言、资源清单记录。

首次默认并发全量运行是 1266 通过、1 失败：Smart 素材面板重命名测试在 `canvas-modules.browser.cjs:227` 按 Enter 时，输入框已脱离 DOM，等待超时。该测试单独重跑通过；未修改它或 Smart 生产代码，随后以文件并发数 2 重跑全量，1267 项全部通过。根因未在本轮范围内确认，不能把单跑通过解释为已修复这一测试的不稳定性。首次、单跑和最终运行日志分别保留于 `.local/classic-box-selection-full-js.log`、`.local/classic-box-selection-smart-retry.log` 和 `.local/classic-box-selection-full-js-controlled.log`。

全量命令（PowerShell，使用现有 Node／Playwright 环境）：

```powershell
$boxJsChecks = Get-ChildItem -LiteralPath tests -Filter '*.cjs' -File | Sort-Object Name | ForEach-Object {$_.FullName}
node --test --test-concurrency=2 @boxJsChecks
.\python\python.exe -m pytest tests/test_classic_canvas_audio_lightbox.py -q
```

## 剩余风险

仍为同一机器、有限的合成文字图与固定 API，12 样本的 p95 接近最大值，不是生产 SLO。播放器回归使用真实浏览器解码本地 WAV／WebM 样本，不代表生产大媒体负载。没有重新执行数据库、真实服务、供应商或 TOS 验收，也不能推导整个画布提速。全量绘制其他触发路径和 Smart 广泛呈现仍按独立候选保留。
