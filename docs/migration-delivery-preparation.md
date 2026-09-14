# 迁移交付：备份准备与独立恢复

日期：2026-09-15。按[精简交付计划](migration-delivery-plan.md)执行，D4.2 的一次备份恢复检查已通过；正式合并与切换尚未执行。

## 已完成

- 恢复本机 PostgreSQL，实际查询新平台 5 张画布、9 份素材、0 条任务、0 个有效编辑租约。
- 新旧画布 ID 无交集：旧目录 28 张，新平台 5 张。后续追加导入，保留原平台数据。
- 在业务 Python 进程未运行期间保存旧目录快照，共 1060 个文件；逐文件核对大小及 SHA-256。包含 data、assets、output、API、config、workflows 及存在的历史/对话文件。原配置和未分类文件也保留。
- 用现有快照一致的备份工具保存新平台数据库及全部 9 个 ready 对象，并离线核验备份。
- 使用真实 pg_restore/psql 恢复到独立空数据库，9 个对象保留原版本；恢复后的画布、资产、供应商表数量与摘要同原平台一致。
- 候选库保持 recovering，旧登录会话和编辑凭证已按恢复协议失效；未启动业务 worker，没有切换用户入口。

## 备份与候选位置

本地准备包：.local/cloud/delivery/prep-1789419296365。

| 内容 | 准备包内位置 |
|---|---|
| 旧目录一致快照 | legacy/ |
| 新平台数据库 | member-before-import.dump |
| 对象及校验清单 | member-before-import.objects/、member-before-import.objects.json |
| 原配置与供应商解密主密钥副本 | private/（私有备份，不提交 Git） |
| 候选配置与恢复回执 | candidate/storage.env、candidate/restore-complete.json |
| 新旧表摘要核对 | candidate-verification.json |
| 含全部任务的迁移盘点 | legacy-inventory-complete-tasks.json |

候选数据库：canvas_delivery_1789419420170；保留原 schema 名 workbench_ui_343d3aa95f4c494b9a6758409d6e7a44。原数据库仍为 canvas_cloud_test，原对象目录未更改。

活动准备记录：.local/cloud/delivery/active-preparation.json。所有完整报告、配置和数据库包留在 Git 忽略的本地目录。

## 实际发现并修复的导入缺口

旧 data/canvas_tasks.json 有 23 条 SQLite 中不存在的任务；此前盘点只覆盖 SQLite 的 24 条，合计应为 47 条。本批导入器增加 JSON 任务支持：

- JSON 独有任务保留历史状态和结果；非终态转待核对，不自动重发，缺失请求不伪造。
- 同 ID 同时存在于 SQLite 和 JSON 时，SQLite 作为任务记录，JSON 另存历史快照，避免覆盖或丢失。
- 重复迁移不重复写入；源记录变化拒绝静默覆盖；任务密钥字段不导入。
- JSON 中的媒体引用加入原有盘点。现有 5 个缺失引用保持，未分类文件仅剩 rollout 指标文件，已随快照保存。

验证：1 项真实 PostgreSQL 专项、3 项离线迁移检查通过，没有执行全量测试。快照再次盘点为 28 张画布、208 个素材、47 条任务；还未执行 apply。

## 回退与下一步

当前尚未切换，原数据库、对象、配置均可继续使用。候选合并完成后再执行其余主流程检查并决定入口切换。正式切换前重新核对原平台是否有新增写入；如有变化，先保留增量再继续。

需要从备份重建时，使用现有 tools/cloud_restore.py，RESTORE_DATABASE_URL 指向一个独立空数据库，source 指向上述 dump，destination 使用新目录；从受控 private 备份恢复供应商解密密钥，配置业务与管理入口，完成维护恢复再开放。不得覆盖现有库。

切换后回退前先停写并备份候选库新增数据，再恢复原入口；不直接用旧快照覆盖新写入。
