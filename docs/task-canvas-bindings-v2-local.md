# 双端任务输入指纹与批量回填协议

2026-09-14，C3 / TK-1 第三十七批。承接第 36 批的持久绑定，实现浏览器与服务器可一致计算的 v2 指纹、提交前输入核对、创建响应回执和共享批量保护模块。两个画布业务生成入口尚未调用该模块，完整按钮提交与自动回填验收继续保留。

## 为什么升级编码

Python JSON 的 1.0 与 JavaScript JSON 的 1、指数表示、Unicode 键排序可能不同。直接分别对 JSON 文本计算 SHA-256，不能证明两端输入一致。

v2 先将 JSON 转成带类型的数组树：null、bool、number、string、array、object 各有独立标签。数字按 IEEE-754 binary64 大端 8 字节十六进制编码，负零归零；拒绝非有限数和超过 JavaScript 安全整数范围的整数。字符串保留 Unicode 标量，拒绝孤立代理字符；对象键按 Unicode 码点排序。然后对紧凑 UTF-8 JSON 计算 SHA-256。

节点与上游选择、分组展开、输入顺序和显示字段忽略沿用第 36 批。v2 连接按目标 ID 及其输入位置排序。v1 仍按原 JSON 和原连接摘要顺序计算；已有持久绑定不重写。测试向量保存了直接用修改前源码计算的 v1 指纹，升级后仍能判断旧任务的输入状态。

## 提交协议

canvas_target 可额外携带 input_sha256，必须为 64 位小写十六进制。它只是客户端声明的期望值：服务器仍在现有编辑准入、revision 与创建事务内自行计算，二者不一致返回 409 task_binding_input_conflict，任务和付费提交均不落库。省略或 null 不改变旧请求的幂等指纹。

新任务绑定版本为 2。图片与视频创建响应，以及同 ID 的幂等重试响应，返回原不可变 canvas_binding；无绑定旧任务保持原响应字段。结果 GET 继续从不可变请求读取绑定。没有新 migration、凭证或完整图快照字段。

## 浏览器共享模块

static/js/canvas-task-bindings.js 在成员画布业务脚本之前加载，提供 graphCanonical、graphFingerprint 和 operation。两种画布尚需分别传入自己的实际存储投影、保存确认函数、lease revision 和节点/会话 guard。

operation 的约定：

1. 在异步生成准备前捕获输入；prepare 等待保存成功并核对等待期间输入未变，再计算指纹并复核 revision。
2. beginSubmission 在请求发送前复验。remember 记住每个 task ID 的服务端原回执；任务已提交后禁止重新绑定。
3. apply 对比当前未保存输入、身份/节点 guard 及不可变回执，在同一同步调用中执行回填，完成后更新本批的预期输入。第一张图片或本批自身输出不会使后续兄弟任务失效。
4. 用户改动、原节点替换、编辑权/空间变化、错误回执和回填异常使运行保持暂停。结果留在持久任务中，模块不修改费用，也不自动领取编辑资格。
5. mutate 仅供调用方明确的同步准备修改，例如旧结果归档；不能用它接受等待期间不明来源的变更。read 必须包含未保存的输入，valid 必须保留原节点与会话身份；两者都是接入时必须验证的调用约定。

模块不提供跨刷新自动回填授权。无内存回执、旧版本或未绑定任务的恢复策略，以及不同并发运行之间的输出冲突，仍需在两个业务入口接入时明确处理。

## 验证与运行边界

共享测试向量覆盖小数/整数、负零、最小非零双精度数、安全整数边界、中文/补充平面字符、类型标签冲突，以及分组与循环图。Python 和 JavaScript 对同一文件计算相同摘要。

新增 22 项 CJS 验证保存/摘要等待中的改动、正常保存外层对象替换、同批连续回填、用户改动后拒绝后续回填、编辑交接、节点替换、错误/重复回执、失败保存和回填异常。Python 补齐旧 v1 真实指纹、字段/幂等兼容与严格数值校验；实库新增两种画布 × 图片/视频四项摘要不符回滚，已有绑定用例验证创建/重试回执一致。

最终完整 PostgreSQL 325 通过；Python 167 通过、325 云用例跳过、7 subtest 通过；CJS 347 通过。日志位于 .local/cloud/acceptance/task-bindings-v2-{postgres,python,cjs}.log。没有执行真实供应商调用，也没有修改用户画布或对用户数据库做 migration。本批不重启刚恢复的用户服务，服务运行版本与本次代码提交分开记录。

## 继续接入

经典 runGenerator/runVideoNode 必须在 generatorSizeForRun 等异步准备之前捕获输入，提交前完成保存，向 pollCanvasImageTask/pollCanvasVideoTask 传递同一 operation；成功及失败回调都需核对，批量任务共享本批预期值。

智能 runGeneration、generateUrlsForCurrentSettings、runCascadeStepIntoNode、runLoopRoundIntoSlot 必须传入同一协议，覆盖 runApiGeneration/runApiVideoGeneration、队列归档、resumeSmartPendingNode 及轮询记录。输入框尚未落入节点的数据、等待后的全局设置/选中节点恢复也必须纳入验证。

接线后仍需实际双画布生成按钮、模拟上游、同批多结果、改提示词/模型/引用、交接/断网/刷新等验收。LLM、完整 UI-1/TK-1、M1/M2/M3/M4 维护管理与正式迁移范围不变，整体目标未完成。
