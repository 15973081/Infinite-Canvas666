# TOS 配置与权限检查

入口：管理平台 → 全平台 → 角色与权限 → TOS 配置与权限检查。需要 maintenance.platform；空间角色无权操作。

配置存入 PostgreSQL managed_storage。AK/SK/STS Token 使用现有 PROVIDER_SECRET_KEY 的 Fernet 加密；读取接口只返回是否已配置凭证。备份数据库时必须同时妥善备份加密密钥。配置使用版本号避免覆盖其他管理员修改，保存与检查均写入操作审计。

首次填写 AK/SK；编辑时凭证留空保留原值。替换时 AK/SK 必须同时填写，STS Token 留空表示使用长期凭证。仅接受与地域匹配的官方 HTTPS Endpoint；服务端可选 ivolces.com 内网地址，浏览器/模型必须使用 volces.com 公网地址。

只读检查包含 HeadBucket、GetBucketVersion、GetBucketACL、GetBucketPolicy。检查凭证需要对应读取权限；无权限或网络失败显示待核对，不判定为通过。自定义桶策略需人工核对，不能仅凭 ACL 判断整个桶私有。对象 ACL 不在此检查范围。不会修改远端桶策略或权限。

保存是待启用配置，不会修改 MEDIA_BACKEND，也不会被工作台或 worker 自动应用。当前素材迁移、统一部署配置、上传/版本下载及模型 URL 端到端验证完成后才能切换。检查成功不代表这些步骤已经完成。暂不提供界面热切换，避免旧素材引用失效。

验证：python -m pytest tests/test_storage_control.py tests/test_media_browser_cache.py -q。真实 TOS 检查需要管理员在页面输入云端凭证，本地测试不会创建云对象。
