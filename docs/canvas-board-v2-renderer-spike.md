# CanvasBoard V2 渲染层 Spike

> 状态：已完成  
> 日期：2026-08-18  
> 生产默认：未改变

## 当前样本

- Chromium 151，无头模式，单 worker。
- 固定 200 个混合节点、300 条合法连线。
- 节点类型覆盖 Prompt、PromptGroup、Loop、Generator、Output、Video、Comfy、LLM、Group 和 LTX Director 外壳。
- Legacy 使用真实 `canvas.js` 节点和连线渲染；两个 V2 原型使用相同布局和连接数据。

运行：

```powershell
Set-Location frontend
npx playwright test e2e/renderer-spike.spec.ts --repeat-each=3 --reporter=line
```

## 最终结果

| 渲染器 | 7 次重绘中位数的三轮中位数 | 当前验证 |
|---|---:|---|
| Legacy Board | 313.0 ms | 真实节点、真实 SVG 连线 |
| 自研 React Board | 1.1 ms | 200/300、选择、框选、拖动、缩放、创建连线、混合节点壳 |
| `@xyflow/react` | 3.0 ms | 200/300、选择、框选、拖动、缩放、混合节点壳；目标 Handle 无法命中 |

这些数字只能证明 Board V2 路线值得继续。V2 原型仍是轻量节点壳，不能用当前差值宣称相对 Legacy 的最终加速比例。

## 交互与生命周期检查

- 自研原型通过单选、框选、节点拖动、缩放和创建连线检查。
- 两个原型均渲染 Group、Output、Comfy 和 LTX Director 外壳；真实复杂内容留到按节点迁移阶段验证。
- Video 元素在 React 重绘后保持同一 DOM 实例；原型卸载后节点和媒体元素均清理。
- `@xyflow/react` 在 `fitView` 的 200 节点混合画布中，目标 Handle 没有可命中的坐标，核心连线流程未通过门禁。
- 删除连线、快捷键、Group 成员联动、Output 中转与环检测继续复用现有领域规则，在 V2 Board 外壳阶段做等价测试；不为本次渲染器选型扩写两个原型。

## 结论

CanvasBoard V2 在 200/300 规模下可行，采用自研 React Board，不把 `@xyflow/react` 引入正式路径。两条路径都满足当前性能门禁，但 `@xyflow/react` 未通过核心连线功能等价门禁；继续适配会增加库内部机制绕过和维护成本。最终决策见 `docs/adr/0002-canvas-board-v2-renderer.md`。
