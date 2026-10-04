# 双画布费用展示小范围共享（2026-10-05）

通信与模块边界计划第 5 轮，基线 `ded49c2`。仅提取 Classic/Smart 已一致的微单位金额展示；不合并费用计算、价格快照、流水、任务、保存或日志 DOM。

## 提取前的证据

先新增并运行两套原实现的行为测试，6 项通过（`.local/cost-display-before.log`）：各自格式入口的零值、数字字符串、负数、千位、六位小数、无效值及 Infinity；真实 Chrome 页面日志的 CNY、外币、预估和待定价展示、冻结记录不被修改、原保存/API 写入次数。此时生产实现尚未修改。

初次测试预期将待定价误写为待核算；按原页面实际 `pendingLabel` 返回修正测试预期后建立基线，没有为测试改变生产文案。

耗时函数虽同名，Classic 四舍五入并显示 `1m 00s`，Smart 向下取整并显示 `1:00`。截取时间格式/解析也有差异，均不提取；两套耗时差异有保留测试。

## 共享入口和差异边界

在已经由两页先加载的 `CanvasCore` 增加纯函数 `formatCostAmount(amountMicros, currency='CNY')`，不增加脚本或新控制器。Classic `formatCostMicros`、Smart `formatSmartCost` 保留原名称并薄委托；两套日志的相同外币展示分支调用该函数。

保留原 `Number(value || 0) / 1000000`、中文千位和最多六位小数。CNY/空币种使用字面量 ¥ 前缀和最少两位小数；非 CNY 币种保留原币种大小写和最少零位小数。负数仍是 `¥-1.00`，不改成另一种货币格式。

Classic/Smart 的总计、日志汇总、unknown/estimated 标签、价格来源、耗时、后端字段、日志点击和保存分别由原适配入口持有。DOM 转义仍在各自渲染器执行；纯函数不解释 HTML、不修正业务记录。

## 验证

- 提取后的原 6 项行为测试及加载、计费/旧流水相关回归合计 65 项通过（`.local/cost-display-related.log`）。
- 相关 Python 52 项通过（`.local/cost-display-python.log`）；52 个 JS/MJS 语法及差异检查通过。
- 全量 JavaScript 1260 项通过，0 失败（`.local/cost-display-full-js.log`）。

## 收益与限制

一处拥有两套金额精度、币种和微单位转换规则，两个原格式入口及日志外币分支不再各自实现。范围很小，不据此声称重复代码已全部消除或性能提升。已有强依赖 CanvasCore 的加载顺序未变；浏览器测试使用固定流水与 API，不代表真实计费服务验收。
