# 回收站恢复修复

成员模式中，恢复请求原本进入「先打开画布并开始编辑」的守卫，导致回收站无法恢复。已将精确的 `POST /api/canvases/{id}/restore` 接入现有目录临时编辑资格流程：申请资格、携带版本凭据恢复、核对并释放资格。不跳过后端成员权限、维护或版本校验，也不会强制接管其他编辑者。

恢复期间禁用当前按钮并展示「正在恢复画布」，完成后刷新正常列表和回收站。权限不足、状态冲突等失败会显示在可见提示区，按钮恢复可用。其他编辑器操作仍需显式开始编辑。

验证结果：

- `node --test tests/member-canvas-edit.cjs tests/canvas-edit-lease.cjs`：66 项通过。
- `node --test tests/canvas-trash-restore.browser.cjs`：2 项通过。生产 HTML 和成员守卫配合受控接口验证经典/智能画布恢复、键盘 Enter、加载禁用、列表刷新、权限失败及资格释放。
- `python/python.exe tools/cloud_test.py -k trash_restore_with_directory_lease_preserves_document`：2 项通过。真实 HTTP 和独立 PostgreSQL 测试 schema 验证软删除后申请资格并恢复，内容保留、回收站移除、版本更新、资格释放，无凭据请求仍被拒绝。
- 实际运行的工作台回收站已检查到恢复入口可用；没有恢复或清理用户已有画布。恢复成功的写入验证在上述独立测试环境完成。

无需数据库迁移。截图为浏览器回归测试数据：[恢复后的画布列表](restored-list.png)、[权限失败提示](permission-feedback.png)。
