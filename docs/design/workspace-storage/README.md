# Workspace 素材占用 · 2026-10-07

顶部 workspace 名称旁常驻显示当前空间素材总量。展开菜单可以查看图片、视频、音频、工作流和其他文件的大小、数量与占用构成，提供单独的“刷新用量”。保持原有空间切换、保存检查和菜单键盘行为。

统计来自 PostgreSQL `assets` 元数据：每个具有最终对象版本且状态不是 `deleted` 的登记文件计一次，包含派生预览和未清理的非就绪文件；同一素材被多个画布引用不会重复计算。上传中的文件未计入总量，大小未知的文件单独提示。此值不是整个存储桶的物理账单，不包括外链、数据库、备份、历史对象版本及临时缓存。界面单位按 1024 换算。

只读 `/api/workspace/storage` 经过成员身份、当前空间和 `canvas.read` 授权，并在数据库事务中重新校验。查看成员可以读取汇总，无需获得媒体本身的读取权限。响应不包含桶名、路径、凭据或素材 ID，也不访问对象存储。

外层页面初始化请求一次，iframe 不重复请求；菜单展开时复用一分钟内的统计快照，过期后更新，可以手动刷新。无后台轮询；失败显示错误或保留上次统计，不以零代替未知。没有配置 workspace 容量配额，明确显示“未设配额”，构成条只表示媒体分类比例。

验证：

- 隔离 PostgreSQL 的新增统计与访问边界检查通过，包括派生文件、待清理文件、上传、未知大小、删除变化、空空间、跨空间拒绝、成员移除及无媒体读取权限的查看成员。
- `python tools/cloud_test.py tests/test_cloud_workspace_storage.py -q` 运行该工具既有云端回归及新增检查，全部通过。
- `node --test tests/workspace-storage.browser.cjs tests/member-session.cjs`：12 项通过。
- `node --test tests/workspace-storage.browser.cjs tests/studio-workbench.browser.cjs`：6 项通过（新增项有重叠，不重复计数）。覆盖空间请求绑定、iframe 请求去重、缓存、失败后重试、零值、Esc 焦点恢复、深浅主题及 320/390/768/1440px。
- 实际 8768 工作台打开 workspace 菜单，显示历史迁移空间 272.9 MB / 432 个文件与分类明细。服务已重启加载接口，无数据写入或生成操作。没有做生产规模性能基准。
- JS 语法、`git diff --check` 通过；原有 `canvas-execution.js` 和 `canvas-session.js` 工作区修改哈希未变化。

截图：

- [实际工作台深色效果](live-storage-dark.png)
- 手机组件验证截图（3 GB 为接口夹具数据）：[深色](storage-dark-mobile.png) / [浅色](storage-light-mobile.png)
