# 火山资产库视频生成问题复盘

## 背景

本次问题发生在标准画布的视频生成链路中：用户从素材库拖出已上传到火山资产库的虚拟人像素材，再调用火山 Seedance 2.0 官方视频接口生成视频。

目标链路是：

1. 素材库图片上传到火山私域虚拟人像资产库。
2. 火山 `CreateAsset` 返回 `asset-...`。
3. 本地素材库保存 `asset://asset-...`。
4. 视频生成时在 `content[].image_url.url` 中引用 `asset://asset-...`。
5. Prompt 中用“图片1/图片2”等序号指代素材。

## 现象

排查过程中出现过几类错误：

1. `expected at most one firstframe image content but got 6`

   后端把多张参考图都当成 `first_frame` 传给火山。火山首尾帧模式最多只允许一个首帧。

2. `first/last frame content cannot be mixed with reference media content`

   同一个请求里混用了 `first_frame` / `last_frame` 和 `reference_image`。火山要求首尾帧模式和参考图模式不能混用。

3. `content[1].image_url specified in the request is not valid`

   一度把 `asset://...` 当普通 URL 处理，或者转成不符合当前模式的 URL，导致火山参数校验失败。

4. `图片里可能包含真人身份/隐私信息`

   请求仍走普通图片链路时，火山按普通参考图做人脸/隐私安全审核，触发拦截。

5. `The specified asset asset-... is not found`

   这是最后定位到的关键问题：请求已经正确传了 `asset://asset-...`，但视频生成 API Key 所属项目下找不到该资产。根因通常是火山 `ProjectName` / 账号 / 推理接入点不一致。

## 根因

### 1. 首尾帧逻辑不适合火山多参考图

旧逻辑里，当参考图数量小于等于 2 时，会自动分配：

- 第一张：`first_frame`
- 第二张：`last_frame`

但火山 Seedance 2.0 当前推荐的是全能参考图模式，即统一使用：

```json
{
  "type": "image_url",
  "role": "reference_image",
  "image_url": {
    "url": "asset://asset-..."
  }
}
```

首尾帧和参考图模式不能在同一段代码里自动混用，否则逻辑很快不可维护。

### 2. 标准画布没有稳定携带素材库认证信息

智能画布原本已有 `asset_uris` 链路，但标准画布从素材库拖拽图片时，只保留了普通图片 URL，没有稳定保存：

```json
{
  "volcengine": "asset://asset-..."
}
```

这会导致后端把素材当普通 `/assets/...` 图片转成 data URL，火山看到的是普通参考图，不是认证资产。

### 3. 火山资产库不是“真人授权认证”

本次接入的是火山文档里的“私域虚拟人像素材资产库”：

- `CreateAssetGroup`
- `CreateAsset`
- `GetAsset`
- `GroupType: AIGC`
- `AssetType: Image`

它的含义是“私域虚拟人像资产可用于 Seedance 2.0 推理引用”，不是“真人人脸授权白名单”。即使素材 `Active`，生成阶段仍会经过火山内容安全策略。

### 4. ProjectName 必须一致

火山资产库按项目隔离。以下三者必须一致：

- `CreateAsset` 上传素材时的 `ProjectName`
- `GetAsset` 查询素材时的 `ProjectName`
- 视频生成 API Key / 推理接入点所属的 `ProjectName`

如果不一致，生成接口会报：

```text
The specified asset asset-... is not found
```

这不是素材不存在，而是当前视频生成项目看不到这个素材。

## 修复内容

### 后端

文件：[main.py](../main.py)

1. 火山视频分支统一使用 `reference_image`，不再自动分配 `first_frame` / `last_frame`。
2. 新增 `asset://` Active 校验：

   - 对 `asset://asset-...` 调用火山 `GetAsset`。
   - 只在 `Status == Active` 时继续生成。
   - 发给视频接口时仍保留 `asset://asset-...`，不替换成 `GetAsset` 返回的临时 URL。

3. 新增素材库 URL 反查兜底：

   - 如果前端只传了 `/assets/library/...`，后端会在 `data/asset_library.json` 中查找匹配素材。
   - 如果该素材有火山 `registrations.volcengine.asset_uri` 且状态为 `Active`，自动替换为 `asset://asset-...`。

4. 新增火山调试日志：

   ```text
   [volc-video-debug] model=... project=... trusted_asset=... content=[...]
   ```

   重点看 `url_kind`：

   - `asset`：已走火山资产引用
   - `data`：仍是普通 base64 图片
   - `local`：仍是本地路径
   - `http`：普通公网 URL

5. 对 `asset is not found` 增加中文友好提示，指向 ProjectName / API Key / 推理接入点一致性问题。

### 前端

文件：[static/js/canvas.js](../static/js/canvas.js)

1. 标准画布从素材库拖拽或双击创建图片节点时，保存 `asset_uris`。
2. 生成视频时，如果 provider 是火山，优先使用 `asset_uris.volcengine`。
3. 火山视频节点隐藏首尾帧开关，并强制关闭 `useFrameRoles`。
4. 如果请求中包含 `asset://`，标准画布会传 `trusted_asset: true`，便于后端补充素材序号指代。

文件：[static/js/smart-canvas.js](../static/js/smart-canvas.js)

1. 火山视频模式隐藏首尾帧开关。
2. 火山视频生成不再给参考图自动分配 `first_frame` / `last_frame`。

## 正确配置方式

### 查看本地素材上传时的 ProjectName

打开：

[data/asset_library.json](../data/asset_library.json)

查找素材的火山注册信息：

```json
"registrations": {
  "volcengine": {
    "project_name": "default",
    "status": "Active",
    "asset_uri": "asset://asset-20260611154516-ff49r",
    "asset_id": "asset-20260611154516-ff49r"
  }
}
```

这里的 `project_name` 就是当时上传 `CreateAsset` 使用的项目名。

### 查看或修改火山 API 设置

打开：

[data/api_providers.json](../data/api_providers.json)

火山配置字段：

```json
{
  "id": "volcengine",
  "base_url": "https://ark.cn-beijing.volces.com/api/v3",
  "protocol": "volcengine",
  "volcengine_project_name": "default",
  "volcengine_region": "cn-beijing"
}
```

页面上也可以在“API 设置 > 火山引擎”中设置 `ProjectName`。

### 最稳流程

1. 确认视频生成所用 API Key 属于哪个火山项目。
2. 将火山 API 设置里的 `ProjectName` 改成同一个项目。
3. 重新把素材上传到火山资产库认证。
4. 等待状态变成 `Active`。
5. 从素材库重新拖出该素材，连接到火山视频生成节点。
6. 看终端日志：

   ```text
   [volc-video-debug] ... project=xxx ... url_kind='asset'
   ```

7. 再进行生成。

## 排查 Checklist

### 一看请求是否真的用了资产

终端日志应该出现：

```text
url_kind: "asset"
url_prefix: "asset://asset-..."
```

如果看到：

```text
url_kind: "data"
```

说明还在走普通图片，通常是旧节点、输出图节点、或前端缓存导致没有带 `asset_uris`。

处理：

- 强刷页面。
- 从素材库重新拖已 `Active` 的素材。
- 确认素材库 JSON 中有 `registrations.volcengine.asset_uri`。

### 二看 asset 是否能被当前项目找到

如果报：

```text
The specified asset asset-... is not found
```

检查：

- `data/asset_library.json` 中该素材的 `project_name`
- `data/api_providers.json` 中火山的 `volcengine_project_name`
- 火山控制台中视频生成 API Key 所属项目

三者必须一致。

### 三看是否内容安全拦截

如果报：

```text
图片里可能包含真人身份/隐私信息
```

或：

```text
copyright restrictions
```

说明已进入火山内容安全策略，不是协议错误。

处理：

- 避免真实自然人脸。
- 避免明星、影视、游戏、IP 角色。
- Prompt 中不要写真实人名、作品名、IP 名。
- 尽量使用明确的虚拟人像、插画、二次元、商品、场景等参考。

## 经验结论

1. 火山 Seedance 2.0 多图参考应统一走 `reference_image`，不要自动首尾帧。
2. `asset://` 是火山私域虚拟人像资产的推理引用格式，不能随意转成普通 URL。
3. 素材 `Active` 只表示资产库处理完成，不代表生成阶段一定免审。
4. `asset is not found` 优先查 `ProjectName` 和 API Key 项目，不要误判为上传失败。
5. 标准画布和智能画布都必须维护同一套 `asset_uris` 传递规则，否则同一个素材在不同入口会表现不一致。
