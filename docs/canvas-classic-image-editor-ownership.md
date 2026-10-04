# Classic 图片编辑器会话状态整理

本阶段实施于 2026-10-04，只整理 Classic 图片编辑器的会话归属和生命周期。目标仍是减少原生 JavaScript 全局状态与模块耦合；未引入 React、新框架或通用状态容器。

原始 [状态盘点快照](canvas-global-state-inventory.json) 保留不变，本文件记录本阶段完成情况。前一阶段见 [模板与预设面板状态整理](canvas-prompt-panel-ownership.md)。Smart 图片编辑器留待后续单独划界。

## 状态所有者

`canvas-media-editor.js` 中的 `createClassicImageEditor()` 是唯一所有者，入口只初始化 `classicImageEditor`。从入口移出的 22 个 `let` 绑定如下：

| 范围 | 私有绑定 |
| --- | --- |
| 裁剪与模式 | `cropState`、`cropDrag`、`imageEditMode`、`imageEditModeTouched` |
| 画笔与编辑内历史 | `editDrawState`、`editDrawUndoStack`、`editDrawRedoStack`、`brushTool`、`brushLabelCounter` |
| 文字 | `editTextItems`、`editTextSelectedId`、`editTextDrag`、`editTextDirty`、`editTextInlineEditor` |
| 宫格 | `gridCustomMode`、`gridCustomLines`、`gridCustomOrientation`、`gridCustomHistory`、`gridCustomDrag` |
| 缩放 | `imageEditZoom`、`imageEditBaseW`、`imageEditBaseH` |

编辑历史上限和遮罩画笔常量也进入闭包。编辑数组、像素快照、目标记录、图片加载回调、临时文字编辑器、延迟聚焦帧、监听记录和按需缓存的专属 DOM 引用均不对外返回。公开 `state` 每次生成冻结快照，只含打开、暂停、就绪、目标 ID、模式、工具、缩放及内部条目数量等值。

专属 DOM 通过私有 `element()` 获取、缓存，销毁时清空缓存。原静态 HTML 的元素 ID 和内联按钮保持不变；浏览器自带的按元素 ID 命名访问仍存在，这不作为模块 API 使用。外部不再获得返回 canvas / DOM 或可变历史快照的旧工具函数。

`canvas`、`nodes`、`connections`、全局节点选择、视口、画布撤销栈和保存标记仍由原模块持有。媒体导入、拖放、上传工具及 Smart 编辑状态均未纳入本轮。

## 操作与集成边界

- `openImageEditor(nodeId, mode)` 完成旧会话清理、目标记录、工具重置、显示及图片加载；`closeImageEditor()` / `reset()` 完成整次关闭。重开时保持媒体前台加载所有权，避免在同步切换之间恢复后台缩略图队列。
- 工具按钮继续使用原函数名作为薄委托，包括模式、画笔、撤销 / 重做、清空、宫格预设 / 自定义、缩放、重置裁剪框与应用操作。封装内部工具方法不向外暴露数组、DOM 或像素历史。
- `isEditingNode(id)` 替代 workspace 读取 `cropState`；Escape 通过只读快照判断面板打开状态。查询先匹配目标 ID，目标记录缓存节点位置，正常路径不对每个工作区节点重复扫描整个节点数组。
- 退出、新建、打开画布调用 `reset()`；文档模块仅在节点移除和清空图片来源之后通知 `targetChanged()`，由编辑器决定是否关闭。原节点删除、撤销、依赖刷新及保存顺序保留。

未改变裁剪、扩图、遮罩、自由画笔、矩形、椭圆、编号、文字、规则 / 自定义宫格和缩放算法。除包装、私有 DOM 查询与辅助函数名称外，87 个已有辅助函数的函数体逐项对照未变；11 个原函数仅增加会话或资源边界。画布撤销与编辑器内部撤销继续分开。

结果写回仍在原编辑操作内完成：裁剪 / 扩图 / 画笔更新来源节点，遮罩建立原类型的新节点并选中，宫格保持原 output 与分组元数据。正常成功仍按原顺序关闭、刷新、调用一次 `scheduleSave()`，上传 API、权限门禁、保存实现和生成任务逻辑未改动。

## 异步与清理规则

目标记录画布 ID、节点 ID 对应的节点对象身份及打开时的图片来源。节点对象仅由有效编辑会话持有，关闭后释放；仅靠同名节点 ID 不足以把旧应用写到重建节点或新画布。

图片加载与异步应用捕获会话代次、画布和原节点。关闭、重开、画布切换、缓存离开与销毁使旧代次失效。加载完成、PNG 编码完成以及上传回执返回后都核对原会话与目标；宫格逐张编码也逐步核对。失效结果不能重置新草稿、改变新模式、关闭新编辑器、修改旧 / 新节点或额外触发保存。相同加载会话的重复 load 不重复初始化草稿。

图片未就绪时保留切换模式的原交互，绘制、拖动及应用等待加载完成。上传失败保留原会话供重试，不额外保存。已提交上传可以在服务端完成，但失效回执不应用到画布。

监听记录准确的 target、类型、handler 与 options，并据此解绑：

- 控件重新绑定先清理自己的旧控件监听；原共享工作区、素材库及其他窗口监听不被替换或移除。
- 裁剪拖动的窗口移动 / 松开监听只在本次拖动时注册，松开、关闭、暂停和销毁解绑。
- 临时文字编辑器移除前解除 input / keydown / blur，取消可追踪的聚焦帧；帧执行时再次核对代次和元素身份。
- 关闭释放指针捕获、清除拖动和光标、解除图片与媒体状态监听、清空来源、文字、宫格和编辑历史，将绘制画布尺寸归零以释放像素缓冲。工具偏好沿用原保留规则。
- 缓存页面离开暂停监听和手势，保留已有像素 / 文字草稿；返回后校验目标、恢复单份控件监听和布局。未完成的图片打开重新发起，旧加载回调仍失效。
- 永久离开销毁会话，解除自身控件与生命周期监听并清空 DOM 缓存；销毁可重复调用，之后打开或工具操作均不起作用。

## 验证

新增 `tests/classic-image-editor-ownership.cjs` 2 项所有权测试，以及 `tests/classic-image-editor.browser.cjs` 27 项真实 Chrome 完整页面测试。浏览器使用生产 HTML、CSS 与脚本，服务请求使用隔离夹具，不调用真实生成服务。

覆盖冻结快照、22 个绑定与 DOM / 历史辅助函数私有化、脚本无提前 DOM 副作用、跨模块意图入口、重复绑定、关闭与销毁后操作、图片迟到、PNG 编码迟到、上传回执迟到、重开、画布替换、节点删除、缓存恢复、延迟文字聚焦取消和上传失败重试。

工具验收读取真实上传的 PNG：默认裁剪为 269 × 202 且保留来源像素；扩图 380 × 240，白色边缘及自然尺寸一致；遮罩为 320 × 240 的黑白图；五种画笔 / 文字输出保持非空修改；规则 2 × 2、自定义分数位置及 40px 间隙的输出尺寸一致。另验证输出节点 / 分组、编辑内撤销独立、单次保存触发及实际画布 PUT 次数、只读会话关闭 / 导航不保存。

最终运行记录：

- 全量 JavaScript：926 项通过，0 失败、0 跳过；相对阶段基线新增 29 项。
- 相关 Python：34 项通过，1 条既有 Starlette / httpx 弃用警告。
- `git diff --check` 通过；原盘点 JSON、Smart 业务脚本、保存与生成核心无内容差异。

日志位于 `.local/classic-editor-final-js.log` 与 `.local/classic-editor-final-python.log`。命令：

```powershell
$env:NODE_PATH='C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node --test --test-concurrency=1 tests/*.cjs
.\python\python.exe -m pytest tests/test_frontend_versioning.py tests/test_canvas_run_entry.py tests/test_smart_canvas_video_resume.py tests/test_canvas_video_task_persistence.py -q
git diff --check
```

## 剩余范围与风险

Smart 编辑器以及预览、全景相关状态保持原状；不以清零变量为目的继续扩大范围。词库响应竞争及服务端版本一致性仍是独立后续事项。

本轮未新增上传取消协议：已提交但目标会话失效的上传可能留下未被画布引用的文件。重复并发应用、跨客户端更新和权限变化中的服务端版本校验仍沿用原行为；会话代次只限定本地 UI 和目标，不提供统一内容版本协议。

浏览器验收使用隔离上传与画布接口，未覆盖真实对象存储服务、大尺寸图片内存 / 耗时基准及所有浏览器。缓存返回用生产 pagehide / pageshow 处理器验证，未声称各浏览器均实际进入 BFCache。
