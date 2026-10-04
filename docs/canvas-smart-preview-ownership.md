# Smart 普通预览：控制状态与媒体呈现所有权

日期：2026-10-04。承接 Smart 图片编辑器阶段。原始 `canvas-global-state-inventory.json` 保持不变；本记录只更新普通预览这一条边界的完成情况。

## 修改范围

入口移出 `previewCompareOn`、`previewCompareIndex`、`previewMetaExtraText` 三个 UI 状态绑定，收归 results 中已有的 `createSmartPreviewGestures()`。沿用现有 `smartPreviewGestures` 功能对象，不增加控制器、框架或第二份图片目标。

该对象统一持有普通预览的对比选择、元信息、媒体呈现、姿态、拖动、加载回调、动画帧和缩略图监听。对比图片、当前图片、元信息、缩略图、对比按钮与图层／手柄通过内部 DOM 缓存访问。共享 stage、frame、视频播放器与全景按钮仍按原功能协作；视频截取在 results 内通过 `video()` 借用同一播放器，该桥接不用于复制播放器状态。

`smartImageEditor` 继续唯一持有当前图片目标、分组导航和编辑模式。预览通过 `currentEditImage()` 获取有效目标，通过 `imageResolution()` 获取冻结的尺寸标量，并通过编辑器的回调保护核对目标。没有复制节点、图片索引、画布 ID 或选择状态。编辑器不再协调对比按钮、缩略图及普通预览 stage 的显示字段。

本轮业务改动只涉及 `smart-canvas.js`、`smart-results.js` 和 `smart-media-editor.js`。视频截取、全景渲染／导出、生成、权限、保存核心、Classic 与画布撤销算法保持原流程。

## 完整命令与只读快照

| 入口 | 关联操作 |
| --- | --- |
| `prepare()` | 使旧视图失效，重置对比／元信息／手势，为新目标准备呈现 |
| `refresh()` | 获取当前有效目标及候选，校验媒体类型和对比索引，生成元信息，再刷新呈现 |
| `toggleComparison()` / `selectComparison(index)` | 校验当前候选，处理开关或同项再次点击取消，统一更新图层、按钮、缩略图及元信息 |
| `updateMetadata(text)` | 更新会话元信息并同步分辨率提示 |
| `leave()` | 从普通预览进入编辑，取消旧回调／帧／拖动，隐藏普通预览；保留再次进入预览时的选择语义 |
| `release()` | 关闭时清理视图资源、暂停视频、移除媒体来源、清空元信息与尺寸、重置对比和手势 |
| `pause()` / `resume()` / `destroy()` | 缓存页面暂停／恢复自身监听；永久退出释放资源、解绑自身监听并清空 DOM 缓存 |

原函数名保留为薄委托，包括 `refreshComparePanel()`、`togglePreviewCompare()`、`updatePreviewMetaHint()` 及编辑器准备／离开／释放桥接。外部无需先修改字段再组合刷新。

冻结 `state` 提供对比开关／索引、对比是否正在显示、元信息、活动／暂停状态以及原姿态／手势标量。`pan` 同样是冻结副本；快照不提供可写字段、目标或 DOM。

候选消失或切到视频时退出对比；索引越界时回到未选择状态；同一缩略图再次点击取消该项。分组切图沿用编辑器的新会话准备规则，重置对比；编辑模式返回普通预览沿用原选择保留规则。状态修正在命令边界完成，呈现器读取已经一致的选择。

## 回调与清理规则

每次呈现更新递增视图代次；图片／视频加载回调同时检查视图代次、活动／暂停状态以及编辑器目标和模式代次。较早的对比加载、切图前的媒体加载、关闭后或销毁后的回调不能改写新视图或补写旧目标尺寸。

动画帧句柄由本功能记录，刷新、离开、关闭、暂停和销毁时取消。缩略图点击由一个委托监听处理；每次重绘移除旧缩略图错误监听、取消媒体观察并移除来源。固定监听按原命名作用域替换绑定，重复绑定不会累积。关闭保留可复用的固定控件监听，但它们只在有效普通预览中工作；暂停和销毁解绑。工作区共享鼠标监听保持原样。

缓存页面离开暂停自身资源与监听，返回由编辑器恢复会话并重新呈现。普通预览不独立恢复图片目标。永久退出由编辑器调用本功能销毁。

媒体尺寸首次发现仍沿用原有内容更新及保存行为，没有新增保存通道；对比选择、元信息展示和已知尺寸的图片／视频切换不触发保存。

## 验证

新增 16 项针对性验收：2 项源码／所有权检查，14 项使用生产 HTML、CSS 和脚本的 Chrome 浏览器测试。覆盖冻结快照、同项取消、分组切图、真实 VP8/WebM 视频解码及类型切换、候选移除、旧图片／对比／视频回调、关闭与销毁、重复绑定／打开、缩略图释放、缓存页面返回及动画帧取消、延迟加载／失败重试和只读权限／保存次数。

测试视频是 652 字节的固定本地样本，运行测试不依赖 MediaRecorder 的录制时序或 ffmpeg。浏览器接口使用本地测试夹具，没有调用真实生成服务。

本轮重新运行全量 JavaScript：988 项通过（原 972 项加本轮 16 项），无失败或跳过。相关 Python 回归 34 项通过，包含一条已有的 Starlette/httpx 弃用提示。JavaScript 语法检查与差异检查通过。

验证命令：

```powershell
node --test --test-concurrency=1 tests/*.cjs
.\python\python.exe -m pytest tests/test_frontend_versioning.py tests/test_canvas_run_entry.py tests/test_smart_canvas_video_resume.py tests/test_canvas_video_task_persistence.py -q
node --check static/js/canvas/smart/smart-results.js
node --check static/js/canvas/smart/smart-media-editor.js
node --check static/js/smart-canvas.js
git diff --check
```

## 保留范围与风险

入口中的视频截取状态、全景状态、音频预览、生成任务、内容数据和缓存绑定继续保留原所有者，不为减少变量数量扩大本阶段。全景仅将普通对比的退出和共同呈现交给现有预览对象，纹理、GPU、导出及数学逻辑未整理。

本轮验证普通预览生命周期与生产页面的 Chrome 交互；未做跨浏览器、大媒体资源性能基准、真实生成服务验收或网络代理／鉴权服务联调。词库响应竞争和服务端版本一致性仍属独立后续事项。
