# 项目操作手册：启动、配置、运行与迁移

适用版本：2026-09-15 本地迁移交付版。适用环境：Windows PowerShell、PostgreSQL、文件系统模拟 TOS。本手册说明日常操作和换电脑/换目录搬迁；真实云 TOS 或 Linux 部署需要对应环境适配，不把本地操作直接当作云端部署。

## 1. 先看这里

| 要做的事 | 阅读章节 |
|---|---|
| 关机后启动画布和管理平台 | 第 3 章 |
| 修改数据库、存储、端口或供应商配置 | 第 4 章 |
| 停服、重启、更新代码、查看日志 | 第 5 章 |
| 备份当前全部数据 | 第 6 章 |
| 导入旧版项目的数据 | 第 7 章 |
| 整个项目搬到另一台电脑或另一目录 | 第 8 章 |
| 恢复失败、切换失败，需要回退 | 第 9 章 |
| 图片不显示、生成不执行、页面打不开 | 第 10 章 |

本文命令只在你执行时生效；整理本手册不会重启服务或再次迁移数据。示例从仓库根目录运行。标注“示例”的目标目录、数据库名和空间 ID，执行前替换成自己的值。

当前画布入口：http://127.0.0.1:8768/；独立管理入口：http://127.0.0.1:8770/。

管理员账号为 preview-admin，当前密码见准备包 private/access.txt。供应商 API Key、数据库密码、解密主密钥不写入此文档或 Git。

## 2. 项目由哪些部分组成

运行时有四部分：PostgreSQL 保存画布、任务、成员和权限；workbench 提供画布；management 提供独立管理页面；worker 处理生成队列。TOS 目前模拟在 .local 内的对象目录，不需要另外启动一个 TOS 服务。

当前仓库是 D:/project/Infinite-Canvas666，准备包为 .local/cloud/delivery/prep-1789419296365。

| 文件或目录 | 用途 |
|---|---|
| .local/cloud/runtime/active-delivery.json | 当前交付环境的位置索引，包含数据库名、Schema、配置路径、FFmpeg 路径 |
| 准备包 candidate/delivery.env | 当前三个业务进程使用的配置 |
| 准备包 candidate/objects/ | 当前图片、视频等不可变对象原件及预览 |
| 准备包 private/provider-secret.key | 解密数据库中供应商凭证的主密钥，搬迁必须带上 |
| 准备包 private/access.txt | 管理员私有交接信息 |
| .local/cloud/pgdata/ | 本机 PostgreSQL 数据目录，不能把运行中的目录直接复制当作可靠备份 |
| .local/cloud/storage.env | 本地数据库初始化配置，不是当前交付业务配置 |
| 准备包 legacy/ | 旧版项目快照，留作追溯 |
| 准备包 delivery-ready.dump 及同名 .objects/、.objects.json | 2026-09-15 交付时的完整备份；后续新增数据需要重新备份 |

当前数据库为 canvas_delivery_1789419420170，Schema 为 workbench_ui_343d3aa95f4c494b9a6758409d6e7a44。原数据库 canvas_cloud_test 保留用于回退。

active-delivery.json 是运维索引，不是自动启动器；后续手动启动不会自动更新其中 PID。旧 active-member-preview.json 和旧预览启动器指向另一环境，不用于交付库启动。

## 3. 日常启动

### 3.1 检查 PostgreSQL

~~~powershell
Set-Location D:/project/Infinite-Canvas666
./python/python.exe tools/cloud_local.py status
~~~

只有显示数据库未运行时才执行：

~~~powershell
./python/python.exe tools/cloud_local.py start
~~~

正常重启不执行 init。若 pg_ctl.exe 不存在，检查当前 Windows 用户的 %LOCALAPPDATA%/Temp/canvas-cloud-runtime/pgsql/bin；换电脑的准备方法见第 8 章。

### 3.2 三个服务分别启动

打开三个 PowerShell 终端，每个先执行准备段：

~~~powershell
Set-Location D:/project/Infinite-Canvas666
$delivery = Get-Content .local/cloud/runtime/active-delivery.json -Raw | ConvertFrom-Json
$env:Path = "$($delivery.ffmpeg_bin);$env:Path"
$commonArgs = @('--env', $delivery.env, '--database', $delivery.candidateDatabase, '--schema', $delivery.originalSchema)
~~~

终端一运行画布：

~~~powershell
./python/python.exe tools/delivery_service.py workbench @commonArgs --port 8768 --stop-file "$($delivery.candidateDirectory)/delivery-workbench.stop"
~~~

终端二运行管理平台：

~~~powershell
./python/python.exe tools/delivery_service.py management @commonArgs --port 8770 --stop-file "$($delivery.candidateDirectory)/delivery-management.stop"
~~~

终端三运行生成执行服务：

~~~powershell
./python/python.exe tools/delivery_service.py worker @commonArgs --stop-file "$($delivery.candidateDirectory)/delivery-worker.stop"
~~~

这三个进程前台运行，保留终端。启动管理服务时会自动生成独立管理前端文件，无需额外执行 npm 构建。启动器不会初始化数据库、删除数据或自动应用数据库升级。

如果提示停止文件存在，先按第 5 章确认旧服务已退出，再移除对应停止文件。不要在服务仍运行时重复启动第二套 worker。

### 3.3 简单确认可用

打开画布并登录，选择已分配空间；打开管理页面，检查维护状态是否正常、生成执行服务是否在线。抽查一张已有画布和一份素材即可。普通重启不要求重新执行迁移验收，更不需要每次真实付费生成。

## 4. 配置怎么改

### 4.1 环境配置

修改 $delivery.env 所指向的 delivery.env，修改前保存私有副本。三个服务重启后生效。已导出的进程环境变量优先于文件，因此使用没有加载其他项目配置的终端。

| 配置项 | 填写要求 |
|---|---|
| DATABASE_BACKEND | 当前为 postgres |
| DATABASE_URL | 目标 PostgreSQL 连接串，包含正确数据库名；不在公开终端输出或提交 Git |
| DATABASE_SCHEMA | 与当前目标 Schema 一致，不能随意改名 |
| AUTH_MODE | members，使用成员与空间权限 |
| MEDIA_BACKEND | filesystem，表示本地模拟 TOS |
| OBJECT_STORE_ROOT | 对象目录的绝对路径；换目录必须修改 |
| MEDIA_TEMP_DIR、APP_RUNTIME_DIR | 临时文件与运行时目录，搬迁后检查是否仍指向旧电脑 |
| MEDIA_SIGNING_KEY | 本地素材签名密钥，日常重启保留；恢复工具会生成新的值 |
| PROVIDER_SECRET_KEY_FILE | 原供应商解密主密钥文件的绝对路径；不能新建随机密钥替换旧值 |
| PUBLIC_BASE_URL | 用户访问画布的地址，当前 http://127.0.0.1:8768 |
| MANAGEMENT_BASE_URL | 管理平台地址，当前 http://127.0.0.1:8770 |
| MANAGEMENT_STATIC_DIR | 管理页面生成目录，必须可写 |
| CLOUD_EMBEDDED_WORKER | 使用独立 worker；delivery_service.py 强制关闭内嵌执行服务 |

端口同时由启动命令 --port 决定，仅改 PUBLIC_BASE_URL 不会改变监听端口。默认 --host 为 127.0.0.1，只能本机访问；局域网访问需设置监听地址和实际访问地址。公网域名、HTTPS、代理转发及防火墙另行配置，本次交付并未部署公网入口。

不要只把 MEDIA_BACKEND 改成 tos 就认为完成云存储迁移：本地对象的 key/version、云端版本及数据库引用需要配套迁移。

### 4.2 供应商、空间和角色

在管理平台操作日常业务配置：

1. “供应商与分配”中维护供应商地址、协议、模型和凭证；按需使用界面提供的上游模型拉取与应用功能。
2. 火山引擎按其专用字段填写，凭证不回显；保存后确认配置状态。托管供应商代理为空表示直连，有代理则使用保存的代理。
3. 给需要的空间分配供应商并选择主供应商；供应商启用不等于所有空间自动可用。
4. “角色与权限”维护角色，“成员与分配”将成员和角色分配到具体空间。
5. 历史数据在“历史迁移”空间，按实际使用者分配；不要为方便使用而给所有成员平台管理员权限。

旧 API/config 文件留作迁移来源。托管模式后续维护以管理平台配置为准。ComfyUI、Modelscope 等已弃用集成不重新启用。

## 5. 运行、停服、重启和更新

### 5.1 正常停止

先在管理平台“维护中心”进入维护，等待任务结束、编辑者保存退出。然后在第四个终端执行：

~~~powershell
Set-Location D:/project/Infinite-Canvas666
$delivery = Get-Content .local/cloud/runtime/active-delivery.json -Raw | ConvertFrom-Json
foreach ($role in @('workbench','management','worker')) {
    Set-Content -LiteralPath "$($delivery.candidateDirectory)/delivery-$role.stop" -Value 'maintenance stop'
}
~~~

等待三个运行终端返回命令提示符。检查当前进程命令行或监听端口确认退出，不能只依据旧 JSON 的 PID：

~~~powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*tools/delivery_service.py*' } | Select-Object ProcessId, CommandLine
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8768,8770 } | Select-Object LocalPort,OwningProcess
~~~

第二条只能验证 HTTP 端口，不能替代 worker 的退出确认。已有其他环境时，按命令行的 --env 区分，别终止其他服务。

确认退出后清除这三个停止标记：

~~~powershell
foreach ($role in @('workbench','management','worker')) {
    Remove-Item -LiteralPath "$($delivery.candidateDirectory)/delivery-$role.stop" -ErrorAction SilentlyContinue
}
~~~

普通重启按第 3 章启动三个服务，完成简单检查后在维护中心恢复开放。业务重启一般不需要停止 PostgreSQL。

### 5.2 查看日志

本次交付后台启动的日志位于 candidate/delivery-workbench.log、delivery-management.log、delivery-worker.log。以后按本手册前台启动，新的输出直接在各终端，不会自动追加到这些旧日志。

~~~powershell
Get-Content -LiteralPath "$($delivery.candidateDirectory)/delivery-worker.log" -Tail 60
~~~

先看错误发生时间，避免把旧失败当作本次问题。维护中心也可查看任务、服务心跳与恢复状态。

### 5.3 更新项目代码

记录当前 git rev-parse HEAD 和 git status --short；进入维护、停止服务、按第 6 章备份后再更新代码。不要用清理命令删除 .local、对象目录或密钥。更新完成继续使用交付配置启动。

若该版本明确包含数据库结构升级，按该版本说明执行；现有 init-db 命令实际会执行数据库 migrations，不是普通启动步骤。数据库升级后回退不能只切回旧代码。恢复备份应先使用与备份对应、migration 校验一致的代码版本，再单独安排升级。

## 6. 创建完整备份

计划搬迁或回退时，建议停写并结束业务服务后备份，保证截止点明确；数据库仍保持运行。

~~~powershell
Set-Location D:/project/Infinite-Canvas666
$delivery = Get-Content .local/cloud/runtime/active-delivery.json -Raw | ConvertFrom-Json
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$PWD/.local/cloud/backups/delivery-$stamp.dump"
./python/python.exe tools/cloud_storage.py backup --env $delivery.env --report $backup
if ($LASTEXITCODE -ne 0) { throw '备份失败，保留现场，不继续切换' }
./python/python.exe tools/cloud_storage.py verify-backup --source $backup
if ($LASTEXITCODE -ne 0) { throw '备份校验失败，不用于迁移' }
git rev-parse HEAD
~~~

必须一起保存三项：同名 .dump、.objects.json 和 .objects/ 目录。备份命令拒绝覆盖同名包，重复执行使用新名字。再私下保存当前 delivery.env、供应商解密主密钥、active-delivery.json、管理员交接信息及对应 Git 提交号。

只复制代码或只有 .dump 不足以恢复图片；只有对象文件也无法恢复成员、画布和任务。离线备份不会自动显示在管理平台“备份记录”列表。

## 7. 导入旧版项目的数据

这是把旧文件数据追加到现有 PostgreSQL 空间，不是把整套平台覆盖掉。当前历史快照已经导入，日常启动无需再执行。

1. 停止旧版项目写入，复制一份完整一致快照，包含 data、assets、output、API、config、workflows 和存在的历史/对话文件。保留原目录。
2. 备份当前 PostgreSQL 平台，在管理页面创建或选定一个接收空间，记录真实空间 ID。
3. 先盘点，不加 --apply。检查缺失文件、冲突和目标空间。

~~~powershell
$delivery = Get-Content .local/cloud/runtime/active-delivery.json -Raw | ConvertFrom-Json
$legacySource = 'D:/migration-input/legacy-snapshot' # 示例：完整旧快照
$targetSpace = 'REPLACE_WITH_EXISTING_SPACE_ID'     # 必须替换
./python/python.exe tools/cloud_storage.py migrate --env $delivery.env --source $legacySource --workspace $targetSpace --report '.local/cloud/legacy-plan.json'
~~~

确认范围后，保持目标业务停写，执行追加导入：

~~~powershell
./python/python.exe tools/cloud_storage.py migrate --env $delivery.env --source $legacySource --workspace $targetSpace --apply --report '.local/cloud/legacy-applied.json'
if ($LASTEXITCODE -ne 0) { throw '导入未完成，检查报告后再处理' }
~~~

不要看到失败就换空间反复导入。导入器保留已有数据、记录冲突，重复导入相同来源有去重保护；源数据变化要核对报告，不静默覆盖。旧任务不会因此重新付费生成；未完成或无法对应的历史任务保留待核对。

供应商凭证和配置通过管理平台对应的配置导入/维护功能另行核对，模型和空间分配也要确认。数据库备份恢复则会带上已经保存的托管供应商配置，但仍需要原解密主密钥。

只需核对报告数量和差异，抽查一张旧画布与一份素材，再为实际成员分配空间。缺失的历史原件记录下来，不用重新生成假装补齐。

## 8. 整个项目搬迁：换电脑或换目录

推荐用“代码 + 完整备份 + 私有配置/密钥”恢复到新库。即使只是更换盘符，也要处理配置中的绝对路径。旧环境在切换完成前保留，搬迁期间不要让新旧环境同时接受写入。

### 8.1 原电脑打包

按第 5 章停写、结束业务服务，再按第 6 章创建最新备份。携带以下内容：

- 对应提交的完整项目源码和所需静态文件。Git 未跟踪的业务文件要单独核对；git clone 不会带上 .local、嵌入式 Python 和私有数据。
- 完整备份三件套，以及供应商解密主密钥、业务配置副本和管理员交接信息。
- Windows 同架构可携带现有 python/ 运行环境；另外准备兼容的 PostgreSQL 服务端/客户端、FFmpeg。运行时不是数据库备份的一部分。
- 需要追溯的 legacy/ 快照和差异记录；如原浏览器还有未保存草稿，先保存或导出，它们不在服务器备份内。

不要复制运行中的 pgdata 来替代逻辑备份。也不要只复制项目目录就假定当前用户 Temp 下的 PostgreSQL 程序和外部 FFmpeg 路径已一起搬走。

### 8.2 新电脑准备运行环境

把项目放到最终目录，以下示例为 D:/project/Infinite-Canvas666，代码版本与备份版本一致。确认 python/python.exe 可运行。

有现成 PostgreSQL 时，使用自己的服务和连接信息，不执行 cloud_local init。没有 PostgreSQL、且新项目没有旧 .local/cloud/pgdata 和旧 .local/cloud/storage.env 时，才可用项目工具初始化全新的本地实例：

~~~powershell
./python/python.exe tools/cloud_local.py init
~~~

该命令在需要时下载工具、创建本地实例和初始化配置，不用于“修复”原有数据库。也可以将旧机器完整的 pgsql 程序目录放到新用户 %LOCALAPPDATA%/Temp/canvas-cloud-runtime/pgsql；它只包含程序，不代替数据恢复。使用现有安装时，把包含 pg_dump、pg_restore、psql 的 bin 加入 PATH。Windows 当前交付使用 PostgreSQL 16，迁移时保持兼容版本。

### 8.3 创建空目标库并恢复

新库示例名 canvas_moved_20260915，必须不存在业务数据，不预先执行 init-db，不让业务进程连接它。使用数据库管理员通过 psql 或管理工具执行：

~~~sql
CREATE DATABASE canvas_moved_20260915 OWNER canvas_local;
~~~

其中 canvas_local 必须替换为新环境实际拥有建表权限的运行账号；项目本地 init 创建的账号就是 canvas_local。若该库已存在，另取新名字，不 DROP 原库。

完整备份示例放在 D:/migration-input/delivery.dump，同时有 delivery.objects.json 和 delivery.objects/。恢复输出目录必须不存在：

~~~powershell
./python/python.exe tools/cloud_storage.py verify-backup --source 'D:/migration-input/delivery.dump'
if ($LASTEXITCODE -ne 0) { throw '备份校验失败' }
$restoreSecret = Read-Host '输入新空数据库连接串（含密码，不回显）' -AsSecureString
$env:RESTORE_DATABASE_URL = ([System.Net.NetworkCredential]::new('', $restoreSecret)).Password
try {
    ./python/python.exe tools/cloud_restore.py --source 'D:/migration-input/delivery.dump' --database canvas_moved_20260915 --destination '.local/cloud/recovered/moved-20260915' --reason '项目搬迁到新环境'
    if ($LASTEXITCODE -ne 0) { throw '恢复未完成，保持新环境隔离' }
} finally {
    Remove-Item Env:RESTORE_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Variable restoreSecret -ErrorAction SilentlyContinue
}
~~~

连接串格式可使用 host=127.0.0.1 port=54329 dbname=canvas_moved_20260915 user=canvas_local password=实际密码；含特殊字符时按 PostgreSQL 连接串规则正确引用。不要把真实连接串作为命令行参数或写进公开文档。

退出码 0 且新目录有 restore-complete.json 才代表恢复完成。若失败，保留新库、新目录与日志，先确认状态，不重复覆盖恢复。

### 8.4 配置新目录并切换索引

新目录会生成 storage.env、objects/ 和恢复回执。复制 storage.env 为同目录 delivery.env，保留其新数据库、新对象路径和新 MEDIA_SIGNING_KEY，然后补充：

~~~dotenv
PUBLIC_BASE_URL=http://127.0.0.1:8768
MANAGEMENT_BASE_URL=http://127.0.0.1:8770
PROVIDER_SECRET_KEY_FILE=D:/project/Infinite-Canvas666/.local/private/provider-secret.key
MANAGEMENT_STATIC_DIR=D:/project/Infinite-Canvas666/.local/cloud/recovered/moved-20260915/management-dist
~~~

把备份中的原供应商主密钥放到上面指定位置；示例路径须按实际目录修改。检查 MEDIA_TEMP_DIR、APP_RUNTIME_DIR 和所有其他路径。不要把旧 delivery.env 整份覆盖到新文件，否则会重新连回旧库或旧对象目录。

保存新的 .local/cloud/runtime/active-delivery.json。以下是供第 3 章命令使用的最小索引示例；Schema 取恢复回执中的 schema，FFmpeg 改为实际安装目录：

~~~json
{
  "candidateDatabase": "canvas_moved_20260915",
  "originalSchema": "workbench_ui_343d3aa95f4c494b9a6758409d6e7a44",
  "candidateDirectory": "D:/project/Infinite-Canvas666/.local/cloud/recovered/moved-20260915",
  "env": "D:/project/Infinite-Canvas666/.local/cloud/recovered/moved-20260915/delivery.env",
  "ffmpeg_bin": "D:/tools/ffmpeg/bin",
  "workbench_url": "http://127.0.0.1:8768/",
  "management_url": "http://127.0.0.1:8770/"
}
~~~

### 8.5 开放新环境

按第 3 章启动管理平台和画布。恢复会撤销旧登录/画布租约，保留账号密码，需要重新登录；平台保持 recovering。未完成任务进入待核对，不自动重新付费提交。

最少确认：数据数量符合备份、抽查画布和素材、成员能访问正确空间、供应商配置可用。核对备份截止后的旧环境增量以及待核对任务，再在维护中心恢复开放，启动独立 worker，交付新入口。不要同时开放旧环境写入。

本地搬迁成功不等于公网部署完成；如要在线上使用，还需完成目标地址、HTTPS、反向代理和实际存储方案配置，再验证外部访问。

## 9. 恢复失败与回退

恢复失败时保持新目标隔离，原环境不受恢复工具覆盖。先查 restore-complete.json 和工具退出码；目录里已有对象并不代表数据库已成功恢复。

切换后回退时，先停止新环境写入并备份新产生的数据，再将访问入口切回保留的原环境。不能拿搬迁前的快照覆盖新写入。新旧数据需要合并时，保留两份库和完整对象，明确差异后单独处理。

管理页面不可用但数据库可连接时，可用本机恢复工具检查状态（会提示管理员密码）：

~~~powershell
$delivery = Get-Content .local/cloud/runtime/active-delivery.json -Raw | ConvertFrom-Json
./python/python.exe tools/maintenance_recovery.py status --storage-env $delivery.env --database $delivery.candidateDatabase --schema $delivery.originalSchema --platform --username preview-admin
~~~

需要 CLI 恢复开放时，recover/reopen 要求当前版本号和原因，reopen 还要求确认恢复检查；具体步骤见 [本机维护恢复工具](maintenance-recovery-local.md)。不要直接改数据库 maintenance 状态绕开恢复流程。

## 10. 常见问题速查

| 现象 | 先检查什么 |
|---|---|
| 8768 或 8770 打不开 | PostgreSQL 是否运行、对应进程是否退出、端口是否被其他进程占用、停止标记是否残留 |
| 能打开画布但任务不执行 | 独立 worker 是否运行、平台/空间是否维护、成员空间是否分配了供应商 |
| 登录后没有历史数据 | 是否选择“历史迁移”空间、当前账号是否被分配权限 |
| 素材图片加载失败 | 登录与空间是否正确、OBJECT_STORE_ROOT 是否指向新对象目录、备份对象是否完整；换环境后重新登录并刷新，不复用旧签名 URL |
| 火山等供应商凭证无法解密 | 是否携带原 provider-secret.key，路径是否正确，不要换成新随机密钥 |
| 上游连接失败 | 供应商 Base URL、协议、凭证和显式代理；管理配置空代理表示直连 |
| 视频预览失败 | FFmpeg 路径是否存在，并进入当前服务的 PATH |
| 启动提示数据库/Schema 不匹配 | delivery.env、启动索引及已导出环境变量是否混用了旧环境 |
| 恢复报版本不一致 | 代码 migration 与备份不一致；先使用对应备份的代码版本恢复，再按版本说明升级 |
| 管理平台显示没有备份记录 | 离线工具备份不会自动登记在该列表，查看实际备份包和校验结果 |

## 11. 当前交付基线

2026-09-15 切换时共 33 张画布、244 条资产、51 条任务；这是当时的基线，后续正常使用会增长。历史导入含 28 张画布、208 份素材、47 条历史任务；保留原平台数据。源数据中原本缺少 5 个媒体引用，名单见 [迁移差异记录](migration-delivery-import.md)。

本地八项精简验收已经完成，生成恢复使用本地 HTTP 模拟上游。真实供应商配置已迁移，但不表示所有真实模型已经付费实测。日常文档、配置调整只检查受影响流程，不重新跑全套验收。

相关记录：[最终交付](migration-delivery-handoff.md)、[精简验收计划](migration-delivery-plan.md)、[备份恢复原理](database-restore-local.md)。
