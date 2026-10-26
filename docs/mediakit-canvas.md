# 画布 MediaKit 视频工具

画布视频节点工具栏提供 **超分、视频理解、字幕擦除**。旧的“解析”仍使用原有分镜解析流程。

## 配置

1. 在管理平台供应商配置中选择“火山 MediaKit”预设。
2. 填写 MediaKit API Key，默认地址为 `https://mediakit.cn-beijing.volces.com`，协议为 `mediakit`。这是 MediaKit 独立密钥，不是火山方舟 Seedance 的密钥。
3. 将厂商分配到目标工作空间，启用对应工具。超分和擦字幕登记为视频模型，理解登记为文本模型；前台只在工具弹窗中显示它们。
4. 在成员画布选择已入库的视频，点击工具、选择参数并提交。视频理解参照深度视频的位置逻辑，立即在原视频实际右边界外 60px、顶部对齐处创建文本节点并连线；节点显示提交、排队、云端分析和保存状态，关闭弹窗或刷新后仍可查询。完成后直接填入同一文本节点，保留拖动后的位置；若目标已删除或填入用户文字，另存结果以免覆盖。点击“查看结果”可居中定位。

## 接口实现

参考官方 [volcengine/mediakit-cli](https://github.com/volcengine/mediakit-cli) 的 `internal/cloud/client.go`、`media_upload.go`、`executor.go` 和视频工具 schema。无需在服务器执行 shell 或安装 CLI；后端直接发送同样的 REST 请求。

|步骤|请求|主要参数|
|---|---|---|
|申请上传|`POST /api/v1/tools-sync/request-media-upload-url`|`tool_name`|
|上传视频|`PUT <upload_url>`|流式文件内容及供应商返回的上传请求头|
|超分|`POST /api/v1/tools/enhance-video`|`video_url: file_id`、`resolution`、`tool_version`|
|视频理解|`POST /api/v1/tools/video-understand-router`|`video_urls: [file_id]`、`prompt`、`level`|
|字幕擦除|`POST /api/v1/tools/erase-video-subtitle`|`video_url: file_id`|
|查任务|`GET /api/v1/tasks/{task_id}`|使用原始任务 ID|

API 请求使用 `Authorization: Bearer <API Key>`。上传存储地址不携带此密钥。密钥复用平台已有的加密供应商存储，不进入浏览器或任务结果。

超分支持标准版/专业版，以及 1080P、2K、4K、8K 输出。输入最高 2K；字幕擦除输入最高 2K、输出最高 1080P。理解可选 Economy / Balanced / Quality。具体限制和收费以供应商开通能力为准。

任务沿用成员权限、工作空间隔离、编辑租约、持久化队列、结果入库和服务端画布交付。拿到上游 ID 后只轮询原任务；不确定的提交进入待核对，不自动重发。关闭弹窗不取消后台任务，再次打开可查询原任务。如果后台没有该任务，弹窗允许用户点击“重新提交”，复用原任务编号及空结果节点，由服务端幂等检查防止延迟请求重复创建任务。供应商视频链接可能过期，因此成功视频立即保存到本平台素材库。

## 验证

- `tests/test_cloud_mediakit_tasks.py`：真实隔离 PostgreSQL 与成员 HTTP 流程，模拟上游请求，验证三个工具契约、上传密钥隔离、原任务恢复、结果入库、画布交付、权限和不确定提交。
- `tests/pixmax-mediakit.browser.cjs`：真实 Chrome 中验证三个弹窗的参数提交、缺少配置、失去编辑权限、断线重开查询。

这些测试不会消费 MediaKit 额度；真实付费处理需配置有效密钥后执行。
