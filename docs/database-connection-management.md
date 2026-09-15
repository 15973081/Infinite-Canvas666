# 数据库连接管理

入口：管理平台 → 数据库连接。仅全平台范围、具备 maintenance.platform 权限的管理账号可以使用。支持新增、查看、编辑、删除连接，以及只读连接测试。

配置保存在当前管理数据库的 database_connections 表。密码通过 PROVIDER_SECRET_KEY 加密保存，接口不回显；编辑时密码留空保留原值。保存和删除使用版本号避免覆盖其他管理员修改，操作写入本地审计。删除仅删除本地连接档案，不删除目标数据库。

主机名用于 TLS 主机校验，连接 IP 可选，适用于指定网络地址但保留域名校验。CA 证书粘贴 PEM 格式，强制 verify-full。测试使用独立短连接、5 秒连接超时、3 秒 SQL 超时、只读事务；只查询版本、数据库身份、TLS 和指定 Schema 可见表数量。不会执行 DDL 或 DML，也不会切换运行中的 DATABASE_URL。

测试从管理服务所在机器发起，请将该机器实际出口地址配置到远端白名单。应用迁移与正式切换为独立操作。当前页面的增删改查对象是连接档案，不是远端表记录。

验证：pytest tests/test_database_control.py tests/test_storage_control.py tests/test_media_browser_cache.py。真实云 PostgreSQL 16.8 / TLS1.3 只读测试成功，43 张表可见。
