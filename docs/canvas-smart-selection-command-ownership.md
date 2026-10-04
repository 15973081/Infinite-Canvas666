# Smart 工作区选择命令所有权（第二轮）

日期：2026-10-04；实施基线 `5676a05`。沿用独立划界记录 `ebeeb7f`，第一轮 composer 会话已完成。本文件记录第二轮，不修改原始盘点与两份历史复盘快照。

## 移出的状态与实际协作收益

`createSmartSelection()` 在 workspace 私有持有主选择、多选、图片子项以及图片单击延迟计时器；入口只初始化、绑定并在文档替换时通知。冻结功能对象通过 `nodeId`、`ids`、`image` 和 `state` 提供只读查询，数组与子项对象也冻结。查询复用当前快照，未改变时不复制数组，不在节点或逐帧渲染期间生成新快照。

状态只保存 ID 和图片索引，不复制节点、图片、草稿或运行设置。undo 的 JSON 键仍为 `selectedId`、`selectedIds`、`selectedImage`，恢复时复制输入集合，避免外部保留可写别名。函数参数 `chatProviderOptions(selectedId)` 属于局部下拉框参数，不是全局选择。

document、execution、results、media-editor 和入口不再直接修改选择字段。点击和上传目标使用完整交互命令；文档、媒体和任务通过具体通知保留其原有批量刷新和保存责任。`selectedNode()`、`selectedNodeIds()`、`isNodeSelected()`、`clearSelection()`、`clearImageClickTimer()` 保留现有调用入口，通过所有者查询或委托。

## 刻意保留的差异

| 入口 | 选择规则与副作用 |
| --- | --- |
| `clickNode`、`uploadTarget` | 主选择、清多选和子项；按原顺序隐藏查看计时、同步选择、更新 composer；上传还设置上传目标并打开原选择器 |
| `deferImageClick` | 单图片选择子项；分组图片单击停留节点级 composer；220ms 判定保持不变，同步 UI 且不重绘画布 |
| `previewTarget`、`toolbarImage`、`audioTarget` | 清多选并选择具体图片；音频保留查看计时，预览/编辑器的资源仍由原所有者管理 |
| `editorTarget`、`createdNode` | 编辑目标保留多选，新建节点只更新主选择；不以通用归一化改变历史行为 |
| `insertedNodes`、`boxSelection` | 粘贴/导入只有多于一个才记录多选；框选和拆组即使单项也保留多选数组；空列表清空选择 |
| `withReferencePreview`、`withLogPreview` | 引用预览 finally 恢复原快照及数组/子项引用；日志预览保留原复制子项语义；均不额外写草稿、重绘或保存 |
| `restoreDocument`、`documentRestoring` | undo 恢复三类选择；草稿/备份恢复只清主选择和多选，保留已有子项规则；原文档更新与保存顺序不变 |
| `nodesRemoved`、`mediaCleared`、`imagesChanged` | 删除过滤受影响 ID；清媒体保留非该节点子项；删除图片沿用索引夹取算法 |
| `createdMedia`、`grouped`、`duplicating`、拖动通知 | 保留原创建、合并、Alt 复制及拖动断开选择规则；几何和手势算法仍在原处 |
| `taskSource`、`taskOutput`、`outputsReplaced`、`taskFailed`、`taskTail`、`taskFinished` | 来源/输出保留多选，失败只恢复主选择，级联尾节点与收尾保留原清理；输出/收尾同时通知 composer，调用方不拼接选择字段 |

用户点击命令保持原草稿切换和查看计时行为。文档/任务通知不额外渲染、保存草稿、创建 undo 或调度保存；这些副作用继续由原调用方批次处理。选择通知不新增编辑权限，写入仍走原权限入口。生成请求、输入指纹、执行回执、文档数据和保存/撤销算法未移动。

真实鼠标单击单张图片还会进入现有节点拖动路径，鼠标抬起保留一次保存并以节点级选择结束；分组缩略图的单击走延迟选择。已分别在基线 `5676a05` 与本轮代码上运行相同原生鼠标序列，确认分组→单图的选择、累计保存次数（1→2）和额外重绘次数（0→0）相同，未为统一命令改动手势算法。

## 生命周期

选择变化、文档替换、暂停和销毁取消待执行的图片单击。回调记录画布 ID、节点对象、图片 URL 与代次；换画布、同 ID 节点替换、切源或更新选择后旧回调不再生效。保存产生的同源元数据副本允许继续处理有效单击。

重复绑定先解绑自身两个 pagehide/pageshow 监听。缓存退出取消待处理单击并暂停用户操作；返回保留选择，composer 按其已有规则恢复，不重放点击。暂停期间已提交任务仍可按既有 UI 守卫通知选择，不改变任务完成语义。永久退出释放计时器和自身监听，后续命令不修改选择或执行临时预览。其他工作区手势、输入、媒体预览、任务和文档资源不由选择对象销毁。

## 验证

新增 18 项所有权/会话测试，覆盖深冻结与无可写别名、入参不能修改实时选择、快照复用、完整节点/上传命令、单项/空框选与粘贴差异、文档与任务通知、删除/索引夹取、引用及日志临时恢复、反复绑定、暂停/销毁，以及延迟点击的画布/节点/图片替换、其他选择、清理和同源元数据复制。

新增 9 项真实 Chrome 生产页面测试，覆盖节点切换后的富文本草稿、保留 DOM 和滚动、实际鼠标单击/双击、真实框选与 Delete/undo、Escape、延迟点击期间目标替换、缓存返回和只读保存门禁。已有音频、图片编辑、视频截取、全景、模板、composer、任务输入/写回、删除与局部性能测试适配为查询/命令；隔离 VM 夹具实例化实际选择所有者，不提供可写全局别名，保留原断言与保存计数。

最终 **1140 项 JavaScript 全部通过**（原 1113 项加本轮 27 项），相关 **51 项 Python 通过**；48 个生产 JavaScript 文件语法检查与差异检查通过。原始盘点与两份历史复盘 SHA256 与基线一致。

执行命令：`node --test --test-concurrency=2 tests/*.cjs`；相关 Python 为 frontend_versioning、canvas_run_entry、smart_canvas_video_resume、canvas_video_task_persistence、SmartCanvasVideoTrimBackendTest、smart_canvas_audio_lightbox 和 classic_canvas_audio_lightbox。真实鼠标基线复核通过路由提供 `5676a05` 的六个原脚本，不回退或修改工作区业务代码。

## 剩余范围

第三轮仍需核对输入应用协作是否有必要收敛的调用步骤；本轮不宣称整个 composer/选择阶段与总计划结束。输入 DOM 标记、提及/尺寸手势和共享 settings 保留原所有者；节点草稿、运行快照与文档存储未复制。后续渲染/几何缓存、管理 UI 及总体验收按总计划推进。

未运行真实生成服务或大画布耗时基准；任务行为由已有输入绑定/写回与浏览器回归验证。保存、历史、锁、同步、任务协调及服务端一致性继续作为独立专项。上一轮 PostgreSQL 专项连接超时，本轮不把未执行的云端测试列为通过。
