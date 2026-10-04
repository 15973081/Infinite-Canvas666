# Classic 结果预览会话与资源边界

日期：2026-10-04。Smart 音频预览已先单独提交为 `95da674`。本阶段整理 Classic 的共享结果预览窗口；原始盘点、当前复盘与排序文件保持不变。

## 所有权与修改范围

入口移出的 11 个状态绑定：`outputCompareDrag`、`outputPreviewZoom`、`outputPreviewPan`、`outputPreviewPanDrag`、`currentOutputCompareUrl`、`currentOutputMeta`、`currentOutputLightboxOutId`、`currentOutputLightboxUrl`、`outputTrimState`、`outputTrimFrame`、`outputTrimJob`。

原入口的 19 个专属 DOM 引用移入 results 的 `createClassicOutputPreview()`，截取控件也由内部按需取得和缓存。图片、视频、音频、对比和截取使用既有共享窗口，没有引入第二套目标或通用控制器。

功能对象、UI 快照和快照中的平移坐标冻结；快照不暴露节点对象、元数据对象、DOM、播放器或截取范围对象。打开和目标有效分别表达。查询不修正状态，关闭不依赖目标存在。

| 范围 | 所有者与协作 |
| --- | --- |
| 预览目标、元信息、对比位置、缩放和平移 | Classic results 的 classicOutputPreview |
| 图片加载回调、音视频资源、复制反馈计时、自身拖动监听 | 同一预览所有者 |
| 截取范围、试听与帧调度 | 共享窗口内的截取会话；保持原时间解析和范围算法 |
| 已提交截取任务 | 独立于窗口开关的请求生命周期；保持原接口和结果写回规则 |
| 单文件下载、分组打包下载 | 原 downloadUrl / downloadGroupNodeImages；任务不依赖窗口继续存在 |
| 节点、选择、文档历史、权限、保存、生成任务 | 原模块；不迁移状态或改核心流程 |
| 虚拟化保留、Escape 和方向键 | workspace 通过查询或命令委托 |

生产修改限于 `static/js/canvas.js`、Classic `canvas-results.js`、`canvas-workspace.js` 和 `static/canvas.html`。HTML 只把本窗口内联事件改为自身注册，结构、样式、标签、原生媒体控件和脚本顺序保持不变。Classic execution/session 原有工作区换行差异不属于本阶段。

## 命令与目标规则

`open(url,out)` 统一释放旧来源、建立目标、执行原查看标记、设置提示词/元信息、呈现媒体和打开窗口。`close/reset` 统一退出对比、拖动和截取试听，释放媒体及回调；导航、下载、打包、复制、重跑、绑定、数据更新通知、暂停、恢复和销毁有明确操作入口。

原函数名保留薄委托，既有调用方仍可使用。入口只初始化对象并绑定；workspace 不再读取预览 ID、URL、缩放、截取字段或窗口 DOM。`previewedNodeIds()` 在虚拟化一轮中校验一次目标并返回冻结的 ID 列表，避免对每个节点重复扫描目标是否存在；单节点查询也不暴露内部字段。

节点目标记录当前画布 ID、原节点对象和来源。图片核对原节点仍在画布、URL 与媒体类型仍一致；结果节点允许同 URL/类型的元数据副本，正常保存和查看标记不会打断预览。分组目标还核对原子节点与组成员关系。引用和日志等无节点预览保留原入口语义，仅限制在发起时的画布。

保留旧数据使用 URL 后缀判别音频/视频的呈现规则，不因历史元数据仍标为 image 而拒绝有效来源。节点替换、URL/类型变化、结果来源移除、分组子节点删除或画布变化使目标操作无效；render 和局部 refresh 通知关闭。通知之前仍可通过真实 Escape 关闭。

## 生命周期与已提交操作

控件、缩放、对比手势和页面生命周期分别记录自己的解绑函数。重复绑定先移除自身旧监听；不移除 workspace 键盘、素材库、图片编辑器或外部追加的监听。

换源、关闭和重置使会话代次变化。图片 onload、视频 onloadedmetadata 和试听帧核对发起时的代次与当前目标；旧来源的回调不能更新新窗口。关闭会取消复制反馈定时器和试听动画帧、清空拖动、解除媒体观察与图片回调，暂停音视频、移除 src 并调用 load；音频元素从宿主移除。

切源时保留共享媒体加载器的预览优先级，只清理旧呈现；真正关闭才释放优先级。这样不会在每次切源中短暂启动后台缩略图队列或提前执行延后加载，媒体也不重复执行空源卸载。

缓存离开关闭窗口、释放媒体并暂停自身控件。缓存返回只恢复监听，不重开或播放；永久离开销毁自身监听和 DOM 缓存。销毁后的 UI 操作无效。

截取提交前仍执行原范围、只读与忙碌检查，提交时固定来源、范围、尺寸、名称、画布 ID 与节点放置位置。关闭、切源或销毁不取消已提交请求，也不清空任务忙碌状态。成功回执仅在原画布仍为当前且可编辑时增加一个新节点、一次画布撤销记录和一次保存调度；原始视频不变。只有原截取会话仍有效且打开时，才按原规则展示新片段；不会重开失效会话。切换画布或转为只读时，沿用原提示文件已保存但未添加节点的行为。

下载在提交时取得当前来源，单文件与分组 ZIP 在关闭后继续完成；blob URL 的回收计时属于下载本身，不被 UI 销毁取消。

## 验证记录

实施前的生产浏览器基线与实施后结果一致：首次查看未读结果调度一次保存，重复查看不增加保存，导航到另一个未读结果再调度一次；节点音频查看不额外保存，选择保持原样。原 18 项视频截取/播放/虚拟化基线全部保留。

新增 43 项 JavaScript 验收：4 项所有权/批量查询检查和 39 项生产页面 Chrome 浏览器测试。最终全量 JavaScript 1079 项通过（原 1036 项加本轮 43 项），无失败或跳过；相关 JavaScript 75 项通过（包含缩略图、局部节点刷新等既有回归）；相关 Python 51 项通过，48 个生产 JavaScript 文件语法检查和差异检查通过。

- 只读快照、私有状态与 DOM、完整打开命令、两万节点批量查询仅校验一次目标。
- 查看标记、导航、提示词、下载、选择与保存次数；只读仍经过原保存保护。
- 对比位置、缩放和平移几何，以及切视频退出对比和重置手势。
- 原生音视频实际解码、播放时间推进、切源与关闭清源；复用现有 WAV/WebM 样本，支持字节范围请求。
- 分组导航与 ZIP 下载、无节点引用和日志预览，以及历史媒体标注和字符串音视频结果兼容。
- 节点替换、URL/类型变化、无画布、结果移除与分组删除后的操作保护和真实键盘 Escape。
- 原删除、清空、撤销、重做、草稿恢复、重新加载路径的目标失效通知，未改画布撤销实现。
- 实际延迟图片/视频响应、旧元数据和试听帧、重复绑定、自身与共享监听的计数、复制反馈及销毁后调用。
- 缓存暂停/恢复分支和永久离开清理；缓存分支使用 PageTransitionEvent，不宣称所有浏览器实际命中 BFCache。
- 截取关闭、换源、销毁后的回执保留完成语义；换画布/只读拒绝写错画布；失败重试和重复提交保护。
- 关闭后单文件/分组下载完成及自身 blob URL 回收，虚拟化保留和关闭后释放媒体，切源不提前执行后台延后加载。

旧函数级测试改为从真实私有实现取源，并更新边界替身，保留全部算法断言。Classic 音频 Python 基线另有一条实施前已失败的旧断言：视频生成现在从经过上传映射的 `mediaRefs` 提取音频，测试仍期待 `allRefs`；仅修正断言追随现有代码，未改生成逻辑。Python 有一条既有 Starlette/httpx 弃用提示。

```powershell
$env:NODE_PATH='C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node --test --test-concurrency=2 tests/*.cjs
.\python\python.exe -m pytest tests/test_frontend_versioning.py tests/test_canvas_run_entry.py tests/test_smart_canvas_video_resume.py tests/test_canvas_video_task_persistence.py tests/test_smart_canvas_video_trim.py::SmartCanvasVideoTrimBackendTest tests/test_smart_canvas_audio_lightbox.py tests/test_classic_canvas_audio_lightbox.py -q
git diff --check
```

## 保留范围与风险

results 的日志、运行计时、结果数据操作、公共格式/媒体工具和分组打包函数保留既有职责，没有把整个 results 封装进预览。内容仍属于 canvas/nodes；未复制全局选择、文档历史、生成或保存状态，不合并 Classic/Smart。

同 URL 原地替换内容无法仅凭前端来源信息识别，服务端版本一致性继续独立处理。本轮未验收真实远端截取/生成服务、跨浏览器差异、长媒体/大文件耗时或音频听感；浏览器测试验证本地样本解码、时间推进、回执处理与资源释放，不评价媒体质量。
