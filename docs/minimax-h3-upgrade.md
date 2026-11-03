# MiniMax H3 / H3 Max 升级

功能来源：`codex/seedance-draft-upgrade`，截至 `e21985061c7b939a95d24282da99a687e9feeb0f`。
迁入 `3eac44d1` 的模型能力、`df39e076` 的 APIMart 通道隔离，以及 `e2198506` 的会员 768P 修复，并适配当前分支的 Pixmax 原生生成表单。

## 配置与规格

在供应商配置中使用 `apimart` 协议，并在视频模型列表中添加 `MiniMax-H3` 或 `MiniMax-H3-Max`。真实 `apimart.ai` 主机及其子域也会识别为该通道。自定义代理地址应明确配置 `apimart` 协议。

| 模型 | 时长（整数秒） | 分辨率 | 默认分辨率 |
| --- | --- | --- | --- |
| MiniMax-H3 | 4–15 | 2K、768P | 2K |
| MiniMax-H3-Max | 5–15 | 768P、480P、1080P | 768P |

这些是源分支的 **APIMart 网关规则**。其他供应商使用相同模型名称时继续沿用自身规则。管理员限制与模型支持的规格取交集；768P、2K 可用于开放规格、分档价格和限时折扣。

两种模型支持最多 9 张参考图、3 段视频、3 段音频，音频参考需搭配图片或视频。提示词上限为 7000 字符。纯文本的自适应比例按 16:9 提交；支持自适应、21:9、16:9、4:3、1:1、3:4、9:16。

H3 Max 的 1080P 请求完全省略 `watermark` 字段。网关不支持的种子、生成音频和返回尾帧选项不传给上游；表单隐藏不适用的音频、增强和固定镜头选项。

## 封装与兼容

- `app/services/apimart_video.py`：模型能力、输入校验、上游基础请求构建；校验在素材上传和付费提交前完成。
- `static/js/apimart-video-policy.js`：浏览器共享的 APIMart 能力；经典画布、智能画布、Pixmax 表单共用分辨率和时长限制。
- 会员配置仅公开 `video_adapter` 标记，不公开供应商端点或凭证。
- Pixmax 使用网关素材限制覆盖旧快照中的 H3 Max 限制，不修改冻结快照，也不改变其他通道的同名模型约束。
- 打开可编辑的旧 H3 节点时，修正已失效的分辨率、时长、比例及不适用的选项，保留提示词。
- 保留当前分支已移除首尾帧入口的行为；后端仍兼容源分支的首尾帧请求。

## 验证

新增回归覆盖后端请求体、非法参数提前拒绝、素材上传失败、通道隔离、会员配置和 768P 下拉项，以及原生表单的旧参数修复、模型切换、多模态限制和请求参数。

```powershell
.venv/Scripts/python.exe -m pytest tests/test_apimart_video.py tests/test_provider_video_capabilities.py -q
node --test tests/apimart-video.cjs tests/apimart-video.browser.cjs
```

浏览器测试需要 Node 能找到 `playwright`，并已安装 Chrome。测试使用模拟上游，没有发起真实付费生成。
