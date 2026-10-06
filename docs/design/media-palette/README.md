# 画布媒体组件配色统一

延续已定稿的网格、石墨灰、雾白和浅绿配色，保留圆角节点、圆形播放按钮、曲线连接与原有工具布局。

- `studio-tokens.css` 为媒体舞台和控件提供语义颜色变量。
- `canvas-media.css` 共用播放、悬停、焦点、禁用和减少动态效果样式；两种画布的组件文件继续负责尺寸与布局。
- 原组件中的视频底色、标签、预览、下载、截取、图片编辑工具和经典画布加载状态改用主题变量，没有在 workbench 文件末尾追加覆盖。
- 没有修改保存、生成、任务恢复、权限或后端接口，也没有新增依赖或数据库变更。

## 对比截图

截图使用实际生产 HTML/CSS/JavaScript，API 由浏览器测试夹具响应，媒体为仓库内的短视频与测试缩略图，**不是真实用户作品**。升级前来自 `cceeb5a` 的原样式，其截图使用旧的非工作空间入口，仅用于比较媒体组件颜色。升级后已改用工作空间成员模式并加载真实 `MemberCanvasEdit` 权限栏，断言顶部旧锁徽标隐藏且不会请求旧锁接口。每种画布均保留深浅主题下的卡片与截取面板截图：`before-*.png` / `after-*.png`。

| 页面 | 升级前 | 升级后 |
| --- | --- | --- |
| 经典卡片（深色） | [查看](before-classic-cards-dark.png) | [查看](after-classic-cards-dark.png) |
| 经典截取（深色） | [查看](before-classic-trim-dark.png) | [查看](after-classic-trim-dark.png) |
| 智能卡片（深色） | [查看](before-smart-cards-dark.png) | [查看](after-smart-cards-dark.png) |
| 智能截取（深色） | [查看](before-smart-trim-dark.png) | [查看](after-smart-trim-dark.png) |
| 经典卡片（浅色） | [查看](before-classic-cards-light.png) | [查看](after-classic-cards-light.png) |
| 经典截取（浅色） | [查看](before-classic-trim-light.png) | [查看](after-classic-trim-light.png) |
| 智能卡片（浅色） | [查看](before-smart-cards-light.png) | [查看](after-smart-cards-light.png) |
| 智能截取（浅色） | [查看](before-smart-trim-light.png) | [查看](after-smart-trim-light.png) |

## 验证

2026-10-07，Chrome 浏览器及 Node 回归共 **71 项通过，0 项失败**：

```powershell
node --test tests/canvas-media-palette.browser.cjs tests/test_classic_canvas_video_trim.cjs tests/studio-unified.browser.cjs tests/classic-output-preview.browser.cjs tests/smart-video-trim.browser.cjs
```

需要现有 Playwright 运行环境。配色测试检查深浅主题、普通/悬停状态文字对比度 ≥ 4.5、不透明控件表面、键盘焦点、全范围禁用按钮、减少动态效果及视频实际播放。卡片阶段请求原视频数量为 0；预览不提交截取或生成请求。经典画布原有媒体尺寸更新自动保存及会话请求继续保留。

既有回归覆盖视频/音频播放释放、图片比较/缩放、下载、截取成功/失败重试、只读权限、撤销/保存、跨画布切换和异步任务生命周期。

本地 `127.0.0.1:8768` 工作空间另行查看了经典、智能画布的真实媒体节点与经典素材预览，确认浅色主题表面和圆角正确；检查时保持查看模式。深色和截取导出流程通过上述隔离夹具验证，未对真实作品发起截取、上传或生成操作。本轮未重新做全站手机端或后端集成测试。
