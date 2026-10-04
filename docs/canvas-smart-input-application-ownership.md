# Smart 输入应用协作（第三轮）

日期：2026-10-05；实施基线 `4d26c49`。本轮沿用选择与 composer 的分轮边界，完成输入应用协作检查；原始盘点及两份历史复盘保持不变。

## 核对与收敛

模板与预设已经通过 workspace 的 `applySmartPromptPanelText` 应用，library 无需协调节点选择、内容和保存。动态参数由 workspace 的 `setDynamicSetting` 处理关联校验、持久化与原有保存，不为隐藏 settings 查询再添加一层。

本轮收敛两处仍需跨模块组合的输入操作：

| 入口 | 原协调步骤 | 当前完整命令 |
| --- | --- | --- |
| 图片扩图完成 | media-editor 修改扩图尺寸、运行设置、提示词和输入 DOM 保留标记 | `applySmartOutpaintComposer` 委托 composer 的 `applyOutpaint` |
| 手动媒体网址 | media-editor 清空旧手动链接、逐项写 settings、持久化、保存及刷新 | `setCurrentSmartManualVideoUrl` 委托 composer 的 `setManualMediaUrls` |

两个操作属于现有 composer 输入责任，没有另建 settings、草稿或任务数据副本。扩图尺寸计算、提示词文字和一次保留标记的行为保持原样；media-editor 继续负责图片编码、上传、原目标验收、图片替换、关闭编辑器、渲染与原有一次保存。节点、图片和运行设置仍是原业务数据。

手动网址的对话框参数、解析规则、引用顺序、超出引用数量时使用最后目标的规则以及自动链接保留策略均沿用原算法。有效设置与清空各执行一次保存和一次渲染；取消、无效值或失效回执不新增保存。云上传、临时链接过期及实际请求适配仍在原 media-editor 流程，本轮不移动已提交任务输入、指纹或请求快照。

## 会话与目标保护

composer 私有持有输入代次。切换输入对象、文档替换或导入、关闭、缓存页面暂停和销毁使待返回的输入对话框失效。A→B→A 不能恢复旧对话框的应用资格；重复请求只接受最新一份回执。

网址对话框记录发起时的画布 ID、目标节点对象与引用源 URL 顺序，返回后核对当前目标和引用。节点删除或同 ID 对象替换、换画布、换输入来源后不写入当前设置。只修改同源媒体元数据不单独失效，不复制媒体或节点状态。

扩图继续使用编辑器原有的图片加载、编码及上传回执保护；composer 命令再核对自身暂停/销毁状态以及原节点仍存在。关闭、重开或换画布期间的迟到上传不会改提示词、设置或输入 DOM。已提交生成、保存、撤销、权限及任务完成语义未改变；本轮没有新增监听或通用状态框架。

## 验证

新增 32 项测试：20 项命令/会话测试、3 项扩图迟到上传浏览器测试、9 项真实 Chrome 手动网址测试。现有扩图测试额外核对只调用一次完整输入命令、尺寸设置与原提示词；原 composer 无副作用断言继续覆盖被动会话操作，有效网址应用保留原有保存责任。

相关 78 项 JavaScript 测试通过；全量 **1172 项 JavaScript 全部通过**（第二轮 1140 项加本轮 32 项），相关 **51 项 Python 通过**。48 个生产脚本语法检查、差异检查及三个历史快照的 SHA256 核对通过。

执行命令：`node --test --test-concurrency=2 tests/*.cjs`。Python 范围为 frontend_versioning、canvas_run_entry、smart_canvas_video_resume、canvas_video_task_persistence、SmartCanvasVideoTrimBackendTest、smart_canvas_audio_lightbox 与 classic_canvas_audio_lightbox。

## 阶段结论与剩余范围

Smart 选择与 composer 三轮至此具有明确的状态归属和跨模块操作入口。保留当前输入 DOM、节点草稿、共享 settings、默认配置与生成输入快照的原有职责；不以隐藏所有查询或清零全局绑定为目标。

后续仍需整理渲染/几何缓存，按实际收益核对管理 UI，再形成当前状态和依赖复盘。保存、画布撤销、锁、同步、任务协调及服务端版本一致性继续独立处理。

本轮未运行真实生成服务或大画布耗时基准。已有输入绑定、写回、只读门禁与保存次数回归约束前端行为；此前 PostgreSQL 专项因本地连接超时未执行，不计为通过。
