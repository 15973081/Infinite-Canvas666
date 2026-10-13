# shadox 统一视觉升级验收

本轮将已定稿的赛博网格风格接入实际工作台、在线生成、GPT 对话、素材库和两种画布编辑器。保留现有 iframe、业务模块和接口；节点卡片采用 18px 圆角，节点内控件采用 10px 圆角，沿用原有曲线连线及命中区域。

## 实现范围

| 区域 | 完成内容 |
| --- | --- |
| 工作台 | 侧栏贯穿全高；空间、当前页面和账户栏与侧栏对齐；兼容折叠和手机抽屉 |
| 画布首页 | 画布操作菜单使用不透明主题面板、细边框、微弱阴影和危险操作色；文件夹菜单统一 |
| 在线生成 | 紧凑标题、提示词、参考图片、模型设置和结果面板；常见桌面首屏能看到生成按钮 |
| GPT 对话 | 网格背景、输入区、历史与模型菜单、选中项和按钮统一；模型菜单适配缩放和窄屏 |
| 素材库 | 标题、页签、面板、搜索、分组操作条、选择状态与预览弹窗采用共用变量 |
| 两种编辑器 | 圆角节点、输入控件、连接点、曲线颜色、选中微光和任务状态统一；连接算法不变 |

## 样式维护

`studio-tokens.css` 是颜色、字体、圆角、网格、阴影和动效变量的来源。`studio-workbench.css` 只保留兼容变量、通用背景、滚动条及缩放桥接；组件样式分别整理到 `studio-components.css`、`studio-generation.css`、`studio-chat.css`、`studio-library.css`、`studio-editor.css`。

聊天页的布局样式从 HTML 提取到 `chat.css`，移除原来的强制深蓝主题覆盖。已升级页面不再加载旧 `theme.css`。2026-10-14 起平台固定为深色外观，移除日夜切换、主题过渡和主题消息，原界面缩放功能迁至 `studio-display.js`。编辑器部分内联样式兼容规则仍保留 `!important`，后续应随对应组件逐项迁移。

| 变量 | 固定深色 |
| --- | --- |
| 页面 | `#090b09` |
| 面板 | `#121611` |
| 文字 | `#f1f5e9` |
| 辅助文字 | `#a1ad91` |
| 边框 | `#343d2a` |
| 主操作 | `#cefa31`，深色文字 `#182004` |

## 浏览器与回归结果

以下为原视觉升级轮次的历史验收记录，涉及浅色与主题切换的结果不代表当前支持范围。以下是本轮已执行的检查。部分套件在修复后重复执行，计数不累加。

| 检查 | 结果 |
| --- | --- |
| 节点卡片、iframe 消息、主题切换单元测试 | 43 通过 |
| 画布模块、智能输入卡、统一视觉浏览器测试 | 42 通过 |
| 连线选择、智能选择、首页、统一视觉浏览器测试 | 23 通过 |
| 静态 utility 布局及首页相关测试 | 9 通过；统一视觉测试后续单独修复并通过 |
| 统一视觉最终复测 | 1 通过；深浅主题文字对比度 ≥ 4.5，390/768/1280px 及 115% 缩放无页面横向溢出，模型菜单不越界，主题与缩放不新增业务写请求 |
| 隔离本地服务真实流程 | 1 通过；经典新建、输入、保存、搜索、重开，智能新建和侧栏返回，手机导航和无结果状态 |
| 前端版本与素材懒加载 Python 检查 | 20 通过 |
| JavaScript 语法与 Git diff 空白检查 | 通过 |
| 批量管理栏与画布菜单补充验收 | 6 项浏览器检查通过；删除零选中禁用态、全选/取消、计数、完成退出、手机按钮尺寸；真实页面选择与退出未执行删除 |

实际访问了运行中的 `http://127.0.0.1:8768/`，检查首页操作菜单、在线生成、聊天模型菜单、素材分组以及深浅主题；手机 390px、平板 768px 和桌面 1280px 截图已保存。真实新建与保存回归使用独立的 `.local/studio-unified-runtime`，绑定 127.0.0.1:8769，测试后停止，不向现有空间添加回归画布。

原有 `canvas-execution.js` 和 `canvas-session.js` 未提交修改的 SHA256 与本轮开始时一致，未覆盖其内容。没有新增依赖或更改生成、保存、权限、恢复和连接业务代码。

另有 6 项旧静态检查失败：`test_classic_canvas_backups_ui.py` 的一项函数定位断言，以及 `test_smart_canvas_video_lightbox.py` 的五项旧入口/版本断言。它们仍在拆分前的入口文件中寻找函数或旧资源版本；本轮未更改这些测试及对应业务实现。

没有发起付费图像或聊天请求。权限与恢复流程由浏览器接口夹具覆盖，成员空间的实际付费生成未复测。当前真实素材空间为空，带媒体的浏览和选择由现有素材浏览器测试覆盖。本轮没有进行生产规模长列表的前后性能基准；没有引入持续扫描动画或额外业务轮询。

## 查看截图

- [升级前工作台](before-home.jpg)
- [深色生成页](after-generation-dark.jpg)
- [深色聊天和模型菜单](after-chat-dark.jpg) / [浅色聊天](after-chat-light.jpg)
- [深色画布操作菜单](after-home-menu-dark.jpg) / [浅色菜单](after-home-menu-light.jpg)
- [浅色素材库](after-library-light.jpg)
- [优化后的画布菜单](after-card-menu-refined-dark.jpg)
- [批量操作未选中](after-bulk-toolbar-empty-dark.jpg) / [已选中](after-bulk-toolbar-selected-dark.jpg)
- [手机聊天](after-chat-mobile-dark.jpg) / [手机导航](after-mobile-navigation-light.jpg)
- [真实经典编辑器圆角节点](live-regression/after-classic-editor-light.png)
- [真实智能编辑器](live-regression/after-smart-editor-light.png)
- [隔离服务首页深色](live-regression/after-dark-desktop.png) / [浅色](live-regression/after-light-desktop.png)

## 后续组件整理

### Tabler 精密工具图标（2026-10-07）

按选定草稿将工作台、画布首页、两种编辑器、在线生成、聊天和素材库的通用图标接入本地 Tabler Outline。统一使用 24px 绘制网格、1.5px 线宽和主题文字色；导航显示 18px，素材分类显示 16px、子项 14px、展开箭头 12px。素材分类的文本三角替换为 chevron，经典画布子项采用面板图标，避免小尺寸文件格式文字干扰。

SVG 来自 [Tabler 官方仓库固定版本](https://github.com/tabler/tabler-icons/tree/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d)，使用 MIT 许可；许可文件保存在 `static/vendor/tabler-icons-LICENSE.txt`。`tools/build_studio_icons.py` 可用项目 Python 重新生成本地资源。188 个现有名称映射到 168 个图标，本地图标数据约 37KB，原资源约 402KB；这是文件大小对比，未作为实测加载性能结论。

`studio-icons.js` 保留业务模块现有 `data-lucide` 和 `lucide.createIcons()` 调用契约，重复刷新保留 SVG 实例和监听器，兼容原有尺寸、动画类、ARIA 与内联事件。核心入口不再请求图标 CDN，旧生成器页面保留原有资源。没有改变生成、保存、权限、恢复和连接算法。

图标、统一视觉和工作台最终检查共 9 项通过；相关画布模块、素材库、经典连线和智能选择检查 62 项通过，成员媒体地址检查 5 项通过。并发执行时工作台手机焦点检查曾出现一次时序失败，无生产代码调整后独立复测及最终组合复测均通过。JavaScript 语法和 Git diff 空白检查通过；已有 `canvas-execution.js`、`canvas-session.js` 的工作区改动哈希保持不变。

运行中的 8768 页面已核对素材分类、画布操作菜单、深浅主题和手机导航，手机 Escape 关闭正常。实际素材空间为空，带媒体及编辑器回归由接口夹具检查；没有执行删除或付费生成请求。

- [深色素材分类](after-tabler-library-dark.jpg) / [浅色素材分类](after-tabler-library-light.jpg)
- [画布操作菜单](after-tabler-home-menu-dark.jpg)
- [手机导航](after-tabler-mobile-navigation-dark.jpg)

### 图片预览补齐（2026-10-06）

历史卡片预览仍使用 online.html 的强制白底和 image-preview.js 的旧深蓝画框。删除预览入口的重复内联覆盖，将弹窗、画框、提示词和下载/复用按钮归入 studio-generation.css，复用现有主题变量。限制 iframe 内弹窗尺寸，兼容界面缩放；新增关闭标签、Escape 关闭和弹窗内键盘焦点循环，保留原有缩放、拖动及复用逻辑。

实际读取了 delivery-normal 原始媒体：96×64 像素，6144 个像素均为 RGB(30,100,210)。纯蓝区域来自原图，不是图片加载失败；此次未替换或删除原始媒体。

相关浏览器检查共 7 项通过（统一视觉 3 项、工作台 4 项）。新增检查覆盖深浅主题、390/768/1280px、100%/115%/140% 界面缩放、长提示词、关闭与焦点恢复、滚轮缩放、双击复位和复用，无新增业务写请求。实际运行服务 8768 的历史卡片打开、关闭和深浅主题已检查；手机 390px 已截图，未发起生成请求。

- [修复前预览](before-image-preview.jpg)
- [修复后深色](after-image-preview-dark.jpg) / [浅色](after-image-preview-light.jpg) / [手机](after-image-preview-mobile.jpg)

下一轮可逐个迁移编辑器内联面板颜色和剩余强制覆盖，统一各节点的排队、执行、失败与重试反馈；保留现有任务状态与操作入口。素材库可进一步整理媒体卡片、空状态和预览区域的组件样式。缩略图生成和长列表性能优化应单独测量与实施。
