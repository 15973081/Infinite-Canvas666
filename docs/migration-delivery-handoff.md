# PostgreSQL + 本地 TOS 模拟迁移交付

日常启动、配置、备份、旧数据导入与换电脑搬迁，统一见 [项目操作手册](project-operations-manual.md)。

交付日期：2026-09-15。按精简计划的八项检查完成本轮交付；实际环境为本机 PostgreSQL 和 .local 文件对象模拟。没有部署云端 PostgreSQL 或真实 TOS Bucket。

## 使用入口

- 画布：http://127.0.0.1:8768/
- 独立管理平台：http://127.0.0.1:8770/
- 管理员沿用 preview-admin；密码交接见本地准备包 private/access.txt，不写入 Git。
- 历史数据位于“历史迁移”空间，现由平台管理员访问；管理员可以在“成员与分配”中指定成员和角色。原平台成员、空间和数据保留，没有猜测历史作者身份。
- 历史空间保留火山引擎和 APIMart 分配，主供应商为火山引擎；Grasi 配置保留但未分配。ComfyUI、Modelscope 等弃用供应商不恢复。模拟验收供应商已停用。

## 配置和数据

仓库根目录：D:/project/Infinite-Canvas666。

准备包：.local/cloud/delivery/prep-1789419296365。

| 内容 | 位置或标识 |
|---|---|
| 当前启动信息 | .local/cloud/runtime/active-delivery.json |
| 业务运行配置 | 准备包 candidate/delivery.env |
| 交付数据库 | canvas_delivery_1789419420170 |
| Schema | workbench_ui_343d3aa95f4c494b9a6758409d6e7a44 |
| TOS 本地模拟对象 | 准备包 candidate/objects/ |
| 供应商解密主密钥 | 准备包 private/provider-secret.key |
| 原平台数据库（保留） | canvas_cloud_test |
| 原平台配置与对象指向 | 准备包 private/original-storage.env、private/original-runtime.json |
| 旧目录原始快照 | 准备包 legacy/ |
| 服务日志 | 准备包 candidate/delivery-workbench.log、delivery-management.log、delivery-worker.log |

启动交付环境使用 active-delivery.json 和 delivery_service.py。旧 active-member-preview.json 及预览启动器仍指向原平台，不能用于交付库重启。数据库、对象、配置和解密密钥必须共同保留；这些私有数据未提交 Git。

## 关机后启动

在仓库根目录 PowerShell 中先检查数据库；仅在未运行时执行 start，不执行 init：

~~~powershell
./python/python.exe tools/cloud_local.py status
# 仅在上一步显示 PostgreSQL 未运行时执行：
./python/python.exe tools/cloud_local.py start
~~~

在三个终端中分别运行下列相同准备段，再各执行一个服务命令。进程持续运行，终端关闭会影响服务。PATH 加入已有 FFmpeg 位置，保留视频预览能力。

~~~powershell
Set-Location D:/project/Infinite-Canvas666
$delivery = Get-Content .local/cloud/runtime/active-delivery.json -Raw | ConvertFrom-Json
$env:Path = "$($delivery.ffmpeg_bin);$env:Path"
$commonArgs = @('--env', $delivery.env, '--database', $delivery.candidateDatabase, '--schema', $delivery.originalSchema)
~~~

画布终端：

~~~powershell
./python/python.exe tools/delivery_service.py workbench @commonArgs --port 8768 --stop-file "$($delivery.candidateDirectory)/delivery-workbench.stop"
~~~

管理终端：

~~~powershell
./python/python.exe tools/delivery_service.py management @commonArgs --port 8770 --stop-file "$($delivery.candidateDirectory)/delivery-management.stop"
~~~

执行服务终端：

~~~powershell
./python/python.exe tools/delivery_service.py worker @commonArgs --stop-file "$($delivery.candidateDirectory)/delivery-worker.stop"
~~~

环境文件是默认配置；如果终端预先导出了 DATABASE_URL、DATABASE_SCHEMA、PUBLIC_BASE_URL 等变量，这些变量优先。请使用未加载其他项目配置的终端。启动器会核对数据库和 Schema，目标不一致时拒绝启动。

## 停止和重启

管理平台进入维护，停止提交新任务，等待当前任务完成、编辑者保存结束后，在仓库根目录执行：

~~~powershell
$delivery = Get-Content .local/cloud/runtime/active-delivery.json -Raw | ConvertFrom-Json
foreach ($role in @('workbench','management','worker')) {
    Set-Content -LiteralPath "$($delivery.candidateDirectory)/delivery-$role.stop" -Value 'maintenance stop'
}
~~~

等待三个进程实际退出。active-delivery.json 的 PID 是本次切换记录，后续启动后会变化，不能用旧 PID 直接杀进程。确认旧服务退出后，删除这三个明确的停止文件，再按上面的命令启动：

~~~powershell
foreach ($role in @('workbench','management','worker')) {
    Remove-Item -LiteralPath "$($delivery.candidateDirectory)/delivery-$role.stop" -ErrorAction SilentlyContinue
}
~~~

普通重启保持原维护状态；如曾进入维护，重启后由管理平台完成恢复并开放。数据库一般无需随业务服务一起重启。

## 备份和回退

最终停写备份为准备包 delivery-ready.dump、delivery-ready.objects/ 和 delivery-ready.objects.json，244 个 ready 对象共 277894714 字节，数据库和对象校验通过。private/delivery.env 与 private/provider-secret.key 配套保留。该备份由离线工具创建，不出现在管理平台“备份记录”列表。

D4.2 已用 member-before-import.dump 完成一次真实独立恢复，恢复后表摘要和 9 个对象与原平台一致。最终备份另外完成离线全量对象校验；没有为同一个验收项重复执行独立恢复。

切换后回退步骤：

1. 停止写入并结束三个交付服务。先对交付库当前新增数据另外备份，不拿旧快照覆盖它。
2. 原平台 canvas_cloud_test、原对象和 private/original-storage.env 保留。需要恢复原入口时，将原配置副本作为独立运行环境，配置原供应商密钥、8768/8770 地址及管理静态目录，用 delivery_service.py 显式指定原数据库与相同 Schema。旧数据迁移后的新写入保留在交付库，人工核对后再迁回。
3. 原平台或交付库需要从备份重建时，使用 tools/cloud_restore.py，RESTORE_DATABASE_URL 指向另行创建的空数据库，--source 指定完整 dump 包，--database 指定该空库，--destination 指定新的私有目录，--reason 写明原因。具体工具操作见 [独立恢复说明](database-restore-local.md)。
4. 恢复后使用新生成配置和配套供应商密钥；保持 recovering，核对数据和登录后，通过管理平台或 tools/maintenance_recovery.py 恢复开放。不要把恢复工具指向现有业务库。

## 验收结果

| 检查 | 结果及证据 |
|---|---|
| D1.1 正常生成 | PostgreSQL 队列、独立 worker、本地 HTTP 模拟上游到对象读取通过；最终 8768 图片 HTTP 200，96×64 |
| D1.2 原任务恢复 | worker 中断退出后恢复；上游 POST 仍为 2，只增加原任务 GET 查询，无重复生成提交 |
| D2.1 空间与占用 | 两账号检查，已分配空间可用，未分配历史空间返回 403，占用显示成员身份 |
| D2.2 保存交接 | 经典与智能各完成保存交接、刷新重开，文本保持 |
| D3.1 管理配置 | 供应商配置及加密凭证迁移核对、空间/自定义角色/成员分配通过 |
| D3.2 维护重启 | 实际停止四个候选进程并重启，表数量和摘要不变，恢复正常开放 |
| D4.1 迁移切换 | 追加 28 张旧画布、208 份旧素材、47 条历史任务，保留原 5 张画布和 9 份素材；无增量后切换正式端口，管理和画布可访问，素材库六个可见图片元素均加载 |
| D4.2 备份恢复 | 原平台一致备份与独立恢复通过，最终交付备份另行保存并校验，回退步骤见上文 |

交付时总计 33 张画布、244 条资产、51 条任务。增加的资产包含预览和验收结果；新增 4 条验收任务中 2 条连接修复前失败、2 条成功，保留失败记录。28 张旧画布包含 5 张活动和 23 张回收站画布。

本地完整证据位于准备包的 candidate-verification.json、import-verification.json 以及 candidate/ 下 main-flow-evidence.json、restart-verification.json、provider-migration.json、management-assignment.json、generation-check/verification.json、pre-cutover.json、final-backup.json、cutover-verification.json。早期文件中的 remaining 字段反映当时状态，最终状态以本页和 cutover-verification.json 为准。

## 已知差异与范围

- 源数据原本缺少 5 个媒体引用，完整名单见 [导入差异](migration-delivery-import.md)，没有伪造文件或自动重新生成。
- 未导出的浏览器草稿、17 个不同外部 URL 的可用性、未知历史身份映射保留为后续人工事项。
- 真实供应商凭证和配置已迁移；生成验收用本地 HTTP 模拟上游，没有真实计费调用，不等同于每个真实模型均已实测。
- 部分成功补偿、极端并发/网络矩阵、真实 TOS 云端故障验收等按精简计划留到后续。本轮不因此继续扩张。
