# AGENTS.md — 前端视觉规范与工程协作契约

## 1. 核心原则与责任边界 (Core Principles)
- **拒绝“删需求换留白”**：视觉重构或组件开发必须 100% 保留现有业务字段、导航菜单、操作入口、权限判断与状态分支。严禁通过删除、缩写或隐藏业务信息来换取画面整洁。
- **拒绝廉价“赛博风”套路**：严禁将“暗黑、AI、科技感”解释为纯黑底、满屏霓虹荧光绿、浑浊暗军绿背景或 1px 实心粗灰框。整体视觉严格对齐 **Linear / Raycast / Vercel Geist** 的冷峻、克制与高精密工业感。
- **最小侵入式修改**：在执行“仅改样式 / UI 升级”任务时，默认严禁修改事件绑定（`onClick`/`onSubmit`）、受控状态、数据接口契约与 DOM 核心结构。不因美化界面而将真实业务状态替换为静态 Demo 假数据。
- **主动质量自检**：交付前必须自行验证“表面明度是否糊成一团”、“空状态是否抢戏”、“图片是否戳出圆角”、“双栏是否等高”，不把基础像素质检与对齐税转嫁给开发者。

---

## 2. 色彩与光学层级体系 (Color & Surface Tokens)
全局强制使用纯粹的冷灰阶（Tailwind `Zinc` 体系），严禁在背景、卡片或边框中混入绿色、紫色等彩色色相。

### 2.1 语义化表面色阶 (Surfaces)
- `--bg-canvas`: `#09090B` (`zinc-950`) — 全局页面最底层大背景。
- `--bg-modal`: `#0C0C0E` — 大型弹窗（Modal）主体底层背景。
- `--surface-card`: `#121215` — 标准卡片、折叠条、侧边分组、列表容器背景。
- `--surface-elevated`: `#16161A` — 表单输入框（Input/Select）、次级内部卡片、空状态缩略图容器背景（需与 `#121215` 形成微弱明度差，防止上下分区糊成一块死黑）。
- `--surface-hover`: `#18181C` 至 `#1E1E24` — 卡片或列表项悬浮态（Hover）与选中态（Active）提亮表面。
- `--surface-popover`: `rgba(18, 18, 21, 0.92)` + `backdrop-filter: blur(16px)` — 悬浮菜单、Tooltip、Sidebar Dock 毛玻璃背景。

### 2.2 微光边框与分割线 (Borders & Dividers)
- **严禁使用实心灰色边框**（如 `#333`、`#444`）或大面积直角粗虚线框（`border-dashed`）。
- `--border-subtle`: `rgba(255, 255, 255, 0.07)` (`border-white/[0.07]`) — 卡片外框、表格外框、顶部栏分割线。
- `--border-control`: `rgba(255, 255, 255, 0.08)` — 输入框、下拉框、次要按钮默认描边。
- `--border-hover`: `rgba(255, 255, 255, 0.16)` — 卡片与控件 Hover 态微亮描边。
- `--border-focus`: `rgba(255, 255, 255, 0.25)` + `ring-1 ring-white/[0.1]` — 输入框聚焦或档位卡片选中态（严禁使用整圈刺眼的亮绿色粗框作为卡片选中态）。

### 2.3 文本色阶 (Typography)
- `--text-primary`: `#F4F4F5` (`zinc-100`) — 页面大标题、卡片主标题、核心数值（配合 `tracking-tight`）。
- `--text-secondary`: `#A1A1AA` (`zinc-400`) — 常规正文、未选中 Tab、表单项 Label、菜单项文字。
- `--text-muted`: `#71717A` (`zinc-500`) — 辅助说明、时间戳、分页统计、占位符（Placeholder）。

### 2.4 强调色“2% 法则”与语义状态 (Accent & Status)
- **主品牌色 (`--accent-primary`)**：`#D4FF33`（荧光黄绿）。
  - **严格限制使用范围**：全屏面积占比不超过 2%。**仅限**用于当前视图唯一的主行动按钮（Primary CTA，如“+ 新建画布”、“+ 导入 Skill”、“生成图片”、“保存资料”）、容量进度条填充、或选中卡片右上角的极小胶囊点缀（`bg-[#D4FF33]/15 text-[#D4FF33] border-[#D4FF33]/30`）。
  - **主按钮排版铁律**：`#D4FF33` 背景上的文字必须使用深炭黑 `#09090B` 且加粗（`font-semibold` / `font-weight: 600`），严禁使用细体字导致边缘发虚。
  - **严禁滥用**：禁止在 Tab 选中下划线、侧边栏菜单选中背景、空状态图标、普通悬浮文字上使用绿色。
- **危险/失败状态 (`--status-danger`)**：采用克制的暗酒红胶囊 `bg-red-500/10 text-red-400 border border-red-500/20`；危险操作按钮（如“注销账号”、“退出登录”）默认保持中性灰，仅在 Hover 时显现 `hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/[0.06]`。

---

## 3. 核心微组件设计规范 (Micro-Components)

### 3.1 空状态容器 (Empty States)
- **告别简陋线框**：禁止只放一个直角虚线框加一行字。
- **标准结构**：使用实心圆角容器 `rounded-xl bg-[#121215] border border-white/[0.07]`，内部叠加中心径向微光缓解死黑沉闷感：
  `background-image: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.035) 0%, transparent 70%);`
- **图标底座 (Icon Badge)**：空状态中心的图标严禁裸奔，必须包裹在 `40px × 40px` 的圆角底座中（`w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shadow-inner`），内部图标尺寸 `18px`，颜色 `#71717A`。

### 3.2 分段控制器与导航选中态 (Tabs & Navigation)
- **顶部/局部 Tab 切换**：采用胶囊分段控制器（Segmented Control），外层 `bg-[#121215] p-1 rounded-lg border border-white/[0.06]`；选中项使用 `bg-[#27272A] text-zinc-100 font-medium rounded-md shadow-sm`，彻底摒弃底部彩色横条。
- **侧边栏菜单 / 树形列表**：未选中项背景全透明（`bg-transparent text-zinc-400`），Hover 态 `hover:bg-white/[0.05] hover:text-zinc-200`；当前选中项统一使用冷灰高光底座 `bg-[#1C1C21] text-zinc-100 font-medium rounded-lg border border-white/[0.07]`。

### 3.3 缩略图卡片与悬浮遮罩 (Cards & Hover Overlays)
- **圆角与裁切分离**：卡片外框负责表面与描边（`rounded-xl bg-[#121215] border border-white/[0.07]`）；内部媒体/图片容器必须独立设置 `overflow-hidden rounded-t-[11px]`，严禁让内部图片直角戳出卡片外框，也避免在外层盲目加 `overflow-hidden` 误裁内部下拉菜单或焦点环。
- **半透明模糊遮罩**：文件夹或卡片 Hover 遮罩使用 `bg-black/35 backdrop-blur-[2px]`，必须保留底层宫格或缩略图轮廓隐约透出，严禁做成不透明纯黑块。遮罩中心操作按钮采用胶囊样式 `bg-[#18181C]/90 border border-white/[0.12] px-3 py-1.5 rounded-lg shadow-xl text-xs text-zinc-100`。
- **缩略图角标 (Badges)**：左上角分类或右下角 `VIDEO` 角标统一使用 `bg-zinc-900/75 backdrop-blur-md border border-white/[0.08] text-zinc-300 text-[11px] px-2 py-0.5 rounded-md font-medium`。

---

## 4. 图标与原生控件接管规范 (Icons & Native Controls)

### 4.1 图标纪律 (Iconography)
- **唯一标准**：统一使用 **Lucide Icons** 标准 SVG 路径（`viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`）。
- **严禁低级替代品**：
  1. **严禁使用 Unicode 特殊字符冒充图标**（如禁止用古希腊字母 `ϟ` 冒充闪电、禁止用 `◇` 冒充菱形图标）。
  2. **严禁临时手搓简笔画 SVG**（如禁止用简单的 `<rect>` + `<circle>` 拼凑火柴人头像或雷同的方框横线文档）。
  3. **验证实际渲染产物**：若项目存在图标适配器（如自动转 Tabler），必须核实最终 DOM 渲染出的 SVG 路径与光学重量一致。
- **光学参数**：常规导航与表单图标统一尺寸 `16px`–`18px`，描边粗细统一控制在 **`stroke-width="1.65"` 至 `"1.75"`**，保持现代锐利感，避免 `2px` 以上粗线条在小尺寸下粘连。

### 4.2 原生 HTML 控件视觉接管
在保持原生 HTML/JS 轻量化、不强行引入重型无头组件库的前提下，使用原生标签必须彻底清除浏览器默认简陋外观：
- **`<select>` 下拉框**：必须设置 `appearance-none pr-8`，隐藏浏览器原生贴边箭头，在右侧 `right-2.5` 处放置自定义 `14px` Lucide `ChevronDown` 灰色图标（`pointer-events-none text-zinc-400`）。
- **`<details>` / `<summary>` 折叠面板**：必须隐藏原生三角箭头（`list-none [&::-webkit-details-marker]:hidden`），改用自定义 `ChevronRight` 图标配合展开旋转动画（`group-open:rotate-90 transition-transform`）。
- **`<textarea>` 文本域**：默认添加 `resize-none` 隐藏右下角浏览器原生白色斜纹拖拽角标（除非业务明确要求手动拖拽高度，此时需自定义滚动与容器边界）。
- **`<input type="checkbox">`**：统一设置 `accent-[#D4FF33] rounded border-white/20 bg-[#16161A]`，防止出现浏览器默认的刺眼蓝底白勾。

---

## 5. 布局防崩与 CSS 工程架构 (Layout & CSS Hygiene)

### 5.1 样式组织与拒绝优先级堆叠
- **语义 Token 优先**：公共颜色、圆角、阴影与过渡时间应沉淀为顶层 CSS Variables（语义 Token），相同职责的组件样式只保留单一维护来源。
- **禁止选择器提权恶习**：修改现有页面样式时，应先理清原有 CSS 规则归属并做干净替换，严禁为了图省事使用 `.panel.panel` 叠词选择器或滥用 `!important` 一层层糊补丁。

### 5.2 经典布局陷阱自检清单
1. **双栏/三栏等高对齐**：在左右分栏工作台（如“左侧生成设置 + 右侧结果预览”或“左中右素材库”）中，必须确保外层 `items-stretch`，且右侧预览容器设为纵向 Flex（`flex flex-col`）、内部画布区设为 `flex-1 min-h-0`。必须排查并清除旧样式中类似“空状态下固定高度或 `align-self: start`”的冲突规则，确保**空预览、加载中、长文本、报错**四种状态下左右两栏底部严格平齐。
2. **输入控件同行等高**：同一行排布的输入框与按钮/优惠码框（如充值页的“其他金额”与“优惠码”），必须锁死相同的高度 Token（如 `h-10`）与内边距。
3. **真实异常处理**：不写静默吞错的空 `try/catch`；所有未开放的服务（如“支付暂未开放”、“开票服务未开放”）必须如实展示克制的空状态或禁用说明，绝不伪造已接通的假交互。