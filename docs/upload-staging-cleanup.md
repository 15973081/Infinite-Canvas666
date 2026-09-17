# 上传暂存回收与彻底删除

## 本次只读核对（2026-09-18）

- 本地 HEAD、origin/main、服务器 source-main 均为 `5f000f75b872ec9e938026fab48df25fe8a608d7`。
- 四个生产服务 workbench、management、worker、backup 的 User 均为 `canvas`，WorkingDirectory 和前三个实际进程 cwd 均为 `/srv/projects/infinite-canvas/releases/5f000f7`。
- 虚拟环境入口 `/srv/projects/infinite-canvas/venv/bin/python`，进程解释器解析为 `/opt/python/3.14.7/bin/python3.14`。
- 环境文件 `/srv/projects/infinite-canvas/shared/production.env`，仅由程序加载以只读查询，未输出其密码/密钥内容。
- 无 `/srv/projects/infinite-canvas/current` 链接；未发现上传暂存清理 timer。
- 以下记录仍为 assets.deleted / media_uploads.ready、cleaned_at 空、无有效上传租约，且超过上传有效期加一小时：

| 素材（default 空间） | 暂存数据版本 | 数据字节 | 删除标记 |
|---|---|---:|---|
| ast_cf33057f382443cba67d09c63f14df79 | 56082D902AC20558F74E | 1,794,352 | 无 |
| ast_5c1b01d83c314247b1df97f71a7c36d1 | 56082D579E90CB2D5275 | 4,773,421 | 5607B7C4597F287DA7C4 |

桶均为 `canvas-media`；完整 Key 为 `staging/default/<素材ID>`，数据共 6,567,773 字节。这是检查时的快照，不能代替执行前的新 dry-run。此次未执行线上删除、迁移、发布或安装 timer。

## 根因与修复边界

分片完成后，`uploads.complete()` 将校验通过的数据从 staging 保存为独立 media 版本。浏览器上传凭证仍可能有效，因此不能立即删除 staging。原有清理入口没有接通定期执行；彻底删除只处理正式素材及预览；旧清理以 HEAD 的 404 推断不存在，可能漏掉删除标记下的历史版本。

唯一业务入口仍为 `app.storage.uploads.cleanup()`，实现提取到 `upload_cleanup.py`。HTTP 彻底删除和维护 CLI 复用相同的边界校验、租约、版本列举、精确删除及确认逻辑。

- 原图和预览仍按原有引用保护删除。暂存回收不删除 media、素材引用、任务或备份。
- 清理前核对上传及素材的 workspace、配置 backend/bucket 和完整 Key `staging/<workspace>/<asset_id>`。
- 等待上传有效期（同时考虑 assets.upload_expires_at）和至少一小时宽限期，并避开有效上传/校验租约。
- 每条记录有独立清理租约，处理前再次在行锁内校验并封存过期上传；对象操作前续租。失败不阻断后续记录。
- 优先处理登记的 staging_version_id，完整分页列举该 Key 的所有数据版本及删除标记。只保留与完整 Key 相等的结果，同前缀对象不会被删除。
- 删除必须传 version_id；数据版本删除后以精确版本 HEAD 确认，并再次列举完整 Key，确认没有剩余版本/标记才记录完成。仅当前对象 HEAD 404 不足以完成。
- 中断 multipart 按登记 upload_id 终止；NoSuchUpload 可幂等接受，桶不存在、权限和网络异常不会被当作成功。
- 缺失登记版本可通过完整版本清单恢复；版本号为 `null` 或无有效版本号时拒绝删除并记录原因。
- `cleanup_state/token/lease_until/attempts/attempted_at/error/report/bytes` 与 `cleaned_at` 持久化记录状态和部分成功。失败重试只处理仍存在的版本；字节摘要为已确认删除的数据版本大小，不包括删除标记或 TOS 未提供大小的未完成分片。
- 界面保留暂存未完成的回收站条目，显示“正式文件已删除，暂存清理待完成”。失败可重试；暂存清理完成后才移除该条目。

Migration `023_upload_cleanup.sql` 不改旧迁移。它为历史 TOS 上传重新开放暂存审计（包括旧 cleaned_at 非空的记录，因为旧 HEAD 判断不可靠）；filesystem 已清理记录保持完成。这不会重新上传或触碰正式对象。

需要的 TOS 权限为：精确 Key 的版本列举、指定版本 HEAD/删除，以及对应 multipart 的 AbortMultipartUpload。不能把 HEAD 404、DeleteMarker 或普通 DeleteObject 的成功响应等同于全部版本被删除。代码以项目已安装的 TOS SDK `list_object_versions(...key_marker, version_id_marker...)` 和 `delete_object(...version_id=...)` 接口为准。

## 发布顺序

以下为待执行方案，替换 `<新提交>` 为包含本次代码和 migration 023 的实际发布版本。不要在旧 `5f000f7` 目录直接调用新参数或修改旧版本代码。先保留本地已有缩略图改动并审阅完整 diff，按现有发布流程构建新 release。

```sh
systemctl show infinite-canvas-workbench infinite-canvas-management infinite-canvas-worker infinite-canvas-backup \
  -p Id -p User -p WorkingDirectory -p MainPID
git -C /srv/projects/infinite-canvas/source-main rev-parse HEAD
readlink -f /proc/$(systemctl show infinite-canvas-workbench -p MainPID --value)/cwd
command -v flock
```

先按既有流程备份数据库并进入维护窗口；如果已安装清理 timer，升级期间先停止 timer 和 service，避免旧、新清理程序同时运行。正常业务上传凭证和处理租约仍由数据库控制。

```sh
NEW_RELEASE=/srv/projects/infinite-canvas/releases/<新提交>
APP_PY=/srv/projects/infinite-canvas/venv/bin/python
PROD_ENV=/srv/projects/infinite-canvas/shared/production.env
cd "$NEW_RELEASE"
sudo -u canvas "$APP_PY" tools/cloud_storage.py init-db --env "$PROD_ENV"
sudo -u canvas "$APP_PY" tools/cloud_storage.py check --env "$PROD_ENV"
```

按现有发布方式更新四个生产 unit 的 WorkingDirectory/入口并重启，核对 systemctl 与实际进程 cwd 都已指向新 release。新代码依赖 migration 023，不要跳过数据库迁移。此处不附通用覆盖生产 unit 的脚本，以免覆盖当前线上配置。

## 历史两条记录：先 dry-run，再显式清理

以生产用户从**新发布目录**运行。默认不删除对象、不终止分片，也不更新清理状态。不要 source 环境文件或将其中内容写入日志。

```sh
cd /srv/projects/infinite-canvas/releases/<新提交>
sudo -u canvas /srv/projects/infinite-canvas/venv/bin/python tools/cloud_storage.py cleanup-uploads \
  --env /srv/projects/infinite-canvas/shared/production.env --workspace default \
  --asset-id ast_cf33057f382443cba67d09c63f14df79 \
  --asset-id ast_5c1b01d83c314247b1df97f71a7c36d1
```

审核 JSON 中 bucket、workspace、key、recorded_version、objects（含每个版本/删除标记及字节数）、safe_after、state 与 reason。预期为上表的两条数据版本及一条删除标记；如果线上内容变更，使用本次清单重新审阅，不按旧清单盲删。若状态是 pending/failed，先处理对应有效期、租约、配置或权限原因。

确认后只对这两条执行相同命令并增加 `--apply`：

```sh
sudo -u canvas /srv/projects/infinite-canvas/venv/bin/python tools/cloud_storage.py cleanup-uploads \
  --env /srv/projects/infinite-canvas/shared/production.env --workspace default \
  --asset-id ast_cf33057f382443cba67d09c63f14df79 \
  --asset-id ast_5c1b01d83c314247b1df97f71a7c36d1 --apply
```

`--report /绝对路径/report.json` 可选，用 canvas 可写的专用受限目录保存审计结果。报告包含对象标识，无上传凭证。命令有失败时返回退出码 2，并继续处理该批其他符合条件的记录。重复相同命令是幂等的。

验收：`completed=2, remaining=0, failed=0`，若对象没有发生变化则 `cleaned_bytes=6567773`。再次执行应 `examined=0, remaining=0`；数据库两条记录 `cleanup_state=complete` 且 cleaned_at 非空。代码已复核精确版本不存在及 Key 下版本/标记为空。可再用 TOS 控制台的**版本列表**核验完整 Key，不能仅看当前对象列表。桶总量统计可能有刷新延迟，应以精确版本检查为准。

其他历史记录先用 `--all-workspaces`（或指定 `--workspace`）且不加 `--apply` 审查；命令只从数据库中选取已过期的登记暂存对象，每批默认 200 条。它不会扫描整个桶，也不会清空前缀。`--limit` 最大 1000；失败/已尝试记录排在未尝试记录之后，避免单条失败长期阻塞其他记录。

## 定期执行

提交内提供 `deploy/systemd/infinite-canvas-upload-cleanup.service` 和 `.timer`。按本次已核实的 canvas 用户、venv、production.env 配置。service 每次读取 workbench 的 WorkingDirectory，因此后续版本升级无需替换硬编码 release，也不依赖不存在的 current 链接。

**先完成以上指定记录清理验收，再启用定时器**。启用即授权定期回收所有空间中满足条件的、数据库登记的 staging，不影响正式对象。

```sh
cd /srv/projects/infinite-canvas/releases/<新提交>
install -m 0644 deploy/systemd/infinite-canvas-upload-cleanup.service /etc/systemd/system/
install -m 0644 deploy/systemd/infinite-canvas-upload-cleanup.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/infinite-canvas-upload-cleanup.service /etc/systemd/system/infinite-canvas-upload-cleanup.timer
systemctl daemon-reload
systemctl enable --now infinite-canvas-upload-cleanup.timer
systemctl list-timers --all infinite-canvas-upload-cleanup.timer
journalctl -u infinite-canvas-upload-cleanup.service --since today --no-pager
```

开机约 5 分钟后首次运行，每次结束约 10 分钟后再次运行（随机延迟最多 60 秒）。单 service 不重复启动，flock 防止同机重复执行，数据库逐条租约防止 CLI/HTTP/其他进程重入。最大运行时间 15 分钟；中断后的租约到期可重新认领，不会提前标记完成。

日志输出每条诊断及汇总：pending_before、remaining、failed_total、examined、completed、pending、failed、candidate_bytes、cleaned_bytes。`cleanup_error` 保存错误类别/HTTP 状态/request_id；`cleanup_report` 保存本次已确认删除的版本，支持部分成功后继续。数据库不可用时不将清理结果伪装为完成。

后续升级检查表：迁移执行成功；四个业务进程 cwd 指向新 release；新 release 包含清理入口；清理 service 的生产用户/env/Python 仍正确；timer enabled；最近一次日志没有持续 failed；remaining 随过期回收下降。更换服务名、用户、Python 或环境文件路径时同步修改清理 unit。停止自动回收可执行 `systemctl disable --now infinite-canvas-upload-cleanup.timer`；不要关闭桶版本控制。

## 本地验证

对象版本/删除标记/权限/分页测试使用假 TOS；集成测试使用一次性本机 PostgreSQL schema 与临时 filesystem 对象，不重新上传线上素材，不调用付费生成接口。

```powershell
.\python\python.exe -B tools/cloud_test.py -k 'test_cloud_upload_cleanup or test_cloud_uploads or test_cloud_asset_purge or test_upload_idempotency_signatures_completion_and_cleanup_are_scoped' -p no:cacheprovider
.\python\python.exe -B -c "import sys;sys.path.insert(0,'.');import pytest;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider','tests/test_upload_cleanup_versions.py','tests/test_canvas_asset_purge.py','tests/test_canvas_asset_catalog.py']))"
node --test tests/asset-cleanup-status.cjs tests/asset-manager-member-media.cjs
```

扩大到整个 workspaces 测试时，`test_worker_restores_persisted_space_for_results_history_and_fees` 因测试模型 `test` 不在管理员开放列表而失败；用 HEAD 的生产模块在内存中恢复后也复现同样失败，未改动该无关模型/计费测试。
