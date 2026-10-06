# 画布节点封面 · 2026-10-07

首页菜单的“封面样式”改为“编辑封面”，进入对应画布并打开设置。经典和智能画布工具栏均增加“封面”。成员模式仍须通过原有“开始编辑”流程取得编辑资格；查看模式可以预览，不能应用。

默认按节点存储顺序取第一个有可用视频结果的节点；没有视频时取第一张图片，没有素材时使用网格占位。可手动选择节点中的图片或视频结果，修改封面文字；留空使用画布名称。文字统一位于左上角。选择保存为节点 ID 和素材索引，不复制媒体文件；被选素材移除后显示自动封面。

封面和候选列表只创建图片元素，不创建视频播放器，不请求原视频流。优先使用素材已有缩略图，再复用 `/api/media-preview` 的现有缓存预览服务；外部视频没有缩略图时显示占位，不下载远程视频补图。本阶段没有新增首帧生成服务。图片沿用 `MemberMediaUrl` 鉴权和 `CanvasMediaLoader` 懒加载队列（最多 4 个并发），选择列表每批显示 24 项。

封面设置走原有画布保存、版本冲突和租约校验。旧客户端不提交 `cover` 时保留已设置封面。首页从原有列表接口取得单条紧凑封面摘要，支持旧画布及后台任务产生的新结果，不逐卡读取文档。租约轮询和轻量元数据更新不扫描封面素材，列表不传输节点、日志和媒体内容。

验证结果：

- 封面规则和元数据单元检查 12 项通过。
- 隔离 PostgreSQL 的两种画布封面保存、切换、删除回退、旧客户端兼容、编辑资格、元数据更新与大画布/目录检查 6 项通过。
- 两种编辑器及列表的封面浏览器检查 3 项通过，覆盖深浅主题、390px 窄屏、只请求缩略图、左对齐文字、保存、权限失效和占位。
- 既有模块、统一视觉和工作台检查 45 项通过；保存竞态检查 7 项通过。复测重叠项目不累加。
- 语法与 `git diff --check` 通过。`canvas-execution.js`、`canvas-session.js` 的已有工作区改动哈希保持不变。

8768 工作台已重启以加载新后端。实际页面检查了首页进入两种画布封面设置、查看模式禁用态、经典空状态，以及智能画布现有图片在封面预览和返回首页后成功显示缩略图。没有向用户空间写入测试素材，也没有执行付费生成。封面选择与保存、视频缩略图请求限制由生产页面加接口夹具及隔离 PostgreSQL 检查覆盖；没有测量生产规模目录的前后耗时，不将大画布回归视为性能基准。

界面截图（带媒体的截图使用浏览器测试夹具）：

- [经典画布深色](classic-cover-dark.png) / [浅色](classic-cover-light.png) / [手机](classic-cover-mobile.png)
- [智能画布深色](smart-cover-dark.png) / [浅色](smart-cover-light.png) / [手机](smart-cover-mobile.png)
- [实际经典画布空状态](live-classic-cover-empty-dark.jpg)
- [实际智能封面预览](live-smart-cover-dark.jpg) / [实际首页封面](live-home-cover-dark.jpg)

后端检查命令：`python tools/cloud_test.py tests/test_cloud_canvas_covers.py -k "node_cover_save or large_member_save or directory_cover_style or batched_scans_allow_deletion" -q`。浏览器检查：`node --test tests/canvas-cover.browser.cjs tests/studio-workbench.browser.cjs tests/test_canvas_save_race.cjs`。
