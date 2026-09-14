# 本地媒体预览故障修复与验收

2026-09-15，第 40 批。对应第 38–39 批实际发现的预览发布 FileNotFoundError 和视频封面失败；继续使用 PostgreSQL 与 .local 文件系统对象模拟。

## 故障与处理

1. Windows 上对象根目录、空间、素材 ID、随机对象名和版本号叠加后，普通路径超过可用长度。263 字符的路径可复现父目录存在、独占创建仍报 FileNotFoundError；同一文件使用 Windows 扩展路径后读写成功。FilesystemStore 在本地文件操作中统一使用扩展路径，支持已有前缀和 UNC 根目录；数据库对象键、版本和稳定引用不变。恢复对象使用相同存储构造和扩展临时路径。保留独占创建、路径边界、散列校验和禁止覆盖恢复目标，并提前拒绝空路径段、点和上级目录。
2. 旧封面抽取固定跳到第 0.5 秒；0.1/0.5 秒视频在该位置没有帧。当前 FFmpeg 的 JPEG 输出还会报像素范围协商错误。改为 PNG 帧管道，优先第 0.5 秒，成功但无帧时回退起点，再按预览宽高限制缩放。解码失败仍报告错误；不无限重试，也不依赖全局 JPEG 临时文件。
3. 实际成员接口测试发现本机 Python 3.10 的 MIME 表没有 WebP，预览因此被标记为 application/octet-stream。普通发布和分片上传现在明确识别 WebP（含大写扩展名）。已有本地 WebP 对象若保存了这个通用类型，签名读取时以 image/webp 返回；不重写原件或版本。这一兼容处理针对本地模拟读取，不代表已修复真实 TOS 中历史对象的 HTTP 元数据。

## 验收

- 12 项本地故障测试：真实 FFmpeg 生成 0.1、0.5、1 秒横竖屏视频，校验封面尺寸和颜色、原件保持；覆盖无帧、解码失败、缺少工具、长路径并发固定版本读写、目录逃逸拒绝和离线对象恢复。
- 真实 PostgreSQL 成员接口：PNG、WebP、0.1 秒视频各 8 次并发预览，实际 160×90 图片可解码，同一尺寸只产生一个就绪预览记录；原件字节、散列与版本保持。查看者可读取，其他成员不能复用签名，外空间成员拒绝；旧通用 MIME 的 WebP 仍正确返回。
- WebP 分片上传成功后保留图片类型及固定版本；伪造 PNG/WebP 在完成上传时拒绝发布。
- 完整 Python 回归：180 通过、330 云用例跳过、7 subtest 通过。完整 PostgreSQL 回归：328 通过；随后补充的 WebP 分片验收 3 项通过（含 2 个新增用例，当前套件共 330 项）。前端代码未改，本批不重复第 39 批的 477 项 CJS 基线。

命令：

~~~text
python/python.exe -c "import sys;sys.path.insert(0,'.');import pytest;raise SystemExit(pytest.main(['tests','-q']))"
python/python.exe tools/cloud_test.py
python/python.exe tools/cloud_test.py -k "staged_content_is_validated_before_publication or staged_webp_keeps_image_type_and_fixed_version"
~~~

浏览器使用自有 localhost:8773 隔离成员空间。经典和智能画布均实际显示蓝色 WebP 图片及 0.1 秒视频封面；经典两张图 DOM 报告 naturalWidth=480、naturalHeight=270，地址仍为成员预览接口，没有回退到原件。智能画布截图确认两张蓝色预览可见，其 iframe DOM 尺寸读取超时，不将其记为尺寸测量通过。两个原画布正文及 revision、两个原对象版本/散列均与准备时一致；产生 4 份按尺寸缓存的 image/webp 派生预览，0 任务，未调用供应商。

本地证据：

- .local/cloud/acceptance/media-preview-faults/diagnosis.json
- .local/cloud/acceptance/media-preview-targeted.log
- .local/cloud/acceptance/media-preview-python-final.log
- .local/cloud/acceptance/media-preview-postgres-resumed.log
- .local/cloud/acceptance/media-preview-staged-webp.log
- .local/cloud/acceptance/media-preview-browser-before.json、media-preview-browser-after.json
- .local/cloud/acceptance/media-preview-classic.jpg、media-preview-smart.jpg
- .local/cloud/acceptance/media-preview-user-resumed.json、media-preview-user-http.json

## 运行与剩余范围

用户重启后已确认旧应用/数据库进程停止，恢复原 pgdata 和持久 workbench_ui_343d3aa95f4c494b9a6758409d6e7a44 schema，复用对象目录和供应商密钥；8768/8769/8770 均 HTTP 200。5 张画布、9 份素材记录、0 个已保存供应商仍在，核查时无有效编辑租约或未保存页面报告。另用独立成员会话实际读取全部 9 份素材，HTTP 成功且 SHA-256 与数据库逐项一致，包含旧 WebP 预览；验收会话随后登出。没有 migration、数据恢复覆盖或真实生成调用。自有两轮浏览器验收 schema 已核实不存在。

首次全量数据库测试被机器重启中断，没有完成结果，已重新执行；不能把中断前的进度点算作通过。预览故障本批关闭，完整协作故障矩阵、手动查询/LLM 输入绑定、剩余管理和维护能力、正式数据迁移与切换、原生 TOS 恢复等原计划范围继续保留；整体目标未完成。
