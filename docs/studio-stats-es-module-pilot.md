# 低依赖 ES Module 试点（2026-10-05）

通信计划第 3 轮，基线 `b0edaea`。只迁出 stats 消息解析函数，不改变画布业务脚本格式，不接入框架或构建器。

## 明确依赖

`studio-stats-codec.mjs` 导出 `parseMessage(text)`，只有 JSON、Array 和类型判断，无 DOM、window、存储、计时器、连接或业务模块依赖。消息校验和结果与第 2 轮一致。

旧 `studio-stats-connection.js` 仍同步安装 `StudioStatsConnection.create()`，外壳 `connectStudioWebSocket()` 仍为原薄委托。连接启动显式按 **会话 ready → import 解析模块 → 创建 socket** 排序，原业务加载顺序和前后台路由保留。

纯模块加载记录在已有 connecting Promise 内；重复启动合并。关闭/暂停期间完成的旧 import 不能创建连接。失败使用第 2 轮原退避和断开提示，永久退出清理计时器，未新增加载控制器或第二份解析实现。

浏览器旧入口桥接只负责从 currentScript 确定同目录模块 URL，并附加 HTML 的 `frontend-build-id`。只有模块内容改变时，部署标识同样改变。既有 `VersionedStaticFiles` 把这个 URL 重定向到内容哈希 URL，再按原 immutable/ETag 策略提供资源；未修改服务端缓存代码。未被服务端改写的原始 HTML 可按无版本路径加载，由既有服务端重定向取得当前内容。

测试的 CommonJS 工厂导出只保留 create；纯函数测试改为原生 import。生产浏览器原有工厂、启动和查询入口全部保留，未在 window 上添加解析函数别名。

## 验收

- 相关 JavaScript 23 项通过：13 项连接/解析单元测试和 10 项 Chrome 浏览器测试。新增原生 import 冷启动等待、旧入口重复调用、模块失败、加载后旧会话失效，以及只改模块内容后的新部署 URL 与新解析行为。
- 1 项后端静态资源测试验证 `.mjs` JavaScript MIME、无缓存 307 重定向、内容哈希 immutable 响应、ETag 304，以及只改模块后部署标识变化、桥接脚本哈希不变、新 ETag/内容返回。
- 相关 Python 共 52 项、51 个 JS/MJS 语法和差异检查通过。
- 首次全量遇到既有 Smart 提示词面板刷新计数的启动时序问题（2 次而非预期 1 次，独立运行通过）。测试先等启动网络请求完成再替换服务与计数，未修改业务补偿逻辑或放宽原断言；相关整组 40 项通过。
- 全量 JavaScript 重跑 **1242 项通过，0 失败**（`.local/codec-full-js-final.log`）。

## 限制与后续

本试点证明原生模块可以通过明确异步入口接入；它不证明所有同步全局函数都可机械改成 import。当前画布入口/子模块的共享初始化顺序继续保留。模块请求失败后可见断开提示；若浏览器缓存了同 URL 的失败模块，依靠已有版本检查和页面重载切换部署 URL，不引入绕过缓存的循环随机参数。

这一步增加一个很小的模块请求，未声称改善加载耗时。后续第 4 轮选择有实际计算与呈现耦合的列表/面板，第 5 轮仅提取两套画布语义一致的小范围代码；第 6 轮仍需真实服务验收及耗时基准，尚未进行 React 迁移。

## 真实成员服务补验与兼容修复

第 6 轮恢复本地隔离 PostgreSQL 后，用原生产页面和原生 Chrome HTTP/WebSocket 核验，发现第 3 轮夹具未覆盖成员网关：静态后缀白名单没有 `.mjs`，真实登录成员的模块请求返回 403，解析模块无法加载，外壳不建立 stats 连接。

网关将 `.mjs` 纳入原有已认证静态脚本类型，认证、成员身份、管理入口限制及业务权限检查不变。新增 PostgreSQL 网关回归 1 项通过：匿名模块请求仍 401，登录 viewer 模块请求 200 且为 JavaScript MIME，未知 `.env` 和旧管理入口仍 403。日志 `.local/stats-module-member-gateway.log`。

随后生产外壳和 Classic/Smart 页面真实服务验收 5 个场景通过，包括原生模块/真实 stats、跨客户端订阅应用、租约保存、只读拒绝和数据库读取恢复。此处是 loopback HTTP/WebSocket 与一次性 PostgreSQL schema，没有执行供应商生成或收费请求。补验独立于原第 3 轮模拟冷启动/缓存测试，不将两者混称为真实供应商验收。
