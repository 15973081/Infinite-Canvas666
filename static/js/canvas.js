/* Classic canvas application entry (1 of 8 task modules).
 * Owns startup order, shared legacy bindings and page lifecycle.
 * Task functions and event registration live in /static/js/canvas/classic/.
 * Keep shared state initialization here during this compatibility migration:
 * moving its initialization can change permission, save and async task behavior.
 * See docs/canvas-eight-module-refactor.md for boundaries and follow-up rules.
 */
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
refreshIcons();
const LOCAL_I18N = {
    "common.apiSettings": "API 设置",
    "common.comfyuiSettings": "工作流设置",
    "common.darkMode": "黑夜模式",
    "common.language": "中文",
    "common.cancel": "取消",
    "common.confirm": "确定",
    "common.save": "保存",
    "common.delete": "删除",
    "common.edit": "编辑",
    "common.run": "运行",
    "common.running": "运行中",
    "common.custom": "自定义",
    "common.close": "关闭",
    "common.loading": "加载中...",
    "common.project": "项目主页",
    "common.moreSettings": "更多设置",
    "studio.ready": "系统就绪",
    "studio.unifiedConsole": "统一创作控制台",
    "studio.describeVision": "描述你想生成的画面...",
    "studio.engineSource": "引擎来源",
    "studio.local": "本地",
    "studio.dimensions": "尺寸",
    "studio.renderArt": "开始生成",
    "studio.renderLocal": "本地生成",
    "studio.renderCloud": "云端生成",
    "studio.loadMore": "加载更多归档",
    "studio.loadingArchives": "正在加载归档...",
    "studio.errorHistory": "历史加载失败",
    "studio.promptExecution": "提示词记录",
    "studio.replicate": "复用",
    "studio.modelscopeTokenRequired": "需要 ModelScope Token，请在侧边栏 API Token 中设置。",
    "studio.processing": "处理中...",
    "studio.uploading": "上传中...",
    "studio.uploadFailed": "上传失败",
    "studio.localModel": "本地",
    "studio.cloudProcessing": "云端处理中...",
    "studio.submittingModelscope": "正在提交到 ModelScope...",
    "studio.canvasReady": "画布就绪",
    "studio.archives": "归档",
    "studio.inputSource": "输入图片",
    "studio.dropImage": "拖放图片到这里",
    "studio.change": "更换",
    "studio.parameters": "参数",
    "studio.engine": "引擎",
    "studio.refinementStrength": "细节强度",
    "studio.superResolution": "超分辨率",
    "studio.doublePixels": "像素加倍 (4K)",
    "studio.kleinDetailEnhance": "Klein 细节增强",
    "studio.enhancementStrength": "增强强度",
    "studio.promptOptional": "提示词（可选）",
    "studio.beginRemaster": "开始增强",
    "studio.computingPixels": "正在计算像素...",
    "studio.inputPrompt": "输入提示词",
    "studio.referenceLayers": "参考图层",
    "studio.cloudUsesMain": "云端使用主图",
    "studio.connecting": "连接中...",
    "studio.detailLora": "细节增强 LoRA",
    "studio.loraStrength": "LoRA 强度",
    "studio.executeSynthesis": "开始合成",
    "studio.synthesizing": "合成中",
    "studio.cameraPerspective": "相机与视角控制",
    "studio.cameraControl": "相机控制",
    "studio.rotation": "旋转",
    "studio.pitch": "俯仰",
    "studio.distance": "距离",
    "studio.reset": "重置",
    "studio.resultPreview": "结果预览",
    "studio.generateAngle": "生成新角度",
    "studio.generatedCommand": "生成指令",
    "studio.copy": "复制",
    "canvas.noApiProviders": "暂无 API 平台",
    "canvas.noApiProvidersHint": "暂无 API 平台，请到 API 设置添加",
    "canvas.noImageModelsHint": "暂无生图模型，请到 API 设置添加",
    "canvas.noModelsHint": "暂无模型，请到 API 设置添加",
    "canvas.title": "shadox",
    "canvas.backToManager": "返回画布管理",
    "canvas.untitled": "未命名画布",
    "canvas.chooseFirst": "请选择或新建画布",
    "canvas.image": "上传",
    "canvas.uploadCard": "上传卡片",
    "canvas.prompt": "提示词",
    "canvas.promptTemplateLibrary": "提示词模板库",
    "canvas.promptTemplateShort": "模板库",
    "canvas.promptTemplateSystem": "系统提示词",
    "canvas.promptTemplateSearch": "搜索模板",
    "canvas.promptTemplateAll": "全部",
    "canvas.promptTemplateView": "视角",
    "canvas.promptTemplateStoryboard": "分镜",
    "canvas.promptTemplateCharacter": "角色",
    "canvas.promptTemplateProduct": "产品",
    "canvas.promptTemplateLighting": "光影",
    "canvas.promptTemplateEmpty": "没有匹配的模板",
    "canvas.promptTemplatePick": "选择一个模板",
    "canvas.promptTemplatePositive": "正向提示词",
    "canvas.promptTemplateNegative": "负向提示词",
    "canvas.promptTemplateParams": "参数建议",
    "canvas.promptTemplateApplyPositive": "正向",
    "canvas.promptTemplateApplyFull": "完整应用",
    "canvas.loop": "循环",
    "canvas.loopNode": "循环节点",
    "canvas.loopCount": "次数",
    "canvas.loopStart": "起始",
    "canvas.loopSerial": "循环",
    "canvas.loopParallel": "并发",
    "canvas.loopHint": "控制一键运行轮数",
    "canvas.loopPromptToggle": "提示词",
    "canvas.loopImageToggle": "图片",
    "canvas.loopImageStart": "起始计数",
    "canvas.loopBatchSize": "批次",
    "canvas.loopImageWillOutput": "当前会输出 {n} 张图片",
    "canvas.loopImageEmpty": "把图片或图片组连接到左侧输入口",
    "canvas.loopImageLabel": "循环图片 {n}",
    "canvas.loopVideoToggle": "视频",
    "canvas.loopVideoWillOutput": "当前会输出 {n} 个视频",
    "canvas.loopVideoEmpty": "把视频或视频组连接到左侧输入口",
    "canvas.loopVideoLabel": "循环视频 {n}",
    "canvas.outputConvertToInputGroup": "转为输入组",
    "canvas.outputCopyToInputGroup": "复制为新的输入组",
    "canvas.outputGroupActions": "分组",
    "canvas.outputFileActions": "文件",
    "canvas.outputDownloadAllImages": "下载全部文件",
    "canvas.outputDownloadEmpty": "没有可下载的本地文件",
    "canvas.loopVariablePrompt": "可变提示词",
    "canvas.loopVariablePlaceholder": "例如：现在生成第[计数]个卖点",
    "canvas.loopFixedPrompt": "固定提示词",
    "canvas.loopFixedPlaceholder": "每一轮都会附加的文本",
    "canvas.insertCounter": "插入计数",
    "canvas.insertTotal": "插入总数",
    "canvas.insertProgress": "插入进度",
    "canvas.counterToken": "计数",
    "canvas.totalToken": "总数",
    "canvas.progressToken": "进度",
    "canvas.loopRounds": "轮",
    "canvas.loopRound": "第",
    "canvas.apiGenerate": "API生成",
    "canvas.msGenerate": "Modelscope生成",
    "canvas.videoGenerate": "视频生成",
    "canvas.group": "分组",
    "canvas.logs": "日志",
    "canvas.generationLogs": "生成日志",
    "canvas.noLogs": "还没有生成日志",
    "canvas.success": "成功",
    "canvas.failed": "失败",
    "canvas.selectCanvas": "选择画布",
    "canvas.trash": "回收站",
    "canvas.backToList": "返回画布列表",
    "canvas.subtitle": "打开已有画布，或新建一个开始创作。",
    "canvas.trashSubtitle": "已删除画布可恢复，30 天后自动清理。",
    "canvas.refresh": "刷新列表",
    "canvas.openTrash": "打开回收站",
    "canvas.newCanvas": "新建画布",
    "canvas.newSmartCanvas": "新建智能画布",
    "canvas.folders": "文件夹",
    "canvas.folder": "文件夹",
    "canvas.allCanvases": "全部画布",
    "canvas.uncategorized": "未分类",
    "canvas.newSubfolder": "新建子文件夹",
    "canvas.deleteFolder": "删除文件夹",
    "canvas.folderNamePrompt": "文件夹名称",
    "canvas.deleteFolderConfirm": "删除该文件夹？其中的画布和子文件夹会移动到上一级。",
    "canvas.folderCreateFailed": "新建文件夹失败",
    "canvas.folderRenameFailed": "重命名文件夹失败",
    "canvas.folderDeleteFailed": "删除文件夹失败",
    "canvas.moveToFolder": "移动到文件夹",
    "canvas.moveFolderFailed": "移动画布失败",
    "canvas.smartCanvas": "智能画布",
    "canvas.smartCanvasShort": "智能",
    "canvas.newSmartCanvasPlaceholder": "智能画布名称（可留空使用默认）",
    "canvas.newCanvasPlaceholder": "新画布名称（可留空使用默认）",
    "canvas.trashNote": "回收站中的画布会在 30 天后自动清理。",
    "canvas.dropImage": "拖放素材到画布",
    "canvas.imageCard": "上传节点",
    "canvas.imageCardHint": "支持图片/音频/视频/批量上传",
    "canvas.llmNode": "LLM 节点",
    "canvas.modelscopeGenerate": "Modelscope生成",
    "canvas.comfyGenerate": "ComfyUI 生成",
    "canvas.videoGenerateNode": "视频生成",
    "canvas.hint": "拖拽画布移动，Ctrl 框选多选，拖动选中节点可一起移动。上传/提示词节点右下端口拖线到生成节点。",
    "canvas.cropImage": "裁剪图片",
    "canvas.cropHint": "拖动裁剪框移动，拖右下角调整大小",
    "canvas.editImage": "编辑图片",
    "canvas.editImageSub": "选择裁剪、遮罩或画笔模式",
    "canvas.modeCrop": "裁剪",
    "canvas.modeOutpaint": "扩图",
    "canvas.modeMask": "遮罩",
    "canvas.modeBrush": "画笔",
    "canvas.modeGrid": "宫格切分",
    "canvas.brushSize": "笔刷",
    "canvas.clear": "清空",
    "canvas.maskHint": "白色区域为要编辑的遮罩",
    "canvas.maskHint2": "在要重绘的位置涂白，保存后会生成遮罩图片节点",
    "canvas.color": "颜色",
    "canvas.textContent": "文字",
    "canvas.textSize": "字号",
    "canvas.brushHint": "直接在图片上绘制标记或草图",
    "canvas.maskEdit": "遮罩编辑",
    "canvas.brushEdit": "画笔编辑",
    "canvas.applyMask": "生成遮罩节点",
    "canvas.applyBrush": "应用画笔",
    "canvas.applyOutpaint": "应用扩图",
    "canvas.outpaintImage": "扩图",
    "canvas.outpaintHint": "拖动红框调整画布范围，最大不超过 4K 尺寸，确认后空白区域填充白色",
    "canvas.applyGrid": "切分到 Output",
    "canvas.gridHint": "按切分线分割图片，间隔会从线两侧扣除",
    "canvas.gridCustom": "自定义",
    "canvas.gridCustomTitle": "自由放置切割线",
    "canvas.gridHLines": "横向线",
    "canvas.gridVLines": "竖向线",
    "canvas.gridOrientH": "水平",
    "canvas.gridOrientHTitle": "点击图片放置水平线",
    "canvas.gridOrientV": "垂直",
    "canvas.gridOrientVTitle": "点击图片放置竖直线",
    "canvas.gridUndo": "撤销上一条线",
    "canvas.gridClearLines": "清除所有自定义线",
    "canvas.gridGap": "间隔(px)",
    "canvas.gridPresets": "预设",
    "canvas.gridWillOutput": "将输出 {n} 张",
    "canvas.copyPrompt": "复制提示词",
    "canvas.copied": "已复制",
    "canvas.rerun": "再次运行",
    "canvas.noPromptMeta": "没有记录提示词",
    "canvas.reset": "重置",
    "canvas.applyCrop": "应用裁剪",
    "canvas.manageModels": "管理模型",
    "canvas.manageModelsSub": "拖动调整顺序，删除不需要的模型，也可以输入新模型名称。",
    "canvas.apiProvider": "API 平台",
    "canvas.provider": "平台",
    "canvas.displayName": "显示名称",
    "canvas.providerId": "平台 ID",
    "canvas.keepKey": "留空则保持当前 Key",
    "canvas.modelInputPlaceholder": "粘贴或输入模型名称",
    "canvas.add": "添加",
    "canvas.manageModelList": "管理模型列表...",
    "canvas.manageApiProviders": "管理 API 平台...",
    "canvas.countSuffix": "个",
    "canvas.noCanvas": "暂无画布",
    "canvas.startWithNewCanvas": "点击右上方「新建画布」开始创作",
    "canvas.trashEmpty": "回收站为空",
    "canvas.deletedCanvas": "已删除画布",
    "canvas.changeIcon": "修改画布图标",
    "canvas.modePreview": "预览",
    "canvas.previewImage": "预览图片",
    "canvas.previewHint": "查看大图，可切换到裁剪 / 扩图 / 遮罩等模式",
    "canvas.sortRecent": "最近编辑",
    "canvas.sortName": "名称",
    "canvas.searchPlaceholder": "搜索画布名称",
    "canvas.clearSearch": "清空搜索",
    "canvas.noSearchResults": "没有找到匹配的画布",
    "canvas.ownerLabel": "负责人 / 项目",
    "canvas.ownerPlaceholder": "输入负责人或项目",
    "canvas.colorLabel": "颜色标记",
    "canvas.colorNone": "无",
    "canvas.pin": "置顶",
    "canvas.unpin": "取消置顶",
    "canvas.editMeta": "编辑图标 / 颜色 / 负责人",
    "canvas.pinned": "已置顶",
    "canvas.metaSaveFailed": "保存失败",
    "canvas.deletedAt": "删除于",
    "canvas.purgeConfirm": "清理画布？素材仍保留在画布资产中",
    "canvas.moveToTrashConfirm": "画布移入回收站？素材仍保留",
    "canvas.restoreCanvas": "恢复画布",
    "canvas.purgeCanvas": "彻底删除",
    "canvas.rename": "重命名",
    "canvas.moveToTrash": "移入回收站",
    "canvas.loadingCanvases": "正在加载画布列表...",
    "canvas.needCanvas": "请先新建或选择画布",
    "canvas.enterCanvasName": "输入画布名称后确认",
    "canvas.noCanvasCreateFirst": "暂无画布，请先新建画布",
    "canvas.canvasListFailed": "画布列表加载失败",
    "canvas.trashLoadFailed": "回收站加载失败",
    "canvas.movedToTrash": "已移入回收站",
    "canvas.moveToTrashFailed": "移入回收站失败",
    "canvas.purged": "已彻底删除",
    "canvas.clickDragPasteImage": "点击/拖拽上传素材，或在空节点粘贴图片",
    "canvas.promptPlaceholder": "输入提示词...",
    "canvas.groupEmpty": "拖入图片或提示词到此",
    "canvas.grouped": "已成组",
    "canvas.imageCount": "张图片",
    "canvas.promptCount": "个提示词",
    "canvas.connectHere": "连接到这里",
    "canvas.dragConnect": "拖线连接",
    "canvas.resize": "调整大小",
    "canvas.nodeMode": "节点",
    "canvas.chatMode": "聊天",
    "canvas.systemPrompt": "系统提示词...",
    "canvas.llmInputEmpty": "把 Prompt 连到 LLM 输入点",
    "canvas.llmOutputEmpty": "运行后会输出文本，可连到生成卡片",
    "canvas.resizePanes": "拖动调整输入/输出高度",
    "canvas.running": "运行中",
    "canvas.startChat": "开始一段聊天...",
    "canvas.chatInput": "输入消息...",
    "canvas.sending": "发送中",
    "canvas.images": "Images",
    "canvas.custom": "自定义",
    "canvas.fitImageSize": "适配图片",
    "canvas.adaptiveRatio": "适配比例",
    "canvas.inputImagesEmpty": "把图片或图片组连到这里",
    "canvas.enableLora": "启用 LoRA",
    "canvas.loraStrength": "LoRA 强度",
    "canvas.noLoraForModel": "当前模型暂无绑定 LoRA，可在 API 设置 · Modelscope · LoRA 管理中添加。",
    "canvas.noLoraBoundError": "当前模型没有可用 LoRA，请先到 API 设置绑定",
    "canvas.imageReadFailed": "无法读取参考图尺寸",
    "canvas.msFailed": "Modelscope 生成失败",
    "canvas.generationFailed": "生成失败",
    "canvas.apiFailed": "API 生成失败",
    "canvas.emptyRatio": "比例空",
    "canvas.decrease": "减少",
    "canvas.decreaseCount": "减少生成数量",
    "canvas.increase": "增加",
    "canvas.increaseCount": "增加生成数量",
    "canvas.ratioWidth": "比例宽",
    "canvas.ratioHeight": "比例高",
    "canvas.width": "宽度",
    "canvas.height": "高度",
    "canvas.generating": "生成中",
    "canvas.needPrompt": "请先连接提示词",
    "canvas.needPromptOrImage": "请先连接提示词或图片",
    "canvas.needImage": "请先连接图片",
    "canvas.videoNeedsPrompt": "请先连接提示词",
    "canvas.needPromptToLLM": "请先连接 Prompt 到 LLM",
    "canvas.createFailed": "新建画布失败",
    "canvas.openFailed": "打开画布失败",
    "canvas.restored": "画布已恢复",
    "canvas.restoreFailed": "恢复画布失败",
    "canvas.purgeFailed": "彻底删除失败",
    "canvas.defaultProviderNoDelete": "默认平台不能删除，可以修改名称、地址和模型。",
    "canvas.noModelsAddFirst": "暂无模型，输入名称后添加",
    "canvas.manageLlmModelsTitle": "管理 LLM 模型",
    "canvas.manageLlmModelsSub": "这些模型会出现在 LLM 节点下拉框里。拖动排序，删除或新增后保存。",
    "canvas.manageApiTitle": "管理 API 平台",
    "canvas.manageApiSub": "选择平台后维护 Base URL、Key 和这个平台下的生成模型。Key 会写入 API/.env，页面只显示脱敏状态。",
    "canvas.manageVideoModelsTitle": "管理视频模型",
    "canvas.manageVideoModelsSub": "这些模型会出现在视频生成节点下拉框里。选择平台后维护该平台的视频模型。",
    "canvas.keepCurrentKey": "保持当前",
    "canvas.enterApiKey": "输入 API Key",
    "canvas.deleteModel": "删除模型",
    "canvas.deleteLink": "删除连线",
    "canvas.download": "下载",
    "canvas.comfyModeText": "文生图",
    "canvas.comfyModeEnhance": "细节增强",
    "canvas.comfyModeEdit": "图片编辑",
    "canvas.comfyModeCustom": "自定义",
    "canvas.comfyText": "文生图",
    "canvas.comfyEnhance": "细节增强",
    "canvas.comfyEdit": "图片编辑",
    "canvas.comfyCustom": "自定义",
    "canvas.comfyRunning": "处理中",
    "canvas.comfyRun": "Run ComfyUI",
    "canvas.comfyNeedImages": "需要",
    "canvas.comfyNoWorkflow": "请先在 ComfyUI 设置中保存工作流。",
    "canvas.comfyLoadingWorkflow": "正在读取工作流参数...",
    "canvas.comfyNoExtraParams": "这个工作流只有图片/提示词输入，没有额外参数。",
    "canvas.ltxDirector": "LTX Director",
    "canvas.ltxDurationSec": "秒数",
    "canvas.ltxDurationFrames": "帧数",
    "canvas.ltxFps": "帧率",
    "canvas.ltxLinkedImages": "已连接图片",
    "canvas.ltxRun": "运行 LTX",
    "canvas.ltxRunning": "LTX 运行中",
    "canvas.ltxFailed": "LTX 生成失败",
    "canvas.ltxNoOutput": "LTX 没有返回产物",
    "canvas.ltxImageSegNeedRef": "LTX 图片段缺少参考图",
    "canvas.ltxTimelineLoadFailed": "LTX 时间线 UI 加载失败，请查看控制台。",
    "canvas.ltxTimelineScriptMissing": "LTX 时间线脚本未加载。",
    "canvas.videoModel": "视频模型",
    "canvas.videoDuration": "时长",
    "canvas.videoAspect": "比例",
    "canvas.videoResolution": "分辨率",
    "canvas.videoUpsample": "提升到 1080p",
    "canvas.videoEnhancePrompt": "优化提示词",
    "canvas.videoWatermark": "水印",
    "canvas.videoCameraFixed": "固定镜头",
    "canvas.videoGenerateAudio": "生成音频",
    "canvas.videoMultimodal": "智能多参",
    "canvas.videoFirstLastFrames": "首尾帧",
    "canvas.videoRoleReference": "参考",
    "canvas.videoRoleFirstFrame": "首帧",
    "canvas.videoRoleLastFrame": "尾帧",
    "canvas.videoFailed": "视频生成失败",
    "smart.title": "智能画布",
    "smart.engineApi": "API生成",
    "smart.engineVolcengine": "火山引擎",
    "smart.engineMs": "Modelscope生成",
    "smart.engineComfy": "ComfyUI生成",
    "smart.kindImage": "图片",
    "smart.kindVideo": "视频",
    "smart.promptPlaceholder": "描述你想生成或编辑的图片...",
    "smart.promptTemplateLibrary": "模板库",
    "smart.tplAll": "全部",
    "smart.tplCatView": "视角",
    "smart.tplCatStoryboard": "分镜",
    "smart.tplCatCharacter": "角色",
    "smart.tplCatProduct": "产品",
    "smart.tplCatLighting": "光影",
    "smart.tplCatMine": "我的",
    "smart.tplBuiltin": "内置",
    "smart.tplMine": "我的",
    "smart.tplBuiltinTemplate": "内置模板",
    "smart.tplMineTemplate": "我的模板",
    "smart.tplManageGroups": "管理分组",
    "smart.tplGroupManage": "分组管理",
    "smart.tplGroupHint": "这里只调整上方分类，不影响模板内容",
    "smart.tplAdd": "新增",
    "smart.tplDone": "完成",
    "smart.tplRename": "重命名",
    "smart.tplSaveCurrent": "存当前",
    "smart.tplNewTemplate": "新模板",
    "smart.tplNewTemplateName": "新模板",
    "smart.tplNoMatches": "没有匹配的模板",
    "smart.tplEditTemplate": "修改模板",
    "smart.tplDeleteTemplate": "删除模板",
    "smart.tplName": "模板名称",
    "smart.tplGroup": "所属分组",
    "smart.tplContent": "模板内容",
    "smart.tplPositive": "正向提示词",
    "smart.tplNegative": "负向提示词",
    "smart.tplParams": "参数建议",
    "smart.tplApplyPositive": "正向",
    "smart.tplApplyFull": "完整应用",
    "smart.tplPickOrCreate": "选择或新建一个模板",
    "smart.tplRequired": "模板名称和内容不能为空",
    "smart.tplNewGroupPrompt": "新分组名称",
    "smart.tplNewGroupDefault": "新分组",
    "smart.tplGroupNamePrompt": "分组名称",
    "smart.tplDeleteGroupConfirm": "删除分组？该分组里的我的模板会移动到“我的”。",
    "smart.promptResize": "拖拽调整文本框高度",
    "smart.run": "运行",
    "smart.modePreview": "预览",
    "smart.previewImage": "预览图片",
    "smart.previewHint": "滚轮缩放，拖动查看，右下角可拉动对比原图",
    "smart.panorama360": "360全景",
    "smart.panoramaRatio": "视窗比例",
    "smart.panoramaExport": "导出画面",
    "smart.panoramaHint": "360全景：拖动转动，滚轮缩放，可调整视窗比例",
    "smart.panoramaLoading": "加载中...",
    "smart.panoramaLoadFailed": "360全景加载失败",
    "smart.panoramaExportDone": "已导出到画布",
    "smart.panoramaExportFailed": "导出全景失败",
    "smart.compareSource": "对比原图",
    "smart.compareNoSource": "该图片没有原图可对比",
    "smart.compareHover": "点击查看输入端缩略图",
    "smart.compareEmpty": "无原图可对比",
    "smart.compareHintPick": "点缩略图开始对比",
    "smart.compareCancelTip": "点击取消对比",
    "smart.compareUseTip": "点击与该图对比",
    "smart.compareDrag": "拖动对比",
    "smart.uploadHint": "点击上传 / 拖入素材",
    "smart.createImportNode": "上传节点",
    "smart.createImportNodeSub": "支持图片/音频/视频/批量上传",
    "smart.createExportNode": "导出节点",
    "smart.createExportNodeSub": "接收多种格式并一键导出",
    "smart.createPromptSub": "手写或用 LLM 生成文本",
    "smart.createLoopSub": "控制一键运行轮数和批次",
    "smart.kindAudio": "音频",
    "smart.kindText": "文本",
    "smart.exportNodeReady": "选择文件夹后一键导出",
    "smart.exportNodeEmpty": "连接节点后收集图片、视频、音频和文本",
    "smart.exportChooseFolder": "选择文件夹并导出",
    "smart.exportNodeNote": "浏览器会弹出本机文件夹选择器",
    "smart.exportNodeHint": "连接内容后可一键导出",
    "smart.exportEmpty": "导出节点里还没有可导出的内容",
    "smart.exportFailed": "导出失败",
    "smart.exportDone": "已导出 {n} 个文件",
    "smart.exportPickerUnsupported": "当前浏览器不支持选择文件夹，已使用默认导出路径",
    "smart.hintEmpty": "支持图片 / 视频 / 音频，也可直接文生图",
    "smart.hintMulti": "多图会作为同一组参考图发送",
    "smart.hintSingle": "点击后在下方输入编辑需求",
    "smart.hintPending": "正在生成…",
    "smart.deleteNode": "删除节点",
    "smart.deleteImage": "删除",
    "smart.platform": "平台",
    "smart.model": "模型",
    "smart.size": "尺寸",
    "smart.ratio": "比例",
    "smart.resolution": "分辨率",
    "smart.quality": "质量",
    "smart.count": "生成数量",
    "smart.qualityAuto": "自动",
    "smart.qualityLow": "低",
    "smart.qualityMid": "中",
    "smart.qualityHigh": "高",
    "smart.countUnit": "张",
    "smart.imageRatio": "图片比例",
    "smart.custom": "自定义",
    "smart.apiPlatform": "API 平台",
    "smart.imageModel": "生图模型",
    "smart.noApiPlatform": "暂无 API 平台",
    "smart.noImageModel": "暂无生图模型",
    "smart.noMsModel": "暂无 Modelscope 模型",
    "smart.msFunction": "Modelscope 生成功能",
    "smart.msCustomModel": "自定义 Modelscope 模型",
    "smart.customModel": "自定义模型",
    "smart.videoPlatform": "视频平台",
    "smart.videoModel": "视频模型",
    "smart.noVideoPlatform": "暂无视频平台",
    "smart.noVideoModel": "暂无视频模型",
    "smart.videoDuration": "时长",
    "smart.videoDurationTip": "时长（秒）",
    "smart.videoAspect": "画面比例",
    "smart.videoResolution": "视频分辨率",
    "smart.videoEnhancePrompt": "提示词增强",
    "smart.videoUpsample": "高清",
    "smart.videoGenerateAudio": "生成音频",
    "smart.videoMultimodal": "智能多参",
    "smart.videoCameraFixed": "镜头固定",
    "smart.videoWatermark": "水印",
    "smart.videoUseFrameRoles": "首尾帧",
    "smart.videoTrustedAsset": "可信素材模式",
    "smart.videoAspectKeep": "原图比例",
    "smart.videoAspectAdaptive": "自适应",
    "smart.videoResAuto": "自动",
    "smart.comfyMode": "ComfyUI 模式",
    "smart.upscaleTarget": "超分目标",
    "smart.workflow": "工作流",
    "smart.noWorkflow": "暂无 ComfyUI 工作流",
    "smart.noOption": "无选项",
    "smart.width": "宽",
    "smart.height": "高",
    "smart.widthFull": "宽度",
    "smart.heightFull": "高度",
    "smart.ratioW": "比例宽",
    "smart.ratioH": "比例高",
    "smart.strength": "强度",
    "smart.superResolution": "超分",
    "smart.diceOn": "随机已开启，点击关闭",
    "smart.diceOff": "随机已关闭，点击开启",
    "smart.inputThumbs": "输入图",
    "smart.inputCount": "{n} 输入图",
    "smart.inputNum": "输入 {n}",
    "smart.inputBlocked": "已屏蔽",
    "smart.inputClickBlock": "点击屏蔽输入",
    "smart.inputClickEnable": "点击启用输入",
    "smart.inputSelf": "自身，默认参与编辑",
    "smart.inputUpstream": "上游输入",
    "smart.inputUpstreamWorkflow": "工作流上游输入",
    "smart.imageModeTitle": "图片模式",
    "smart.imageModeEdit": "编辑",
    "smart.imageModeWorkflow": "工作流",
    "smart.imageModeEditHint": "默认优先编辑这张卡自己的图片；只有空卡片时才会承接上游。",
    "smart.imageModeWorkflowHint": "始终承接上游图片作为编辑源，适合图1 -> 图2 -> 图3这类链路。",
    "smart.imageModeWorkflowNeedInput": "工作流模式会忽略这张卡自身结果，请先接入上游图片。",
    "smart.promptPreset": "预设",
    "smart.promptPresetDefault": "提示词预设",
    "smart.promptPresetUnnamed": "未命名预设",
    "smart.promptPresetNone": "暂无预设",
    "smart.promptPresetEmpty": "提示词为空",
    "smart.promptPresetSavedNew": "已存为新预设",
    "smart.promptPresetPanelHint": "选择预设后可直接修改名称和内容。",
    "smart.promptPresetPanelEmpty": "当前还没有预设，可以先把当前提示词存为新预设。",
    "smart.promptPresetEditing": "编辑完成后点击保存修改。",
    "smart.promptPresetRequired": "名称和内容都不能为空。",
    "smart.promptPresetSaved": "修改已保存",
    "smart.promptPresetDeleteAgain": "再次点击删除",
    "smart.promptPresetDeleteConfirm": "将删除“{name}”，再次点击确认。",
    "smart.promptPresetDeleted": "预设已删除",
    "smart.promptPlaceholderNode": "输入提示词...",
    "smart.promptLlmInstructionPlaceholder": "输入给 LLM 的文本，运行后会写入上方提示词",
    "smart.promptLlmSystemPlaceholder": "系统提示词开启后会随请求一起发送",
    "smart.promptLlmEnableSystem": "启用系统提示词",
    "smart.promptLlmDisableSystem": "关闭系统提示词",
    "smart.promptLlmNeedText": "请先输入给 LLM 的文本",
    "smart.promptLlmFailed": "LLM 运行失败",
    "smart.loopPromptHintFound": "识别到 {n} 条提示词，按计数轮流输出",
    "smart.loopPromptHintVariable": "可使用 [计数] 作为变量",
    "smart.loopParallelTip": "智能画布会按轮落盘，避免覆盖同一目标节点",
    "smart.loopDefaultPrompt": "现在生成第《计数》张卖点图片",
    "smart.loopRunAll": "一键运行",
    "smart.loopNoChain": "没有可一键运行的上游链路",
    "smart.loopRunDone": "一键运行完成",
    "smart.loopRunRoundsDone": "循环运行完成：{n} 轮",
    "smart.loopParallelRoundsDone": "并发运行完成：{n} 轮",
    "smart.mentionInput": "输入图",
    "smart.mentionAssets": "资产库",
    "smart.mentionEmpty": "没有可引用的图片",
    "smart.toastNoUndo": "没有可撤销的操作",
    "smart.toastUndone": "已撤销",
    "smart.toastNeedPrompt": "请输入提示词",
    "smart.toastNeedGroup": "请先按住 Ctrl 框选至少两个图片节点",
    "smart.toastUploadFail": "素材上传失败",
    "smart.toastApiSettingsFail": "API 设置加载失败",
    "smart.toastCanvasFail": "智能画布加载失败",
    "smart.errNoApiModel": "请先选择可用的 API 生图模型",
    "smart.errNoVideoModel": "请先选择视频模型",
    "smart.errNoOutImages": "没有返回图片",
    "smart.errNoOutVideos": "没有返回视频",
    "smart.errMsNeedRefs": "该 Modelscope 模型需要参考图",
    "smart.errImageRead": "图片读取失败",
    "smart.errNeedWorkflow": "请先在 ComfyUI 设置中添加工作流",
    "smart.errComfyNoImages": "ComfyUI 没有返回图片",
    "smart.errComfyEmpty": "ComfyUI 返回图片为空",
    "smart.errEnhanceNeedRefs": "图片增强需要参考图",
    "smart.errEditNeedRefs": "图片编辑需要参考图",
    "smart.errRunFailed": "生成失败",
    "smart.errRunTimeout": "生成超时",
    "smart.refMapHeader": "下面是参考图编号：",
    "smart.refUserNeed": "用户需求：",
    "smart.runPromptPrefix": "提示词：",
    "smart.assetLibrary": "资产库",
    "smart.assetImages": "图片资产",
    "smart.assetWorkflows": "工作流",
    "smart.assetNewFolder": "新建文件夹",
    "smart.assetRenameFolder": "重命名文件夹",
    "smart.assetFolder": "新文件夹",
    "smart.assetDropHint": "把画布图片拖到这里保存到当前文件夹",
    "smart.assetEmpty": "这个文件夹还没有图片。把画布里的图片拖进来保存。",
    "smart.assetWorkflowEmpty": "工作流资产先预留在这里，后续接入。",
    "smart.assetRename": "重命名",
    "smart.assetDeleteConfirm": "确定删除这个资产吗？",
    "smart.assetNoFolder": "请先新建一个图片文件夹",
    "smart.assetLoadFail": "资产库加载失败",
    "smart.assetAddFail": "保存资产失败",
    "smart.assetSaved": "已保存到资产库",
    "smart.mediaBrowser": "浏览器",
    "smart.mediaBrowserCollapse": "收起浏览器",
    "smart.mediaBrowserOpen": "打开",
    "smart.mediaBrowserExtract": "提取媒体",
    "smart.mediaBrowserReady": "输入网址后打开，或直接提取页面媒体。",
    "smart.mediaBrowserLoading": "正在打开网页...",
    "smart.mediaBrowserExtracting": "正在提取媒体...",
    "smart.mediaBrowserNoUrl": "请先输入网址",
    "smart.mediaBrowserNoMedia": "没有提取到可用媒体",
    "smart.mediaBrowserExtracted": "已加入临时抽屉 {n} 个媒体",
    "smart.mediaBrowserBlocked": "部分网站不允许内嵌显示，但仍可尝试提取媒体。",
    "smart.mediaDrawer": "临时抽屉",
    "smart.mediaDrawerClear": "清空抽屉",
    "smart.mediaDrawerEmpty": "提取图片或视频后会放在这里，可拖入画布。",
    "smart.mediaDrawerAdd": "放入画布",
    "smart.mediaDrawerSave": "存资产",
    "smart.shortcuts": "快捷键",
    "smart.shortcutBoxSelect": "按住并拖拽框选节点",
    "smart.shortcutGroup": "合并选中的图片为组",
    "smart.shortcutUngroup": "释放选中的分组",
    "smart.shortcutUndo": "撤销上一步操作",
    "smart.shortcutCopy": "复制选中的节点",
    "smart.shortcutPaste": "粘贴节点或剪贴板图片",
    "smart.shortcutAssets": "打开/关闭资源库",
    "smart.shortcutOverview": "缩小画布视图",
    "smart.shortcutCreateMenu": "打开快捷菜单",
    "smart.shortcutPan": "拖动画布",
    "smart.shortcutZoom": "缩放画布或预览图片",
    "smart.shortcutDelete": "删除选中节点"
};
function tr(key){ return LOCAL_I18N[key] || key; }
function trDefault(key, fallback){ const text = tr(key); return text === key ? fallback : text; }
function trf(key, values={}){
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), tr(key));
}
function langIsEn(){ return false; }
function actionFailed(labelKey, detail=''){
    const label = tr(labelKey);
    return langIsEn() ? `${label} failed${detail ? `: ${detail}` : ''}` : `${label}失败${detail ? `：${detail}` : ''}`;
}
function noReturnedImage(labelKey){ return langIsEn() ? `${tr(labelKey)} failed: no image returned` : `${tr(labelKey)}失败：未返回图片`; }

function applyLanguage(lang){

    document.title = tr('canvas.title');
    refreshGateViewControls();
    if(canvas) {
        currentCanvasTitle.textContent = canvas?.title || tr('canvas.untitled');
    }
    renderCanvasList();
    render();
}
async function refreshCanvasConfigFromSettings(){
    await loadConfig();
    pruneMissingComfyWorkflows();
    (nodes || []).forEach(node => {
        sanitizeImageNodeProviderModel(node);
        sanitizeVideoNodeProviderModel(node);
    });
    if(typeof render === 'function') render();
}
window.addEventListener('message', event => {
    if(event.origin && event.origin !== location.origin) return;
    if(event.data?.type === 'studio-lang') applyLanguage();
    if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
    if(event.data?.type === 'canvas_locked') handleCanvasLockedMessage(event.data);
    if(event.data?.type === 'canvas_unlocked') handleCanvasUnlockedMessage(event.data);
    if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed' || event.data?.type === 'comfy-instances-changed'){
        refreshCanvasConfigFromSettings();
    }
    if(event.data?.type === 'canvas-focus'){
        // 从其他标签页切换回画布时，重新拉取工作流列表并刷新节点
        refreshCanvasConfigFromSettings();
        if(canvas) syncRemoteCanvasNow();
    }
});

const shell = document.getElementById('shell');
const canvasGate = document.getElementById('canvasGate');
const board = document.getElementById('board');
const world = document.getElementById('world');
const nodesEl = document.getElementById('nodes');
const minimap = document.getElementById('minimap');
const minimapContent = document.getElementById('minimapContent');
let minimapViewport = document.getElementById('minimapViewport');
const linksEl = document.getElementById('links');
const linkControlsEl = document.getElementById('linkControls');
const dropOverlay = document.getElementById('dropOverlay');
const createMenu = document.getElementById('createMenu');
const linkCreateMenu = document.getElementById('linkCreateMenu');
const nodeInputMenu = document.getElementById('nodeInputMenu');
const nodeOutputMenu = document.getElementById('nodeOutputMenu');
const imageNodeMenu = document.getElementById('imageNodeMenu');
const selectionBox = document.getElementById('selectionBox');
const selectionHub = document.getElementById('selectionHub');
const gateStatus = document.getElementById('gateStatus');
const gateCreateBtn = document.getElementById('gateCreateBtn');
const gateCreateSmartBtn = document.getElementById('gateCreateSmartBtn');
const gateRefreshBtn = document.getElementById('gateRefreshBtn');
const gateBackBtn = document.getElementById('gateBackBtn');
const gateTrashBtn = document.getElementById('gateTrashBtn');
const gateAssetManagerBtn = document.getElementById('gateAssetManagerBtn');
const gateTrashCount = document.getElementById('gateTrashCount');
const gateTitleText = document.getElementById('gateTitleText');
const gateSubtitle = document.getElementById('gateSubtitle');
const gateCanvasList = document.getElementById('gateCanvasList');
const gateSearch = document.getElementById('gateSearch');
const gateSearchInput = document.getElementById('gateSearchInput');
const gateSearchClear = document.getElementById('gateSearchClear');
const gateFolderTree = document.getElementById('gateFolderTree');
const gateFolderBar = document.getElementById('gateFolderBar');
const gateNewFolderBtn = document.getElementById('gateNewFolderBtn');
const backToManagerBtn = document.getElementById('backToManagerBtn');
const canvasLockBadge = document.getElementById('canvasLockBadge');
const canvasLockLabel = document.getElementById('canvasLockLabel');
const canvasIdentityBtn = document.getElementById('canvasIdentityBtn');
const canvasIdentityLabel = document.getElementById('canvasIdentityLabel');
const canvasLockOverlay = document.getElementById('canvasLockOverlay');
const canvasLockOverlayMsg = document.getElementById('canvasLockOverlayMsg');
const canvasLockRetryBtn = document.getElementById('canvasLockRetryBtn');
const currentCanvasTitle = document.getElementById('currentCanvasTitle');
const currentCanvasTime = document.getElementById('currentCanvasTime');
const outputLightbox = document.getElementById('outputLightbox');
const outputPreview = document.getElementById('outputPreview');
const outputLightboxImg = document.getElementById('outputLightboxImg');
const outputLightboxAudio = document.getElementById('outputLightboxAudio');
const outputLightboxAudioTitle = document.getElementById('outputLightboxAudioTitle');
const outputLightboxAudioHost = document.getElementById('outputLightboxAudioHost');
const outputCompareContainer = document.getElementById('outputCompareContainer');
const outputCompareResult = document.getElementById('outputCompareResult');
const outputCompareOriginal = document.getElementById('outputCompareOriginal');
const outputCompareOriginalWrap = document.getElementById('outputCompareOriginalWrap');
const outputCompareSlider = document.getElementById('outputCompareSlider');
const outputResolution = document.getElementById('outputResolution');
const outputDownloadBtn = document.getElementById('outputDownloadBtn');
const outputDownloadAllBtn = document.getElementById('outputDownloadAllBtn');
const outputLightboxVideo = document.getElementById('outputLightboxVideo');
const outputPromptPanel = document.getElementById('outputPromptPanel');
const outputPromptText = document.getElementById('outputPromptText');
const outputCopyPromptBtn = document.getElementById('outputCopyPromptBtn');
const outputRerunBtn = document.getElementById('outputRerunBtn');
const promptTemplateModal = document.getElementById('promptTemplateModal');
const promptTemplatePanel = document.getElementById('promptTemplatePanel') || promptTemplateModal?.querySelector('.prompt-template-panel');
const promptTemplateClose = document.getElementById('promptTemplateClose');
const promptTemplateSearch = document.getElementById('promptTemplateSearch');
const promptTemplateLibrarySelect = document.getElementById('promptTemplateLibrarySelect');
const promptTemplateCats = document.getElementById('promptTemplateCats');
const promptTemplateBody = document.getElementById('promptTemplateBody');
const canvasAssetToggle = document.getElementById('canvasAssetToggle');
const canvasAssetPanel = document.getElementById('canvasAssetPanel');
const canvasAssetResizeHandle = document.getElementById('canvasAssetResizeHandle');
const canvasAssetCloseBtn = document.getElementById('canvasAssetCloseBtn');
const canvasAssetLibrarySelect = document.getElementById('canvasAssetLibrarySelect');
const canvasAssetCategorySelect = document.getElementById('canvasAssetCategorySelect');
const canvasAssetAddCategoryBtn = document.getElementById('canvasAssetAddCategoryBtn');
const canvasAssetSearch = document.getElementById('canvasAssetSearch');
const canvasAssetDropZone = document.getElementById('canvasAssetDropZone');
const canvasAssetGrid = document.getElementById('canvasAssetGrid');
const canvasAssetHoverPreview = document.getElementById('canvasAssetHoverPreview');
const workflowTransferToggle = document.getElementById('workflowTransferToggle');
const canvasCostToggle = document.getElementById('canvasCostToggle');
const canvasCostToggleLabel = document.getElementById('canvasCostToggleLabel');
const canvasLogToggle = document.getElementById('canvasLogToggle');
const workflowTransferModal = document.getElementById('workflowTransferModal');
const workflowTransferSub = document.getElementById('workflowTransferSub');
const workflowExportMeta = document.getElementById('workflowExportMeta');
const workflowImportInput = document.getElementById('workflowImportInput');
const workflowImportDropZone = document.getElementById('workflowImportDropZone');
const workflowExportLibraryBtn = document.getElementById('workflowExportLibraryBtn');
const assetManagerModal = document.getElementById('assetManagerModal');
const assetManagerBody = document.getElementById('assetManagerBody');

revealCanvasAssetControls();
const logModal = document.getElementById('logModal');
const logList = document.getElementById('logList');
const errorModal = document.getElementById('errorModal');
const errorTitle = document.getElementById('errorTitle');
const errorMessage = document.getElementById('errorMessage');
let canvases = [];
let deletedCanvases = [];
let canvasFolders = [];
let activeFolderId = 'all';
let canvasSearchQuery = '';
let canvas = null;
let nodes = [];
let connections = [];
let viewport = {x: -1800, y: -1000, scale: 1};
let dragNode = null;
let dragBoard = null;
let minimapDrag = false;
let minimapState = null;
let minimapRenderQueued = false;
let minimapLayoutDirty = true;
let resizeNode = null;
let llmPaneDrag = null;
let tempLink = null;
let knifeActive = false;
let knifePoint = null;
let knifeTrail = [];
let knifeChanged = false;
let knifeNeedsRender = false;
let selectDrag = null;
let isRKeyDown = false;
let menuPoint = null;
let linkCreateState = null;
let internalDrag = false;
let selected = new Set();
let saveTimer = null;
let windowPointerSession = null;

let creatingCanvas = false;
let createCanvasKind = 'classic';
let trashMode = false;
let pendingDeleteCanvasId = null;
let pendingPurgeCanvasId = null;
let movingCanvasId = null;
let emojiPickerCanvasId = null;
let canvasMetaAnchorId = '';
let canvasSortMode = (() => { try { return localStorage.getItem('canvasSortMode') || 'recent'; } catch(e){ return 'recent'; } })();
const CANVAS_COLOR_OPTIONS = ['red','orange','amber','green','teal','blue','violet','pink','slate'];
let localCanvasDirty = false;
let savingCanvasNow = false;
let saveCanvasAgain = false;
let applyingRemoteCanvas = false;
let remoteSyncTimer = null;
let remoteSyncInterval = null;
let remoteSyncBusy = false;
let lastCanvasWsUpdatedAt = 0;
const REMOTE_SYNC_POLL_MS = 10000;
const REMOTE_SYNC_WS_QUIET_MS = 30000;
let lastCanvasUpdatedAt = 0;
let lastSavedCanvasSnapshot = '';
let openCanvasRequestSeq = 0;
let models = {gpt:'gpt-image-2', nano:'nano-banana-pro'};
let imageModels = ['gpt-image-2', 'nano-banana-pro'];
let chatModels = ['gpt-4o-mini'];
let videoModels = [];
let msChatModels = [];
let apiProviders = [];
let comfyBackendCount = 1;
let comfyWorkflows = [];
let comfyWorkflowCache = {};
let managedProviderId = 'comfly';
let localImageModels = [];
let localChatModels = [];
const MS_GEN_MODELS = {
    zimage:    { label: 'ZImage',     modelId: 'Tongyi-MAI/Z-Image-Turbo',            supportsImage: false, endpoint: '/generate'            },
    qwen_edit: { label: 'Qwen Edit',  modelId: 'Qwen/Qwen-Image-Edit-2511',            supportsImage: true,  endpoint: '/api/angle/generate'  },
    klein_edit:{ label: 'Klein',      modelId: 'black-forest-labs/FLUX.2-klein-9B',   supportsImage: true,  endpoint: '/api/ms/generate'     },
    custom:    { label: '自定义', labelKey: 'canvas.custom', modelId: '',                acceptsImage: true,   endpoint: '/api/ms/generate'     }
};
let hasManagedImageModels = false;
let hasManagedChatModels = false;
let outputCompareDrag = false;
let outputPreviewZoom = 1;
let outputPreviewPan = {x: 0, y: 0};
let outputPreviewPanDrag = null;
let currentOutputCompareUrl = '';
let currentOutputMeta = null;
let currentOutputLightboxOutId = '';
let currentOutputLightboxUrl = '';
let outputTrimState = null;
let outputTrimFrame = null;
let outputTrimJob = null;
const missingAssetUrls = new Set();
let outputTimer = null;
let clipboard = null;
let lastImagePasteAt = 0;
let promptTemplateNodeId = '';
let promptTemplateCategory = 'all';
let promptTemplateSelectedId = '';
let promptTemplateQuery = '';
let promptTemplateEditing = false;
let canvasPromptTemplates = [];
let canvasPromptTemplatesLoaded = false;
let canvasPromptLibraries = [];
let activePromptLibraryId = 'system';
const CANVAS_PROMPT_TEMPLATE_GROUPS_KEY = 'canvas_prompt_template_groups_v1';
const CANVAS_PROMPT_TEMPLATE_OVERRIDES_KEY = 'canvas_prompt_template_overrides';
let promptTemplateGroups = [];
let promptTemplateGroupEditMode = false;
let canvasPromptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
let canvasAssetLibrary = {categories:[]};
let canvasAssetLibraryOpen = false;
let activeCanvasAssetLibraryId = '';
let activeCanvasAssetCategoryId = '';
let canvasAssetSearchQuery = '';
const CANVAS_ASSET_BATCH_SIZE = 60;
const CANVAS_ASSET_PANEL_WIDTH_KEY = 'canvas_asset_panel_width_v1';
const CANVAS_ASSET_PANEL_DEFAULT_WIDTH = 320;
const CANVAS_ASSET_PANEL_MIN_WIDTH = 320;
let canvasAssetRenderKey = '';
let canvasAssetRenderedCount = CANVAS_ASSET_BATCH_SIZE;
let canvasAssetFilteredCount = 0;
let canvasAssetPanelWidth = (() => {
    try {
        const stored = Number(localStorage.getItem(CANVAS_ASSET_PANEL_WIDTH_KEY));
        return Number.isFinite(stored) && stored > 0 ? stored : CANVAS_ASSET_PANEL_DEFAULT_WIDTH;
    } catch(e) {
        return CANVAS_ASSET_PANEL_DEFAULT_WIDTH;
    }
})();
let canvasAssetPanelResize = null;
const LOCAL_CANVAS_ASSET_LIBRARY_ID = '__local_assets__';
let localCanvasAssetLibrary = {items:[], tree:null};
let assetManagerTab = 'assets';
let managerSelectedAssetIds = new Set();
let managerSelectedWorkflowIds = new Set();
let managerSelectedPromptIds = new Set();
let activeCanvasWorkflowCategoryId = '';
const activeCanvasTaskPolls = new Set();
let hoveredConnectionId = '';
let connectionHoverFrame = null;
let pendingConnectionHover = null;
const renderedCanvasLinks = new Map();
const suspendedCanvasPreviewImages = new WeakMap();
let lastMouseBoard = {x: 0, y: 0};
let undoStack = [];
let redoStack = [];
const UNDO_MAX = 30;
const cascadeRunningIds = new Set();
const cascadeRunningNodeIds = new Set();
const cascadeStopIds = new Set();
const cascadeSerialIds = new Set(); // 记录以串行循环模式启动的运行，用于停止按钮
const cascadeContexts = new Map();
let cropState = null;
let cropDrag = null;
let imageEditMode = 'crop';
let imageEditModeTouched = false;
let editDrawState = null;
let editTextItems = [];
let editTextSelectedId = '';
let editTextDrag = null;
let editTextDirty = false;
let editTextInlineEditor = null;
let editDrawUndoStack = [];
let editDrawRedoStack = [];
const EDIT_DRAW_HISTORY_MAX = 40;
let brushTool = 'free';
let brushLabelCounter = 1;
let gridCustomMode = false;
let gridCustomLines = []; // [{type:'h'|'v', pos:0-1}] 相对图片尺寸的分数位置
let gridCustomOrientation = 'h'; // 当前点击放置方向
let gridCustomHistory = []; // 撤销栈：每次放线前快照
let gridCustomDrag = null; // {index, pointerId}
let imageEditZoom = 1.0;
let imageEditBaseW = 0; // zoom=1 时图片显示宽度
let imageEditBaseH = 0;
let textSelectionGuard = null;
const PROMPT_TEXT_MAX_LENGTH = 50000;
const CLIENT_ID = (() => {
    const key = 'canvasClientId';
    try {
        const existing = sessionStorage.getItem(key);
        if(existing) return existing;
        const created = 'canvas_' + Math.random().toString(36).slice(2);
        sessionStorage.setItem(key, created);
        return created;
    } catch(e){
        return 'canvas_' + Math.random().toString(36).slice(2);
    }
})();
const CANVAS_USER_NAME_KEY = 'canvasUserName';
const CANVAS_LOCK_POLL_MS = 5000;
let canvasLockHolder = null; // {client_id, username, ip, acquired_at} | null (null = no lock)
let canvasLockPollTimer = null;
let canvasLockedByOther = false;
const LTX_DIRECTOR_WORKFLOW = 'LTXDirectorv2-API.json';
const LTX_DIRECTOR_WF_NODE = '46';
const LTX_DIRECTOR_SEED_NODE = '94:28';
const LTX_SEGMENT_COLORS = ['#e07b3a', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'];
const CANVAS_EMOJIS = ['layers','sparkles','image','palette','wand-2','star','heart','rocket','flame','moon','cloud','leaf','gem','compass','pin','flag','bookmark','crown'];

const SIZE_MAP = {
    square: { '1k':'1024x1024', '2k':'2048x2048', '4k':'4096x4096' },
    portrait: { '1k':'1024x1536', '2k':'1360x2048', '4k':'2352x3520' },
    portrait43: { '1k':'1008x1344', '2k':'1536x2048', '4k':'2448x3264' },
    landscape43: { '1k':'1344x1008', '2k':'2048x1536', '4k':'3264x2448' },
    landscape: { '1k':'1536x1024', '2k':'2048x1360', '4k':'3520x2352' },
    story: { '1k':'720x1280', '2k':'1152x2048', '4k':'2160x3840' },
    wide: { '1k':'1280x720', '2k':'2048x1152', '4k':'3840x2160' },
    ultrawide: { '1k':'1280x544', '2k':'2048x880', '4k':'3840x1648' },
    ultratall: { '1k':'544x1280', '2k':'880x2048', '4k':'1648x3840' }
};
const RES_LONG_SIDE = { '1k':1536, '2k':2048, '4k':3840 };
const RES_PIXEL_LIMIT = { '1k':1572864, '2k':4194304, '4k':8294400 };
const CUSTOM_IMAGE_MODELS_KEY = 'canvas_custom_image_models';
const MANAGED_IMAGE_MODELS_KEY = 'canvas_image_models_ordered';
const MANAGED_CHAT_MODELS_KEY = 'canvas_chat_models_ordered';
const CANVAS_THEME_KEY = 'canvas_theme';
const QUICK_TOOLBAR_COLLAPSED_KEY = 'canvas_quick_toolbar_collapsed';
const CANVAS_SESSION_VIEWPORTS_KEY = 'canvas_session_viewports_v1';
let canvasSessionViewportFallback = {};
const DEFAULT_VIDEO_MODELS = [
    // Veo
    'veo2', 'veo2-fast', 'veo2-pro',
    'veo3', 'veo3-fast', 'veo3-pro',
    'veo3.1', 'veo3.1-fast', 'veo3.1-quality', 'veo3.1-lite',
    // Sora
    'sora-2', 'sora-2-pro',
    // 通义万相
    'wan2.6-t2v', 'wan2.6-i2v',
    'wan2.5-t2v-preview', 'wan2.5-i2v-preview',
    'wan2.2-t2v-plus', 'wan2.2-i2v-plus', 'wan2.2-i2v-flash',
    // Seedance
    'doubao-seedance-2-0-260128',
    'doubao-seedance-2-0-fast-260128',
    'doubao-seedance-1-5-pro-251215',
    'doubao-seedance-1-0-pro-250528',
    'doubao-seedance-1-0-lite-t2v-250428',
    'doubao-seedance-1-0-lite-i2v-250428',
    // Agnes
    'agnes-video-v2.0'
];

function uid(prefix='n'){ return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`; }

let pendingViewportRefresh = null;

async function copyTextToClipboard(text){
    const value = String(text || '');
    if(!value) return false;
    try {
        if(navigator.clipboard?.writeText){
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch(_) {}
    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch(_) {
        return false;
    }
}

function formatCanvasTime(value){
    if(!value) return '--';
    const raw = Number(value);
    const time = raw < 10000000000 ? raw * 1000 : raw;
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function setStatus(text){
    document.getElementById('saveState').textContent = text;
    if(gateStatus) gateStatus.textContent = text;
}
function normalizeCanvasFolderId(value){
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}
function canvasFolderLabel(folderId){
    if(folderId === 'all') return trDefault('canvas.allCanvases', '全部画布');
    if(!folderId) return trDefault('canvas.uncategorized', '未分类');
    return canvasFolders.find(folder => folder.id === folderId)?.name || trDefault('canvas.folder', '文件夹');
}
function canvasFolderChildren(parentId=''){
    const target = normalizeCanvasFolderId(parentId);
    return canvasFolders
        .filter(folder => normalizeCanvasFolderId(folder.parent_id) === target)
        .sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN', {numeric:true, sensitivity:'base'}));
}
function canvasFolderDepth(folderId){
    let depth = 0;
    let current = canvasFolders.find(folder => folder.id === folderId);
    const seen = new Set();
    while(current?.parent_id && !seen.has(current.id)){
        seen.add(current.id);
        depth += 1;
        current = canvasFolders.find(folder => folder.id === current.parent_id);
    }
    return depth;
}
function countCanvasesInFolder(folderId){
    if(folderId === 'all') return canvases.length;
    const target = normalizeCanvasFolderId(folderId);
    return canvases.filter(item => normalizeCanvasFolderId(item.folder_id) === target).length;
}
function visibleCanvasItems(){
    let items;
    if(trashMode) items = deletedCanvases;
    else if(activeFolderId === 'all') items = canvases;
    else {
        const target = normalizeCanvasFolderId(activeFolderId);
        items = canvases.filter(item => normalizeCanvasFolderId(item.folder_id) === target);
    }
    const query = String(canvasSearchQuery || '').trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
    if(!query) return items;
    return items.filter(item => String(item.title || '').normalize('NFKC').toLocaleLowerCase('zh-CN').includes(query));
}
function folderTargetForCreate(){
    return activeFolderId && activeFolderId !== 'all' ? normalizeCanvasFolderId(activeFolderId) : '';
}
function renderFolderNode(folder, depth=0){
    const count = countCanvasesInFolder(folder.id);
    const row = document.createElement('div');
    row.className = `gate-folder-node ${activeFolderId === folder.id ? 'active' : ''}`;
    row.dataset.folderId = folder.id;
    row.style.setProperty('--depth', depth);
    row.innerHTML = `
        <button class="gate-folder-main" type="button" title="${escapeAttr(folder.name)}">
            <i data-lucide="folder" class="w-3.5 h-3.5"></i>
            <span class="gate-folder-name">${escapeHtml(folder.name)}</span>
            <span class="gate-folder-count">${count}</span>
        </button>
        <div class="gate-folder-actions">
            <button class="gate-folder-action" type="button" data-folder-action="child" title="${trDefault('canvas.newSubfolder', '新建子文件夹')}"><i data-lucide="folder-plus" class="w-3 h-3"></i></button>
            <button class="gate-folder-action" type="button" data-folder-action="rename" title="${trDefault('canvas.rename', '重命名')}"><i data-lucide="pencil" class="w-3 h-3"></i></button>
            <button class="gate-folder-action" type="button" data-folder-action="delete" title="${trDefault('canvas.deleteFolder', '删除文件夹')}"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
        </div>
    `;
    row.querySelector('.gate-folder-main').onclick = () => setActiveFolder(folder.id);
    row.querySelector('[data-folder-action="child"]').onclick = e => { e.stopPropagation(); createCanvasFolder(folder.id); };
    row.querySelector('[data-folder-action="rename"]').onclick = e => { e.stopPropagation(); renameCanvasFolder(folder.id); };
    row.querySelector('[data-folder-action="delete"]').onclick = e => { e.stopPropagation(); deleteCanvasFolder(folder.id); };
    row.addEventListener('dragover', e => {
        if(!Array.from(e.dataTransfer?.types || []).includes('text/canvas-id')) return;
        e.preventDefault();
        row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
        const canvasId = e.dataTransfer?.getData('text/canvas-id');
        row.classList.remove('drag-over');
        if(canvasId) moveCanvasToFolder(canvasId, folder.id);
    });
    const wrap = document.createDocumentFragment();
    wrap.appendChild(row);
    canvasFolderChildren(folder.id).forEach(child => wrap.appendChild(renderFolderNode(child, depth + 1)));
    return wrap;
}
function renderFolderTree(){
    if(!gateFolderTree) return;
    gateFolderTree.innerHTML = '';
    const special = [
        {id:'all', name:trDefault('canvas.allCanvases', '全部画布'), icon:'layout-grid', count:canvases.length},
        {id:'', name:trDefault('canvas.uncategorized', '未分类'), icon:'inbox', count:countCanvasesInFolder('')},
    ];
    special.forEach(item => {
        const row = document.createElement('div');
        row.className = `gate-folder-node gate-folder-special ${activeFolderId === item.id ? 'active' : ''}`;
        row.dataset.folderId = item.id;
        row.innerHTML = `
            <button class="gate-folder-main" type="button">
                <i data-lucide="${item.icon}" class="w-3.5 h-3.5"></i>
                <span class="gate-folder-name">${escapeHtml(item.name)}</span>
                <span class="gate-folder-count">${item.count}</span>
            </button>
        `;
        row.querySelector('.gate-folder-main').onclick = () => setActiveFolder(item.id);
        row.addEventListener('dragover', e => {
            if(!Array.from(e.dataTransfer?.types || []).includes('text/canvas-id')) return;
            e.preventDefault();
            row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', e => {
            const canvasId = e.dataTransfer?.getData('text/canvas-id');
            row.classList.remove('drag-over');
            if(canvasId) moveCanvasToFolder(canvasId, item.id === 'all' ? '' : item.id);
        });
        gateFolderTree.appendChild(row);
    });
    const sep = document.createElement('div');
    sep.className = 'gate-folder-separator';
    gateFolderTree.appendChild(sep);
    canvasFolderChildren('').forEach(folder => gateFolderTree.appendChild(renderFolderNode(folder, 0)));
    if(gateFolderBar){
        gateFolderBar.innerHTML = `
            <div class="gate-folder-current">
                <i data-lucide="${activeFolderId === 'all' ? 'layout-grid' : (activeFolderId ? 'folder' : 'inbox')}" class="w-3.5 h-3.5"></i>
                <span>${escapeHtml(canvasFolderLabel(activeFolderId))}</span>
            </div>
            <span class="gate-folder-current-count">${visibleCanvasItems().length}</span>
        `;
    }
    refreshIcons();
}
async function loadCanvasFolders(){
    try {
        const data = await window.CanvasApi.listCanvasFolders();
        canvasFolders = data.folders || [];
        if(activeFolderId !== 'all' && activeFolderId && !canvasFolders.some(folder => folder.id === activeFolderId)){
            activeFolderId = '';
        }
        renderFolderTree();
    } catch(e) {
        console.error(e);
        canvasFolders = [];
        renderFolderTree();
    }
}
function setActiveFolder(folderId){
    activeFolderId = folderId === 'all' ? 'all' : normalizeCanvasFolderId(folderId);
    movingCanvasId = null;
    closeCanvasMetaPopover();
    renderFolderTree();
    renderCanvasList();
    refreshGateViewControls();
}
function createCanvasFolder(parentId=''){
    window.CanvasNameDialog.open({title:'新建文件夹', label:'文件夹名称', placeholder:'例如：品牌设计', confirm:'创建', description:'将相关画布收纳在一起，方便查找。', onSubmit:async name => {
        const data = await window.CanvasApi.createCanvasFolder({name, parent_id:normalizeCanvasFolderId(parentId)});
        canvasFolders = data.folders || canvasFolders;
        activeFolderId = data.folder?.id || activeFolderId;
        renderFolderTree(); renderCanvasList(); refreshGateViewControls();
    }});
}
function renameCanvasFolder(folderId){
    const folder = canvasFolders.find(item => item.id === folderId);
    if(!folder) return;
    window.CanvasNameDialog.open({title:'重命名文件夹', label:'文件夹名称', value:folder.name, description:'修改名称不会影响文件夹中的画布。', onSubmit:async name => {
        if(name === folder.name) return;
        const data = await window.CanvasApi.updateCanvasFolder(folderId, {name});
        canvasFolders = data.folders || canvasFolders;
        renderFolderTree();
    }});
}
async function deleteCanvasFolder(folderId){
    const folder = canvasFolders.find(item => item.id === folderId);
    if(!folder) return;
    if(!confirm(trDefault('canvas.deleteFolderConfirm', '删除该文件夹？其中的画布和子文件夹会移动到上一级。'))) return;
    try {
        const parentId = normalizeCanvasFolderId(folder.parent_id);
        const data = await window.CanvasApi.deleteCanvasFolder(folderId);
        canvasFolders = data.folders || canvasFolders.filter(item => item.id !== folderId);
        canvases.forEach(item => {
            if(normalizeCanvasFolderId(item.folder_id) === folderId) item.folder_id = parentId;
        });
        if(activeFolderId === folderId) activeFolderId = parentId || '';
        renderFolderTree();
        renderCanvasList();
        refreshGateViewControls();
    } catch(e) {
        setStatus(trDefault('canvas.folderDeleteFailed', '删除文件夹失败'));
        console.error(e);
    }
}
function toggleMoveCanvasMenu(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    movingCanvasId = movingCanvasId === id ? null : id;
    closeCanvasMetaPopover();
    renderCanvasList();
}
function canvasMoveMenuHtml(item){
    if(movingCanvasId !== item.id || trashMode) return '';
    const entries = [
        {id:'', name:trDefault('canvas.uncategorized', '未分类'), depth:0, icon:'inbox'},
        ...canvasFolders.map(folder => ({id:folder.id, name:folder.name, depth:canvasFolderDepth(folder.id), icon:'folder'})),
    ];
    return `
        <div class="canvas-folder-menu">
            ${entries.map(entry => `
                <button type="button" data-move-folder="${escapeAttr(entry.id)}" class="${normalizeCanvasFolderId(item.folder_id) === entry.id ? 'active' : ''}" style="--depth:${entry.depth || 0}">
                    <i data-lucide="${entry.icon}" class="w-3 h-3"></i>
                    <span>${escapeHtml(entry.name)}</span>
                </button>
            `).join('')}
        </div>
    `;
}
async function moveCanvasToFolder(id, folderId){
    const target = normalizeCanvasFolderId(folderId);
    const item = canvases.find(entry => entry.id === id);
    const prev = item ? normalizeCanvasFolderId(item.folder_id) : '';
    if(item) item.folder_id = target;
    if(canvas?.id === id) canvas.folder_id = target;
    movingCanvasId = null;
    renderFolderTree();
    renderCanvasList();
    refreshGateViewControls();
    try {
        const data = await window.CanvasApi.moveCanvasToFolder(id, target);
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e) {
        if(item) item.folder_id = prev;
        if(canvas?.id === id) canvas.folder_id = prev;
        setStatus(e?.message || trDefault('canvas.moveFolderFailed', '移动画布失败'));
        console.error(e);
        await loadCanvasList(false);
    }
}
function refreshGateViewControls(){
    canvasGate.classList.toggle('trash-mode', trashMode);
    if(gateTitleText) gateTitleText.textContent = trashMode ? tr('canvas.trash') : tr('canvas.selectCanvas');
    if(gateSubtitle) gateSubtitle.textContent = trashMode ? tr('canvas.trashSubtitle') : tr('canvas.subtitle');
    const trashCount = deletedCanvases.length;
    if(gateTrashCount){
        gateTrashCount.textContent = String(trashCount);
        gateTrashCount.classList.toggle('visible', trashCount > 0);
    }
    const countPill = document.getElementById('gateCountPill');
    if(countPill){
        const items = visibleCanvasItems();
        const suffix = tr('canvas.countSuffix');
        countPill.textContent = suffix ? `${items.length} ${suffix}` : String(items.length);
    }
    const sortSwitch = document.getElementById('gateSortSwitch');
    if(sortSwitch){
        sortSwitch.classList.toggle('hidden', trashMode);
        sortSwitch.querySelectorAll('[data-sort]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === canvasSortMode);
        });
    }
    if(gateSearchInput){
        if(gateSearchInput.value !== canvasSearchQuery) gateSearchInput.value = canvasSearchQuery;
        gateSearchInput.placeholder = tr('canvas.searchPlaceholder');
        gateSearchInput.setAttribute('aria-label', tr('canvas.searchPlaceholder'));
    }
    if(gateSearch) gateSearch.classList.toggle('has-value', Boolean(String(canvasSearchQuery || '').trim()));
    if(gateSearchClear){
        gateSearchClear.title = tr('canvas.clearSearch');
        gateSearchClear.setAttribute('aria-label', tr('canvas.clearSearch'));
    }
    renderFolderTree();
}
function setCanvasMode(open){
    shell.classList.toggle('no-canvas', !open);
    if(!open){
        minimapState = null;
        minimapLayoutDirty = true;
        clearConnectionHover();
        renderedCanvasLinks.clear();
        clearLocalCanvasLock();
        nodesEl.innerHTML = '';
        linksEl.innerHTML = '';
        linkControlsEl.innerHTML = '';
        selectionHub.classList.remove('open');
    } else if(currentCanvasTitle) {
        currentCanvasTitle.textContent = canvas?.title || tr('canvas.untitled');
        currentCanvasTime.textContent = formatCanvasTime(canvas?.updated_at || canvas?.created_at);
    }
    refreshIcons();
}
function ensureCanvas(){
    if(canvas) return true;
    setStatus(tr('canvas.needCanvas'));
    return false;
}
function setCreateMode(active, kind='classic'){
    creatingCanvas = active;
    createCanvasKind = active && kind === 'smart' ? 'smart' : 'classic';
    refreshGateViewControls();
    if(active) window.CanvasNameDialog.open({title:kind === 'smart' ? '新建智能画布' : '新建画布', label:'画布名称', placeholder:'例如：秋季视觉探索', confirm:'创建画布', allowEmpty:true, onSubmit:name => createCanvas(name)});
}

let geometryRefreshFrame = null;
let geometryRefreshPasses = 0;
let geometryRefreshAll = false;
const geometryRefreshNodes = new Set();

async function loadConfig(){
    loadLocalModelLists();
    try {
        const cfg = await window.CanvasApi.getConfig();
        imageModels = cfg.image_models?.length ? cfg.image_models : imageModels;
        chatModels = cfg.chat_models?.length ? cfg.chat_models : chatModels;
        videoModels = cfg.video_models?.length ? cfg.video_models : DEFAULT_VIDEO_MODELS;
        apiProviders = window.CanvasCore.availableModelProviders(Array.isArray(cfg.api_providers) ? cfg.api_providers : defaultApiProviders());
        models.nano = imageModels.find(m => m.toLowerCase().includes('nano')) || 'nano-banana-pro';
        models.gpt = imageModels.find(m => !m.toLowerCase().includes('nano')) || cfg.image_model || 'gpt-image-2';
    } catch(e) {
        apiProviders = defaultApiProviders();
    }
}

// 监听 API 设置页面的变更广播，实时刷新画布的模型/平台下拉
try {
    const apiChannel = new BroadcastChannel('studio-api');
    apiChannel.onmessage = async (e) => {
        if(e.data?.type === 'providers-changed' || e.data?.type === 'workflows-changed' || e.data?.type === 'comfy-instances-changed'){
            await refreshCanvasConfigFromSettings();
        }
    };
} catch(e) { /* 不支持 BroadcastChannel 的旧浏览器忽略 */ }
async function loadCanvasList(openFirst=true, options={}){
    try {
        const refreshFolders = options.refreshFolders === true;
        const canvasPromise = window.CanvasApi.listCanvases();
        if(refreshFolders) await loadCanvasFolders();
        const data = await canvasPromise;
        canvases = data.canvases || [];
        sortCanvasListByUpdated();
        refreshGateViewControls();
        renderCanvasList();
        refreshTrashCount();
        if(openFirst && canvases[0]) await openCanvas(canvases[0].id);
        else if(!canvas) {
            setCanvasMode(false);
            setStatus(trashMode ? (deletedCanvases.length ? tr('canvas.trash') : tr('canvas.trashEmpty')) : (canvases.length ? tr('canvas.chooseFirst') : tr('canvas.noCanvasCreateFirst')));
        }
    } catch(e) {
        setStatus(tr('canvas.canvasListFailed'));
        console.error(e);
    } finally {
        if(canvasGate.classList.contains('gate-loading')){
            canvasGate.classList.remove('gate-loading');
            canvasGate.classList.add('gate-ready');
        }
    }
}
async function loadTrashList(){
    try {
        const data = await window.CanvasApi.listTrashCanvases();
        deletedCanvases = data.canvases || [];
        refreshGateViewControls();
        renderCanvasList();
        setStatus(deletedCanvases.length ? tr('canvas.trash') : tr('canvas.trashEmpty'));
    } catch(e) {
        setStatus(tr('canvas.trashLoadFailed'));
        console.error(e);
    }
}
async function refreshTrashCount(){
    if(trashMode) return;
    try {
        const data = await window.CanvasApi.listTrashCanvases({canvases:[]});
        deletedCanvases = data.canvases || [];
        refreshGateViewControls();
    } catch(e) {}
}
async function setTrashMode(active){
    trashMode = active;
    creatingCanvas = false;
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = null;
    closeCanvasMetaPopover();
    canvasGate.classList.toggle('creating', false);
    refreshGateViewControls();
    if(trashMode) await loadTrashList();
    else await loadCanvasList(false);
    refreshIcons();
}
function renderCanvasList(){
    const panel = canvasGate.querySelector('.gate-panel');
    const visible = panel && panel.getClientRects().length && !canvasGate.classList.contains('gate-loading');
    const before = visible ? panel.getBoundingClientRect().height : 0;
    panel?._gateResize?.cancel();
    renderCanvasListInto(gateCanvasList);
    if(!visible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const after = panel.getBoundingClientRect().height;
    if(Math.abs(after - before) > 1){
        panel._gateResize = panel.animate([{height:before+'px'},{height:after+'px'}],{duration:200,easing:'ease-out'});
    }
    gateCanvasList._gateFade?.cancel();
    gateCanvasList._gateFade = gateCanvasList.animate([{opacity:.5},{opacity:1}],{duration:180,easing:'ease-out'});
}
function compareCanvasRecords(a, b){
    // 置顶始终排在最前；其余按当前排序模式（最近编辑 / 名称）。
    const ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
    if(ap !== bp) return bp - ap;
    if(canvasSortMode === 'name'){
        const cmp = String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN', {numeric:true, sensitivity:'base'});
        if(cmp !== 0) return cmp;
    }
    return Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0);
}
function sortCanvasListByUpdated(){
    canvases.sort(compareCanvasRecords);
}
function setCanvasSortMode(mode){
    const next = mode === 'name' ? 'name' : 'recent';
    if(next === canvasSortMode) { refreshGateViewControls(); return; }
    canvasSortMode = next;
    try { localStorage.setItem('canvasSortMode', canvasSortMode); } catch(e){}
    sortCanvasListByUpdated();
    renderCanvasList();
    refreshGateViewControls();
}
async function patchCanvasMeta(id, patch){
    const item = canvases.find(c => c.id === id);
    if(item) Object.assign(item, patch);
    if(canvas?.id === id) Object.assign(canvas, patch);
    sortCanvasListByUpdated();
    renderCanvasList();
    try {
        const data = await window.CanvasApi.patchCanvasMeta(id, patch);
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e){
        setStatus(tr('canvas.metaSaveFailed') || '保存失败');
        console.error(e);
        await loadCanvasList(false);
    }
}
function togglePinCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    const item = canvases.find(c => c.id === id);
    closeCanvasMetaPopover();
    patchCanvasMeta(id, {pinned: !(item && item.pinned)});
}
function setCanvasColorValue(id, color, event){
    event?.preventDefault();
    event?.stopPropagation();
    patchCanvasMeta(id, {color: color || ''});
}
function commitCanvasOwner(id, value){
    const owner = String(value || '').trim().slice(0, 40);
    const item = canvases.find(c => c.id === id);
    if((item?.owner || '') === owner) return;
    patchCanvasMeta(id, {owner});
}
function updateCanvasListRecord(record){
    if(!record?.id) return;
    const index = canvases.findIndex(item => item.id === record.id);
    if(index >= 0) canvases[index] = {...canvases[index], ...record};
    else canvases.unshift(record);
    sortCanvasListByUpdated();
    renderCanvasList();
}
async function touchCanvasOpened(id){
    if(!id) return null;
    try {
        const data = await window.CanvasApi.touchCanvas(id, null);
        if(!data) return null;
        if(data.canvas) updateCanvasListRecord(data.canvas);
        return data.canvas || data;
    } catch(e) {
        console.warn('touch canvas failed', e);
        return null;
    }
}
function renderCanvasListInto(list){
    if(!list) return;
    refreshGateViewControls();
    const items = visibleCanvasItems();
    list.innerHTML = '';
    if(!items.length){
        const empty = document.createElement('div');
        empty.className = 'gate-list-empty';
        const hasSearch = Boolean(String(canvasSearchQuery || '').trim());
        empty.innerHTML = hasSearch
            ? `<div class="gate-list-empty-icon"><i data-lucide="search-x" class="w-6 h-6"></i></div>${tr('canvas.noSearchResults')}`
            : (trashMode
                ? `<div class="gate-list-empty-icon"><i data-lucide="trash-2" class="w-6 h-6"></i></div>${tr('canvas.trashEmpty')}`
                : `<div class="gate-list-empty-icon"><i data-lucide="layout-grid" class="w-6 h-6"></i></div>${tr('canvas.noCanvas')}<br>${tr('canvas.startWithNewCanvas')}`);
        list.appendChild(empty);
        refreshIcons();
        return;
    }
    items.forEach(item => {
        const row = document.createElement('div');
        const isSmartCanvas = (item.kind || 'classic') === 'smart';
        const color = String(item.color || '').trim();
        const owner = String(item.owner || '').trim();
        const pinned = !!item.pinned && !trashMode;
        row.className = `canvas-item ${isSmartCanvas ? 'smart-canvas' : ''} ${canvas?.id === item.id ? 'active' : ''} ${pinned ? 'pinned' : ''} ${color ? 'has-color' : ''}`;
        row.dataset.canvasId = item.id;
        row.dataset.coverStyle = ["type","editorial","sage","ink"].includes(item.cover_style) ? item.cover_style : "type";
        const ownerChip = owner
            ? `<span class="canvas-owner-chip" role="button" tabindex="0" title="${escapeAttr(owner)}"><i data-lucide="user-round" class="w-3 h-3"></i><span class="canvas-owner-text">${escapeHtml(owner)}</span></span>`
            : '';
        row.innerHTML = `
            <div class="canvas-open" role="button" tabindex="${trashMode ? '-1' : '0'}">
                <div class="studio-canvas-cover studio-neutral-cover" aria-hidden="true"><strong class="studio-cover-title">${escapeHtml(item.title || '未命名画布')}</strong></div><div class="studio-card-type">${isSmartCanvas ? '智能画布' : '普通画布'}${pinned ? ' · 已置顶' : ''}</div>
                <div class="canvas-card-icon-row">
                    <span class="canvas-preview-mark ${color ? `icon-has-color cc-${escapeAttr(color)}` : ''}" role="button" tabindex="0" title="${trashMode ? tr('canvas.deletedCanvas') : (tr('canvas.editMeta') || '编辑图标 / 颜色 / 负责人')}">${renderCanvasIcon(isSmartCanvas && /[^\x00-\x7F]/.test(item.icon || '') ? 'sparkles' : item.icon, 16)}</span>
                    ${isSmartCanvas ? `<span class="canvas-kind-chip">${tr('canvas.smartCanvasShort')}</span>` : ''}
                </div>
                <div class="canvas-card-title">${escapeHtml(item.title)}</div>

                <div class="canvas-card-meta">
                    <span class="canvas-card-meta-dot"></span>
                    <div class="canvas-card-time">${trashMode ? `${tr('canvas.deletedAt')} ${formatCanvasTime(item.deleted_at)}` : formatCanvasTime(item.updated_at || item.created_at)}</div>
                </div>
            </div>
            ${trashMode ? (pendingPurgeCanvasId === item.id ? `
                <div class="canvas-delete-confirm">
                    <div class="canvas-delete-box">
                        <div class="canvas-delete-title">${tr('canvas.purgeConfirm')}</div>
                        <div class="canvas-delete-actions">
                            <button class="canvas-confirm-btn" type="button">${tr('common.confirm')}</button>
                            <button class="canvas-cancel-btn" type="button">${tr('common.cancel')}</button>
                        </div>
                    </div>
                </div>
            ` : `
                <button class="canvas-delete canvas-restore" type="button" title="${tr('canvas.restoreCanvas')}" aria-label="${tr('canvas.restoreCanvas')} ${escapeHtml(item.title)}" style="right:42px">
                    <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-delete canvas-purge" type="button" title="${tr('canvas.purgeCanvas')}" aria-label="${tr('canvas.purgeCanvas')} ${escapeHtml(item.title)}">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
            `) : (pendingDeleteCanvasId === item.id ? `
                <div class="canvas-delete-confirm">
                    <div class="canvas-delete-box">
                        <div class="canvas-delete-title">${tr('canvas.moveToTrashConfirm')}</div>
                        <div class="canvas-delete-actions">
                            <button class="canvas-confirm-btn" type="button">${tr('common.confirm')}</button>
                            <button class="canvas-cancel-btn" type="button">${tr('common.cancel')}</button>
                        </div>
                    </div>
                </div>
            ` : `
                <button class="canvas-pin-btn ${pinned ? 'active' : ''}" type="button" title="${pinned ? (tr('canvas.unpin') || '取消置顶') : (tr('canvas.pin') || '置顶')}" aria-label="${pinned ? (tr('canvas.unpin') || '取消置顶') : (tr('canvas.pin') || '置顶')}">
                    <i data-lucide="pin" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-card-edit" type="button" title="${tr('canvas.rename')}" aria-label="${tr('canvas.rename')} ${escapeHtml(item.title)}">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-folder-btn" type="button" title="${trDefault('canvas.moveToFolder', '移动到文件夹')}" aria-label="${trDefault('canvas.moveToFolder', '移动到文件夹')} ${escapeHtml(item.title)}">
                    <i data-lucide="folder-input" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-delete" type="button" title="${tr('canvas.moveToTrash')}" aria-label="${tr('canvas.moveToTrash')} ${escapeHtml(item.title)}">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
                ${canvasMoveMenuHtml(item)}
            `)}
        `;
        if(!trashMode) {
            row.draggable = true;
            row.addEventListener('dragstart', e => {
                e.dataTransfer?.setData('text/canvas-id', item.id);
                e.dataTransfer?.setData('text/plain', item.id);
                e.dataTransfer.effectAllowed = 'move';
                row.classList.add('dragging');
            });
            row.addEventListener('dragend', () => row.classList.remove('dragging'));
        }
        if(!trashMode) row.querySelector('.canvas-open').onclick = () => openCanvas(item.id);
        const titleEl = row.querySelector('.canvas-card-title');
        const editBtn = row.querySelector('.canvas-card-edit');
        if(editBtn && titleEl && !trashMode) {
            editBtn.onmousedown = e => e.stopPropagation();
            editBtn.onclick = e => { e.stopPropagation(); startTitleEdit(item.id, titleEl); };
        }
        const iconBtn = row.querySelector('.canvas-preview-mark');
        if(iconBtn && !trashMode) {
            iconBtn.onclick = e => toggleEmojiPicker(item.id, e);
            iconBtn.onkeydown = e => {
                if(e.key === 'Enter' || e.key === ' ') toggleEmojiPicker(item.id, e);
            };
        }
        row.querySelectorAll('.emoji-option').forEach(btn => {
            btn.onclick = e => setCanvasIcon(item.id, btn.dataset.icon, e);
        });
        const pinBtn = row.querySelector('.canvas-pin-btn');
        if(pinBtn){
            pinBtn.onmousedown = e => e.stopPropagation();
            pinBtn.onclick = e => togglePinCanvas(item.id, e);
        }
        const folderBtn = row.querySelector('.canvas-folder-btn');
        if(folderBtn){
            folderBtn.onmousedown = e => e.stopPropagation();
            folderBtn.onclick = e => toggleMoveCanvasMenu(item.id, e);
        }
        row.querySelectorAll('[data-move-folder]').forEach(btn => {
            btn.onmousedown = e => e.stopPropagation();
            btn.onclick = e => {
                e.stopPropagation();
                moveCanvasToFolder(item.id, btn.dataset.moveFolder || '');
            };
        });
        const ownerChipEl = row.querySelector('.canvas-owner-chip');
        if(ownerChipEl && !trashMode){
            ownerChipEl.onmousedown = e => e.stopPropagation();
            ownerChipEl.onclick = e => { e.stopPropagation(); toggleEmojiPicker(item.id, e); };
        }
        const deleteBtn = row.querySelector('.canvas-delete');
        if(deleteBtn) deleteBtn.onclick = e => requestDeleteCanvas(item.id, e);
        const confirmBtn = row.querySelector('.canvas-confirm-btn');
        if(confirmBtn) confirmBtn.onclick = e => trashMode ? purgeCanvas(item.id, e) : deleteCanvas(item.id, e);
        const cancelBtn = row.querySelector('.canvas-cancel-btn');
        if(cancelBtn) cancelBtn.onclick = e => cancelDeleteCanvas(e);
        const restoreBtn = row.querySelector('.canvas-restore');
        if(restoreBtn) restoreBtn.onclick = e => restoreCanvas(item.id, e);
        const purgeBtn = row.querySelector('.canvas-purge');
        if(purgeBtn) purgeBtn.onclick = e => requestPurgeCanvas(item.id, e);
        if(!trashMode){
            const menu = document.createElement('details');
            menu.className = 'studio-card-menu';
            const summary = document.createElement('summary');
            summary.setAttribute('aria-label', '画布操作：' + item.title);
            summary.title = '更多操作';
            summary.innerHTML = '<i data-lucide="ellipsis"></i>';
            menu.appendChild(summary);
            const actions = document.createElement('div');
            actions.className = 'studio-card-menu-items';
            for(const [selector, label] of [['.canvas-card-edit','重命名'],['.canvas-folder-btn','移动到文件夹'],['.canvas-preview-mark','封面样式'],['.canvas-pin-btn',pinned ? '取消置顶' : '置顶'],['.canvas-delete','移入回收站']]){
                const control = row.querySelector(selector);
                if(!control) continue;
                if(control.tagName !== 'BUTTON') {
                    const button = document.createElement('button');
                    button.type = 'button'; button.className = 'studio-card-meta-action';
                    button.innerHTML = '<i data-lucide="panels-top-left"></i>';
                    button.onclick = e => {e.stopPropagation(); menu.open=false; openCanvasCoverStyle(item);};
                    actions.appendChild(button);
                    button.appendChild(document.createTextNode(label));
                    control.remove();
                } else {
                    control.appendChild(document.createTextNode(label));
                    actions.appendChild(control);
                }
            }
            menu.appendChild(actions);
            menu.addEventListener('click', e => e.stopPropagation());
            menu.addEventListener('pointerdown', e => e.stopPropagation());
            menu.addEventListener('dragstart', e => e.preventDefault());
            menu.addEventListener('toggle', () => {
                if(menu.open) {
                    document.querySelectorAll('.studio-card-menu[open]').forEach(other => {if(other !== menu) other.open = false;});
                    const rect = summary.getBoundingClientRect();
                    actions.style.position = 'fixed'; actions.style.right = 'auto';
                    actions.style.left = Math.max(12, Math.min(rect.right - 200, window.innerWidth - 212)) + 'px';
                    actions.style.top = Math.max(12, rect.bottom + actions.offsetHeight + 8 > window.innerHeight ? rect.top - actions.offsetHeight - 6 : rect.bottom + 6) + 'px';
                }
            });
            menu.addEventListener('keydown', e => {if(e.key === 'Escape'){menu.open=false;summary.focus();e.stopPropagation();}});
            row.appendChild(menu);
            row.querySelector('.canvas-open').addEventListener('keydown', e => {
                if(e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')){e.preventDefault();openCanvas(item.id);}
            });
        }
        list.appendChild(row);
    });
    refreshIcons();
    renderCanvasMetaPopover();
}
function closeCanvasMetaPopover(){
    emojiPickerCanvasId = null;
    canvasMetaAnchorId = '';
    document.querySelector('.canvas-meta-pop')?.remove();
}
function renderCanvasMetaPopover(){
    document.querySelector('.canvas-meta-pop')?.remove();
    if(trashMode || !emojiPickerCanvasId) return;
    const item = canvases.find(entry => entry.id === emojiPickerCanvasId);
    if(!item) return;
    const color = String(item.color || '').trim();
    const owner = String(item.owner || '').trim();
    const pop = document.createElement('div');
    pop.className = 'canvas-meta-pop';
    pop.dataset.canvasMetaPop = item.id;
    pop.innerHTML = `
        <div class="canvas-meta-section">
            <div class="canvas-meta-label">${tr('canvas.ownerLabel') || '负责人 / 项目'}</div>
            <input class="canvas-owner-input" type="text" maxlength="40" value="${escapeAttr(owner)}" placeholder="${escapeAttr(tr('canvas.ownerPlaceholder') || '如：张三 / 双十一项目')}">
        </div>
        <div class="canvas-meta-section">
            <div class="canvas-meta-label">${tr('canvas.colorLabel') || '颜色标记'}</div>
            <div class="canvas-color-row">
                <button class="canvas-color-swatch cc-none ${!color ? 'active' : ''}" type="button" data-color="" title="${tr('canvas.colorNone') || '无'}"><i data-lucide="ban" class="w-3 h-3"></i></button>
                ${CANVAS_COLOR_OPTIONS.map(c => `<button class="canvas-color-swatch cc-${c} ${color === c ? 'active' : ''}" type="button" data-color="${c}" aria-label="${c}"></button>`).join('')}
            </div>
        </div>
        <div class="canvas-meta-section">
            <div class="canvas-meta-label">${tr('canvas.changeIcon')}</div>
            <div class="emoji-picker-grid">
                ${CANVAS_EMOJIS.map(icon => `<button class="emoji-option" type="button" data-icon="${escapeHtml(icon)}">${renderCanvasIcon(icon, 14)}</button>`).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(pop);
    pop.querySelectorAll('.emoji-option').forEach(btn => {
        btn.onclick = e => setCanvasIcon(item.id, btn.dataset.icon, e);
    });
    pop.querySelectorAll('.canvas-color-swatch').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => setCanvasColorValue(item.id, btn.dataset.color || '', e);
    });
    const ownerInput = pop.querySelector('.canvas-owner-input');
    if(ownerInput){
        ownerInput.onmousedown = e => e.stopPropagation();
        ownerInput.onclick = e => e.stopPropagation();
        ownerInput.onkeydown = e => {
            e.stopPropagation();
            if(e.key === 'Enter'){ e.preventDefault(); ownerInput.blur(); }
            if(e.key === 'Escape'){ e.preventDefault(); closeCanvasMetaPopover(); renderCanvasList(); }
        };
        ownerInput.onblur = () => commitCanvasOwner(item.id, ownerInput.value);
    }
    refreshIcons();
    requestAnimationFrame(positionCanvasMetaPopover);
}
function positionCanvasMetaPopover(){
    if(!emojiPickerCanvasId) return;
    const pop = document.querySelector('.canvas-meta-pop');
    const anchorId = canvasMetaAnchorId || emojiPickerCanvasId;
    const row = document.querySelector(`.canvas-item[data-canvas-id="${CSS.escape(anchorId)}"]`);
    const icon = row?.querySelector('.studio-card-menu summary') || row?.querySelector('.canvas-preview-mark') || row?.querySelector('.canvas-owner-chip');
    if(!pop || !icon) return;
    const iconRect = icon.getBoundingClientRect();
    const width = pop.offsetWidth || 212;
    const height = pop.offsetHeight || 260;
    const margin = 12;
    let left = Math.min(Math.max(iconRect.left, margin), window.innerWidth - width - margin);
    let top = iconRect.bottom + 8;
    if(top + height > window.innerHeight - margin) top = iconRect.top - height - 8;
    if(top < margin) top = margin;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
}
async function createCanvas(customTitle = ''){
    openCanvasRequestSeq++;

    const isSmart = createCanvasKind === 'smart';
    const titleBase = isSmart ? tr('canvas.newSmartCanvas') : tr('canvas.newCanvas');
    const title = customTitle || `${titleBase} ${new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
    trashMode = false;
    refreshGateViewControls();
    setStatus('Creating...');
    try {
        const data = await window.CanvasApi.createCanvas({title, icon:isSmart ? 'sparkles' : '🧩', kind:isSmart ? 'smart' : 'classic', folder_id:folderTargetForCreate()});
        if(isSmart){
            setCreateMode(false);
            await loadCanvasList(false);
            openSmartCanvasPage(data.canvas?.id);
            return;
        }
        if(window.CanvasSession?.enabled){
            setCreateMode(false);
            await loadCanvasList(false);
            await openCanvas(data.canvas.id);
            return;
        }
        resetCascadeRuntimeState();
        canvas = data.canvas;
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = localViewportForCanvas(canvas.id, {x:0, y:0, scale:1});
        canvas.viewport = {...viewport};
        resetTransientRunState(nodes);
        sanitizeConnections();
        selected.clear();
        setCanvasMode(true);
        render();
        setStatus('Saved');
        setCreateMode(false);
        await loadCanvasList(false);
        renderCanvasList();
    } catch(e) {
        setStatus(tr('canvas.createFailed'));
        console.error(e);
        throw e;
    }
}
async function createSmartCanvas(){
    setCreateMode(true, 'smart');
}
async function openSmartCanvasPage(id){
    if(!id) return;
    await window.FrontendVersion?.checkForUpdate?.();
    const path = `/static/smart-canvas.html?id=${encodeURIComponent(id)}`;
    const target = window.CanvasSession?.enabled ? window.CanvasSession.url(path) : path;
    window.location.href = window.FrontendVersion?.versionedUrl(target) || target;
}
function toggleEmojiPicker(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    pendingDeleteCanvasId = null;
    const opening = emojiPickerCanvasId !== id;
    emojiPickerCanvasId = opening ? id : null;
    canvasMetaAnchorId = opening ? id : '';
    renderCanvasList();
}
async function setCanvasIcon(id, icon, event){
    event?.preventDefault();
    event?.stopPropagation();
    const item = canvases.find(c => c.id === id);
    const nextIcon = icon || 'layers';
    if(item) item.icon = nextIcon;
    if(canvas?.id === id) canvas.icon = nextIcon;
    closeCanvasMetaPopover();
    renderCanvasList();
    try {
        const data = await window.CanvasApi.patchCanvasMeta(id, {icon:nextIcon});
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e) {
        setStatus('图标保存失败');
        console.error(e);
        await loadCanvasList(false);
    }
}
function startTitleEdit(id, titleEl){
    const item = canvases.find(c => c.id === id);
    if(!item) return;
    window.CanvasNameDialog.open({title:'重命名画布', label:'画布名称', value:item.title || '', description:'修改名称不会影响画布内容和连接。', onSubmit:async title => {
        if(title === item.title) return;
        const data = await window.CanvasApi.patchCanvasMeta(id, {title});
        if(data.canvas) updateCanvasListRecord(data.canvas);
        if(canvas?.id === id) { canvas.title = title; if(currentCanvasTitle) currentCanvasTitle.textContent = title; }
        renderCanvasList();
    }});
}
async function openCanvas(id){
    if(window.MemberCanvasEdit?.active && window.MemberCanvasEdit.active.id !== id){
        if(!await window.MemberCanvasEdit.leave()) return;
    }
    const openSeq = ++openCanvasRequestSeq;
    setStatus('Opening...');
    try {
        const data = await window.CanvasApi.getCanvas(id, {errorFallback:tr('canvas.openFailed')});
        if(openSeq !== openCanvasRequestSeq) return;
        resetCascadeRuntimeState();
        const nextCanvas = data.canvas;
        const touched = await touchCanvasOpened(nextCanvas.id);
        if(openSeq !== openCanvasRequestSeq) return;
        if(touched?.updated_at) nextCanvas.updated_at = Number(touched.updated_at);
        if((nextCanvas.kind || 'classic') === 'smart'){
            openSmartCanvasPage(nextCanvas.id);
            return;
        }
        canvas = nextCanvas;
        resetCanvasHistory();
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = localViewportForCanvas(canvas.id, {x:0, y:0, scale:1});
        canvas.viewport = {...viewport};
        lastCanvasUpdatedAt = Number(canvas.updated_at || 0);
        localCanvasDirty = false;
        resetCanvasSaveSnapshot();
        resetTransientRunState(nodes);
        sanitizeConnections();
        if(!window.CanvasSession?.enabled) pruneMissingComfyWorkflows();
        await refreshMissingCanvasAssets();
        selected.clear();
        setCanvasMode(true);
        renderCanvasList();
        render();
        resumeCanvasImageTasks();
        startCanvasRemotePolling();
        setStatus('Ready');
        if(window.CanvasSession?.enabled){
            await window.MemberCanvasEdit.mount({id:canvas.id, dirty:() => localCanvasDirty || savingCanvasNow || saveCanvasAgain,
                taskRecovery:classicTaskRecovery(),
                snapshot:() => ({...canvas, ...canvasSavePayload()}), flush:flushClassicCanvasBeforeFrontendReload,
                refresh:syncRemoteCanvasNow, restore:restoreClassicMemberDraft, busy:() => savingCanvasNow || saveCanvasAgain || cascadeRunningIds.size>0 || nodes.some(n => n.running || (n._pending || []).some(task => !task.failed && !task.paused)),
                openCopy:async copy => {await loadCanvasList(false);await openCanvas(copy.id);},
                reload:async () => { const loaded=await openCanvas(id); if(!loaded) throw new Error('画布重载失败，请重试'); return loaded; },
                changed:lease => { if(!lease.canEdit){ clearTimeout(saveTimer); saveTimer=null; } else resumeCanvasImageTasks(); }
            });
        } else checkCanvasLock().then(() => {
            if(!canvasLockedByOther && !canvasLockHolder){
                acquireCanvasLock();
            }
            startCanvasLockPolling();
        });
        return canvas;
    } catch(e) {
        setStatus(tr('canvas.openFailed'));
        console.error(e);
    }
}

async function returnToCanvasManager(){
    if(window.MemberCanvasEdit && !await window.MemberCanvasEdit.leave()) return;
    openCanvasRequestSeq++;
    clearTimeout(saveTimer);
    clearTimeout(remoteSyncTimer);
    remoteSyncTimer = null;
    if(canvas && localCanvasDirty) await saveCanvas();
    stopCanvasRemotePolling();
    stopCanvasLockPolling();
    await releaseCanvasLock();
    canvas = null;
    nodes = [];
    connections = [];
    selected.clear();
    viewport = {x: -1800, y: -1000, scale: 1};
    setCanvasMode(false);
    trashMode = false;
    pendingPurgeCanvasId = null;
    refreshGateViewControls();
    await loadCanvasList(false);
    setCreateMode(false);
}

window.addEventListener('frontend:before-reload', event => {
    if(typeof event.detail?.waitUntil === 'function'){
        if(window.CanvasSession?.enabled){
            event.detail.waitUntil(window.MemberCanvasEdit.prepareReload());
            return;
        }
        event.detail.waitUntil(flushClassicCanvasBeforeFrontendReload());
    }
});

// beforeunload — protect unsaved work and release lock on tab close
window.addEventListener('beforeunload', event => {
    if(localCanvasDirty || savingCanvasNow || saveCanvasAgain || saveTimer){
        event.preventDefault();
        event.returnValue = '';
    }
    releaseCanvasLockOnExit();
});
window.addEventListener('pagehide', () => {
    if(outputLightbox?.classList.contains('open')) closeOutputLightbox();
    else releaseOutputLightboxAudio();
});

function requestDeleteCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    closeCanvasMetaPopover();
    pendingPurgeCanvasId = null;
    pendingDeleteCanvasId = id;
    renderCanvasList();
}
function requestPurgeCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    closeCanvasMetaPopover();
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = id;
    renderCanvasList();
}
function cancelDeleteCanvas(event){
    event?.preventDefault();
    event?.stopPropagation();
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = null;
    renderCanvasList();
}
async function deleteCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Moving to trash...');
    try {
        const res = await window.CanvasApi.deleteCanvas(id);
        if(!res.ok) throw new Error(tr('canvas.moveToTrashFailed'));
        const deletingCurrent = canvas?.id === id;
        pendingDeleteCanvasId = null;
        canvases = canvases.filter(item => item.id !== id);
        if(deletingCurrent){
            canvas = null;
            nodes = [];
            connections = [];
            selected.clear();
            viewport = {x: -1800, y: -1000, scale: 1};
            setCanvasMode(false);
        }
        renderCanvasList();
        setStatus(canvases.length ? tr('canvas.movedToTrash') : tr('canvas.noCanvasCreateFirst'));
        await loadCanvasList(false);
    } catch(e) {
        setStatus(tr('canvas.moveToTrashFailed'));
        console.error(e);
    }
}
async function restoreCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Restoring...');
    try {
        const res = await window.CanvasApi.restoreCanvas(id);
        if(!res.ok) throw new Error(tr('canvas.restoreFailed'));
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        await loadCanvasList(false);
        await loadTrashList();
        setStatus(tr('canvas.restored'));
    } catch(e) {
        setStatus(tr('canvas.restoreFailed'));
        console.error(e);
    }
}
async function purgeCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Deleting...');
    try {
        const res = await window.CanvasApi.purgeCanvas(id);
        if(!res.ok) throw new Error(tr('canvas.purgeFailed'));
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        renderCanvasList();
        setStatus(deletedCanvases.length ? tr('canvas.purged') : tr('canvas.trashEmpty'));
        await loadTrashList();
    } catch(e) {
        setStatus(tr('canvas.purgeFailed'));
        console.error(e);
    }
}
window.createCanvas = createCanvas;
window.createSmartCanvas = createSmartCanvas;
window.loadCanvasList = loadCanvasList;
window.openCanvas = openCanvas;
window.deleteCanvas = deleteCanvas;
window.returnToCanvasManager = returnToCanvasManager;
gateCreateBtn.addEventListener('click', () => setCreateMode(true));
gateCreateSmartBtn?.addEventListener('click', createSmartCanvas);
gateNewFolderBtn?.addEventListener('click', () => createCanvasFolder(''));
gateBackBtn.addEventListener('click', () => setTrashMode(false));
gateTrashBtn.addEventListener('click', () => setTrashMode(true));
gateRefreshBtn.addEventListener('click', () => trashMode ? loadTrashList() : loadCanvasList(false, {refreshFolders:true}));
document.getElementById('gateSortSwitch')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-sort]');
    if(btn) setCanvasSortMode(btn.dataset.sort);
});
gateSearchInput?.addEventListener('input', event => {
    canvasSearchQuery = event.target.value || '';
    closeCanvasMetaPopover();
    renderCanvasList();
});
gateSearchInput?.addEventListener('keydown', event => {
    if(event.key !== 'Escape' || !canvasSearchQuery) return;
    event.preventDefault();
    canvasSearchQuery = '';
    renderCanvasList();
});
gateSearchClear?.addEventListener('click', () => {
    canvasSearchQuery = '';
    renderCanvasList();
    gateSearchInput?.focus();
});

document.addEventListener('mousedown', e => {
    if(movingCanvasId && !e.target.closest('.canvas-folder-menu') && !e.target.closest('.canvas-folder-btn')){
        movingCanvasId = null;
        renderCanvasList();
    }
    if(emojiPickerCanvasId === null) return;
    if(e.target.closest('.canvas-meta-pop') || e.target.closest('.canvas-preview-mark') || e.target.closest('.canvas-owner-chip')) return;
    closeCanvasMetaPopover();
    renderCanvasList();
});
gateCanvasList?.addEventListener('scroll', () => requestAnimationFrame(positionCanvasMetaPopover), {passive:true});
window.addEventListener('resize', () => requestAnimationFrame(positionCanvasMetaPopover));
window.addEventListener('studio-theme-change', event => applyTheme(event.detail?.theme || 'light'));
bindClassicImageEditorControls();
window.addEventListener('resize', () => {
    if(cropState) syncImageEditOverflow();
    scheduleMinimapRender();
});
backToManagerBtn.addEventListener('click', returnToCanvasManager);

const CANVAS_NODE_ASSET_DRAG_TYPE = 'application/x-canvas-node-asset';
const IMAGE_DROP_EXT_RE = /\.(png|jpe?g|webp|gif)$/i;
const IMAGE_DROP_TEXT_TYPES = [
    'text/uri-list',
    'text/plain',
    'text/html',
    'DownloadURL',
    'text/x-moz-url',
    'text/x-file-url',
    'public.file-url',
    'public.url',
    'UniformResourceLocator',
    'FileName',
    'FileNameW'
];
const IMAGE_DROP_TYPE_HINT_RE = /^(?:files?|image\/.+|text\/(?:uri-list|html|plain|x-moz-url|x-file-url)|downloadurl|public\.(?:file-url|url)|uniformresourcelocator|filenamew?)$|application\/x-qt-(?:windows-mime|image)|application\/x-moz-file|com\.eagle/i;

const MASK_BRUSH_ALPHA = 115;
const MASK_BRUSH_COLOR = `rgba(255,255,255,${MASK_BRUSH_ALPHA / 255})`;

bindClassicCropDragEvents();

const loopPromptVisiting = new Set();

const canvasAssetHover = window.CanvasCore.createAssetHoverController(showCanvasAssetHoverPreviewNow, hideCanvasAssetHoverPreviewNow, positionCanvasAssetHoverPreviewNow);

window.closeAssetManager = closeAssetManager;

const generationSettingsOpen = new WeakMap();

const canvasInputViewCache = new WeakMap();

const CANVAS_GENERATOR_TYPES = ['generator','msgen','comfy','ltxDirector','video'];
const CANVAS_IMAGE_OUTPUT_TYPES = ['generator','msgen','comfy','ltxDirector'];
const CANVAS_MEDIA_OUTPUT_TYPES = ['generator','msgen','comfy','ltxDirector','video'];

let videoCostBackfillRunning = false;

bindClassicLedgerUpdates();

window.openCanvasLog = openCanvasLog;
window.openCanvasCost = openCanvasCost;
window.closeCanvasLog = closeCanvasLog;

window.createCanvasBackup = createCanvasBackup;
window.showBackupList = showBackupList;
window.closeBackupModal = closeBackupModal;

bindClassicLibraryControls();
bindClassicWorkflowToggle();
bindClassicLogToggle();
bindClassicWorkflowFileInput();
bindClassicLibraryNavigation();
bindClassicWorkflowDropEvents();

bindClassicAssetManagerEvents();

bindClassicMinimapEvents();

bindClassicBoardEvents();
bindClassicMediaImportEvents();
// 使用捕获阶段，避免节点内控件 stopPropagation 后让画布快捷键偶发失效。
bindClassicKeyboardEvents();
bindClassicSessionVisibility();
bindClassicSelectionBlur();

function escapeHtml(str){ return window.CanvasCore?.escapeHtml(str) || ''; }
function escapeAttr(str){ return escapeHtml(str); }

window.onload = async () => {
    if(window.CanvasSession) await window.CanvasSession.ready;
    applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem(CANVAS_THEME_KEY) || 'light');
    applyQuickToolbarState();
    updateCanvasIdentityButton();

    document.title = tr('canvas.title');
    initOutputCompareEvents();
    initOutputPreviewZoomEvents();
    applyViewport();
    await loadConfig();
    pruneMissingComfyWorkflows();
    await loadCanvasList(false, {refreshFolders:true});
    setCanvasMode(false);
};

bindClassicCardMenuDismissal();

function openCanvasCoverStyle(item){
    if(document.querySelector('.studio-cover-dialog')) return;
    const origin = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'studio-cover-dialog';
    dialog.setAttribute('aria-labelledby','coverStyleTitle');
    dialog.innerHTML = '<h2 id="coverStyleTitle">封面样式</h2><p>用画布名称作为封面，选择适合这份创作的排版。</p><div class="studio-cover-options" role="group" aria-label="封面风格"></div><p class="studio-cover-error" role="alert" hidden></p><footer><button type="button" class="cover-cancel">取消</button><button type="button" class="cover-save">保存样式</button></footer>';
    let choice = item.cover_style || 'type', busy = false;
    const options = dialog.querySelector('.studio-cover-options');
    for(const [key,label] of [['type','经典大字'],['editorial','杂志衬线'],['sage','鼠尾草'],['ink','墨色']]){
        const button = document.createElement('button');button.type='button';button.dataset.coverStyle=key;
        const sample=document.createElement('strong');sample.className='studio-cover-title';sample.textContent=item.title || '未命名画布';
        const caption=document.createElement('span');caption.textContent=label;
        button.append(sample,caption);button.setAttribute('aria-pressed',String(choice===key));
        button.onclick=()=>{choice=key;options.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));};options.append(button);
    }
    dialog.querySelector('.cover-cancel').onclick=()=>dialog.close();
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.addEventListener('close',()=>{dialog.remove();if(origin?.isConnected)origin.focus();});
    dialog.querySelector('.cover-save').onclick=async()=>{
        if(busy)return;busy=true;
        dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
        const error=dialog.querySelector('.studio-cover-error');error.hidden=true;
        try{
            if(choice!== (item.cover_style || 'type')){
                const data=await window.CanvasApi.patchCanvasMeta(item.id,{cover_style:choice});
                if(data.canvas)updateCanvasListRecord(data.canvas);
                if(canvas?.id===item.id)canvas.cover_style=choice;
                renderCanvasList();
            }
            dialog.close();
        }catch(e){error.textContent=e.message || '保存失败，请重试';error.hidden=false;}
        finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    document.body.append(dialog);dialog.showModal();
}

// Apply availability and policies together; never rebuild a field while it is being edited.
function refreshCanvasModelControls(){
    if(!canvas) return;
    const ids = [];
    for(const node of nodes){
        if(!['generator','video','llm'].includes(node.type)) continue;
        const element = nodesEl.querySelector(`.node[data-id="${CSS.escape(node.id)}"]`);
        if(!element) continue;
        const active = document.activeElement;
        if(element.contains(active) && active?.matches('input,textarea,select,[contenteditable="true"]')){
            if(!element.dataset.modelRefreshPending){
                element.dataset.modelRefreshPending = 'true';
                element.addEventListener('focusout', () => {
                    delete element.dataset.modelRefreshPending;
                    setTimeout(refreshCanvasModelControls, 0);
                }, {once:true});
            }
        } else ids.push(node.id);
    }
    refreshNodes(ids);
}
function applyCanvasModelConfig(cfg){
    if(!Array.isArray(cfg.api_providers)) return;
    const providers = window.CanvasCore.availableModelProviders(cfg.api_providers);
    if(JSON.stringify(providers) === JSON.stringify(apiProviders)) return;
    apiProviders = providers;
    refreshCanvasModelControls();
}
window.VideoDurationPolicy.watch({read:()=>window.CanvasApi.getConfig(),apply:applyCanvasModelConfig});
