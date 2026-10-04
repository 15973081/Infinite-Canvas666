# Classic / Smart 模板与预设面板状态整理

本阶段完成于 2026-10-04。目标仍是减少原生 JavaScript 的全局会话状态与跨模块写入，为后续维护提供清楚的边界；未引入 React、新框架或通用状态容器。

原始 [状态盘点快照](canvas-global-state-inventory.json) 保留不变。本文件记录后续完成情况，不将历史扫描结果改写成当前结果。素材库和 minimap 的先行试点分别见 [素材库面板](canvas-asset-panel-ownership.md) 和 [缩略导航图](canvas-minimap-ownership.md)。

## 本次归属变化

| 功能 | 所有者 | 从入口移出的顶层 UI 绑定 | 私有 DOM 引用 |
| --- | --- | --- | --- |
| Classic 模板面板 | library 的 `createClassicPromptPanel()` | 7：应用节点、分类、当前模板、查询、编辑开关、库选择、分组管理开关 | 7：modal、panel、关闭、搜索、库下拉、分类、正文 |
| Smart 模板 / 预设 | library 的 `createSmartPromptPanels()` | 6：库选择、分类、当前模板、编辑开关、分组管理开关、删除确认 | 17：模板 6 项、预设 10 项、composer 模板按钮 |

入口只初始化 `classicPromptPanel` / `smartPromptPanels` 功能对象。Smart 另将原来隐含在 `dataset`、预设下拉与搜索输入中的目标、选择和查询收入会话；模板和预设分别持有打开状态与应用目标，保留同时打开和各自关闭的规则。

`state` 每次返回一个冻结快照，Smart 的嵌套 `preset` 快照也冻结。快照不包含数组、节点或 DOM。模板编辑、预设编辑的表单草稿继续只存在内部 DOM 中，不保存第二份草稿。DOM 的输入值、选择值和目标 `dataset` 只是镜像，不是应用操作的状态来源。

内容数据及其存储流程仍在原入口中：

- Classic：`canvasPromptTemplates`、`canvasPromptTemplatesLoaded`、`canvasPromptLibraries`、`promptTemplateGroups`、`canvasPromptTemplateOverrides`。
- Smart：`promptPresets`、`builtinPromptTemplates`、`promptLibraries`、`promptTemplateGroups`、`promptTemplateOverrides`。

各自 5 个内容 / 缓存绑定未在本轮私有化。原 localStorage 键、远端 API、覆盖规则和权限条件保持原样。Classic 管理弹窗的多选集合仍由管理弹窗持有。

## 操作入口与校验

两套对象提供 `open`、`close`、`selectLibrary`、`selectCategory`、`selectTemplate`、`setQuery`、`startEditing`、`cancelEditing`、`toggleGroups`、`dataChanged`、`reset`、`destroy`、`bind`、`bindLifecycle`。原函数名保留为薄委托，兼容现有工作区、内联按钮及初始化调用。Smart 另提供预设打开 / 关闭、`selectPreset`、`applyPreset`、`savePreset`、`createPreset`、`confirmDelete`。

关联状态在命令、加载完成或内容更新通知时校验，画面绘制函数只读取状态：无效分类回到 `all`；当前模板不在筛选结果中时选择首项并退出原编辑，空列表清空选择。绘制不会修复选择，也不会把 DOM 中未经命令提交的值读回会话。

切库差异保留：

- Classic 保留新库中的合法分类，清除原模板选择和编辑，通过现有缓存加载模板；管理弹窗调用同一个切库命令，并只清除自己的提示词多选。
- Smart 回到全部分类，清除原模板选择和编辑，重新加载远端词库，然后校验和刷新。
- 搜索、模板选择、分类与编辑切换只刷新面板，不重绘画布。

有效写回执的模板正文只绘制一次，数据校验与最终绘制分开执行；面板关闭时不构建正文卡片。浏览器通过 DOM 变更记录验证单次写回执的绘制次数，避免增加重复重绘。

Smart 预设下拉由选择命令维护。选择、输入修改、关闭与删除完成会解除删除确认；第一次删除点击只进入确认，第二次完成删除与存储。

## 工作区应用边界

library 不再给节点内容、预设绑定或全局节点选择直接赋值，改为调用 workspace 的具体操作：

- `applyClassicPromptPanelText`：核对画布 ID 和 prompt 节点，更新原 textarea、计数器、提示词依赖和几何，保持原关闭 / 保存顺序；不重建节点，不全量绘制画布。
- `selectSmartPromptPanelTarget`、`applySmartPromptPanelText`：核对节点目标，保留节点选择、节点 / composer 内容应用、预设绑定、输入草稿与原刷新 / 保存顺序。composer 仍应用到当前输入区，不固定到打开时的输入区节点。
- Smart 的预设绑定、同步、删除与编辑完成入口负责原范围内的节点更新与刷新 / 保存。预设编辑面板只更新面板目标中绑定该预设的节点；模板编辑中的本地预设更新所有绑定节点；删除清除绑定并保留节点已有文字。

节点目标记录画布 ID 和节点 ID，执行前确认仍属于当前画布且节点存在。保存门禁、脏标记、权限协议与生成任务核心没有修改。本轮没有新增绕过权限的保存入口。

## 异步与生命周期

会话记录代次。打开、关闭、重开、选择命令、画布切换、缓存页面暂停及销毁会使旧 UI 回调失效。异步打开完成后核对代次、画布和目标节点；失效结果不能重开面板、恢复旧选择、改变节点选择或聚焦旧目标。

已提交的词库写请求继续完成并更新内容数据。仅原会话仍有效时，回执可以选择新条目或进入编辑；失效回执仅通知当前内容变化，保留后续会话仍合法的编辑草稿。画布变化后不把完成后的刷新 / 保存作用于另一张画布；销毁或暂停后不再绘制面板。

监听记录准确的 target、事件、handler 与 options，并用相同记录解绑。重复 `bind()` 先清理本功能旧监听，生命周期注册也可重复调用。删除确认、搜索及原 `.onclick` / `.onchange` 都通过本功能注册，不替换共享窗口 / document 处理器。

滚动恢复的动画帧保存可取消句柄，并在执行时再次检查代次。关闭、暂停、重置、销毁取消旧帧。节点目标保存字符串，不持有旧节点对象。

- 缓存页面离开：暂停会话、解绑本功能控件监听、取消帧，保留 DOM 草稿与会话选择。
- 缓存页面返回：恢复监听、校验目标与选择，保留仍合法的编辑草稿，恢复中断的打开；旧打开回调本身仍失效。
- 永久离开：关闭会话、取消帧、解除自身控件和生命周期监听，将自身 DOM 引用置空；销毁幂等，后续打开、编辑或写操作入口不再工作。
- Classic 退出 / 新建 / 打开画布，以及 Smart 显式加载或切换画布，重置目标会话。Smart 同画布的观察刷新不强制关闭面板。

## 验证

新增 `tests/prompt-panel-ownership.cjs` 2 项所有权回归，以及 `tests/prompt-panels.browser.cjs` 17 项真实 Chrome 完整页面测试。浏览器使用生产 HTML、脚本与 CSS，API 和成员会话采用隔离夹具，不调用真实生成服务。原完整页面夹具提取到 `tests/helpers/canvas-browser.cjs`，供两组浏览器测试复用。

覆盖：只读快照、入口不再持有 UI / DOM 绑定、library 无节点和选择直接写入、绘制不修正选择、库 / 分类 / 查询 / 空列表、编辑取消、分组删除、管理弹窗共享库与多选、重复绑定、Escape / 外部关闭、缓存返回与 DOM 草稿、目标删除与换画布、旧写回执、销毁后调用、节点 / composer 应用、本地预设存储和不同绑定范围、两次删除、权限保存门禁，以及保存触发次数。

Classic 浏览器断言应用保留同一个 textarea、27px 滚动位置及按钮状态；原局部编辑和提示词依赖测试继续验证局部刷新。内容应用的完整提示词规则保留 Classic / Smart 的原差异。成员只读测试确认应用操作仍经过原保存门禁、不发出画布 PUT。

最终结果：

- 全量 JavaScript：**897 项通过，0 失败，0 跳过**。
- 相关 Python：**34 项通过**，1 条既有 Starlette / httpx 弃用警告。
- `git diff --check` 通过，原盘点 JSON 未修改。

本机验证命令：

```powershell
$env:NODE_PATH='C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node --test --test-concurrency=1 tests/*.cjs
.\python\python.exe -m pytest tests/test_frontend_versioning.py tests/test_canvas_run_entry.py tests/test_smart_canvas_video_resume.py tests/test_canvas_video_task_persistence.py -q
git diff --check
```

日志在本地忽略目录 `.local/prompt-final-js.log`、`.local/prompt-final-python.log`。全量运行发现的 minimap 夹具补齐提示词会话依赖，同时断言退出画布会调用其重置；没有删减原 minimap 验收。

## 剩余边界

本轮只解决面板会话与应用目标的异步边界。词库内容仍使用原整体响应替换流程：并行读取、读写竞争、并发写回执及跨客户端版本一致性不具备统一版本校验，继续作为独立后续事项。失效的打开读取可以填充原内容缓存，但不执行旧会话的选择、打开或焦点回调。

未进行真实生成服务验收，也未新增海量词库的耗时基准；本轮性能证据限于搜索不重绘画布、Classic 保留编辑 DOM、原缓存复用和保存触发次数。全局选择、其他手势、撤销历史、保存核心及服务端版本协议均未纳入整理。
