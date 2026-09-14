# 工作台管理入口迁出与本地验收

日期：2026-09-14。对应管理平台升级计划 M2，第 24 批。

## 实现范围

- 删除工作台 API 设置 HTML、JS、CSS 与 iframe，移除本机维护弹窗及修改请求。保留业务供应商摘要、维护公告、断线恢复和保存刷新。
- 工作台通过受认证的 /api/management-entry 取得服务端 MANAGEMENT_BASE_URL，以新标签打开独立后台。地址仅允许 HTTPS 或回环 HTTP 的站点根地址，不包含凭证、查询参数或会话；未配置时隐藏入口，后台仍独立登录与鉴权。
- 旧供应商写入、连接检测、异步探测和模型拉取，以及旧维护 start/cancel 接口，在共享认证与本机访问下返回 410 management_entry_required；成员网关继续拒绝这些管理调用。旧静态文件即使残留于部署目录也返回 404。
- 独立供应商页增加火山视频规格价格编辑，按模型、480p/720p/1080p、有无视频输入调整默认服务层单价。空值清除当前覆盖，0 表示免费；版本冲突拒绝覆盖，沿用后端价格历史和凭证保留规则。
- 本地预览支持 --management-port，管理地址随 --browser-host 设置，便于使用 localhost 独立验收，不干扰用户当前站点会话。

ComfyUI、ModelScope 及依赖工具继续按第 20 批移除；历史资料和费用保持，不重新加入迁移清单。

## 验收证据

全量 PostgreSQL 248 通过；Python 127 通过、248 云测试跳过、7 subtest 通过；CJS 253 通过。补充清除价格与省略价格字段保留历史的断言后，最终专项 12 通过、236 deselected。生产价格合并逻辑无需修改。

本地日志位于 .local/cloud/acceptance/：

- workbench-management-postgres-full.log
- workbench-management-postgres-final.log
- workbench-management-python.log
- workbench-management-frontend.log

浏览器在隔离 workbench_ui_1a1230393cc748e0862e8d821e553da1 中完成：工作台管理链接实际打开新标签、独立登录、创建无凭证模拟供应商、保存 0/28 两种规格、清除 0 后重新打开确认、后台发布设计空间维护公告并在工作台显示。

该目录下保留 workbench-management-link.png、management-video-prices.png、management-prices-after-clear.png、workbench-maintenance-banner.png 与 database-evidence.json。实库最终 provider version=4：无视频输入的 0 元价格已结束生效，有视频输入 28 元价格仍有效，4 条 provider.save 审计，0 生成任务、0 付费提交。

首次自动化 fill 空字符串并未实际清空数字输入框，已通过 DOM 值识别并改用键盘全选删除后重验；database-before-confirmed-clear.json 仅为这一验收过程的中间状态，不是后端缺陷证据。

验收预览正常退出；上述 schema 与提前停止的 workbench_ui_d9bcbf31887c43f7b1e396a8dee3190e 均确认不存在。用户 8768、8769、8770 检查均返回 HTTP 200。

## 部署与剩余范围

本批没有新增 migration，未重启用户预览。用户预览仍需应用 013–015 并更新后端/管理静态产物；开发库仍未应用 004–015。本地 .local TOS 模拟和用户数据保持。

源码静态资源可能被运行中的旧服务读取，但旧后端尚无 /api/management-entry，链接在该进程更新前不会显示。当前独立管理入口仍可直接访问原 8770 地址。

旧共享目录/本地素材等管理能力、资源管理视图、完整维护排空与恢复、历史身份映射、双画布协作剩余项和 M4 数据库恢复验收仍按原计划执行，本批不代表整体升级完成。
