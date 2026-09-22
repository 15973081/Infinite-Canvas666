# 两种画布的 8 模块拆分

实施日期：2026-09-22。

本次按业务任务拆分经典画布和智能画布，每种画布为 **1 个入口 + 7 个任务文件**。保留现有 JavaScript、DOM、CSS、API、数据格式、权限检查和异步任务处理逻辑。

经典画布入口从 15,142 行缩减至 2,314 行；智能画布入口从 15,481 行缩减至 1,377 行。代码迁移到任务文件，并未删除原有功能。

## 模块与维护入口

| 任务 | 经典画布 | 智能画布 | 职责 |
| --- | --- | --- | --- |
| 应用入口 | `static/js/canvas.js` | `static/js/smart-canvas.js` | 状态初始化、页面启动/退出、画布打开、模块事件注册的调用顺序；经典画布列表与管理入口 |
| 文档 | `static/js/canvas/classic/canvas-document.js` | `static/js/canvas/smart/smart-document.js` | 数据编辑、撤销/复制粘贴、保存、草稿恢复、备份、工作流导入导出 |
| 会话 | `static/js/canvas/classic/canvas-session.js` | `static/js/canvas/smart/smart-session.js` | 编辑权限、锁、远端同步、任务写入守卫 |
| 工作区 | `static/js/canvas/classic/canvas-workspace.js` | `static/js/canvas/smart/smart-workspace.js` | 节点/连线渲染、局部更新、视口、小地图、选择与手势；智能画布输入区和引用选择 |
| 素材与模板 | `static/js/canvas/classic/canvas-library.js` | `static/js/canvas/smart/smart-library.js` | 素材库、分类/分页、模板、库内操作、素材认证相关操作 |
| 媒体导入与编辑 | `static/js/canvas/classic/canvas-media-editor.js` | `static/js/canvas/smart/smart-media-editor.js` | 文件导入上传、拖放/粘贴、裁剪、绘制、文字、切图/拼图 |
| 执行 | `static/js/canvas/classic/canvas-execution.js` | `static/js/canvas/smart/smart-execution.js` | 模型/输入解析、单节点生成、级联/循环、停止/重试、任务轮询与恢复、结果写入 |
| 结果 | `static/js/canvas/classic/canvas-results.js` | `static/js/canvas/smart/smart-results.js` | 预览、音视频播放器、下载、对比、全景预览、记录和费用展示 |

已有 `canvas-api.js`、`canvas-core.js`、`canvas-task-results.js`、`canvas-task-bindings.js`、媒体加载和会员权限模块继续使用，不复制其实现。

## 本次架构与兼容边界

本次是粗粒度、保持行为的源码模块化，**不是 ES module / 私有状态工厂改造**。

- 两个 HTML 页面各显式加载七个任务脚本，最后加载原入口。`data-canvas-module` 标记对应任务，`app` 标记入口。
- 任务脚本只有函数声明，不在加载时获取 DOM、启动请求、创建定时器或绑定事件。
- 模块之间仍通过已有全局函数和共享词法绑定协作，HTML 的内联事件入口继续有效。
- 入口保留原来的 `const`/`let` 声明及初始化顺序。`nodes`、`canvas`、保存标记、运行令牌和权限状态没有第二份副本。
- 已迁移的事件代码放在所属任务文件的 `bindClassic…` / `bindSmart…` 函数中。入口在原语句所在位置调用一次，保留注册顺序、捕获阶段、被动监听设置和原有清理行为。
- 跨功能的页面生命周期事件继续留在入口，例如离开页面、刷新前保存、模型配置变化。
- 智能画布预览与图片编辑共用既有弹窗，因此弹窗打开/关闭仍由媒体编辑模块协调；播放器、对比和全景预览函数由结果模块负责。没有为了拆分改动 DOM。
- 经典画布入口仍包含画布管理 UI，因此比智能画布入口大；这符合其入口职责。

保留共享绑定是本次降低权限与初始化风险的实施选择。任务文件形成清晰的维护位置，但它们尚不能脱离入口独立运行。后续如需封装私有状态，应作为单独迁移任务设计明确接口，并逐项验证；不能直接把任意文件包进 IIFE 或改为 `type="module"`。

## 权限与数据写入约束

1. `session` 提供原有权限判断和 `canvasTaskWriteGuard`，其他任务模块中的具体权限检查保持原位。
2. 素材库权限、画布编辑权限、任务输入绑定是不同约束，不能合并成一个布尔值。
3. 生成完成时继续校验当前画布、节点身份、编辑代次、任务令牌及输入绑定；不能以提交时的权限替代结果写入校验。
4. 保存仍使用原有脏标记、排队逻辑、确认版本和同步保护。只读加载不能创建伪草稿。
5. 服务端注入的会员请求门禁、任务结果/输入绑定和编辑模块必须先于所有画布任务脚本加载。
6. CSS 文件、元素 ID、类名、`data-*` 属性、渲染模板和内联调用名称保持不变。

## 后续修改如何定位

- 修改素材分类、模板编辑：`*-library.js`。
- 修改上传或裁剪：`*-media-editor.js`。
- 修改拖动、连线显示、节点卡片或智能输入区：`*-workspace.js`。
- 修改保存、撤销、工作流导入导出：`*-document.js`。
- 修改生成参数解析、级联执行、停止或恢复：`*-execution.js`。
- 修改预览、下载或费用记录：`*-results.js`。
- 修改权限判断、锁和同步：`*-session.js`，同时检查实际写入操作中的守卫。
- 修改页面启动/退出、共享状态初始化和经典画布列表：两个原入口。

新增功能优先放到对应任务文件。不要向入口继续堆积业务函数，也不要在模块加载阶段添加副作用。一个模块较大时，可以先用明确函数分区组织，后续独立评估是否细分，避免退回任意编号的分片。

## 验证

迁移时对原代码与拆分后代码进行 AST 比对：经典画布 863 个函数、智能画布 930 个函数均保持语法结构一致。展开事件注册函数后，经典画布 423 条、智能画布 409 条初始化语句保持原有结构与顺序。临时比对脚本及日志在本地忽略目录 `.local/` 中，不作为应用运行依赖。

新增回归测试：

- `tests/canvas-modules.cjs`：每页八个模块、脚本加载顺序、无加载期副作用、无重复函数导出、语法检查。
- `tests/canvas-modules.browser.cjs`：真实 Chrome 加载完整页面和生产脚本/CSS；节点显示、工作流/素材面板事件、保存、只读执行/保存保护，以及失去编辑资格、恢复资格和切换画布时的旧任务守卫。
- `tests/test_frontend_versioning.py`：会员权限协议先于全部画布模块加载，每个模块均有服务端内容版本参数。

浏览器测试使用隔离的 API/会话夹具，不连接真实生成服务；它验证模块集成，真实租约/后端权限由既有协议测试覆盖。

原有源码回归测试改为通过 `tests/helpers/canvas-source.cjs` 和 `tests/canvas_source.py` 读取 HTML 中实际加载的八个脚本。浏览器性能夹具使用 `tests/fixtures/canvas-source.js`。原有行为断言保留；少量依赖旧文件相邻顺序的截取改为按函数名提取。

全量运行时还发现既有媒体加载浏览器用例存在观察时序竞争：DOM 的 `src` 已设置时，Node 侧路由回调未必已记录请求。该测试增加了有上限的等待，仍断言实际缩略图请求数恰好为 4；未修改媒体加载实现。

本机命令（PowerShell）：

```powershell
$env:NODE_PATH = (Resolve-Path 'frontend/node_modules').Path
node --test --test-concurrency=1 tests/*.cjs
py -3.14 -m pytest tests/test_canvas_run_entry.py tests/test_smart_canvas_video_resume.py tests/test_frontend_versioning.py tests/test_classic_canvas_audio_lightbox.py tests/test_smart_canvas_audio_lightbox.py tests/test_canvas_video_task_persistence.py -q
```

## 迁移前已有的失败

拆分前后保留以下相同失败，没有为通过测试而修改业务行为或弱化断言：

- `canvas-task-writes.cjs` 中三项经典图片生成的权限变化/旧代次测试：当前既有实现会清理运行状态并展示错误，与测试要求的完全不再修改 UI 状态不一致。
- `test_classic_canvas_video_lightbox.cjs` 中释放播放器的用例：夹具未提供既有实现引用的 `window`。
- `test_classic_canvas_audio_lightbox.py` 中音频引用源码断言：测试仍要求旧的 `audioRefsOnly(allRefs)` 表达式。

这些失败应另行处理，特别是前三项的权限变化后的 UI 行为应先明确预期。本次保留原有权限行为，不借拆分改变它。

最终验证结果：JavaScript 共 773 项，769 项通过、上述原有 4 项失败；相关 Python 共 48 项，47 项通过、上述原有 1 项失败。新增 6 项模块/完整页面测试全部通过，未新增行为回归失败。`git diff --check` 通过。

## 后续本地验证记录（2026-09-22）

- 本地启动发现基础依赖缺少 WebSocket 实现，已在 `requirements.txt` 增加 `websockets`。安装后真实 HTTP 登录、实时状态推送、心跳和匿名 WebSocket 拒绝访问均通过。
- 再次运行全部 JavaScript 测试仍为 769 项通过、4 项失败，与上面的已知失败一致。
- 扩展 PostgreSQL 集成检查通过 `tools/cloud_test.py` 在独立临时 schema 中执行，结果为 **357 项通过、35 项失败**。失败涉及模型可用性、任务恢复/费用、维护恢复、输入绑定摘要及对象存储签名断言。该轮检查尚未完成逐项归因或拆分前基线复测，不能称为全量通过，也不能将这些失败直接认定为本次拆分引入。日志保存在本地 `.local/permission-audit-cloud.log`。
- Lighthouse 登录后桌面单次性能分：工作台 98、经典画布列表 65、智能画布空白界面 74、管理后台 100。智能画布含加载超时警告，分数仅供参考，另记录旧本地素材接口返回 503；未修改权限以消除该错误。完整报告在本地 `.local/lighthouse/reports/`。

## 后续修复：4 项 JavaScript 失败（2026-09-22）

上述 JavaScript 4 项失败已在后续修复中消除，不再是当前状态：

- 经典图片生成的异常路径现在与视频生成一致：编辑资格、账号、空间、节点或画布已变化，或轮询返回旧编辑代次时，旧操作只暂停/退出，不再修改节点运行状态、重绘页面或弹出旧错误。原始草稿和待处理任务保留，级联调用仍收到暂停信号。
- 保持正常业务错误处理：编辑资格仍有效时，生成失败会结束运行、记录错误并提示用户。原先另一个用例要求“权限撤销后也清理节点”的断言与保护约束冲突，现改为验证撤销前后节点、保存、重绘和提示均不被旧回调改变；正常失败分支继续独立验证。
- 空间权限回归矩阵补充暂停、只读、账号变化和空间变化，覆盖提交/轮询阶段的成功与失败响应。
- 播放器运行代码未变。测试夹具补齐浏览器 `window`，分别验证有/无媒体加载器时的行为，包括先解除媒体监听，再暂停、清空来源并卸载播放器。

完整 JavaScript 回归结果更新为 **774 项通过、0 项失败、0 项跳过**。数量从 773 增至 774，是播放器用例增加了媒体加载器分支。日志：`.local/fix-four-final-js.log`。本轮未处理上文独立记录的 Python 音频断言和 35 项数据库集成失败。

## 后续修复：数据库集成测试夹具（2026-09-22）

35 项失败已在拆分前提交 `ef260e8` 的隔离副本中完成归因。只调整测试配置与断言、保留业务实现后，原失败及相关参数分支共 38 项全部通过。正式修改将这些验证结果落实到测试中：

| 原因 | 原失败数 | 修正 |
| --- | ---: | --- |
| 测试模型未开放 | 23 | 模拟供应商测试显式请求 `fake_supplier_catalog` 夹具；成员测试为 LLM 和图片任务配置对应模型，继续经过真实模型开放校验 |
| Windows 子进程输出编码不匹配 | 7 | 维护恢复测试设置子进程 `PYTHONIOENCODING=utf-8`，与管道解码一致 |
| 费用夹具缺少服务端价格 | 2 | 测试供应商配置每张 0.05 元，继续验证服务端价格快照与费用结果 |
| 请求摘要断言过期 | 2 | 显式验证未启用的图片工具字段被省略，再验证请求、数据库和画布绑定的摘要一致 |
| 对象存储签名断言过期 | 1 | 同时验证固定对象版本和 `private, no-store` 缓存保护参数 |

这些修改没有改变数据库结构、空间权限、模型授权或计费实现，也没有跳过原失败测试。测试仍使用独立临时 schema 与模拟生成服务。

正式合入当前工作目录后，运行完整 `tools/cloud_test.py`：**392 项通过、0 项失败、0 项跳过**，耗时约 133 秒；65 条警告为测试依赖与既有接口的弃用提示。日志和 JUnit 结果分别位于 `.local/db-fixes-final.log`、`.local/db-fixes-final.xml`。结合上一轮 JavaScript 的 774 项全通过，本次两组回归均已通过；这不包含独立的 Python 音频源码断言用例。
