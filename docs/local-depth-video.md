# 智能画布本地深度图与深度视频

图片素材浮动工具栏 →「深度图（本地）」，使用与深度视频相同的 V2 Small ONNX fp16 模型、Worker 和缓存，不增加第二份模型下载。原有托管「深度图」入口保持可用。

本地图片处理输出灰度 PNG，可选最长边 1024px、2048px，保持原图比例、不放大原图；推理输入最长边不超过 518px，较大导出尺寸是缩放后的深度图，不代表模型推理细节增加。输入限 32 MiB、4000 万像素，支持浏览器能解码的图片（透明区域先合成灰色背景）。图片模式只要求 WebGPU fp16，不依赖 WebCodecs 或 MP4 编码库。

结果在面板预览，可「下载 PNG」；「保存到画布（上传结果）」经上传前后权限、画布、源素材检查后创建新的图片节点，不替换原图。只读模式仍能本地处理和下载，保存按钮禁用。默认不上传原图、像素或生成结果，不提交收费任务，也不增加服务器模型存储；明确保存后才按普通画布素材计入存储并沿用其删除方式。

视频素材浮动工具栏 →「深度视频」。默认 960px / 30fps / 灰度，可选 640px、15fps。输出最长边不超过源视频尺寸和所选上限，保留原片时长，无音轨。最大输入 256 MiB、120 秒，编码数据超过 64 MiB 时停止。

## 模型与加载

- [Depth Anything V2 Small ONNX fp16](https://huggingface.co/onnx-community/depth-anything-v2-small/blob/c70d1ddbcd93c9bda8098268cc3554adf5e8dd4f/onnx/model_fp16.onnx)，固定 revision `c70d1ddbcd93c9bda8098268cc3554adf5e8dd4f`，文件 49,642,442 字节，Apache 2.0。SHA-256：`2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04`。
- [Transformers.js 3.8.1](https://huggingface.co/docs/transformers.js/guides/webgpu) 的 `depth-estimation` pipeline，使用 WebGPU、fp16。运行库从 jsDelivr 按固定版本加载，模型支持 ModelScope / Hugging Face。
- 面板「下载源」提供自动、ModelScope、Hugging Face。自动模式优先 [ModelScope 同名模型库](https://modelscope.cn/models/onnx-community/depth-anything-v2-small)，失败后按文件切换 Hugging Face；手动选择时只使用指定源。ModelScope 固定 revision `412694b964262937af8683baa8a5433485787a9a`，使用支持 CORS 的 `/models/{model}/resolve/{revision}/{file}`，LFS 文件重定向由浏览器处理。两源三个文件均逐个核对长度、SHA-256，再加入同一 `transformers-cache` 缓存，不因切换源复制一份模型。
- 仅点击「开始提取」才创建 Worker、加载运行库和模型；不在页面启动或打开面板时预下载。模型使用浏览器 Cache Storage，显示来源、缓存命中、下载进度与切源状态，失败可重试。单次文件请求或连续读取停滞 30 秒时超时，单文件最长下载 4 分钟。损坏缓存会被移除并重新下载，部分下载不写缓存。关闭/取消终止 Worker，释放推理资源；模型缓存仍可复用。浏览器可能自行回收缓存，缓存失败时仍可执行，但下次可能重新下载。
- 「清除模型缓存」只删除本模型的 Hugging Face 缓存条目，不删除其他模型、画布资源或浏览器 HTTP 缓存。运行库/WASM 也有额外下载流量，49.6 MB 仅指模型。

也可在 [ModelScope 文件页](https://modelscope.cn/models/onnx-community/depth-anything-v2-small/files)或 [Hugging Face 指定版本文件页](https://huggingface.co/onnx-community/depth-anything-v2-small/tree/c70d1ddbcd93c9bda8098268cc3554adf5e8dd4f)下载以下三个文件，保留目录结构，再点击「选择本地模型目录」选择根目录：

```text
depth-anything-v2-small/
  config.json
  preprocessor_config.json
  onnx/
    model_fp16.onnx
```

本地模式通过文件对象与 Transformers.js 自定义缓存读取，禁用远程模型下载，不上传文件；三个文件在 Worker 内校验长度与 SHA-256。文件选择只保留到关闭面板，重新打开需再选择；「改用在线模型」可清除本地选择。此模式仍需要 jsDelivr 运行库/WASM，不是完整离线模式。

## 视频处理与数据边界

需要 HTTPS 或 localhost、WebGPU `shader-f16` 与 WebCodecs H.264 支持的 Chrome / Edge 和显卡。不支持时显示原因，不自动下载更大的替代模型。

素材 GET 到浏览器，逐帧 seek、提取 RGBA，一个 Worker 顺序推理，保持一个在途帧。推理输入最长边不超过 518px，灰度结果缩放至输出尺寸。通过固定版本 [Mediabunny 1.61.3](https://mediabunny.dev/guide/writing-media-files) 编码 MP4；每帧时间为 `i / fps`，最后一帧时长截至原片终点，推理耗时不改变输出时长。

这使用图像相对深度模型逐帧处理，不提供米制距离，也没有视频时序一致性模型，可能产生帧间闪烁。页面关闭后未保存的结果丢失。

默认结果为浏览器 Blob，可播放和下载，不调用收费生成接口，不新增服务器附件或画布存储。只有明确点击「保存到画布（上传结果）」才走现有上传接口，新增视频节点；此后结果按普通画布素材计入存储并沿用其删除方式。上传前后复查编辑资格、画布与源 URL；资格发生变化时不写入节点。若上传完成后资格变化，已上传对象沿用既有未引用媒体清理策略，不绕过权限删除服务器对象。

## 验证

`node --test tests/local-depth-model-loader.cjs tests/local-depth-video.cjs tests/canvas-modules.cjs tests/smart-image-tools.cjs`，Playwright 可通过 `NODE_PATH` 指向本地依赖目录。回归覆盖源切换、共享缓存、SHA-256 与不完整文件拒绝、超时、存储不可用、本地读取、延迟加载、固定时间戳、显式保存、模型失败重试、取消、移动端布局和上传前后的权限/素材/画布变更；默认推理与封装替身不请求外部模型。

设置 `DEPTH_MEDIA_BUNDLE` 为固定版本 Mediabunny 本地文件后，导出用例使用真实 H.264 编码并检查 MP4 时长。本机另完成真实模型 WebGPU 单帧推理，以及本地目录、ModelScope 浏览器直连加载到 15 帧推理和 MP4 导出的全链路验证：输出 1 秒，处理阶段服务器写请求为 0。实际直连 Hugging Face 加载在本机网络失败，未将其报告为线上验证通过。

图片扩展另验证真实 ModelScope 加载 → WebGPU 推理 → 1024×512 PNG 导出；随后在同一浏览器生成深度视频，模型下载请求没有增加。图片新增回归覆盖 PNG 灰度、尺寸比例、只读下载、取消重试、无 WebCodecs 环境、显式保存为独立节点，以及图片/视频的上传前后写入边界。
