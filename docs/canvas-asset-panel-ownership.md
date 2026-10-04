# 素材库面板状态封装试点

范围：经典画布与智能画布的侧边素材库面板。继续使用原生 JavaScript、原有八脚本加载顺序与 DOM/CSS，不迁移 React、不引入框架。

## 所有权与边界

| 对象 | 唯一所有者 | 外部使用方式 |
| --- | --- | --- |
| 开关、当前库、图片/工作流分类、搜索、当前标签 | 各页面的 `classicAssetPanel` / `smartAssetPanel` 控制器 | 读取冻结的 `state`；调用选择/开关命令 |
| 分页键、已显示/筛选数量、经典面板宽度与拖动状态 | 同一控制器 | 素材模块的渲染/滚动/调整宽度入口 |
| 面板、按钮、选择框、网格、搜索框、悬浮预览 DOM | 同一控制器缓存引用，所属 `*-library.js` 负责渲染 | 其他模块只可调用 `contains()` 做命中检测，不读取 `elements` |
| 控件、拖放、当前卡片、行内编辑、窗口 resize/pagehide 监听 | 控制器的具名事件作用域 | 使用 `events(name).on()` 注册；重绑自动清理同名作用域 |
| 素材刷新定时器 | 智能面板控制器 | `scheduleRefresh()` 合并刷新；`cancelRefresh()` / `destroy()` 清理 |
| 悬浮预览延迟、动画帧、全局拖动监听 | 既有 hover controller | 新增 `destroy()`，由面板销毁入口调用 |
| 素材库数据、本地素材数据、认证状态 | 原有素材模块与 API 数据流程 | 本次不复制数据、不修改认证判定 |
| 画布保存、权限、生成任务 | 原有 document/session/execution 模块 | 本次不改变核心逻辑 |

入口只创建控制器并按原位置调用事件注册函数，不再声明第二份面板 UI 状态或 DOM 引用。共享工厂位于 `canvas-core.js`，两种面板的初始化配置、渲染、业务动作继续位于各自的 `*-library.js`。

经典素材管理弹窗原本与面板共享的库/图片分类选择继续共用控制器；独立的管理弹窗工作流分类迁入同一控制器的 `workflowCategoryId`，仍与侧栏分类分开。模板状态保持原模块所有。智能引用选择器的 `mentionAssetCategoryId` 表示引用来源分组，与面板当前分类用途不同，保留独立状态；共用的库选择通过控制器命令更新。删除未使用的 `activeLocalAssetFolderId`。

## 业务命令（第二阶段）

- `selectLibrary(id)`、`selectCategory(id)`、`selectTab(tab)` 完成一次操作：所属素材模块的 `normalizeClassicAssetSelection` / `normalizeSmartAssetSelection` 校验库/分类、处理关联字段，控制器重置分页，再由 `selectionChanged` 刷新对应视图。调用方无需追加清空分类、切标签或 render。
- 入口差异用语义化来源表达：Classic 的 `manager-assets` 只允许媒体分类，`manager-workflows` 使用独立工作流分类；侧栏允许媒体与工作流分类。管理来源命令同时清理对应多选集合。`selectClassicAssetManagerTab()` 负责管理标签切换。
- Smart 切到本地库自动回到图片标签；从本地库切工作流标签时回到可用远端库。`source:'mention'` 表示来自 `@` 选择器：共享库选择，保留图片/工作流标签规则，引用分组仍独立。`updateMentionPicker()` / `selectSmartMentionCategory()` 承担准备和修改，`renderMentionPicker()` 只渲染准备好的选择。
- `setQuery()` 同步输入框并刷新素材视图，不重绘画布。筛选仍按去除首尾空格后的不区分大小写名称匹配。搜索与翻页不会重复执行库/分类校验。
- 数据进入 `setCanvasAssetLibraryFromResponse()` / `setAssetLibraryFromResponse()` 时调用 `reconcile()`，在渲染前完成合法性修正。`updateAssetManager()` 在打开/切换管理视图时准备相应分类；面板和管理渲染器不再修正选择。
- `page(items,key)` / `loadMore()` 内部管理分页计数，删除了逐字段的分页 setter。首批/追加仍各 60 项、180px 阈值、追加保留滚动位置。渲染函数只计算显示投影和分页，不决定业务选择。
- `captureSelection()` 捕获选择版本与目标；`selectTarget(target,{expected})` 仅在该版本仍有效时完成回执引起的目标选择。切到 B 再切回 A 也不会让旧操作恢复选择。目标命令只允许库/分类字段，不能借它改写开关或分页。

## 异步结果边界（第二阶段）

- 每次面板读取获得递增序号。只有最新序号、页面未挂起/销毁且无写操作进行中，才能应用读取结果或报告读取失败；旧响应与旧错误均忽略。不会取消已发送的网络请求。
- 素材 CRUD、工作流上传/导出等写操作通过 `mutate()`：发起和结束（包括失败）都使先前读取失效；写入过程中返回的读取也不应用。写回执进入统一数据入口时再次使旧读取失效，防止旧列表恢复被重命名/删除的素材。认证状态接口返回的完整库快照通过 WeakMap 关联读取序号并走同一门禁；接口的 item 回执仍交给原有节点/权限守卫处理，不修改认证判定或序列化数据。
- 已提交写操作始终等待真实结果，不因切库或销毁而取消业务操作。回执数据与“是否自动选中新分类/库”分开：前者更新素材缓存，后者核对选择版本。销毁后不再更新该视图。
- 新建分类在打开异步命名弹窗前固定库与分类类型；拖入媒体在解析/上传前固定目的库和分类；工作流导出使用开始操作时选定的库。结果返回后按当前选择刷新，不跳回已离开的分类。
- `pagehide.persisted` 挂起并使在途读取失效；`pageshow.persisted` 恢复读取，重新加载打开的侧栏、Classic 管理弹窗或 Smart 素材引用选择器，同时保留搜索和选择。

## 监听与清理

- 按 controls/navigation/selection/toggle/drop/cards/lifecycle 分组。重绑只替换面板对应作用域，不重复注册模板或管理弹窗事件。
- 重绘清理上批卡片监听；`cards:rename:<id>` 子作用域随 cards 一并清理。即使外部仍持有旧卡片，其拖动监听也已解除。
- 经典面板的调整宽度手势使用独立 resize 作用域，鼠标松开或销毁时解除窗口监听与 body 样式，不再占用工作区的共享指针会话。
- `destroy()` 幂等：清除定时器、hover 延迟/帧/全局监听、所有面板作用域并释放 DOM 引用。销毁后的库加载响应不再更新面板；这不取消已经提交的素材写入或改变业务事务。
- `pagehide` 非 BFCache 离开时销毁。`persisted=true` 时保留页面控件绑定和状态，清理 hover、未完成 resize 与刷新定时器，并挂起读取；历史返回后重新验证数据。
- 普通关闭只关闭视图，保持选择/搜索和监听；再次打开仍加载最新素材。销毁是页面终止操作，不是普通关闭。

## 验证与限制

新增 `tests/asset-panel-controller.cjs` 验证不可写快照、DOM 投影、重复绑定、子作用域清理、销毁、定时器及模块所有权约束。扩展 `tests/canvas-modules.browser.cjs`，使用真实 Chrome、生产 HTML/CSS/脚本和隔离 API 验证两种面板的开关、分类、搜索、分页、滚动、拖拽、旧卡片清理、销毁与迟到响应，并断言搜索不重绘画布。

既有认证回归夹具改为创建生产控制器，权限/认证行为断言未弱化。八脚本加载、保存、只读、旧任务隔离、媒体和性能调度测试继续执行。

第二阶段新增浏览器验收覆盖：完整选择命令、快速切库、Classic 管理与 Smart `@` 共享规则、渲染不修正选择、读取反序返回、过期错误静默、重命名/删除与读取交错、读取失败重试、缓存页面返回、异步命名期间切库及 A→B→A、延迟拖放的原目标、工作流导出不恢复旧选择。控制器用例还验证写失败后可重试，以及销毁后已提交写操作仍返回结果。

验证日志：`.local/asset-phase2-final-js.log`（完整 JavaScript）、`.local/asset-phase2-targets.log`（76 项目标回归；随后新增的认证快照用例包含在完整回归中）、`.local/asset-phase2-python.log`（34 项 Python，1 条既有 Starlette/httpx 弃用警告）。最终完整 JavaScript 回归 **863 项通过，0 失败、0 跳过**；相关 Python **34 项通过**；`git diff --check` 通过。

剩余边界：此处解决当前页面面板读取与素材写入的竞争，不提供后端事务版本协议。多个并发写回执以及跨客户端写入之间的全局新旧关系仍由现有服务端/刷新机制决定；尚未增加统一服务端 revision 校验。写失败后保留已有数据，允许用户重新读取/重试，不自动重放写请求。浏览器测试使用隔离 API，不代表真实生成服务端到端验收；未新增大素材库耗时基准。`elements` 的跨模块边界仍通过模块约定和回归检查约束。

本机复现命令（使用已存在的依赖）：

```powershell
$env:NODE_PATH = 'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node --test --test-concurrency=1 tests/*.cjs
.\python\python.exe -m pytest tests/test_frontend_versioning.py tests/test_canvas_run_entry.py tests/test_smart_canvas_video_resume.py tests/test_canvas_video_task_persistence.py -q
git diff --check
```
