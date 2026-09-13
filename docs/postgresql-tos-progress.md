# PostgreSQL + TOS 目标计划实施进度

目标依据：`postgresql-tos-design.md` 和 `postgresql-tos-implementation.md`。本地验收使用现有 `.local/cloud` 的 PostgreSQL 16 与私有对象模拟；保留共享工作区、两种画布和默认本地模式。真实云资源上线不属于此次本地运行操作。

## 已核实的实现与证据

| 计划项 | 当前证据 |
|---|---|
| PostgreSQL 存储、画布版本冲突、引用事务 | `test_cloud_storage.py` 实库并发测试通过 |
| 两种画布保存、备份、恢复、素材关联 | 原有集成通过；`.local/cloud/acceptance/storage-check.json` 记录浏览器新建并保存的两张画布 |
| 旧路径完整别名、SQLite 任务与五张账本迁移 | 原有人工备份副本迁移测试通过，包含重试、金额及内容冲突 |
| staging、分片、续传、受限签名、确认发布 | 新增 `uploads.py`、migration 002、两种画布共用的 `CanvasApi.uploadAi`；10 项新实库/SDK 契约用例通过 |
| 分片校验、固定版本、重复确认、旧租约拒绝 | `test_cloud_uploads.py` 通过，含网络响应丢失和写入失败恢复 |
| 浏览器上传与预览 | 普通画布 667 B 单片、智能画布 9.7 MB 双片，浏览器预览成功；两份截图存 `.local/cloud/acceptance/` |
| FFmpeg 裁剪、ZIP 导入导出、参考图 | 原有集成通过 |
| 任务领取、心跳、视频上游 ID 恢复、不盲目付费重提 | 原有实库任务消费者与故障用例通过；仍需核实下一节恢复缺口 |
| 入口认证、签名 GET、Range、退出会话失效 | 原有及本轮集成通过；浏览器登录通过 |
| PostgreSQL 同 snapshot 导出 + 对象字节、隔离恢复 | 新备份包含全部 ready 固定版本与 SHA-256；29 项集成通过，含新数据库 + 新对象目录中的两种画布读取和含素材 ZIP 导出 |
| 临时空间与原件保留 | 分片按大小限制、操作目录清理、过期 staging 清理测试通过；默认不物理删除原件 |

## 尚需实现或扩大验证的项目

1. **任务 finalizing 恢复**：当前 `worker.execute` 对没有可恢复视频上游 ID 的 `finalizing` 进入 `needs_review`。继续核对/实现已取得结果来源的图片、视频输出恢复，保持输出槽位和费用幂等，不能用重新付费生成替代结果入库恢复。
2. **任务规范请求**：`clean_request` 目前只剔除一组密钥字段，需核对临时素材 URL 的规范化、provider_account_ref、媒体 ready 校验及结果/费用状态的一致性。
3. **长历史与列表**：`workspace_documents.list_values` 仍无界返回；继续核对对话、历史、素材库及画布列表的有界读取与前端消费，保留旧协议需要的结构。
4. **完整迁移审计**：现有测试只覆盖人工样本。补齐缺失引用、未知外链、文档与备份类别盘点/报告的证据，不执行真实旧数据迁移。
5. **本地恢复演练与备份对象字节：已完成**。开发库备份 `.local/cloud/backups/20260914-054255.dump` 携带 7 个对象共 10,029,722 字节。离线恢复到 `.local/cloud/acceptance/restore-20260914-054255/objects` 后，在新建隔离数据库中读取普通/智能画布并导出含原件 ZIP，逐个哈希一致，报告同目录 `report.json`；隔离验收数据库已移除，开发库与原对象保持原状。真实云端 TOS 恢复版本重映射、异地备份及定时部署仍属于外部部署边界。
6. **回归测试基线：已修复并复验**。Python 签名断言更新为已有 graph 参数，继续检查逐次传递 loopContext；普通画布夹具提供可选账本集成的 window 和可抛错的错误提示；智能画布夹具提供 canvasId，并新增断言核验请求的 canvas_id/client_task_id。未更改画布业务代码。全量 Python **117 通过、29 项云集成跳过、7 项 subtest 通过**，全量 CJS **156 通过**；另行运行的实库集成 **29 通过**。
7. **总体完成审计**：按设计第 10 节 A–D 逐项补齐证据；本页不是完整实现声明。真实供应商网络拉取、真实 TOS 权限/配额/网络和云端容量测试保留为外部联调边界，不能拿本地模拟替代。

## 当前命令

```bat
python\python.exe tools\cloud_test.py
python\python.exe -m pytest -o pythonpath=. tests -q
node --test tests/test_canvas_resumable_upload.cjs
node --test tests/*.cjs
python\python.exe tools\cloud_storage.py init-db
python\python.exe tools\cloud_storage.py check
python\python.exe tools\cloud_storage.py cleanup-uploads
```

验收服务若使用回环地址，与 `PUBLIC_BASE_URL` 同时指定为该地址，避免与私有配置中的局域网入口混用。私有配置及原始用户素材没有在本轮修改或迁移。
