# 画布资产永久删除

回收资产详情提供“彻底删除”，批量管理提供“批量彻底删除”。操作需要 asset.manage 权限、当前目录版本及显式确认，仅允许删除已回收的托管素材。

删除前检查原素材和派生素材在画布（包括回收/清理后仍保留的画布文档）、任务、空间文档和备份中的引用。有引用则整批拒绝，不改动画布节点或账单。外部 URL 不进行远程删除。

先提交 deleting 状态，再按数据库记录的精确对象版本清理 TOS 或本地模拟文件。成功后标记 deleted 并从目录隐藏；失败项保留，可重试。数据库记录保留用于审计；不会整桶删除，也不会删除其他对象版本。TOS 凭证需要对应对象版本的删除权限。

本次不涉及数据库结构迁移、云端部署或远程推送。已缓存的浏览器内容不保证立即消失。

验证：
- python -m pytest tests/test_canvas_asset_catalog.py tests/test_canvas_asset_purge.py -q
- python tools/cloud_test.py tests/test_cloud_asset_purge.py -k asset_purge
- node tests/test_asset_manager_consistency.cjs

关联云存储/任务回归在原代码和本次代码上均有 7 项已有失败，涉及模拟供应商模型限制、pg_dump 环境及 TOS SDK mock；原代码基线为 23 passed / 7 failed。本次新增隔离数据库删除集成测试通过。
