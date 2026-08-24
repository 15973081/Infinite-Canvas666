import{a as e,r as t,s as n,t as r}from"./site-jsx-runtime-BGbSauha.js";var i=n(),a=e(),o=`<div class="page">
        <div class="wrap">
            <header class="page-head">
                <div>
                    <div class="title">API 设置</div>
                    <div class="sub">管理平台地址、模型列表和 Key。Key 写入后端 env，页面不会回显完整内容。</div>
                </div>
                <div id="status" class="status"></div>
            </header>

            <div class="layout">
                <aside class="sidebar">
                    <div class="side-section-title">平台列表</div>
                    <div id="providerList" class="provider-list"></div>
                    <button class="add-btn" type="button" onclick="addProvider()"><i data-lucide="plus" class="w-4 h-4"></i><span>新增平台</span></button>
                    <button class="api-link-btn" type="button" onclick="openRecommendApi()"><i data-lucide="sparkles" class="w-4 h-4"></i><span>推荐API</span></button>
                </aside>

                <main id="settingsContent" class="content">
                    <div class="content-head">
                        <div>
                            <div id="editorTitle" class="editor-title">平台</div>
                            <div class="editor-sub">配置基础信息、API Key 和可用模型</div>
                        </div>
                        <div class="content-actions">
                            <button id="deleteBtn" class="action-btn danger-btn api-page-delete-btn" type="button" onclick="deleteProvider()"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>删除</span></button>
                            <button class="action-btn save-btn api-page-save-btn" type="button" onclick="saveProviders()"><i data-lucide="save" class="w-3.5 h-3.5"></i><span>保存</span></button>
                        </div>
                    </div>

                    <section id="providerOnboardingCard" class="provider-onboarding-card" hidden></section>

                    <section class="block">
                        <div class="block-head">
                            <div>
                                <div class="block-title">基本信息</div>
                                <div class="block-desc">平台显示名、唯一 ID 和请求地址</div>
                            </div>
                        </div>
                        <div class="form">
                            <label class="field full">
                                <span class="label">平台名称</span>
                                <div class="field-frame"><input id="nameInput" type="text" placeholder="Comfly"></div>
                                <span class="hint"><span>平台 ID</span>: <span id="idPreview" style="font-family:ui-monospace,Menlo,monospace;color:var(--text)">—</span></span>
                                <input id="idInput" type="hidden">
                            </label>
                            <label class="field full api-base-url-field">
                                <span class="label">请求地址</span>
                                <div class="field-frame"><input id="baseInput" type="text" placeholder="https://api.example.com/v1"></div>
                                <div class="ms-hint">
                                    <span class="ms-line"><span>国内默认请求地址：</span><span class="inline-code">https://api-inference.modelscope.cn/v1</span></span>
                                    <span class="ms-line"><span>国外使用请求地址：</span><span class="inline-code">https://api-inference.modelscope.ai/v1</span></span>
                                </div>
                                <div class="runninghub-hint">
                                    <span class="ms-line">国外地址：<span class="inline-code">https://www.runninghub.ai</span></span>
                                </div>
                                <div class="volcengine-hint">
                                    <span class="ms-line">方舟默认请求地址：<span class="inline-code">https://ark.cn-beijing.volces.com/api/v3</span></span>
                                    <span class="ms-line">Seedance 视频生成使用方舟 API Key，验证会请求 <span class="inline-code">/api/v3/models</span>。</span>
                                </div>
                            </label>
                            <label class="field full api-proxy-field">
                                <span class="label">代理地址</span>
                                <div class="field-frame"><input id="proxyInput" type="text" placeholder="http://127.0.0.1:7890"></div>
                                <span class="hint">仅对自定义平台生效，支持 http://、https://；留空则不单独指定。</span>
                            </label>
                            <label class="field full api-key-field">
                                <span class="label api-key-label">API Key</span>
                                <div class="key-panel api-standard-key-row">
                                    <div class="key-input-line">
                                        <div class="field-frame"><input id="keyInput" type="password"></div>
                                        <div class="key-actions">
                                            <button class="key-btn" type="button" onclick="saveKeyOnly()" title="保存 Key"><i data-lucide="check" class="w-4 h-4"></i></button>
                                            <button class="key-btn key-clear" type="button" onclick="clearKeyOnly()" title="清除 Key"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                        </div>
                                    </div>
                                </div>
                                <span id="keyHint" class="hint"></span>
                                <div class="rh-key-stack">
                                    <div class="rh-key-item">
                                        <div class="rh-key-head">
                                            <div>
                                                <div class="rh-key-title">RH币 API Key · 必填</div>
                                                <div class="rh-key-desc">使用 RH币 接口时填写</div>
                                            </div>
                                            <div class="rh-key-links">
                                                <span>获取</span>
                                                <a href="https://www.runninghub.cn/enterprise-api/consumerApi?inviteCode=rh-v1331" target="_blank" rel="noopener"><i data-lucide="external-link" class="w-3 h-3"></i><span>国内 Key</span></a>
                                                <a href="https://www.runninghub.ai/enterprise-api/consumerApi?inviteCode=rh-v1331" target="_blank" rel="noopener"><i data-lucide="external-link" class="w-3 h-3"></i><span>国外 Key</span></a>
                                            </div>
                                        </div>
                                        <div class="key-input-line">
                                            <div class="field-frame"><input id="rhFreeKeyInput" type="password"></div>
                                            <div class="key-actions">
                                                <button class="key-btn" type="button" onclick="saveRhKeyOnly('free')" title="保存 RH币 Key"><i data-lucide="check" class="w-4 h-4"></i></button>
                                                <button class="key-btn key-clear" type="button" onclick="clearRhKeyOnly('free')" title="清除 RH币 Key"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                            </div>
                                        </div>
                                        <span id="rhFreeKeyHint" class="hint"></span>
                                    </div>
                                    <div class="rh-key-item">
                                        <div class="rh-key-head">
                                            <div>
                                                <div class="rh-key-title">账户余额 API Key · 可选</div>
                                                <div class="rh-key-desc">使用账户余额接口时填写</div>
                                            </div>
                                            <div class="rh-key-links">
                                                <span>获取</span>
                                                <a href="https://www.runninghub.cn/enterprise-api/sharedApi?inviteCode=rh-v1331" target="_blank" rel="noopener"><i data-lucide="external-link" class="w-3 h-3"></i><span>国内 Key</span></a>
                                                <a href="https://www.runninghub.ai/enterprise-api/sharedApi?inviteCode=rh-v1331" target="_blank" rel="noopener"><i data-lucide="external-link" class="w-3 h-3"></i><span>国外 Key</span></a>
                                            </div>
                                        </div>
                                        <div class="key-input-line">
                                            <div class="field-frame"><input id="rhWalletKeyInput" type="password"></div>
                                            <div class="key-actions">
                                                <button class="key-btn" type="button" onclick="saveRhKeyOnly('wallet')" title="保存账户余额 Key"><i data-lucide="check" class="w-4 h-4"></i></button>
                                                <button class="key-btn key-clear" type="button" onclick="clearRhKeyOnly('wallet')" title="清除账户余额 Key"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                            </div>
                                        </div>
                                        <span id="rhWalletKeyHint" class="hint"></span>
                                    </div>
                                </div>
                                <div class="volcengine-key-stack">
                                    <div class="rh-key-item">
                                        <div class="rh-key-head">
                                            <div>
                                                <div class="rh-key-title">方舟 API Key · 生成视频</div>
                                                <div class="rh-key-desc">用于 Seedance 2.0 生成接口，Authorization: Bearer。</div>
                                            </div>
                                        </div>
                                        <span id="volcArkKeyHint" class="hint"></span>
                                    </div>
                                    <div class="rh-key-item">
                                        <div class="rh-key-head">
                                            <div>
                                                <div class="rh-key-title">素材库 AK/SK · 上传素材</div>
                                                <div class="rh-key-desc">用于 CreateAssetGroup / CreateAsset / GetAsset 的 Access Key 鉴权。</div>
                                            </div>
                                        </div>
                                        <div class="key-input-line">
                                            <div class="field-frame"><input id="volcAkInput" type="password" placeholder="Access Key ID"></div>
                                        </div>
                                        <div class="key-input-line">
                                            <div class="field-frame"><input id="volcSkInput" type="password" placeholder="Secret Access Key"></div>
                                            <div class="key-actions">
                                                <button class="key-btn" type="button" onclick="saveVolcengineAssetKeys()" title="保存火山素材库 AK/SK"><i data-lucide="check" class="w-4 h-4"></i></button>
                                                <button class="key-btn key-clear" type="button" onclick="clearVolcengineAssetKeys()" title="清除火山素材库 AK/SK"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                            </div>
                                        </div>
                                        <span id="volcAssetKeyHint" class="hint"></span>
                                    </div>
                                    <div class="rh-key-item volcengine-project-card">
                                        <div class="rh-key-head">
                                            <div>
                                                <div class="rh-key-title">素材库项目</div>
                                                <div class="rh-key-desc">ProjectName 必须和视频生成 API Key 所属项目一致。</div>
                                            </div>
                                        </div>
                                        <div class="volcengine-project-grid">
                                            <div class="rh-card-title-field">
                                                <span>ProjectName</span>
                                                <input id="volcProjectInput" type="text" value="default">
                                            </div>
                                            <div class="rh-card-title-field">
                                                <span>Region</span>
                                                <input id="volcRegionInput" type="text" value="cn-beijing">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="ms-hint">
                                    <span class="ms-line"><span>获取 Token · 国内：</span><a href="https://www.modelscope.cn/my/access/token" target="_blank">https://www.modelscope.cn/my/access/token</a></span>
                                    <span class="ms-line"><span>获取 Token · 国外：</span><a href="https://www.modelscope.ai/my/access/token" target="_blank">https://www.modelscope.ai/my/access/token</a></span>
                                </div>
                                <div class="runninghub-hint">
                                </div>
                            </label>
                            <!-- 验证操作行 -->
                            <div class="verify-action-row">
                                <button id="testUrlBtn" class="action-btn" type="button" onclick="testConnection()">
                                    <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i><span>验证地址</span>
                                </button>
                                <button id="probeAsyncBtn" class="action-btn" type="button" onclick="probeAsync()">
                                    <i data-lucide="radar" class="w-3.5 h-3.5"></i><span>验证协议</span>
                                </button>
                                <div class="field-frame protocol-selector-wrap">
                                    <select id="protocolInput">
                                        <option value="openai">OpenAI 直连</option>
                                        <option value="apimart">异步协议</option>
                                        <option value="gemini">Gemini 协议</option>
                                        <option value="volcengine">方舟/Ark 任务协议</option>
                                    </select>
                                </div>
                                <div class="field-frame image-request-mode-wrap">
                                    <select id="imageRequestModeInput" title="图片接口">
                                        <option value="openai">图片：OpenAI 标准</option>
                                        <option value="openai-json">图片：OpenAI JSON</option>
                                    </select>
                                </div>
                            </div>
                            <div id="verifyResult" style="display:none;padding:2px 0;grid-column:1/-1"></div>
                        </div>
                    </section>

                    <section id="runninghubConfigBlock" class="block runninghub-config-block" hidden>
                        <div class="block-head">
                            <div>
                                <div class="block-title">应用与工作流</div>
                                <div class="block-desc">粘贴运行路径后，点击右侧创建卡片。</div>
                            </div>
                        </div>
                        <div class="rh-paste-row">
                            <input id="rhPasteInput" class="rh-paste-input" type="text" placeholder="/run/ai-app/... 或 /run/workflow/...">
                            <button class="action-btn" type="button" onclick="createRhEntryFromPaste()"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>创建</span></button>
                        </div>
                        <div class="rh-card-columns">
                            <div class="rh-card-group">
                                <div class="rh-group-head">
                                    <div class="rh-group-title">AI 应用</div>
                                    <div id="rhAppsCount" class="rh-group-count">0</div>
                                </div>
                                <div id="rhAppsList" class="rh-card-list"></div>
                            </div>
                            <div class="rh-card-group">
                                <div class="rh-group-head">
                                    <div class="rh-group-title">工作流</div>
                                    <div id="rhWorkflowsCount" class="rh-group-count">0</div>
                                </div>
                                <div id="rhWorkflowsList" class="rh-card-list"></div>
                            </div>
                        </div>
                    </section>

                    <div id="modelsHead" class="block models-toolbar">
                        <div>
                            <div class="block-title">模型列表</div>
                            <div class="block-desc">从上游 API 自动拉取所有可用模型并按类型分类（image / chat / video）</div>
                        </div>
                        <div class="models-toolbar-actions">
                            <button id="fetchModelsBtn" class="action-btn primary-btn" type="button" onclick="fetchModels()">
                                <i data-lucide="download-cloud" class="w-3.5 h-3.5"></i><span>拉取模型</span>
                            </button>
                            <button id="openPickerBtn" class="action-btn" type="button" onclick="openModelPicker()" disabled style="opacity:.5">
                                <i data-lucide="list-checks" class="w-3.5 h-3.5"></i><span>选择模型</span>
                            </button>
                        </div>
                    </div>
                    <div class="model-grid">
                        <section class="block">
                            <div class="block-head">
                                <div>
                                    <div class="block-title">生图模型</div>
                                    <div class="block-desc">在线生图和无限画布 API 生成使用。</div>
                                    <div class="ms-hint">
                                        <span class="ms-line"><span>模型名称示意：</span><span class="inline-code">Tongyi-MAI/Z-Image-Turbo</span></span>
                                    </div>
                                </div>
                                <button class="ghost-btn" type="button" onclick="addModel('image')"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>模型</span></button>
                            </div>
                            <div id="imageModelList" class="model-list"></div>
                        </section>

                        <section class="block">
                            <div class="block-head">
                                <div>
                                    <div class="block-title">聊天模型</div>
                                    <div class="block-desc">GPT 对话和 LLM 节点使用。</div>
                                </div>
                                <button class="ghost-btn" type="button" onclick="addModel('chat')"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>模型</span></button>
                        </div>
                        <div id="chatModelList" class="model-list"></div>
                    </section>

                        <section class="block">
                            <div class="block-head">
                                <div>
                                    <div class="block-title">视频模型</div>
                                    <div class="block-desc">无限画布视频生成节点使用。</div>
                                </div>
                                <button class="ghost-btn" type="button" onclick="addModel('video')"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>模型</span></button>
                            </div>
                            <div id="videoModelList" class="model-list"></div>
                        </section>

                        <section id="msLoraBlock" class="block ms-lora-block">
                            <div class="block-head">
                                <div>
                                    <div class="block-title">LoRA 管理</div>
                                    <div class="block-desc">为 ModelScope 生图模型绑定可用 LoRA。无限画布 MS 节点会按当前模型自动筛选。</div>
                                    <div class="ms-hint">
                                        <span class="ms-line"><span>中文模型库：</span><a href="https://www.modelscope.cn/aigc/models" target="_blank">https://www.modelscope.cn/aigc/models</a></span>
                                        <span class="ms-line"><span>英文模型库：</span><a href="https://www.modelscope.ai/civision/models" target="_blank">https://www.modelscope.ai/civision/models</a></span>
                                    </div>
                                </div>
                                <button class="ghost-btn" type="button" onclick="addMsLora()"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>LoRA</span></button>
                            </div>
                            <div id="msLoraList" class="lora-list"></div>
                        </section>
                </div>
            </main>
                <main id="recommendContent" class="content recommend-content" hidden>
                    <div class="content-head">
                        <div>
                            <div class="editor-title">推荐平台</div>
                            <div class="editor-sub">获取 Key 后保存，右侧会切换到刚保存的平台配置。</div>
                        </div>
                    </div>
                    <section id="recommendPanel" class="provider-onboarding-card recommend-inline-card"></section>
                </main>
        </div>
        </div>
    </div>

    <!-- 模型选择浮层 -->
    <div id="recommendApiOverlay" class="picker-overlay">
        <div class="picker-modal">
            <div class="picker-head">
                <div>
                    <div class="picker-title">推荐API</div>
                    <div class="picker-count">选择平台后可以一键填写请求地址和协议。</div>
                </div>
                <div class="picker-close" onclick="closeRecommendApi()"><i data-lucide="x" class="w-4 h-4"></i></div>
            </div>
            <div id="recommendApiList" class="recommend-api-body"></div>
            <div class="recommend-note">提示：账户内需要至少 0.05 元余额，才能验证地址并拉取模型。</div>
        </div>
    </div>

    <div id="modelPickerOverlay" class="picker-overlay">
        <div class="picker-modal">
            <div class="picker-head">
                <div>
                    <div class="picker-title">从上游拉取的模型清单</div>
                    <div id="pickerCount" class="picker-count">—</div>
                </div>
                <div class="picker-close" onclick="closeModelPicker()"><i data-lucide="x" class="w-4 h-4"></i></div>
            </div>
            <div class="picker-toolbar">
                <input id="pickerFilter" class="picker-search" type="text" placeholder="按名称搜索模型…" oninput="renderModelPicker()">
                <div class="picker-cat-tabs">
                    <button class="picker-cat-tab active" data-cat="all" onclick="selectPickerCat('all')">全部 <span class="cat-count">0</span></button>
                    <button class="picker-cat-tab" data-cat="image" onclick="selectPickerCat('image')">生图 <span class="cat-count">0</span></button>
                    <button class="picker-cat-tab" data-cat="chat" onclick="selectPickerCat('chat')">LLM <span class="cat-count">0</span></button>
                    <button class="picker-cat-tab" data-cat="video" onclick="selectPickerCat('video')">视频 <span class="cat-count">0</span></button>
                </div>
            </div>
            <div id="pickerList" class="picker-body"></div>
            <div id="pickerSummary" class="picker-summary">
                <span class="picker-summary-title">将应用：</span>
                <span id="sumImage" class="picker-sum-chip picker-sum-chip-empty">生图 0</span>
                <span id="sumChat" class="picker-sum-chip picker-sum-chip-empty">聊天 0</span>
                <span id="sumVideo" class="picker-sum-chip picker-sum-chip-empty">视频 0</span>
                <span id="sumUnsel" style="margin-left:auto;color:var(--faint)">未选 0</span>
            </div>
            <div class="picker-foot">
                <button class="action-btn" type="button" onclick="closeModelPicker()">取消</button>
                <button class="action-btn save-btn" type="button" onclick="applyModelPicker()">应用到模型列表</button>
            </div>
        </div>
    </div>

    <div id="rhWorkflowEditorOverlay" class="rh-workflow-editor-overlay">
        <div class="rh-workflow-editor-modal">
            <div class="rh-workflow-editor-head">
                <div class="rh-workflow-editor-title-wrap">
                    <div id="rhWorkflowEditorTitle" class="rh-workflow-editor-title">RunningHub 工作流</div>
                    <div id="rhWorkflowEditorSub" class="rh-workflow-editor-sub">选择要暴露到画布的输入参数</div>
                </div>
                <div class="rh-workflow-editor-actions">
                    <button class="action-btn" type="button" onclick="fetchRhWorkflowEditor(true)"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>重新拉取</span></button>
                    <button id="rhWorkflowSaveBtn" class="action-btn save-btn" type="button" onclick="saveRhWorkflowEditor()"><i data-lucide="save" class="w-3.5 h-3.5"></i><span>保存</span></button>
                    <button class="rh-workflow-editor-close" type="button" onclick="closeRhWorkflowEditor()"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
            </div>
            <div class="rh-workflow-editor-body">
                <aside class="rh-workflow-editor-side">
                    <label class="rh-editor-field">
                        <span>名称</span>
                        <input id="rhWorkflowEditName" type="text" oninput="updateRhWorkflowEditorMeta('title', this.value)">
                    </label>
                    <label class="rh-editor-field">
                        <span>备注</span>
                        <textarea id="rhWorkflowEditNote" oninput="updateRhWorkflowEditorMeta('description', this.value)"></textarea>
                    </label>
                    <div id="rhWorkflowEditorSummary" class="rh-editor-summary"></div>
                    <div id="rhWorkflowEditorNodeList" class="rh-editor-node-list"></div>
                </aside>
                <section class="rh-workflow-editor-canvas">
                    <div id="rhWorkflowEditorGraphWrap" class="rh-editor-graph-wrap">
                        <svg id="rhWorkflowEditorGraphSvg" class="rh-editor-graph-svg"></svg>
                        <div class="rh-editor-graph-controls">
                            <button type="button" onclick="rhEditorGraphZoom(-1)" title="缩小"><i data-lucide="zoom-out" class="w-4 h-4"></i></button>
                            <span id="rhWorkflowEditorZoom">100%</span>
                            <button type="button" onclick="rhEditorGraphZoom(1)" title="放大"><i data-lucide="zoom-in" class="w-4 h-4"></i></button>
                            <button type="button" onclick="rhEditorGraphFit()" title="适应窗口"><i data-lucide="maximize" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
`,s=!1;function c(){if(s)return;s=!0;let e=[],t=``,n=document.getElementById(`providerList`),r=document.getElementById(`editorTitle`),i=document.getElementById(`status`),a=document.getElementById(`nameInput`),o=document.getElementById(`idInput`),c=document.getElementById(`baseInput`),l=document.getElementById(`proxyInput`),u=document.getElementById(`protocolInput`),d=document.getElementById(`imageRequestModeInput`),f=document.getElementById(`keyInput`),ee=document.getElementById(`keyHint`),p=document.getElementById(`rhFreeKeyInput`),m=document.getElementById(`rhWalletKeyInput`),te=document.getElementById(`rhFreeKeyHint`),ne=document.getElementById(`rhWalletKeyHint`),re=document.getElementById(`volcArkKeyHint`),h=document.getElementById(`volcAkInput`),g=document.getElementById(`volcSkInput`),ie=document.getElementById(`volcAssetKeyHint`),ae=document.getElementById(`volcProjectInput`),oe=document.getElementById(`volcRegionInput`),se=document.getElementById(`runninghubConfigBlock`),ce=document.getElementById(`rhPasteInput`),le=document.getElementById(`rhAppsList`),ue=document.getElementById(`rhWorkflowsList`),de=document.getElementById(`rhAppsCount`),fe=document.getElementById(`rhWorkflowsCount`),pe=document.getElementById(`settingsContent`),me=document.getElementById(`recommendContent`),he=document.getElementById(`recommendPanel`),ge=document.getElementById(`providerOnboardingCard`),_=document.getElementById(`rhWorkflowEditorOverlay`),_e=document.getElementById(`rhWorkflowEditorTitle`),ve=document.getElementById(`rhWorkflowEditorSub`),ye=document.getElementById(`rhWorkflowSaveBtn`),be=document.getElementById(`rhWorkflowEditName`),v=document.getElementById(`rhWorkflowEditNote`),xe=document.getElementById(`rhWorkflowEditorSummary`),y=document.getElementById(`rhWorkflowEditorNodeList`),b=document.getElementById(`rhWorkflowEditorGraphWrap`),Se=document.getElementById(`rhWorkflowEditorGraphSvg`),Ce=document.getElementById(`rhWorkflowEditorZoom`),we=document.getElementById(`imageModelList`),Te=document.getElementById(`chatModelList`),Ee=document.getElementById(`videoModelList`),De=document.getElementById(`msLoraBlock`),Oe=document.getElementById(`msLoraList`),ke=document.getElementById(`recommendApiOverlay`);document.getElementById(`recommendApiList`);let Ae=`https://ark.cn-beijing.volces.com/api/v3`,je=`default`,Me=`cn-beijing`,Ne=[`doubao-seedance-2-5-260628`,`doubao-seedance-2-0-260128`,`doubao-seedance-2-0-fast-260128`,`doubao-seedance-2-0-mini-260615`,`doubao-seedance-1-5-pro-251215`,`doubao-seedance-1-0-pro-250528`,`doubao-seedance-1-0-lite-t2v-250428`,`doubao-seedance-1-0-lite-i2v-250428`],Pe=[`Tongyi-MAI/Z-Image-Turbo`,`Qwen/Qwen-Image-2512`,`Qwen/Qwen-Image-Edit-2511`,`black-forest-labs/FLUX.2-klein-9B`],Fe=[`/openapi/v2/text2image`],Ie={modelscope:{titleKey:`api.msOnboardingTitle`,descKey:`api.msOnboardingDesc`,primaryLabelKey:`api.msGetTokenCn`,secondaryLabelKey:`api.msGetTokenGlobal`,primaryUrl:`https://www.modelscope.cn/my/access/token`,secondaryUrl:`https://www.modelscope.ai/my/access/token`},runninghub:{titleKey:`api.rhOnboardingTitle`,descKey:`api.rhOnboardingDesc`,primaryLabelKey:`api.rhGetKeyCn`,secondaryLabelKey:`api.rhGetKeyGlobal`,primaryUrl:`https://www.runninghub.cn/enterprise-api/consumerApi?inviteCode=rh-v1331`,secondaryUrl:`https://www.runninghub.ai/enterprise-api/consumerApi?inviteCode=rh-v1331`,walletPrimaryLabelKey:`api.rhGetWalletKeyCn`,walletSecondaryLabelKey:`api.rhGetWalletKeyGlobal`,walletPrimaryUrl:`https://www.runninghub.cn/enterprise-api/sharedApi?inviteCode=rh-v1331`,walletSecondaryUrl:`https://www.runninghub.ai/enterprise-api/sharedApi?inviteCode=rh-v1331`}},x={open:!1,index:-1,entry:null,config:null,expanded:{},activeNodeId:``,graph:{k:1,x:0,y:0,w:0,h:0},pan:null,bound:!1,previewParams:{},previewRunning:!1,previewStatus:``,previewOutputs:[]},S=`workflow`,C=!1,Le=``,Re=[{name:`APIMART`,base_url:`https://api.apimart.ai`,protocol:`apimart`,register_url:`https://apimart.ai/zh/register?aff=1uyAbb`,tagKeys:[`api.tagImageModels`,`api.tagVideoModels`,`api.tagLlmModels`],icons:[`IMG`,`VID`,`LLM`],summaryKey:`api.recommendApimartSummary`,advantages:[`模型类型覆盖广`,`适合多节点混合工作流`,`异步协议适合长任务`]},{name:`玉玉API`,base_url:`https://yuli.host`,protocol:`openai`,register_url:`https://yuli.host/register?aff=95JQ`,tagKeys:[`api.tagImageModels`,`api.tagVideoModels`,`api.tagLlmModels`],icons:[`IMG`,`VID`,`LLM`],summaryKey:`api.recommendYuliSummary`,perkKey:`api.recommendYuliPerk`,advantages:[`模型种类最全`,`图像/视频/LLM 全覆盖`,`支持签到送积分`],image_models:[`gpt-image-2`,`gemini-3.1-flash-image-preview`,`gemini-3-pro-image-preview`],chat_models:[`gpt-5.5`],video_models:[`veo3.1-fast`],model_protocols:{"gemini-3.1-flash-image-preview":`gemini`,"gemini-3-pro-image-preview":`gemini`}},{name:`Agnes AI`,base_url:`https://apihub.agnes-ai.com`,protocol:`openai`,image_request_mode:`openai-json`,register_url:`https://platform.agnes-ai.com/settings/apiKeys`,tagKeys:[`api.tagImageModels`,`api.tagVideoModels`,`api.tagLlmModels`],icons:[`IMG`,`VID`,`LLM`],summaryKey:`api.recommendAgnesSummary`,perkKey:`api.recommendAgnesFree`,perkClass:`recommend-free-tag`,advantages:[`免费额度可用`,`支持 Agnes 图像与视频接口`,`OpenAI 兼容地址配置简单`],image_models:[`agnes-image-2.1-flash`,`agnes-image-2.0-flash`],chat_models:[],video_models:[`agnes-video-v2.0`]},{name:`FHL`,base_url:`https://www.fhl.mom`,protocol:`openai`,register_url:`https://www.fhl.mom/register?aff=86L574B4T2N9`,tagKeys:[`Codex`,`api.tagGptImage2`],icons:[`CODEX`,`GPT`,`IMG`],summaryKey:`api.recommendFhlSummary`,advantages:[`OpenAI 兼容接入`,`配置路径简单`,`适合图像与代码相关模型`]}],ze={"common.apiSettings":`API 设置`,"common.comfyuiSettings":`工作流设置`,"common.darkMode":`黑夜模式`,"common.language":`中文`,"common.cancel":`取消`,"common.confirm":`确定`,"common.save":`保存`,"common.delete":`删除`,"common.edit":`编辑`,"common.run":`运行`,"common.running":`运行中`,"common.custom":`自定义`,"common.close":`关闭`,"common.loading":`加载中...`,"common.project":`项目主页`,"common.moreSettings":`更多设置`,"api.title":`API 设置`,"api.subtitle":`管理平台地址、模型列表和 Key。Key 写入后端 env，页面不会回显完整内容。`,"api.addProvider":`新增平台`,"api.getApi":`获取API`,"api.recommendApi":`推荐API`,"api.recommendApiDesc":`选择平台后可以一键填写请求地址和协议。`,"api.recommendApiNote":`提示：账户内需要至少 0.05 元余额，才能验证地址并拉取模型。`,"api.register":`获取key`,"api.autoFill":`自动填写`,"api.provider":`平台`,"api.delete":`删除`,"api.save":`保存`,"api.name":`显示名称`,"api.providerId":`平台 ID`,"api.baseUrl":`请求地址`,"api.protocol":`协议`,"api.protocolOpenAI":`OpenAI 直连`,"api.protocolApimart":`异步协议`,"api.protocolGemini":`Gemini 协议`,"api.protocolVolcengine":`火山引擎协议`,"api.key":`API Key`,"api.msNotes":`ModelScope 使用提示`,"api.msChinaEndpoint":`国内默认请求地址：`,"api.msGlobalEndpoint":`国外使用请求地址：`,"api.msCnModels":`中文模型库：`,"api.msEnModels":`英文模型库：`,"api.msModelExample":`模型名称示意：`,"api.imageModels":`生图模型`,"api.imageHint":`在线生图和无限画布 API 生成使用。`,"api.chatModels":`聊天模型`,"api.chatHint":`GPT 对话和 LLM 节点使用。`,"api.videoModels":`视频模型`,"api.videoHint":`无限画布视频生成节点使用。`,"api.model":`模型`,"api.noModels":`暂无模型`,"api.modelsTitle":`模型列表`,"api.modelsDesc":`从上游 API 自动拉取所有可用模型并按类型分类（image / chat / video）`,"api.volcengineEndpointTip":`火山聊天模型建议填写方舟控制台中的推理接入点 ID（ep-...）。`,"api.volcengineArkKey":`方舟 API Key · 生成视频`,"api.volcengineArkKeyDesc":`用于 Seedance 2.0 生成接口，Authorization: Bearer。`,"api.volcengineAssetKeys":`素材库 AK/SK · 上传素材`,"api.volcengineAssetKeysDesc":`用于 CreateAssetGroup / CreateAsset / GetAsset 的 Access Key 鉴权。`,"api.volcengineProject":`素材库项目`,"api.volcengineProjectDesc":`ProjectName 必须和视频生成 API Key 所属项目一致。`,"api.selectModels":`选择模型`,"api.loraManager":`LoRA 管理`,"api.loraManagerDesc":`为 ModelScope 生图模型绑定可用 LoRA。无限画布 MS 节点会按当前模型自动筛选。`,"api.loraEmpty":`暂无 LoRA，点击右上角添加。添加后会按绑定模型显示在无限画布 MS 节点里。`,"api.loraId":`LoRA ID`,"api.loraIdPlaceholder":`例如 Daniel8152/Klein-enhance`,"api.loraTargetModel":`绑定模型`,"api.loraDefaultStrength":`默认强度`,"api.fetchModels":`拉取模型`,"api.fetchingModels":`拉取中...`,"api.testUrl":`验证地址`,"api.testingUrl":`验证中...`,"api.urlValid":`地址可用`,"api.urlInvalid":`验证未通过`,"api.urlTestDisclaimer":`注：本验证调用 OpenAI 标准格式的 <code>/v1/models</code> 端点。如果该平台不是 OpenAI 兼容接口，验证失败<strong>不一定</strong>代表地址不可用，请自行确认。`,"api.platformName":`平台名称`,"api.platformNameHint":`同时作为唯一标识。中文也可以，会自动转换为 ASCII 形式的 ID。`,"api.platformIdShown":`平台 ID`,"api.newProvider":`新 API 平台`,"api.keepCurrentKey":`保持当前 Key`,"api.enterKey":`输入 API Key`,"api.keySaved":`当前 Key 已保存：`,"api.noKey":`还没有保存 Key。`,"api.loading":`加载中...`,"api.loadFailed":`API 平台加载失败`,"api.keepOne":`至少保留一个 API 平台`,"api.defaultNoDelete":`默认平台不能删除，可以修改名称、地址、Key 和模型。`,"api.duplicateId":`平台 ID 不能重复`,"api.saving":`保存中...`,"api.saveFailed":`保存失败`,"api.saved":`已保存，模型列表会立即同步到画布。`,"api.providersTitle":`平台列表`,"api.editorSub":`配置基础信息、API Key 和可用模型`,"api.basicInfo":`基本信息`,"api.basicHint":`平台显示名、唯一 ID 和请求地址`,"api.keyHint":`写入后端 env，页面不显示完整内容。可单独保存或清除当前 Key。`,"api.setPrimary":`设为首选`,"api.currentPrimary":`当前首选`,"api.primaryBadge":`首选`,"api.modelscopeOnlyDelete":`ModelScope 是默认平台，不可删除`,"api.confirmClearKey":`确认清除当前 Key？`,"api.enterKeyAlert":`请输入 Key`,"api.msTokenCn":`获取 Token · 国内：`,"api.msTokenGlobal":`获取 Token · 国外：`,"api.onboardingNew":`NEW`,"api.msOnboardingTitle":`ModelScope 新手引导`,"api.msOnboardingDesc":`先获取 Token，填入 API Key 并保存后，右侧完整设置会自动显示。`,"api.msGetTokenCn":`获取 Token · 国内`,"api.msGetTokenGlobal":`获取 Token · 国外`,"api.msOnboardingStep":`获取 Token 后填写并保存`,"api.msTokenLabel":`ModelScope Token`,"api.msTokenPlaceholder":`粘贴 ModelScope Token`,"api.rhOnboardingTitle":`RunningHub 新手引导`,"api.rhOnboardingDesc":`RH 有 RH币和账户余额两种 Key，RH币必填，账户余额可选。`,"api.rhGetKeyCn":`获取 Key · 国内`,"api.rhGetKeyGlobal":`获取 Key · 国外`,"api.rhGetWalletKeyCn":`获取余额 Key · 国内`,"api.rhGetWalletKeyGlobal":`获取余额 Key · 国外`,"api.rhOnboardingStep":`获取 Key 后填写并保存`,"api.rhCoinKey":`RH币 Key`,"api.rhWalletKey":`账户余额 Key`,"api.rhCoinApiKeyRequired":`RH币 API Key · 必填`,"api.rhWalletApiKeyOptional":`账户余额 API Key · 可选`,"api.rhCoinPlaceholder":`粘贴 RH币 API Key`,"api.rhWalletPlaceholder":`需要账户余额时再粘贴`,"api.rhEnterCoinAlert":`请输入 RH币 API Key`,"api.rhKeepCoinKey":`保持当前 RH币 Key`,"api.rhEnterCoinKey":`输入 RH币 API Key`,"api.rhKeepWalletKey":`保持当前账户余额 Key`,"api.rhEnterWalletKey":`输入账户余额 Key`,"api.rhCoinKeySaved":`当前 RH币 Key 已保存：`,"api.rhNoCoinKey":`还没有保存 RH币 Key。`,"api.rhWalletKeySaved":`当前账户余额 Key 已保存：`,"api.rhNoWalletKey":`还没有保存账户余额 Key。验证地址和拉取模型会优先使用它。`,"api.rhCoinKeyDesc":`使用 RH币 接口时填写`,"api.rhWalletKeyDesc":`使用账户余额接口时填写`,"api.get":`获取`,"api.cnKey":`国内 Key`,"api.globalKey":`国外 Key`,"api.saveKeyTitle":`保存 Key`,"api.clearKeyTitle":`清除 Key`,"api.saveRhCoinKeyTitle":`保存 RH币 Key`,"api.clearRhCoinKeyTitle":`清除 RH币 Key`,"api.saveRhWalletKeyTitle":`保存账户余额 Key`,"api.clearRhWalletKeyTitle":`清除账户余额 Key`,"api.recommendPanelTitle":`推荐平台`,"api.recommendPanelSub":`获取 Key 后保存，右侧会切换到刚保存的平台配置。`,"api.recommendPanelDesc":`选择适合的平台，获取 Key 后在右侧保存为默认配置。`,"api.recommendQuickSetup":`快捷设置`,"api.getKey":`获取 Key`,"api.recommendKeyPlaceholder":`粘贴 {name} API Key`,"api.enterApiKey":`请输入 API Key`,"api.recommendSaved":`已保存 {name}，当前显示该平台配置。`,"api.recommendAccountTitle":`GPT / Codex / Claude 账号订阅`,"api.recommendAccountDesc":`独立订阅、成品账号等选择，适合想直充自己账户的人。`,"api.viewPlans":`查看方案`,"api.recommendApimartSummary":`聚合多类型生成模型，适合希望用一套配置快速接入图像、视频和 LLM 的用户。`,"api.recommendFhlSummary":`偏向 OpenAI 兼容体验，适合需要 Codex、GPT image 2 等模型能力的配置。`,"api.recommendYuliSummary":`模型种类齐全，图像、视频、LLM 一站覆盖，支持每日签到送积分，适合想低成本尝鲜各类模型的用户。`,"api.recommendYuliPerk":`签到送积分`,"api.recommendAgnesSummary":`免费可用的 Agnes AI 接口，支持图像与视频生成，适合快速测试和低成本接入。`,"api.recommendAgnesFree":`免费`,"api.recommendFeatured":`首选推荐`,"api.tagImageModels":`图像模型`,"api.tagVideoModels":`视频模型`,"api.tagLlmModels":`LLM模型`,"api.tagGptImage2":`GPT image 2模型`};function w(){window.lucide&&lucide.createIcons()}function T(e){return ze[e]||e}function Be(e,t={}){let n=T(e);return Object.entries(t).forEach(([e,t])=>{n=n.replaceAll(`{${e}}`,String(t??``))}),n}function E(e){i.textContent=e||``}function Ve(e=`providers-changed`){let t={type:e,updated_at:Date.now()};try{new BroadcastChannel(`studio-api`).postMessage(t)}catch{}try{window.parent?.postMessage(t,`*`)}catch{}try{window.top?.postMessage(t,`*`)}catch{}}function He(){return y?.closest?.(`.rh-workflow-editor-side`)||y}function Ue(){let e=document.getElementById(`rhNodePopover`),t=e?.querySelector?.(`.rh-popover-body`);return{sideTop:He()?.scrollTop||0,nodeListTop:y?.scrollTop||0,graphTop:b?.scrollTop||0,popNodeId:e?.dataset?.nodeId||``,popFieldKey:e?.dataset?.fieldKey||``,popBodyTop:t?.scrollTop||0}}function We(e){if(!e)return;let t=()=>{let t=He();t&&(t.scrollTop=e.sideTop||0),y&&(y.scrollTop=e.nodeListTop||0),b&&(b.scrollTop=e.graphTop||0);let n=document.getElementById(`rhNodePopover`);if(n&&(e.popNodeId&&n.dataset.nodeId===e.popNodeId||e.popFieldKey&&n.dataset.fieldKey===e.popFieldKey)){let t=n.querySelector(`.rh-popover-body`);t&&(t.scrollTop=e.popBodyTop||0)}};requestAnimationFrame(()=>{t(),requestAnimationFrame(t)})}function D(e){let t=Ue(),n=e();return We(t),n}function Ge(e){return Array.from(document.querySelectorAll(`.rh-app-field-card`)).find(t=>t.dataset.fieldKey===String(e||``))}function Ke(e){return String(e||``).trim().toLowerCase().replace(/[^a-z0-9_-]/g,`-`).replace(/^-+|-+$/g,``).replace(/-+/g,`-`).slice(0,40)}function qe(t,n){if(n)return n;let r=Ke(t);r||=`api-`+Math.random().toString(36).slice(2,8);let i=r,a=2;for(;e.some(e=>e.id===i);)i=`${r}-${a++}`;return i}function Je(){let e=O();if(!e)return;let t=e.id===`comfly`||e.id===`modelscope`||e.id===`runninghub`||e.id===`volcengine`,n=document.getElementById(`idPreview`);if(n){if(t){n.textContent=e.id;return}n.textContent=qe(a.value,e.id)}}function O(){return Xe().find(e=>e.id===t)||Xe()[0]||e[0]}function Ye(e){return!1}function Xe(){return(e||[]).filter(e=>!Ye(e))}function k(e){let t=typeof e==`string`?e:e?.id;return t===`modelscope`||t===`runninghub`||t===`volcengine`}function A(e){let t=new Set;return e.map(e=>String(e||``).trim()).filter(e=>e&&!t.has(e)&&t.add(e))}function j(e,t){let n=new Set;return(Array.isArray(e)?e:[]).map(e=>{let r=Ze(e?.appId||e?.workflowId||e?.id||``),i=String(r?.id||e?.id||e?.appId||e?.workflowId||``).trim();if(!i||n.has(i))return null;n.add(i);let a=t===`app`?`AI 应用 ${i.slice(-6)}`:`工作流 ${i.slice(-6)}`,o={id:i,title:String(e?.title||e?.name||a).trim(),note:String(e?.note||e?.description||``).trim(),thumbnail:String(e?.thumbnail||``).trim(),enabled:e?.enabled!==!1};e?.hidden===!0&&(o.hidden=!0),Array.isArray(e?.fields)&&(o.fields=e.fields.map(P)),e?.workflowJson&&typeof e.workflowJson==`object`&&(o.workflowJson=e.workflowJson),e?.raw&&typeof e.raw==`object`&&(o.raw=e.raw);let s=Number(e?.updatedAt||0);return s>0&&(o.updatedAt=s),t===`app`?o.appId=i:(o.workflowId=i,o.optionalImageMode=String(e?.optionalImageMode||`prune-workflow`)),o}).filter(Boolean)}function Ze(e){let t=String(e||``).trim(),n=t.match(/\/run\/(ai-app|workflow)\/([0-9A-Za-z_-]+)/i);return n?{type:n[1].toLowerCase()===`ai-app`?`app`:`workflow`,id:n[2]}:t.match(/^[0-9]{8,}$/)?{type:`workflow`,id:t}:null}function Qe(e){return(e?._meta?.title||e?.class_type||e?._class||e?.type||`Node`).toString()}function $e(e){return(e?.class_type||e?._class||e?.type||``).toString()}function et(e){let t=`${Qe(e)} ${$e(e)}`.toLowerCase();return/text|prompt|clip/.test(t)?`prompt`:/lora/.test(t)?`lora`:/ksampler|k sampler|sampler|scheduler|guid|cfg/.test(t)?`sampler`:/video|movie|mp4|webm|frame/.test(t)?`video`:/audio|sound|voice|music|wav|mp3/.test(t)?`audio`:/image|mask|resize|scale|crop|photo|picture|preview|save/.test(t)?`image`:`misc`}function M(e){return`${e?.nodeId||``}::${e?.fieldName||``}`}function N(e){let t=String(e?.fieldType||``).toUpperCase();if([`IMAGE`,`VIDEO`,`AUDIO`,`BOOLEAN`,`NUMBER`,`FLOAT`,`INT`,`INTEGER`,`TEXT`,`SLIDER`].includes(t))return t===`FLOAT`||t===`INT`||t===`INTEGER`?`NUMBER`:t;let n=`${e?.fieldName||``} ${e?.fieldValue||``}`.toLowerCase();return/image|img|mask|png|jpg|jpeg|webp/.test(n)?`IMAGE`:/video|mp4|webm|mov/.test(n)?`VIDEO`:/audio|wav|mp3|voice|sound/.test(n)?`AUDIO`:/true|false/.test(n)?`BOOLEAN`:/^-?\d+(\.\d+)?$/.test(String(e?.fieldValue||``).trim())?`NUMBER`:`TEXT`}function tt(e){return{TEXT:`文本`,NUMBER:`数字`,SLIDER:`滑块`,BOOLEAN:`开关`,SELECT:`下拉`,IMAGE:`图片`,VIDEO:`视频`,AUDIO:`音频`}[String(e||``).toUpperCase()]||e}let nt={sampler_name:[`euler`,`euler_ancestral`,`heun`,`dpm_2`,`dpm_2_ancestral`,`lms`,`dpmpp_2m`,`dpmpp_sde`,`ddim`,`uni_pc`],sampler:[`euler`,`euler_ancestral`,`heun`,`dpm_2`,`dpm_2_ancestral`,`lms`,`dpmpp_2m`,`dpmpp_sde`,`ddim`,`uni_pc`],scheduler:[`normal`,`karras`,`exponential`,`sgm_uniform`,`simple`,`ddim_uniform`,`beta`],ratio:[`1:1`,`16:9`,`9:16`,`21:9`,`9:21`,`4:3`,`3:4`,`4:5`,`5:4`,`3:2`,`2:3`],aspectRatio:[`1:1`,`16:9`,`9:16`,`4:3`,`3:4`,`4:5`,`5:4`,`3:2`,`2:3`],resolution:[`512`,`768`,`1024`,`1280`,`1536`,`2048`,`1k`,`2k`,`4k`],size:[`512`,`768`,`1024`,`1280`,`1536`,`2048`],ckpt_name:[],unet_name:[],lora_name:[]};function rt(e){let t=String(e?.fieldName||``).trim();if(!t)return[];if(nt[t])return nt[t].map(String);let n=Object.keys(nt).find(e=>e.toLowerCase()===t.toLowerCase());return n?nt[n].map(String):[]}function P(e){let t=Array.isArray(e?.options)?e.options.map(e=>String(e??``).trim()).filter(Boolean):String(e?.options||``).split(/\r?\n|,/).map(e=>e.trim()).filter(Boolean),n=t.length?t:rt(e),r=String(e?.fieldType||N(e)),i=r.toUpperCase(),a=e?.sourceFromUpstream;return{id:String(e?.id||M(e)),nodeId:String(e?.nodeId||``),fieldName:String(e?.fieldName||``),fieldValue:e?.fieldValue==null?``:String(e.fieldValue),fieldType:n.length&&![`IMAGE`,`VIDEO`,`AUDIO`,`SLIDER`].includes(i)?`SELECT`:r,label:String(e?.label||e?.fieldName||``),enabled:e?.enabled===!0,sourceFromUpstream:a!==void 0&&a!==!1,group:String(e?.group||``),note:String(e?.note||``),options:n,random_enabled:e?.random_enabled===!0,min:e?.min??``,max:e?.max??``,step:e?.step??``,imageOrder:Number(e?.imageOrder||e?.image_order||0)||0,required:e?.required===!0}}function it(e){return{...P(e),enabled:!1}}function at(e){return`${e?.nodeId||``}::${e?.group||``}`}function ot(e){return[...e||[]].sort((e,t)=>{let n=N(e),r=N(t);if(n===`IMAGE`&&r===`IMAGE`){let n=Number(e.imageOrder)||9999,r=Number(t.imageOrder)||9999;if(n!==r)return n-r}return n===`IMAGE`&&r!==`IMAGE`?-1:n!==`IMAGE`&&r===`IMAGE`?1:String(e.nodeId||``).localeCompare(String(t.nodeId||``),void 0,{numeric:!0})||String(e.fieldName||``).localeCompare(String(t.fieldName||``))})}function st(e){return e?.has_key?`${T(`api.rhCoinKeySaved`)}${e.key_env||`API/.env`} ${e.key_preview||``}`:T(`api.rhNoCoinKey`)}function ct(e){return e?.has_wallet_key?`${T(`api.rhWalletKeySaved`)}${e.wallet_key_env||`API/.env`} ${e.wallet_key_preview||``}`:T(`api.rhNoWalletKey`)}function lt(e){return e?.has_key?`方舟 API Key 已保存：${e.key_env||`API/.env`} ${e.key_preview||``}`:`还没有保存方舟 API Key。`}function ut(e){return`${e?.has_volcengine_access_key?`AK 已保存：${e.volcengine_access_key_env||`API/.env`} ${e.volcengine_access_key_preview||``}`:`AK 未保存`} · ${e?.has_volcengine_secret_key?`SK 已保存：${e.volcengine_secret_key_env||`API/.env`} ${e.volcengine_secret_key_preview||``}`:`SK 未保存`}`}function dt(e){return e?e.id===`modelscope`?!e.has_key:e.id===`runninghub`&&!e.has_key&&!e.has_wallet_key:!1}function ft(e){if(!ge)return;let t=Ie[e?.id],n=!!(!C&&t&&dt(e));if(ge.hidden=!n,document.body.classList.toggle(`show-provider-onboarding`,n),!n){ge.innerHTML=``;return}if(e.id===`modelscope`){ge.innerHTML=`
            <div class="onboarding-head">
                <div>
                    <div class="onboarding-title">${Q(T(t.titleKey))}</div>
                    <div class="onboarding-desc">${Q(T(t.descKey))}</div>
                </div>
                <span class="onboarding-badge">${Q(T(`api.onboardingNew`))}</span>
            </div>
            <div class="onboarding-step-panel onboarding-rh-linear-panel onboarding-ms-linear-panel">
                <div class="onboarding-rh-panel-head">
                    <div>
                        <div class="onboarding-step-title">${Q(T(`api.msOnboardingStep`))}</div>
                    </div>
                    <i data-lucide="key-round" class="onboarding-rh-icon w-4 h-4"></i>
                </div>
                <div class="onboarding-rh-linear-rows">
                    <div class="onboarding-rh-linear-row onboarding-ms-linear-row">
                        <div class="onboarding-rh-source-group">
                            <div class="onboarding-rh-source-label">${Q(T(`api.msTokenLabel`))}</div>
                            <div class="onboarding-key-actions onboarding-rh-key-actions">
                                <a class="onboarding-key-btn" href="${$(t.primaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="key-round" class="w-3.5 h-3.5"></i><span>${Q(T(t.primaryLabelKey))}</span></a>
                                <a class="onboarding-key-btn" href="${$(t.secondaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="globe-2" class="w-3.5 h-3.5"></i><span>${Q(T(t.secondaryLabelKey))}</span></a>
                            </div>
                        </div>
                        <div class="recommend-flow-arrow onboarding-flow-arrow onboarding-rh-row-arrow" aria-hidden="true"><span></span><b></b></div>
                        <label class="onboarding-key-field onboarding-rh-row-field">
                            <span>API Key</span>
                            <input type="password" value="${$(f?.value||``)}" placeholder="${$(T(`api.msTokenPlaceholder`))}" oninput="syncOnboardingKeyInput('standard', this.value)">
                        </label>
                    </div>
                </div>
                <div class="onboarding-rh-save-line">
                    <button class="onboarding-save-btn onboarding-rh-save-all" type="button" onclick="saveKeyOnly()"><i data-lucide="check" class="w-3.5 h-3.5"></i><span>${Q(T(`api.save`))}</span></button>
                </div>
            </div>
        `,w();return}e.id===`runninghub`&&(ge.innerHTML=`
            <div class="onboarding-head">
                <div>
                    <div class="onboarding-title">${Q(T(t.titleKey))}</div>
                    <div class="onboarding-desc">${Q(T(t.descKey))}</div>
                </div>
                <span class="onboarding-badge">${Q(T(`api.onboardingNew`))}</span>
            </div>
            <div class="onboarding-step-panel onboarding-rh-linear-panel">
                <div class="onboarding-rh-panel-head">
                    <div>
                        <div class="onboarding-step-title">${Q(T(`api.rhOnboardingStep`))}</div>
                    </div>
                    <i data-lucide="key-round" class="onboarding-rh-icon w-4 h-4"></i>
                </div>
                <div class="onboarding-rh-linear-rows">
                    <div class="onboarding-rh-linear-row">
                        <div class="onboarding-rh-source-group">
                            <div class="onboarding-rh-source-label">${Q(T(`api.rhCoinKey`))}</div>
                            <div class="onboarding-key-actions onboarding-rh-key-actions">
                                <a class="onboarding-key-btn" href="${$(t.primaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="coins" class="w-3.5 h-3.5"></i><span>${Q(T(t.primaryLabelKey))}</span></a>
                                <a class="onboarding-key-btn" href="${$(t.secondaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="globe-2" class="w-3.5 h-3.5"></i><span>${Q(T(t.secondaryLabelKey))}</span></a>
                            </div>
                        </div>
                        <div class="recommend-flow-arrow onboarding-flow-arrow onboarding-rh-row-arrow" aria-hidden="true"><span></span><b></b></div>
                        <label class="onboarding-key-field onboarding-rh-row-field">
                            <span>${Q(T(`api.rhCoinApiKeyRequired`))}</span>
                            <input type="password" value="${$(p?.value||``)}" placeholder="${$(T(`api.rhCoinPlaceholder`))}" oninput="syncOnboardingKeyInput('free', this.value)">
                        </label>
                    </div>
                    <div class="onboarding-rh-linear-row">
                        <div class="onboarding-rh-source-group">
                            <div class="onboarding-rh-source-label">${Q(T(`api.rhWalletKey`))}</div>
                            <div class="onboarding-key-actions onboarding-rh-key-actions">
                                <a class="onboarding-key-btn" href="${$(t.walletPrimaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="wallet" class="w-3.5 h-3.5"></i><span>${Q(T(t.walletPrimaryLabelKey))}</span></a>
                                <a class="onboarding-key-btn" href="${$(t.walletSecondaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="globe-2" class="w-3.5 h-3.5"></i><span>${Q(T(t.walletSecondaryLabelKey))}</span></a>
                            </div>
                        </div>
                        <div class="recommend-flow-arrow onboarding-flow-arrow onboarding-rh-row-arrow" aria-hidden="true"><span></span><b></b></div>
                        <label class="onboarding-key-field onboarding-rh-row-field">
                            <span>${Q(T(`api.rhWalletApiKeyOptional`))}</span>
                            <input type="password" value="${$(m?.value||``)}" placeholder="${$(T(`api.rhWalletPlaceholder`))}" oninput="syncOnboardingKeyInput('wallet', this.value)">
                        </label>
                    </div>
                </div>
                <div class="onboarding-rh-save-line">
                    <button class="onboarding-save-btn onboarding-rh-save-all" type="button" onclick="saveOnboardingRunningHubKey()"><i data-lucide="check" class="w-3.5 h-3.5"></i><span>${Q(T(`api.save`))}</span></button>
                </div>
            </div>
        `,w())}function pt(e,t){e===`free`&&p?p.value=t||``:e===`wallet`&&m?m.value=t||``:f&&(f.value=t||``)}async function mt(){if(!p?.value.trim()){alert(T(`api.rhEnterCoinAlert`));return}let e=O();!e||e.id!==`runninghub`||(F(),await Z()&&(p&&(p.value=``),m&&(m.value=``)))}function ht(n){let r=e.find(e=>e.id===n);r&&(n===`modelscope`?(r.base_url=`https://api-inference.modelscope.cn/v1`,r.protocol=`openai`,r.image_models=A([...Pe,...r.image_models||[]]),r.chat_models=A([...r.chat_models||[]]),r.ms_defaults_version=Math.max(3,Number(r.ms_defaults_version||0))):n===`runninghub`?(r.base_url=`https://www.runninghub.cn`,r.protocol=`runninghub`,r.image_models=A([...r.image_models||[],...Fe]),I(r)):n===`volcengine`&&(r.base_url=Ae,r.protocol=`volcengine`,r.video_models=A([...r.video_models||[],...Ne]),r.volcengine_project_name=r.volcengine_project_name||je,r.volcengine_region=r.volcengine_region||Me),t=r.id,W(),E(`已显示默认配置，填写 Key 后点击保存生效`))}function gt(){ft(O()),w()}function F(){let e=O();if(!e)return;let n=e.id;e.id=e.id===`comfly`||e.id===`modelscope`||e.id===`runninghub`||e.id===`volcengine`?e.id:qe(a.value,e.id),n!==e.id&&(t=e.id),e.name=a.value.trim()||e.id;let r=e.id===`modelscope`?`openai`:e.id===`runninghub`?`runninghub`:e.id===`volcengine`?`volcengine`:u?.value||`openai`;e.base_url=c.value.trim(),e.proxy_url=J(e)&&l?.value.trim()||``,e.protocol=r,e.image_request_mode=K(e.id===`modelscope`||e.id===`runninghub`||e.id===`volcengine`?`openai`:d?.value||e.image_request_mode),e.image_generation_endpoint=``,e.image_edit_endpoint=``,e.rh_apps=j(e.rh_apps||[],`app`),e.rh_workflows=j(e.rh_workflows||[],`workflow`);let i=f.value.trim();if(i&&(e.api_key=i),e.id===`runninghub`){let t=p?.value.trim()||``,n=m?.value.trim()||``;t&&(e.api_key=t),n&&(e.wallet_api_key=n)}if(e.id===`volcengine`){let t=h?.value.trim()||``,n=g?.value.trim()||``;t&&(e.volcengine_access_key_id=t),n&&(e.volcengine_secret_access_key=n),e.volcengine_project_name=ae?.value.trim()||je,e.volcengine_region=oe?.value.trim()||Me}}function I(e){e&&(e.rh_apps=j(e.rh_apps||[],`app`),e.rh_workflows=j(e.rh_workflows||[],`workflow`))}function _t(){let e=O();if(!e||!u||e.id===`modelscope`||e.id===`runninghub`||e.id===`volcengine`)return;let t=String(u.value||`openai`).toLowerCase();e.protocol=[`openai`,`apimart`,`gemini`,`volcengine`].includes(t)?t:`openai`,Vn();let n=f?f.value:``;W(),f&&(f.value=n)}function vt(e){return String(e?.protocol||``).toLowerCase()===`volcengine`}function yt(e){Ze(e)&&E(`已识别 RunningHub 路径，点击右侧创建卡片`)}function bt(){let e=O();if(!e||e.id!==`runninghub`)return;let t=Ze(ce?.value||``);if(!t){E(`请粘贴 /run/ai-app/... 或 /run/workflow/...`);return}I(e);let n=t.type===`app`?`rh_apps`:`rh_workflows`,r=e[n].findIndex(e=>e.id===t.id),i=r>=0&&e[n][r]?.hidden!==!0;r>=0&&e[n][r]?.hidden===!0?e[n][r]={...e[n][r],enabled:!0,hidden:!1}:i||e[n].unshift({id:t.id,appId:t.type===`app`?t.id:void 0,workflowId:t.type===`workflow`?t.id:void 0,title:t.type===`app`?`AI 应用 ${t.id.slice(-6)}`:`工作流 ${t.id.slice(-6)}`,note:``,thumbnail:``,enabled:!0}),ce&&(ce.value=``),V(),E(i?`这个 RunningHub 项目已经存在`:`已创建 RunningHub 卡片`)}function xt(e,t,n,r){let i=O();if(!i||i.id!==`runninghub`)return;let a=e===`app`?`rh_apps`:`rh_workflows`;I(i),i[a][t]&&(i[a][t][n]=r,n===`title`&&E(`名称已修改，点保存生效`),n===`note`&&E(`备注已修改，点保存生效`))}function St(e,t){let n=String((e===`app`?t?.appId||t?.id:t?.workflowId||t?.id)||``).trim(),r=String(t?.thumbnail||``);return r.includes(`/static/runninghub/`)||n&&r.includes(`${e===`app`?`app`:`workflow`}-${n}`)?!0:Array.isArray(t?.fields)||t?.workflowJson&&typeof t.workflowJson==`object`||t?.raw&&typeof t.raw==`object`}function Ct(e,t){let n=O();if(!n||n.id!==`runninghub`)return;let r=e===`app`?`rh_apps`:`rh_workflows`;I(n);let i=n[r][t];i&&(St(e,i)?n[r][t]={...i,enabled:!1,hidden:!0}:n[r].splice(t,1),V(),E(`已删除，点击保存后生效`))}function wt(e){return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(String(r.result||``)),r.onerror=()=>n(r.error||Error(`读取图片失败`)),r.readAsDataURL(e)})}function Tt(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>t(r),r.onerror=()=>n(Error(`图片解析失败`)),r.src=e})}async function Et(e){let t=await wt(e);try{let e=await Tt(t),n=Math.min(1,360/Math.max(e.naturalWidth||e.width||1,e.naturalHeight||e.height||1)),r=Math.max(1,Math.round((e.naturalWidth||e.width||1)*n)),i=Math.max(1,Math.round((e.naturalHeight||e.height||1)*n)),a=document.createElement(`canvas`);a.width=r,a.height=i;let o=a.getContext(`2d`);return o.fillStyle=`#ffffff`,o.fillRect(0,0,r,i),o.drawImage(e,0,0,r,i),a.toDataURL(`image/jpeg`,.78)}catch{return t}}function Dt(e,t){let n=document.createElement(`input`);n.type=`file`,n.accept=`image/*`,n.onchange=async()=>{let r=n.files?.[0];if(r)try{xt(e,t,`thumbnail`,await Et(r)),V(),E(`缩略图已更新，点保存生效`)}catch(e){alert(e.message||`上传缩略图失败`)}},n.click()}async function Ot(e){let t=O();if(!t||t.id!==`runninghub`)return;I(t);let n=t.rh_workflows[e];if(n){S=`workflow`,x={open:!0,index:e,entry:n,config:null,expanded:{},activeNodeId:``,graph:{k:1,x:0,y:0,w:0,h:0},pan:null,bound:!1,previewParams:{},previewRunning:!1,previewStatus:``,previewOutputs:[]},_&&_.classList.add(`open`),L(`正在加载工作流...`),w();try{await jt(n)}catch(e){L(e.message||`工作流加载失败`)}}}async function kt(e){let t=O();if(!t||t.id!==`runninghub`)return;I(t);let n=t.rh_apps[e];if(n){S=`app`,x={open:!0,index:e,entry:n,config:null,expanded:{},activeNodeId:`app`,graph:{k:1,x:0,y:0,w:0,h:0},pan:null,bound:!1,previewParams:{},previewRunning:!1,previewStatus:``,previewOutputs:[]},_&&_.classList.add(`open`),L(`正在加载应用参数...`),w();try{await zt(n)}catch(e){L(e.message||`应用参数加载失败`)}}}function At(){_&&_.classList.remove(`open`),x.open=!1}function L(e){_e&&(_e.textContent=x.entry?.title||(S===`app`?`RunningHub AI 应用`:`RunningHub 工作流`)),be&&(be.value=x.entry?.title||``),v&&(v.value=x.entry?.note||``),ve&&(ve.textContent=S===`app`?`/run/ai-app/${x.entry?.appId||x.entry?.id||``}`:`/run/workflow/${x.entry?.workflowId||x.entry?.id||``}`),xe&&(xe.innerHTML=`<div class="rh-editor-empty">${Q(e)}</div>`),y&&(y.innerHTML=``),S===`workflow`?(gn(),Se&&(Se.innerHTML=``)):b&&(b.classList.add(`rh-app-field-wrap`),b.innerHTML=`<div class="rh-editor-empty">${Q(e)}</div>`)}async function jt(e){let t=null,n=String(e.workflowId||e.id||``).trim();if(!n)throw Error(`workflowId 为空`);let r=await fetch(`/api/runninghub/workflows/${encodeURIComponent(n)}`).then(async e=>{if(e.status===404)return null;let t=await e.json();if(!e.ok)throw Error(t.detail||`读取工作流配置失败`);return t.workflow||null});if(r)t=r;else return t=await Vt(!1),t;return x.config=Mt(t,e),z(),setTimeout(()=>wn(),50),x.config}function Mt(e,t){let n=String(e?.workflowId||t?.workflowId||t?.id||``).trim();return Pt({workflowId:n,title:String(e?.title||t?.title||n),description:String(e?.description||t?.note||``),fields:(Array.isArray(e?.fields)?e.fields:[]).map(P),workflowJson:e?.workflowJson||{},optionalImageMode:String(e?.optionalImageMode||t?.optionalImageMode||`prune-workflow`),raw:e?.raw||{}})}function Nt(e){let t=String(e?.appId||e?.id||``).trim();return{appId:t,title:String(e?.title||`AI 应用 ${t.slice(-6)}`||t),description:String(e?.note||``),fields:(Array.isArray(e?.fields)?e.fields:[]).map(P),raw:e?.raw||{}}}function Pt(e){return(e.fields||[]).filter(e=>N(e)===`IMAGE`).forEach((e,t)=>{Number(e.imageOrder)||(e.imageOrder=t+1),e.required!==!0&&e.required!==!1&&(e.required=t===0),t===0&&e.required!==!1&&(e.required=!0)}),e.optionalImageMode=e.optionalImageMode||`prune-workflow`,e}function Ft(e){let t=x.config;!t||S!==`workflow`||(t.optionalImageMode=e||`prune-workflow`,D(()=>B()))}function It(e){let t=e?.data&&typeof e.data==`object`?e.data:e,n=[t?.nodeInfoList,t?.fields,t?.inputs,t?.inputList,t?.formItems,t?.forms,t?.params,t?.parameters,t?.apiParams,t?.config?.fields,t?.webapp?.fields,t?.webapp?.inputs];for(let e of n){if(Array.isArray(e)&&e.length)return e;if(e&&typeof e==`object`&&Object.keys(e).length)return Object.entries(e).map(([e,t])=>({fieldName:e,fieldValue:t}))}return[]}function Lt(e,t=0){let n=e?.fieldName||e?.inputName||e?.name||e?.key||e?.paramName||e?.id||`field_${t+1}`,r=e?.nodeId||e?.node_id||e?.groupId||`app`,i=e?.fieldValue;i===void 0&&(i=e?.defaultValue),i===void 0&&(i=e?.value),i===void 0&&(i=e?.default),i??=``,typeof i==`object`&&(i=JSON.stringify(i));let a=Rt(e);return P({id:e?.id||`${r}::${n}`,nodeId:r,fieldName:n,fieldValue:i,fieldType:e?.fieldType||e?.type||e?.valueType||(a.length?`SELECT`:``),label:e?.label||e?.title||e?.name||n,enabled:!0,group:e?.group||e?.category||e?.title||`AI 应用参数`,note:e?.note||e?.description||``,options:a,min:e?.min??``,max:e?.max??``,step:e?.step??``})}function Rt(e){let t=[e?.options,e?.optionList,e?.values,e?.enum,e?.choices,e?.items,e?.list,e?.selectOptions,e?.fieldData];for(let e of t)if(!(!Array.isArray(e)||!e.length))return e.map(e=>e&&typeof e==`object`?e.value??e.label??e.name??e.title:e).filter(e=>e!=null).map(String);let n=rt(e);return n.length?n:[]}async function zt(e){let t=Nt(e);return x.config=t,t.fields.length?(z(),setTimeout(()=>wn(),50)):await Bt(!1),x.config}async function Bt(e=!1){let t=x,n=t.entry,r=String(n?.appId||n?.id||``).trim();if(!r)throw Error(`appId 为空`);e&&L(`正在重新拉取...`);let i=await fetch(`/api/runninghub/app-info?webappId=${encodeURIComponent(r)}`),a=await i.json();if(!i.ok||a.success===!1)throw Error(a.detail||`拉取应用参数失败`);let o=It(a).map(Lt);return t.config={appId:r,title:be?.value.trim()||n.title||`AI 应用 ${r.slice(-6)}`,description:v?.value.trim()||n.note||``,fields:o,raw:a.data||a},t.graph={k:1,x:0,y:0,w:0,h:0},z(),setTimeout(()=>wn(),50),t.config}async function Vt(e=!1){let t=x,n=t.entry;if(S===`app`)return Bt(e);if(!n)return null;let r=String(n.workflowId||n.id||``).trim();if(!r)throw Error(`workflowId 为空`);e&&L(`正在重新拉取...`);let i=await fetch(`/api/runninghub/workflows/fetch`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({workflowId:r,title:be?.value.trim()||n.title||r,description:v?.value.trim()||n.note||``})}),a=await i.json();if(!i.ok||a.success===!1)throw Error(a.detail||`拉取工作流失败`);return t.config=Mt({workflowId:a.data.workflowId,title:a.data.title,description:a.data.description,fields:(a.data.fields||[]).map(it),workflowJson:a.data.workflowJson||{},optionalImageMode:n.optionalImageMode||`prune-workflow`,raw:a.data.raw||{}},n),t.graph={k:1,x:0,y:0,w:0,h:0},z(),setTimeout(()=>wn(),50),t.config}function Ht(e,t){let n=x.config;n&&(e===`title`&&(n.title=t),e===`description`&&(n.description=t),D(()=>B()))}function Ut(e){let t=x.expanded;t[e]=t[e]===!1,D(()=>z())}function Wt(e){let t=x,n=t.config;n&&(t.activeNodeId=String(e||``),(n.fields||[]).forEach(e=>{if(String(e.nodeId)===t.activeNodeId){let n=at(e).replace(/[^a-zA-Z0-9_-]/g,`_`);t.expanded[n]=!0}}),D(()=>z()))}function Gt(e,t){let n=x;n.activeNodeId=String(e||``),bn();let r=Array.from(document.querySelectorAll(`.rh-editor-gnode`)).find(e=>e.dataset.nodeId===n.activeNodeId)||t;qt(n.activeNodeId,r)}function Kt(){document.getElementById(`rhNodePopover`)?.remove()}function qt(e,t){Kt();let n=x.config;if(!n)return;let r=(n.fields||[]).filter(t=>String(t.nodeId)===String(e));if(!r.length)return;let i=document.createElement(`div`);i.id=`rhNodePopover`,i.className=`rh-node-popover`,i.dataset.nodeId=String(e||``);let a=n.workflowJson?.[e]||{};i.innerHTML=`
        <div class="rh-popover-head">
            <div>
                <strong>${Q((a?._meta?.title||a?.class_type||r[0]?.group||`Node #${e}`).toString())}</strong>
                <span>#${Q(e)} · ${r.length}</span>
            </div>
            <button type="button" onclick="closeRhNodePopover()"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="rh-popover-body">${r.map(e=>mn(e)).join(``)}</div>
    `,document.body.appendChild(i);let o=t?.getBoundingClientRect?.(),s=_?.getBoundingClientRect?.()||{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight},c=o?o.right+12:window.innerWidth/2-190,l=o?o.top:window.innerHeight/2-180;c+390>s.right-16&&(c=Math.max(s.left+16,(o?.left||c)-390-12)),l=Math.max(s.top+74,Math.min(l,s.bottom-420)),i.style.left=`${c}px`,i.style.top=`${l}px`,w()}function Jt(e){let t=x.config;t&&D(()=>{if(t.fields=(t.fields||[]).map(t=>M(t)===e?{...t,enabled:t.enabled!==!0}:t),z(),S===`workflow`&&x.activeNodeId){let e=document.querySelector(`.rh-editor-gnode[data-node-id="${x.activeNodeId}"]`);e&&qt(x.activeNodeId,e)}else if(S===`app`){let t=Ge(e);t&&vn(e,t)}})}function Yt(e,t,n){let r=x.config;r&&(r.fields=(r.fields||[]).map(r=>{if(M(r)!==e)return r;let i=t===`imageOrder`?Math.max(1,Number(n)||1):t===`required`?!!n:n;return{...r,[t]:i}}),(t===`random_enabled`||t===`fieldType`||t===`required`||t===`sourceFromUpstream`)&&D(()=>{if(z(),S===`workflow`&&x.activeNodeId){let e=document.querySelector(`.rh-editor-gnode[data-node-id="${x.activeNodeId}"]`);e&&qt(x.activeNodeId,e)}else if(S===`app`){let t=Ge(e);t&&vn(e,t)}}))}function R(e,t){if(!ye)return;let n=ye.querySelector(`span`);ye.classList.toggle(`is-saved`,e===`saved`),ye.disabled=e===`saving`,n&&(n.textContent=t||(e===`saved`?`已保存`:e===`saving`?`保存中...`:`保存`));let r=ye.querySelector(`i`);r&&r.setAttribute(`data-lucide`,e===`saved`?`check`:`save`),w()}async function Xt(){let e=x,t=e.config;if(!t){alert(S===`app`?`请先加载应用参数`:`请先加载工作流`);return}R(`saving`,`保存中...`),t.title=be?.value.trim()||t.title||t.workflowId,t.description=v?.value.trim()||t.description||``;try{if(S===`app`){let n=O();if(n?.id===`runninghub`&&n.rh_apps?.[e.index]){let r=n.rh_apps[e.index];r.title=t.title||r.title,r.note=t.description||``,r.fields=(t.fields||[]).map(P),r.raw=t.raw||{},V(),await Z()}E(`应用参数配置已保存`),R(`saved`,`已保存`),setTimeout(()=>R(`idle`,`保存`),1600),Ve(`providers-changed`),z();return}let n=await fetch(`/api/runninghub/workflows/${encodeURIComponent(t.workflowId)}`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify({workflowId:t.workflowId,title:t.title,description:t.description,fields:(t.fields||[]).map(P),workflowJson:t.workflowJson||{},optionalImageMode:t.optionalImageMode||`prune-workflow`,raw:t.raw||{}})}),r=await n.json();if(!n.ok||r.success===!1)throw Error(r.detail||`保存失败`);e.config=Mt(r.workflow||t,e.entry);let i=O();if(i?.id===`runninghub`&&i.rh_workflows?.[e.index]){let t=i.rh_workflows[e.index];t.title=e.config.title,t.note=e.config.description,t.fields=(e.config.fields||[]).map(P),t.workflowJson=e.config.workflowJson||{},t.optionalImageMode=e.config.optionalImageMode||`prune-workflow`,t.raw=e.config.raw||{},t.updatedAt=Number(r.workflow?.updatedAt||Date.now()),V(),await Z()}E(`工作流配置已保存`),R(`saved`,`已保存`),setTimeout(()=>R(`idle`,`保存`),1600),Ve(`workflows-changed`),z()}catch(e){R(`idle`,`保存`),alert(e.message||`保存失败`)}}function z(){let e=x.config;if(!e){L(S===`app`?`应用参数未加载`:`工作流未加载`);return}_e&&(_e.textContent=e.title||(S===`app`?`RunningHub AI 应用`:`RunningHub 工作流`)),ve&&(ve.textContent=S===`app`?`/run/ai-app/${e.appId}`:`/run/workflow/${e.workflowId}`),be&&(be.value=e.title||``),v&&(v.value=e.description||``),Pt(e),B(),dn(),w()}function B(){let e=x.config;!e||!xe||!y||(fn(),y.innerHTML=Zt(e),w())}function Zt(e){let t=ot((e.fields||[]).filter(e=>e.enabled===!0)),n=e.title||(S===`app`?`RunningHub AI 应用`:`RunningHub 工作流`),r=t.reduce((e,t)=>{let n=N(t);return n===`IMAGE`?e.image+=1:n===`VIDEO`?e.video+=1:n===`AUDIO`?e.audio+=1:e.setting+=1,e},{image:0,video:0,audio:0,setting:0}),i=t.length?t.map(e=>$t(e)).join(``):`<div class="rh-preview-empty">勾选右侧参数后，这里会显示画布节点上的效果</div>`,a=x.previewStatus?`<div class="rh-preview-status">${Q(x.previewStatus)}</div>`:``,o=(x.previewOutputs||[]).length?`<div class="rh-preview-output-list">${x.previewOutputs.map(e=>Qt(e)).join(``)}</div>`:``,s=S===`workflow`?`
        <div class="rh-workflow-run-mode">
            <label>
                <span>空可选图</span>
                <select onchange="setRhWorkflowOptionalImageMode(this.value)">
                    <option value="prune-workflow" ${String(e.optionalImageMode||`prune-workflow`)===`prune-workflow`?`selected`:``}>裁剪 workflow JSON</option>
                    <option value="skip" ${String(e.optionalImageMode||``)===`skip`?`selected`:``}>不提交字段</option>
                </select>
            </label>
            <small>仅工作流生效。可选图片为空时，裁剪模式会移除该图片输入及相关连接。</small>
        </div>
    `:``;return`
        <div class="rh-mapped-card">
            <div class="rh-mapped-head">
                <div class="rh-mapped-icon"><i data-lucide="${S===`app`?`sparkles`:`workflow`}" class="w-4 h-4"></i></div>
                <div>
                    <div class="rh-mapped-title">${Q(n)}</div>
                    <div class="rh-mapped-sub">${S===`app`?`/run/ai-app/${Q(e.appId||``)}`:`/run/workflow/${Q(e.workflowId||``)}`}</div>
                </div>
            </div>
            <div class="rh-mapped-stats">
                <span>图片 ${r.image}</span>
                <span>视频 ${r.video}</span>
                <span>音频 ${r.audio}</span>
                <span>参数 ${r.setting}</span>
            </div>
            <div class="rh-preview-fields">${i}</div>
            ${s}
            <button class="rh-preview-run ${x.previewRunning?`running`:``}" type="button" onclick="testRhMappedPreview()" ${x.previewRunning?`disabled`:``}><i data-lucide="${x.previewRunning?`loader-2`:`play`}" class="w-3.5 h-3.5 ${x.previewRunning?`spin-icon`:``}"></i><span>${x.previewRunning?`测试中...`:`测试`}</span></button>
            ${a}
            ${o}
        </div>
    `}function Qt(e){let t=$(e||``);return/\.(mp4|webm|mov|m4v)(\?|$)/i.test(t)?`<video src="${t}" controls muted playsinline preload="metadata"></video>`:/\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(t)?`<audio src="${t}" controls preload="metadata"></audio>`:`<img src="${t}" alt="">`}function $t(e){let t=M(e),n=Q(e.label||e.fieldName),r=N(e),i=x.previewParams[t]||{};if(e.sourceFromUpstream===!1&&![`IMAGE`,`VIDEO`,`AUDIO`].includes(r))return`<div class="rh-preview-field keep-original"><div class="rh-preview-label">${n}</div><div class="rh-preview-keep"><i data-lucide="lock" class="w-3.5 h-3.5"></i><span>保留工作流原设置</span></div></div>`;let a=e.random_enabled===!0&&i.randomActive!==!1,o=i.value??e.fieldValue??``,s=Array.isArray(e.options)?e.options:[];if([`IMAGE`,`VIDEO`,`AUDIO`].includes(r)){let a=S===`workflow`&&r===`IMAGE`?`<span class="rh-preview-slot">图 ${Number(e.imageOrder)||1} · ${e.required===!0?`必选`:`可选`}</span>`:``,s=r===`VIDEO`?`file-video`:r===`AUDIO`?`file-audio`:`image`,c=i.url?en(i.url,r,i.name||o):`<i data-lucide="${s}" class="w-5 h-5"></i><span>点击上传</span>`;return`<div class="rh-preview-field"><div class="rh-preview-label">${n}${a}</div><button class="rh-preview-media ${i.url?`has-media`:``}" type="button" onclick="pickRhPreviewMedia('${$(t)}','${r}')">${c}</button></div>`}if(r===`BOOLEAN`)return`<div class="rh-preview-field"><div class="rh-preview-label">${n}</div><div class="rh-preview-switch ${String(o).toLowerCase()===`true`?`on`:``}"><span></span></div></div>`;if(r===`SLIDER`){let r=Number.isFinite(Number(e.min))?Number(e.min):0,i=Number.isFinite(Number(e.max))&&Number(e.max)>r?Number(e.max):1,a=Number.isFinite(Number(e.step))&&Number(e.step)>0?Number(e.step):.01,s=Number.isFinite(Number(o))?Number(o):r;return`<div class="rh-preview-field"><div class="rh-preview-label"><span>${n}</span><span class="rh-preview-slider-val">${Q(s)}</span></div><input class="rh-preview-slider" type="range" min="${$(r)}" max="${$(i)}" step="${$(a)}" value="${$(s)}" oninput="updateRhPreviewValue('${$(t)}', this.value); const val=this.closest('.rh-preview-field')?.querySelector('.rh-preview-slider-val'); if(val) val.textContent=this.value;"></div>`}if(s.length||r===`SELECT`)return`<div class="rh-preview-field"><div class="rh-preview-label">${n}</div><select disabled>${(s.length?s:[o||`选项`]).map(e=>`<option>${Q(e)}</option>`).join(``)}</select></div>`;let c=r===`NUMBER`&&e.random_enabled?`<button class="random-btn rh-preview-random-btn ${a?`active`:``}" type="button" onclick="toggleRhPreviewRandom('${$(t)}')" title="${a?`使用随机数`:`使用固定数`}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>`:``;return`<div class="rh-preview-field"><div class="rh-preview-label">${n}</div><div class="rh-preview-random-row" style="${c?``:`grid-template-columns:1fr`}"><input ${a?`disabled`:``} type="${r===`NUMBER`?`number`:`text`}" value="${$(o)}" placeholder="${r===`NUMBER`&&a?`随机数`:``}" oninput="updateRhPreviewValue('${$(t)}', this.value)">${c}</div></div>`}function en(e,t,n=``){let r=$(e||``);return t===`VIDEO`?`<video src="${r}" muted preload="metadata" playsinline controls></video>`:t===`AUDIO`?`<span class="rh-preview-audio"><i data-lucide="file-audio" class="w-5 h-5"></i>${Q(n||`音频`)}</span><audio src="${r}" controls preload="metadata"></audio>`:`<img src="${r}" alt="">`}function tn(e){return e===`VIDEO`?`video/*`:e===`AUDIO`?`audio/*`:`image/*`}async function nn(e,t){let n=document.createElement(`input`);n.type=`file`,n.accept=tn(t),n.onchange=async()=>{let r=n.files?.[0];if(!r)return;let i=URL.createObjectURL(r);x.previewParams[e]={...x.previewParams[e]||{},url:i,name:r.name,uploading:!0},B();let a=new FormData;a.append(`files`,r);try{let n=(await fetch(`/api/ai/upload`,{method:`POST`,body:a}).then(async e=>{let t=await e.json();if(!e.ok)throw Error(t.detail||`上传失败`);return t})).files?.[0];x.previewParams[e]={...x.previewParams[e]||{},url:n?.url||i,name:n?.name||r.name,kind:n?.kind||t.toLowerCase(),uploading:!1},D(()=>B())}catch(t){x.previewParams[e]={...x.previewParams[e]||{},uploading:!1},D(()=>B()),alert(t.message||`上传失败`)}},n.click()}function rn(e){let t=x.previewParams[e]||{},n=(x.config?.fields||[]).find(t=>M(t)===e);x.previewParams[e]={...t,value:t.value??n?.fieldValue??``,randomActive:t.randomActive===!1},D(()=>B())}function an(e,t){let n=x.previewParams[e]||{};x.previewParams[e]={...n,value:t,randomActive:!1}}function on(e){let t=Number(e.step)>0&&Number(e.step)<1,n=Number.isFinite(Number(e.min))?Number(e.min):null,r=Number.isFinite(Number(e.max))?Number(e.max):null,i=`${e.fieldName||``} ${e.label||``}`.toLowerCase(),a=i.includes(`seed`)||i.includes(`noise`)||i.includes(`随机`)||i.includes(`种子`);n===null&&(n=+!!a),(r===null||r<=n)&&(r=a?0x38d7ea4c68000:999999);let o=n+Math.random()*(r-n);if(t){let t=Math.min(8,Math.max(1,String(e.step).split(`.`)[1]?.length||2));return Number(o.toFixed(t))}return Math.floor(o)}async function sn(e){let t=String(e||``).trim();if(!t)return``;if(!/^https?:\/\//i.test(t)&&!t.startsWith(`/output/`)&&!t.startsWith(`/assets/`))return t;let n=await fetch(`/api/runninghub/upload-asset`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({url:t})}),r=await n.json();if(!n.ok||r.success===!1)throw Error(r.detail||r.error||`RunningHub 素材上传失败`);return r.data?.fileName||t}async function cn(){let e=x.config,t=ot((e?.fields||[]).filter(e=>e.enabled===!0)),n=[];for(let e of t){let t=M(e),r=N(e);if(e.sourceFromUpstream===!1&&![`IMAGE`,`VIDEO`,`AUDIO`].includes(r))continue;let i=x.previewParams[t]||{},a=i.value??e.fieldValue??``;if([`IMAGE`,`VIDEO`,`AUDIO`].includes(r)){if(S===`workflow`&&r===`IMAGE`&&e.required!==!0&&!i.url)continue;if(S===`workflow`&&r===`IMAGE`&&e.required===!0&&!i.url&&!a)throw Error(`缺少必选图片：${e.label||e.fieldName}`);a=await sn(i.url||a)}else r===`NUMBER`&&e.random_enabled===!0&&i.randomActive!==!1?a=on(e):[`NUMBER`,`SLIDER`].includes(r)&&String(a??``).trim()!==``&&!Number.isNaN(Number(a))&&(a=Number(a));typeof a==`string`&&r!==`TEXT`&&/[\r\n]/.test(a)&&(a=a.split(/\r?\n/).map(e=>e.trim()).filter(Boolean)[0]||``),n.push({nodeId:e.nodeId,fieldName:e.fieldName,fieldValue:a})}return n}function ln(e){let t=x.config;if(S!==`workflow`||(t?.optionalImageMode||`prune-workflow`)!==`prune-workflow`)return null;let n=new Set((e||[]).map(e=>M(e))),r=ot(t.fields||[]).filter(e=>e.enabled===!0&&N(e)===`IMAGE`&&e.required!==!0&&!n.has(M(e)));if(!r.length||!t.workflowJson)return null;let i=JSON.parse(JSON.stringify(t.workflowJson)),a=new Set;return r.forEach(e=>{let t=i[String(e.nodeId)];t?.inputs&&Object.prototype.hasOwnProperty.call(t.inputs,e.fieldName)&&delete t.inputs[e.fieldName],t?.inputs&&!Object.keys(t.inputs).length&&a.add(String(e.nodeId))}),a.forEach(e=>delete i[e]),Object.values(i).forEach(e=>{Object.entries(e?.inputs||{}).forEach(([t,n])=>{Array.isArray(n)&&a.has(String(n[0]))&&delete e.inputs[t]})}),i}async function un(){let e=x.config;if(!(!e||x.previewRunning)){x.previewRunning=!0,x.previewStatus=`正在提交 RunningHub 任务...`,x.previewOutputs=[],B();try{let t=await cn(),n=S===`workflow`?`/api/runninghub/workflow-submit`:`/api/runninghub/submit`,r=ln(t),i=S===`workflow`?{workflowId:String(e.workflowId||``).trim(),nodeInfoList:t,...r?{workflow:r}:{}}:{webappId:String(e.appId||``).trim(),nodeInfoList:t};if(S===`workflow`&&!i.workflowId)throw Error(`workflowId 为空`);if(S===`app`&&!i.webappId)throw Error(`webappId 为空`);let a=(await fetch(n,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(i)}).then(async e=>{let t=await e.json();if(!e.ok||t.success===!1)throw Error(t.detail||t.error||`RunningHub 提交失败`);return t.data||t})).taskId;if(!a)throw Error(`RunningHub 没有返回 taskId`);x.previewStatus=`任务已提交：${a}`,B();let o=null;for(let e=0;e<720;e++){await new Promise(e=>setTimeout(e,2500));let e=await fetch(`/api/runninghub/query?taskId=${encodeURIComponent(a)}`).then(async e=>{let t=await e.json();if(!e.ok||t.success===!1)throw Error(t.detail||t.error||`RunningHub 查询失败`);return t.data||t});if(e.status===`SUCCESS`){o=e;break}if(e.status===`FAILED`)throw Error(e.failReason||`RunningHub 任务失败`);x.previewStatus=e.status===`QUEUED`?`排队中...`:`运行中...`,B()}if(!o)throw Error(`RunningHub 任务超时`);let s=o.urls||[];if(!s.length)throw Error(`RunningHub 没有返回产物`);x.previewOutputs=s,x.previewStatus=`测试完成`,E(`RunningHub 测试完成`)}catch(e){x.previewStatus=e.message||String(e),E(x.previewStatus),alert(x.previewStatus)}finally{x.previewRunning=!1,B()}}}function dn(){S===`app`?hn():bn()}function fn(){let e=x.config;if(!e||!xe)return;let t=e.fields||[],n=t.filter(e=>e.enabled===!0).length,r=S===`app`?1:Object.keys(e.workflowJson||{}).length,i=t.filter(e=>e.enabled===!0&&N(e)===`IMAGE`),a=i.filter(e=>e.required!==!0).length;xe.innerHTML=`
        <div><span>${S===`app`?`应用`:`节点`}</span><strong>${r}</strong></div>
        <div><span>字段</span><strong>${n} / ${t.length}</strong></div>
        ${S===`workflow`?`<div><span>可选图</span><strong>${a} / ${i.length}</strong></div>`:``}
    `}function pn(){let e=x.config;if(!e||!y)return;let t={};(e.fields||[]).forEach(e=>{let n=at(e);(t[n]=t[n]||{field:e,items:[]}).items.push(e)});let n=Object.entries(t);if(!n.length){y.innerHTML=`<div class="rh-editor-empty">没有可配置字段</div>`;return}y.innerHTML=n.map(([e,t])=>{let n=e.replace(/[^a-zA-Z0-9_-]/g,`_`),r=x.expanded[n]!==!1,i=t.items.filter(e=>e.enabled===!0).length;return`
            <div class="rh-editor-node ${r?`expanded`:``} ${String(t.field.nodeId)===x.activeNodeId?`is-focused`:``}" data-node-id="${$(t.field.nodeId)}">
                <button class="rh-editor-node-head" type="button" onclick="toggleRhWorkflowEditorGroup('${$(n)}')">
                    <span>
                        <strong>${Q(t.field.group||`Node #${t.field.nodeId}`)}</strong>
                        <small>#${Q(t.field.nodeId)} · ${i}/${t.items.length}</small>
                    </span>
                    <i data-lucide="chevron-down" class="w-4 h-4"></i>
                </button>
                <div class="rh-editor-node-body">
                    ${t.items.map(e=>mn(e)).join(``)}
                </div>
            </div>
        `}).join(``)}function mn(e){let t=M(e),n=e.enabled===!0,r=N(e),i=Array.isArray(e.options)?e.options.join(`
`):``,a=e.random_enabled===!0,o=e.sourceFromUpstream===!1,s=S===`workflow`&&r===`IMAGE`?`
        <div class="rh-image-slot-row">
            <label><span>排序</span><input type="number" min="1" step="1" value="${$(e.imageOrder||``)}" oninput="updateRhWorkflowEditorField('${$(t)}','imageOrder',this.value)"></label>
            <button class="rh-editor-required ${e.required===!0?`active`:``}" type="button" onclick="updateRhWorkflowEditorField('${$(t)}','required',${e.required===!0?`false`:`true`})">
                <span class="check-dot"></span>${e.required===!0?`必选`:`可选`}
            </button>
        </div>
    `:``;return`
        <div class="rh-editor-field-row ${n?`active`:``}">
            <button class="rh-editor-check ${n?`checked`:``}" type="button" onclick="toggleRhWorkflowEditorField('${$(t)}')">${n?`<i data-lucide="check" class="w-3 h-3"></i>`:``}</button>
            <div class="rh-editor-field-main">
                <div class="rh-editor-field-name">${Q(e.label||e.fieldName)}</div>
                <div class="rh-editor-field-meta">${Q(e.fieldName)} · ${Q(r)}</div>
                <button class="rh-editor-keep ${o?`active`:``}" type="button" onclick="updateRhWorkflowEditorField('${$(t)}','sourceFromUpstream',${o?`true`:`false`})">
                    <span class="check-dot"></span>${o?`保留工作流原设置`:`暴露并覆盖参数`}
                </button>
                <div class="rh-editor-field-controls">
                    <input type="text" value="${$(e.label||``)}" placeholder="显示名称" oninput="updateRhWorkflowEditorField('${$(t)}','label',this.value)">
                    <select onchange="updateRhWorkflowEditorField('${$(t)}','fieldType',this.value)">
                        ${[`TEXT`,`NUMBER`,`SLIDER`,`BOOLEAN`,`SELECT`,`IMAGE`,`VIDEO`,`AUDIO`].map(t=>`<option value="${t}" ${String(e.fieldType||r).toUpperCase()===t?`selected`:``}>${tt(t)}</option>`).join(``)}
                    </select>
                </div>
                ${s}
                <div class="rh-editor-field-controls rh-editor-wide-controls">
                    <textarea placeholder="下拉选项：每行一个，例如 1024x1024" oninput="updateRhWorkflowEditorField('${$(t)}','options',this.value)">${Q(i)}</textarea>
                </div>
                <div class="rh-editor-random-row">
                    <button class="rh-editor-random ${a?`active`:``}" type="button" onclick="updateRhWorkflowEditorField('${$(t)}','random_enabled',${a?`false`:`true`})"><i data-lucide="dice-5" class="w-3.5 h-3.5"></i><span>随机数</span></button>
                    <input type="number" value="${$(e.min??``)}" placeholder="最小" oninput="updateRhWorkflowEditorField('${$(t)}','min',this.value)">
                    <input type="number" value="${$(e.max??``)}" placeholder="最大" oninput="updateRhWorkflowEditorField('${$(t)}','max',this.value)">
                    <input type="number" value="${$(e.step??``)}" placeholder="步长" oninput="updateRhWorkflowEditorField('${$(t)}','step',this.value)">
                </div>
            </div>
        </div>
    `}function hn(){let e=x.config;!b||!e||(Kt(),b.classList.add(`rh-app-field-wrap`),b.innerHTML=`
        <div class="rh-app-field-list">
            ${(e.fields||[]).length?(e.fields||[]).map(e=>_n(e)).join(``):`<div class="rh-editor-empty">没有拉取到应用参数</div>`}
        </div>
    `,w())}function gn(){!b||Se?.parentElement===b||(b.classList.remove(`rh-app-field-wrap`),b.innerHTML=`
        <svg id="rhWorkflowEditorGraphSvg" class="rh-editor-graph-svg"></svg>
        <div class="rh-editor-graph-controls">
            <button type="button" onclick="rhEditorGraphZoom(-1)" title="缩小"><i data-lucide="zoom-out" class="w-4 h-4"></i></button>
            <span id="rhWorkflowEditorZoom">100%</span>
            <button type="button" onclick="rhEditorGraphZoom(1)" title="放大"><i data-lucide="zoom-in" class="w-4 h-4"></i></button>
            <button type="button" onclick="rhEditorGraphFit()" title="适应窗口"><i data-lucide="maximize" class="w-4 h-4"></i></button>
        </div>
    `,Se=document.getElementById(`rhWorkflowEditorGraphSvg`),Ce=document.getElementById(`rhWorkflowEditorZoom`))}function _n(e){let t=M(e),n=e.enabled===!0;return`
        <div class="rh-app-field-card ${n?`active`:``}" data-field-key="${$(t)}" onclick="openRhAppFieldPopover('${$(t)}', this)">
            <button class="rh-editor-check ${n?`checked`:``}" type="button" onclick="event.stopPropagation();toggleRhWorkflowEditorField('${$(t)}')">${n?`<i data-lucide="check" class="w-3 h-3"></i>`:``}</button>
            <div>
                <strong>${Q(e.label||e.fieldName)}</strong>
                <span>${Q(e.fieldName)} · ${Q(N(e))}</span>
            </div>
            <i data-lucide="settings-2" class="w-4 h-4"></i>
        </div>
    `}function vn(e,t){let n=(x.config?.fields||[]).find(t=>M(t)===e);if(!n)return;Kt();let r=document.createElement(`div`);r.id=`rhNodePopover`,r.className=`rh-node-popover rh-app-popover`,r.dataset.fieldKey=String(e||``),r.innerHTML=`
        <div class="rh-popover-head">
            <div>
                <strong>${Q(n.label||n.fieldName)}</strong>
                <span>${Q(n.fieldName)}</span>
            </div>
            <button type="button" onclick="closeRhNodePopover()"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="rh-popover-body">${mn(n)}</div>
    `,document.body.appendChild(r);let i=t?.getBoundingClientRect?.(),a=_?.getBoundingClientRect?.()||{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight},o=i?i.left:window.innerWidth/2-190,s=i?i.bottom+10:window.innerHeight/2-180;o+390>a.right-16&&(o=a.right-390-16),s+420>a.bottom-16&&(s=Math.max(a.top+74,(i?.top||s)-420)),r.style.left=`${Math.max(a.left+16,o)}px`,r.style.top=`${s}px`,w()}function yn(e){let t=Object.keys(e||{}),n={},r={};t.forEach(e=>{n[e]=new Set,r[e]=new Set}),t.forEach(t=>{Object.values(e[t]?.inputs||{}).forEach(i=>{Array.isArray(i)&&i.length===2&&typeof i[0]==`string`&&e[i[0]]&&(n[t].add(i[0]),r[i[0]].add(t))})});let i={},a=new Set;function o(e,t){a.has(e)||(i[e]=Math.max(i[e]||0,t),a.add(e),r[e].forEach(e=>o(e,t+1)),a.delete(e))}t.forEach(e=>{n[e].size===0&&o(e,0)}),t.forEach(e=>{e in i||(i[e]=0)});let s={};return t.forEach(e=>{(s[i[e]]=s[i[e]]||[]).push(e)}),{buckets:s}}function bn(){let e=x.config;gn(),Kt();let t=e?.workflowJson||{},n=Se,r=b;if(!n||!r)return;if(!t||!Object.keys(t).length){n.innerHTML=`<text x="24" y="42" fill="currentColor">暂无工作流预览</text>`;return}let{buckets:i}=yn(t),a={},o=Object.keys(i).map(Number).sort((e,t)=>e-t),s=0;o.forEach(e=>{let t=i[e].sort((e,t)=>parseInt(e,10)-parseInt(t,10));t.forEach((t,n)=>a[t]={x:e*178+18,y:n*68+18}),s=Math.max(s,t.length)});let c=[];Object.keys(t).forEach(e=>{let n=new Set;Object.values(t[e]?.inputs||{}).forEach(t=>{if(Array.isArray(t)&&t.length===2&&typeof t[0]==`string`&&a[t[0]]&&a[e]){if(n.has(t[0]))return;n.add(t[0]);let r=a[t[0]],i=a[e],o=r.x+136,s=r.y+26,l=i.x,u=i.y+26,d=(o+l)/2;c.push(`<path class="rh-editor-edge" d="M ${o} ${s} C ${d} ${s}, ${d} ${u}, ${l} ${u}"></path>`)}})});let l=new Set((e.fields||[]).filter(e=>e.enabled===!0).map(e=>String(e.nodeId))),u=Object.entries(t).map(([t,n])=>{let r=a[t],i=Qe(n),o=$e(n),s=et(n),c=(e.fields||[]).filter(e=>e.enabled===!0&&String(e.nodeId)===String(t)).length;return`
            <g class="rh-editor-gnode cat-${s} ${l.has(String(t))?`has-exposed`:``} ${String(t)===x.activeNodeId?`is-active`:``}" data-node-id="${$(t)}" transform="translate(${r.x},${r.y})" onclick="openRhWorkflowNodePopover('${$(t)}', this)">
                <rect width="136" height="52" rx="8"></rect>
                <text class="rh-editor-gtitle" x="10" y="20">${Q(i.length>15?i.slice(0,15)+`...`:i)}</text>
                <text class="rh-editor-gsub" x="10" y="36">${Q(o.length>18?o.slice(0,18)+`...`:o)}</text>
                <text class="rh-editor-gsub" x="128" y="20" text-anchor="end">#${Q(t)}</text>
                ${c?`<text class="rh-editor-gbadge" x="128" y="43" text-anchor="end">${c}</text>`:``}
            </g>
        `}).join(``);x.graph.w=o.length*178+18,x.graph.h=s*68+18,n.setAttribute(`viewBox`,`0 0 ${r.clientWidth||800} ${r.clientHeight||520}`),n.innerHTML=`<g id="rhWorkflowEditorViewport" transform="translate(${x.graph.x},${x.graph.y}) scale(${x.graph.k})">${c.join(``)}${u}</g>`,Tn(),xn()}function xn(){Ce&&(Ce.textContent=Math.round((x.graph.k||1)*100)+`%`)}function Sn(){let e=document.getElementById(`rhWorkflowEditorViewport`),t=x.graph;e&&e.setAttribute(`transform`,`translate(${t.x},${t.y}) scale(${t.k})`),xn()}function Cn(e){let t=b;if(!t)return;let n=x.graph,r=e>0?1.2:1/1.2,i=Math.max(.2,Math.min(3,n.k*r)),a=t.clientWidth/2,o=t.clientHeight/2;n.x=a-(a-n.x)*(i/n.k),n.y=o-(o-n.y)*(i/n.k),n.k=i,Sn()}function wn(){let e=b,t=x.graph;if(!e||!t.w||!t.h)return;let n=Math.max(.2,Math.min(2,Math.min((e.clientWidth-48)/t.w,(e.clientHeight-48)/t.h)));t.k=n,t.x=(e.clientWidth-t.w*n)/2,t.y=(e.clientHeight-t.h*n)/2,Sn()}function Tn(){let e=Se,t=b;!e||!t||e.dataset.editorPanZoomBound||(e.dataset.editorPanZoomBound=`1`,x.bound=!0,t.addEventListener(`wheel`,e=>{if(!x.open)return;e.preventDefault();let n=x.graph,r=e.deltaY<0?1.15:1/1.15,i=Math.max(.2,Math.min(3,n.k*r)),a=t.getBoundingClientRect(),o=e.clientX-a.left,s=e.clientY-a.top;n.x=o-(o-n.x)*(i/n.k),n.y=s-(s-n.y)*(i/n.k),n.k=i,Sn()},{passive:!1}),e.addEventListener(`mousedown`,e=>{x.open&&(e.preventDefault(),x.pan={sx:e.clientX,sy:e.clientY,ox:x.graph.x,oy:x.graph.y},t.classList.add(`is-panning`))}),window.addEventListener(`mousemove`,e=>{let t=x.pan;t&&(x.graph.x=t.ox+e.clientX-t.sx,x.graph.y=t.oy+e.clientY-t.sy,Sn())}),window.addEventListener(`mouseup`,()=>{x.pan&&(x.pan=null,t.classList.remove(`is-panning`))}))}function V(){let e=O();if(!e||e.id!==`runninghub`){le&&(le.innerHTML=``),ue&&(ue.innerHTML=``);return}I(e);let t=e.rh_apps.map((e,t)=>({...e,_rhIndex:t})).filter(e=>e?.hidden!==!0),n=e.rh_workflows.map((e,t)=>({...e,_rhIndex:t})).filter(e=>e?.hidden!==!0);de&&(de.textContent=t.length),fe&&(fe.textContent=n.length),kn(le,t,`app`),kn(ue,n,`workflow`),w()}function En(e,t){let n=String((e===`workflow`?t?.workflowId||t?.id:t?.appId||t?.id)||``).trim().replace(/[^0-9A-Za-z_-]/g,``);if(!n)return[];let r=e===`workflow`?`workflow`:`app`,i=[`jpg`],a=[`${r}-${n}`,n],o=[`/static/runninghub/thumbnails`,`/static/runninghub`],s=[];return a.forEach(e=>{i.forEach(t=>{o.forEach(n=>s.push(`${n}/${e}.${t}`))})}),s}function Dn(e,t){let n=e===`app`?`sparkles`:`workflow`,r=En(e,t),i=String(t?.thumbnail||``).trim(),a=i||r[0]||``;if(!a)return`<i data-lucide="${n}" class="w-5 h-5"></i>`;let o=i?r:r.slice(1);return`<img src="${$(a)}" alt="" data-rh-thumb-fallbacks="${$(o.join(`|`))}" onerror="fallbackRhEntryThumbnail(this,'${n}')">`}function On(e,t){let n=String(e?.dataset?.rhThumbFallbacks||``).split(`|`).filter(Boolean),r=n.shift();if(r){e.dataset.rhThumbFallbacks=n.join(`|`),e.src=r;return}let i=e?.parentElement;i&&(i.innerHTML=`<i data-lucide="${t===`sparkles`?`sparkles`:`workflow`}" class="w-5 h-5"></i>`,w())}function kn(e,t,n){if(e){if(!t.length){e.innerHTML=`<div class="rh-empty">${n===`app`?`粘贴 /run/ai-app/... 后点击创建 AI 应用卡片`:`粘贴 /run/workflow/... 后点击创建工作流卡片`}</div>`;return}e.innerHTML=t.map((e,t)=>`
        <div class="rh-config-card">
            <button class="rh-thumb" type="button" onclick="pickRhThumbnail('${n}', ${e._rhIndex??t})" title="上传缩略图">
                ${Dn(n,e)}
            </button>
            <div class="rh-card-main">
                <label class="rh-card-title-field">
                    <span>名称</span>
                    <input type="text" value="${$(e.title||``)}" oninput="updateRhEntry('${n}', ${e._rhIndex??t}, 'title', this.value)" placeholder="${n===`app`?`AI 应用名称`:`工作流名称`}">
                </label>
                <div class="rh-id-line"><i data-lucide="hash" class="w-3 h-3"></i><span>${Q(n===`app`?`/run/ai-app/${e.id}`:`/run/workflow/${e.id}`)}</span></div>
                <textarea oninput="updateRhEntry('${n}', ${e._rhIndex??t}, 'note', this.value)" placeholder="备注、用途、参数说明">${Q(e.note||``)}</textarea>
            </div>
            <div class="rh-card-actions">
                ${n===`workflow`?`<button class="rh-card-action" type="button" onclick="openRhWorkflowEditor(${e._rhIndex??t})" title="编辑工作流"><i data-lucide="settings-2" class="w-3.5 h-3.5"></i></button>`:`<button class="rh-card-action" type="button" onclick="openRhAppEditor(${e._rhIndex??t})" title="编辑应用参数"><i data-lucide="settings-2" class="w-3.5 h-3.5"></i></button>`}
                <button class="rh-card-action danger" type="button" onclick="removeRhEntry('${n}', ${e._rhIndex??t})" title="删除"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
        </div>
    `).join(``)}}function An(){C=!0,H(),U(),ft(O())}function jn(){ke&&(ke.style.display=`none`),C=!1,H(),U(),W()}function H(){pe&&(pe.hidden=C),me&&(me.hidden=!C);let e=me?.querySelector(`.editor-title`),t=me?.querySelector(`.editor-sub`);e&&(e.textContent=T(`api.recommendPanelTitle`)),t&&(t.textContent=T(`api.recommendPanelSub`)),document.body.classList.toggle(`show-recommend-mode`,C)}function U(){if(!he)return;if(!C){he.innerHTML=``;return}let e=Re.map((e,t)=>`
        <section class="recommend-card recommend-platform-card" style="--recommend-index:${t}">
            <div class="recommend-platform-info">
                <div class="recommend-platform-head">
                    <div>
                        <div class="recommend-name"><span>${Q(e.name)}</span></div>
                    </div>
                    <span class="recommend-badge">${Q(e.protocol===`apimart`?`APIMart`:`OpenAI`)}</span>
                </div>
                <p class="recommend-platform-summary">${Q(T(e.summaryKey))}</p>
                <div class="recommend-tags">
                    ${e.perkKey?`<span class="recommend-tag recommend-perk-tag ${$(e.perkClass||``)}"><i data-lucide="gift" class="w-3 h-3"></i><span>${Q(T(e.perkKey))}</span></span>`:``}
                    ${(e.tagKeys||[]).map(e=>`<span class="recommend-tag">${Q(e.startsWith(`api.`)?T(e):e)}</span>`).join(``)}
                </div>
            </div>
            <div class="recommend-platform-setup">
                <div class="recommend-setup-title">${Q(T(`api.recommendQuickSetup`))}</div>
                <div class="recommend-quick-stack recommend-setup-flow">
                    <div class="recommend-guide-source onboarding-rh-source-group">
                        <div class="onboarding-rh-source-label">${Q(T(`api.getKey`))}</div>
                        <div class="onboarding-key-actions onboarding-rh-key-actions recommend-single-action">
                            <a class="onboarding-key-btn recommend-guide-key-btn" href="${$(e.register_url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="key-round" class="w-3.5 h-3.5"></i><span>${Q(T(`api.getKey`))}</span></a>
                        </div>
                    </div>
                    <div class="recommend-flow-arrow onboarding-flow-arrow recommend-guide-arrow" aria-hidden="true"><span></span><b></b></div>
                    <div class="recommend-guide-save">
                        <label class="onboarding-key-field onboarding-rh-row-field">
                            <span>API Key</span>
                            <input type="password" data-recommend-key="${t}" placeholder="${$(Be(`api.recommendKeyPlaceholder`,{name:e.name}))}">
                        </label>
                        <button class="onboarding-save-btn recommend-guide-save-btn" type="button" onclick="saveRecommendedApi(${t})"><span>${Q(T(`api.save`))}</span></button>
                    </div>
                </div>
            </div>
        </section>
    `).join(``);he.innerHTML=`
        <div class="onboarding-head">
            <div>
                <div class="onboarding-title">${Q(T(`api.recommendPanelTitle`))}</div>
                <div class="onboarding-desc">${Q(T(`api.recommendPanelDesc`))}</div>
            </div>
        </div>
        <div class="recommend-api-body recommend-inline-body">${e}</div>
        <div class="recommend-note">${Q(T(`api.recommendApiNote`))}</div>
        <div class="recommend-account-invite">
            <div>
                <div class="recommend-account-title">${Q(T(`api.recommendAccountTitle`))}</div>
                <div class="recommend-account-desc">${Q(T(`api.recommendAccountDesc`))}</div>
            </div>
            <a class="onboarding-key-btn recommend-account-link" href="https://bewild.ai?code=WULIDX" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" class="w-3.5 h-3.5"></i><span>${Q(T(`api.viewPlans`))}</span></a>
        </div>
    `,w()}function Mn(t){let n=e.find(e=>String(e.name||``).toLowerCase()===t.name.toLowerCase());if(n)return n;let r=Ke(t.name)||`custom-api`,i=r,a=2;for(;e.some(e=>e.id===i);)i=`${r}-${a++}`;return n={id:i,name:t.name,base_url:t.base_url,protocol:t.protocol,image_request_mode:K(t.image_request_mode),image_generation_endpoint:``,image_edit_endpoint:``,enabled:!0,primary:!1,image_models:Array.isArray(t.image_models)?[...t.image_models]:[],chat_models:Array.isArray(t.chat_models)?[...t.chat_models]:[],video_models:Array.isArray(t.video_models)?[...t.video_models]:[],model_protocols:t.model_protocols&&typeof t.model_protocols==`object`?{...t.model_protocols}:{},has_key:!1,key_preview:``},e.push(n),n}async function Nn(e){let n=Re[e];if(!n)return;let r=(he?.querySelector(`[data-recommend-key="${e}"]`))?.value.trim()||``;if(!r){alert(T(`api.enterApiKey`));return}t=Mn(n).id,C=!1,H(),In(),W(),f.value=r,u&&(u.value=n.protocol,u.dispatchEvent(new Event(`change`))),d&&(d.value=K(n.image_request_mode),d.dispatchEvent(new Event(`change`))),F(),await Z()&&E(Be(`api.recommendSaved`,{name:n.name}))}function Pn(){let e=[`modelscope`,`runninghub`,`volcengine`];return Xe().sort((t,n)=>{let r=e.indexOf(t.id),i=e.indexOf(n.id);return r===-1&&i===-1?0:r===-1?1:i===-1?-1:r-i})}function Fn(e){if(k(e))return``;let t=$(e.id);return` draggable="true" data-provider-id="${t}" ondragstart="handleProviderDragStart(event,'${t}')" ondragover="handleProviderDragOver(event,'${t}')" ondrop="handleProviderDrop(event,'${t}')" ondragend="handleProviderDragEnd()"`}function In(){n.innerHTML=Pn().map(e=>{let n=e.id===t?`active`:``,r=e.enabled===!1?`is-disabled`:e.has_key||e.has_wallet_key?`has-key`:`missing-key`,i=e.id===`runninghub`?`RH`:String(e.protocol||`openai`).toUpperCase();return e.id===`modelscope`?`
                <button class="provider-card provider-card-banner ${n} ${r}" type="button" onclick="selectProvider('${Q(e.id)}')">
                    <span class="provider-banner-inner">
                        <span class="provider-logo-wrap">
                            <img src="/static/images/modelscope.gif" alt="ModelScope" class="ms-icon-light">
                            <img src="/static/images/modelscope-1.gif" alt="ModelScope" class="ms-icon-dark">
                            <span class="provider-logo-fallback">ModelScope</span>
                        </span>
                        <span class="provider-protocol-pill">OpenAI</span>
                    </span>
                </button>
            `:e.id===`runninghub`?`
                <button class="provider-card provider-card-banner ${n} ${r}" type="button" onclick="selectProvider('${Q(e.id)}')">
                    <span class="provider-banner-inner">
                        <span class="provider-logo-wrap">
                            <img src="/static/images/RunningHub-B.png" alt="RunningHub" class="runninghub-icon ms-icon-light">
                            <img src="/static/images/RunningHub-W.png" alt="RunningHub" class="runninghub-icon ms-icon-dark">
                            <span class="provider-logo-fallback">RunningHub</span>
                        </span>
                        <span class="provider-protocol-pill">RH</span>
                    </span>
                </button>
            `:e.id===`volcengine`?`
                <button class="provider-card provider-card-banner ${n} ${r}" type="button" onclick="selectProvider('${Q(e.id)}')">
                    <span class="provider-banner-inner">
                        <span class="provider-logo-wrap">
                            <img src="/static/images/volcengine-theme-light.svg" alt="火山引擎" class="volcengine-icon ms-icon-light">
                            <img src="/static/images/volcengine-theme-dark.svg" alt="火山引擎" class="volcengine-icon ms-icon-dark">
                            <span class="provider-logo-fallback">火山引擎</span>
                        </span>
                        <span class="provider-protocol-pill">Ark</span>
                    </span>
                </button>
            `:`
            <button class="provider-card provider-card-sortable ${n} ${r}" type="button" onclick="selectProvider('${Q(e.id)}')"${Fn(e)}>
                <span class="provider-drag-handle" aria-hidden="true"><i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i></span>
                <span class="provider-mark"><i data-lucide="${e.has_key?`key-round`:`key`}" class="w-4 h-4"></i></span>
                <span class="provider-info">
                    <div class="provider-name">${Q(e.name||e.id)}</div>
                    <div class="provider-meta">${Q(e.base_url||`未配置地址`)}</div>
                </span>
                <span class="provider-side-meta">
                    <span class="provider-status-dot"></span>
                    <span class="provider-protocol-pill">${Q(i)}</span>
                </span>
            </button>
        `}).join(``),w()}function Ln(t,n){let r=e.find(e=>e.id===n);if(!r||k(r)){t.preventDefault();return}Le=n,t.currentTarget.classList.add(`is-dragging`),t.dataTransfer.effectAllowed=`move`,t.dataTransfer.setData(`text/plain`,n)}function Rn(e,t){!Le||Le===t||k(t)||(e.preventDefault(),e.dataTransfer.dropEffect=`move`,n?.querySelectorAll(`.provider-card-drop-target`).forEach(e=>e.classList.remove(`provider-card-drop-target`)),e.currentTarget.classList.add(`provider-card-drop-target`))}function zn(t,r){t.preventDefault(),n?.querySelectorAll(`.provider-card-drop-target`).forEach(e=>e.classList.remove(`provider-card-drop-target`));let i=Le||t.dataTransfer.getData(`text/plain`);if(Le=``,!i||i===r||k(i)||k(r))return;let a=e.findIndex(e=>e.id===i),o=e.findIndex(e=>e.id===r);if(a<0||o<0)return;let[s]=e.splice(a,1),c=e.findIndex(e=>e.id===r);e.splice(c,0,s),In(),Z()}function Bn(){Le=``,n?.querySelectorAll(`.is-dragging,.provider-card-drop-target`).forEach(e=>{e.classList.remove(`is-dragging`,`provider-card-drop-target`)})}function W(){let e=O();if(!e)return;r.textContent=e.name||e.id,a.value=e.name||``,o.value=e.id||``,Je(),Vn(),c.placeholder=`https://api.example.com/v1`,c.value=e.base_url||``,l&&(l.value=J(e)&&e.proxy_url||``),u&&(u.value=e.id===`runninghub`?`openai`:e.id===`volcengine`?`volcengine`:e.protocol||`openai`),d&&(d.value=K(e.image_request_mode)),f.value=``,f.placeholder=e.has_key?`${T(`api.keepCurrentKey`)} ${e.key_preview||``}`:T(`api.enterKey`),ee.textContent=e.has_key?`${T(`api.keySaved`)}${e.key_env||`API/.env`}`:T(`api.noKey`);let t=e.id===`modelscope`,n=e.id===`runninghub`,i=e.id===`volcengine`||String(u?.value||e.protocol||``).toLowerCase()===`volcengine`,s=e.id===`volcengine`,pe=J(e);n&&(I(e),p&&(p.value=``,p.placeholder=e.has_key?`${T(`api.rhKeepCoinKey`)} ${e.key_preview||``}`:T(`api.rhEnterCoinKey`)),m&&(m.value=``,m.placeholder=e.has_wallet_key?`${T(`api.rhKeepWalletKey`)} ${e.wallet_key_preview||``}`:T(`api.rhEnterWalletKey`)),te&&(te.textContent=st(e)),ne&&(ne.textContent=ct(e)),V()),i&&(e.base_url=e.base_url||Ae,e.protocol=`volcengine`,e.volcengine_project_name=e.volcengine_project_name||je,e.volcengine_region=e.volcengine_region||Me,f.placeholder=e.has_key?`保持当前方舟 API Key ${e.key_preview||``}`:`输入方舟 API Key`,ee.textContent=lt(e),re&&(re.textContent=lt(e)),h&&(h.value=``,h.placeholder=e.has_volcengine_access_key?`保持当前 AK ${e.volcengine_access_key_preview||``}`:`Access Key ID`),g&&(g.value=``,g.placeholder=e.has_volcengine_secret_key?`保持当前 SK ${e.volcengine_secret_key_preview||``}`:`Secret Access Key`),ie&&(ie.textContent=ut(e)),ae&&(ae.value=e.volcengine_project_name||je),oe&&(oe.value=e.volcengine_region||Me)),document.body.classList.toggle(`show-ms`,t),document.body.classList.toggle(`show-runninghub`,n),document.body.classList.toggle(`show-volcengine`,i),document.body.classList.toggle(`show-volcengine-standalone`,s),document.body.classList.toggle(`show-provider-proxy`,pe),ft(e),U(),se&&(se.hidden=!n,se.style.display=n?`flex`:`none`),n||(ce&&(ce.value=``),le&&(le.innerHTML=``),ue&&(ue.innerHTML=``),de&&(de.textContent=`0`),fe&&(fe.textContent=`0`)),De&&(De.style.display=t?`flex`:`none`);let me=document.getElementById(`deleteBtn`);me&&(me.style.display=k(e)?`none`:`inline-flex`),Y(`image`),Y(`chat`),Y(`video`),t?X():Oe&&(Oe.innerHTML=``),In()}function G(e){let t=document.getElementById(`verifyResult`);t&&(t.style.display=`block`,t.innerHTML=e)}function Vn(){let e=document.getElementById(`verifyResult`);e&&(e.style.display=`none`,e.innerHTML=``)}function Hn(e){try{return JSON.stringify(e,null,2)}catch{return String(e||``)}}function Un(e){return e?.id===`runninghub`?m?.value.trim()||p?.value.trim()||``:f.value.trim()}function K(e){return String(e||``).trim().toLowerCase()===`openai-json`?`openai-json`:`openai`}function Wn(e){return K(e)===`openai-json`?`OpenAI JSON`:`OpenAI 标准`}function Gn(e){let t=O();if(!t||!d)return!1;let n=K(e),r=K(t.image_request_mode)!==n||K(d.value)!==n;return d.value=n,t.image_request_mode=n,r}function Kn(e){let t=O(),n=String(e||``).toLowerCase();return!t||!u||![`openai`,`apimart`,`gemini`,`volcengine`].includes(n)||String(u.value||``).toLowerCase()===n&&String(t.protocol||``).toLowerCase()===n?!1:(u.value=n,t.protocol=n,t.base_url=c?.value.trim()||t.base_url||``,n===`volcengine`&&(t.video_models=A([...t.video_models||[],...Ne]),t.volcengine_project_name=t.volcengine_project_name||je,t.volcengine_region=t.volcengine_region||Me),u.dispatchEvent(new Event(`change`)),!0)}async function qn(){let e=O();if(!e)return;let t=document.getElementById(`probeAsyncBtn`),n=c.value.trim();if(!n){alert(`请先填写请求地址`);return}t&&(t.disabled=!0,t.querySelector(`span`).textContent=`检测中...`),G(`<span style="color:var(--muted);font-size:11px;font-weight:700">正在检测协议类型...</span>`);try{let t=Un(e),r=String(u?.value||e.protocol||`openai`).toLowerCase(),i=await fetch(`/api/providers/probe-async`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({base_url:n,api_key:t,provider_id:e.id,protocol:r,proxy_url:J(e)&&(l?.value.trim()||e.proxy_url)||``,image_request_mode:d?.value||e.image_request_mode||`openai`})}).then(async e=>{if(!e.ok)throw Error((await e.json()).detail||`请求失败`);return e.json()}),a=String(i.protocol||``).toLowerCase(),o=i.ok===!0&&a===`apimart`,s=i.ok===!0&&a===`openai`,c=[`gemini`,`volcengine`].includes(r);u&&!c&&Kn(a||(o?`apimart`:`openai`)),i.image_request_mode&&Gn(i.image_request_mode);let f=JSON.stringify(i.raw,null,2),ee=String(i.message||``),p=ee.includes(`/v1/tasks/`),m=o||s||i.ok===!0?`#15803d`:i.ok===null?`#b45309`:`#64748b`,te=o||s||i.ok===!0?`✓`:`⚠`,ne=a===`volcengine`?`方舟/Ark 任务协议`:o?`APIMart 异步`:a===`openai`?`OpenAI 兼容`:c?r===`gemini`?`Gemini`:r.toUpperCase():`OpenAI 兼容`;G(`
            ${p?``:`<div style="font-size:11px;font-weight:800;color:${m}">${te} ${Q(ee)}</div>`}
            <div style="font-size:11px;color:var(--muted);font-weight:700;margin-top:2px">${c?`协议已验证为`:`协议已自动设置为`}：<strong style="color:var(--text)">${ne}</strong> · 图片接口：<strong style="color:var(--text)">${Wn(d?.value||e.image_request_mode)}</strong></div>
            <details style="margin-top:6px">
                <summary style="font-size:10.5px;color:var(--muted);cursor:pointer;font-weight:700;user-select:none">▸ 查看原始响应 (HTTP ${i.status_code})</summary>
                <pre style="margin-top:6px;padding:10px 12px;border-radius:10px;background:var(--soft);border:1px solid var(--line-2);font-size:10.5px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;color:var(--text);max-height:200px;overflow:auto">${Q(f)}</pre>
            </details>`)}catch(t){let n=[`gemini`,`volcengine`].includes(String(u?.value||e.protocol||``).toLowerCase());u&&!n&&(u.value=`openai`,u.dispatchEvent(new Event(`change`)));let r=n?`，已保留当前手动选择的协议`:`，协议已设为 OpenAI 兼容`;G(`<div style="font-size:11px;font-weight:800;color:#b45309">⚠ ${Q(t.message||String(t))}${r}</div>`)}finally{t&&(t.disabled=!1,t.querySelector(`span`).textContent=`验证协议`,w())}}async function Jn(){let e=O();if(!e)return;let t=document.getElementById(`testUrlBtn`),n=c.value.trim();if(!n){alert(`请先填写请求地址`);return}t&&(t.disabled=!0,t.querySelector(`span`).textContent=T(`api.testingUrl`)||`验证中...`),G(`<span style="color:var(--muted);font-size:11px;font-weight:700">验证中...</span>`);try{let t=Un(e),r=await fetch(`/api/providers/test-connection`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({base_url:n,api_key:t,provider_id:e.id,protocol:u?.value||`openai`,proxy_url:J(e)&&(l?.value.trim()||e.proxy_url)||``,image_request_mode:d?.value||e.image_request_mode||`openai`})}).then(async e=>{if(!e.ok)throw Error((await e.json()).detail||T(`api.urlInvalid`)||`验证失败`);return e.json()});if(r.ok){let t=String(r.protocol||``).toLowerCase();t&&t!==String(u?.value||``).toLowerCase()&&Kn(t),r.image_request_mode&&Gn(r.image_request_mode),Yn=r.all||[],Xn={image:new Set(r.image_models||[]),chat:new Set(r.chat_models||[]),video:new Set(r.video_models||[])};let n=document.getElementById(`openPickerBtn`);n&&(n.disabled=!1,n.style.opacity=`1`);let i=t===`volcengine`||vt(e)?`<div style="margin-top:6px;color:#92400e;font-size:11px;font-weight:700">${t===`volcengine`?`已自动识别为方舟/Ark 任务协议。`:``}火山协议提示：模型列表只代表可见模型，聊天模型建议填写你在方舟控制台创建的 <code>ep-...</code> 推理接入点。</div>`:``,a=` · 图片接口：${Wn(d?.value||e.image_request_mode)}`;G(`<span style="color:#15803d;font-size:11px;font-weight:800">✓ 地址验证通过 · 找到 ${r.model_count} 个模型${a}</span>${i}`)}else G(`
                <div style="font-size:11px;font-weight:800;color:#b45309">⚠ 地址验证未通过 (HTTP ${r.status})</div>
                <div style="font-size:11px;color:var(--muted);font-weight:600;margin-top:3px">${Q((r.message||``).slice(0,200))}</div>`)}catch(e){G(`<div style="font-size:11px;font-weight:800;color:#b45309">⚠ ${Q(e.message||String(e))}</div>`)}finally{t&&(t.disabled=!1,t.querySelector(`span`).textContent=T(`api.testUrl`)||`验证地址`)}}let Yn=[],Xn=null;async function Zn(){let e=O();if(!e)return;F();let t=document.getElementById(`fetchModelsBtn`),n=c.value.trim(),r=Un(e);if(!n){alert(`请先填写请求地址`);return}t&&(t.disabled=!0,t.querySelector(`span`).textContent=T(`api.fetchingModels`)||`拉取中...`),E(T(`api.fetchingModels`)||`正在从上游拉取模型列表...`);try{let t=await fetch(`/api/providers/fetch-models`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({base_url:n,api_key:r,provider_id:e.id,protocol:u?.value||`openai`,proxy_url:J(e)&&(l?.value.trim()||e.proxy_url)||``,image_request_mode:d?.value||e.image_request_mode||`openai`})}).then(async e=>{if(!e.ok)throw Error((await e.json()).detail||T(`api.urlInvalid`)||`拉取失败`);return e.json()});Yn=t.all||[],Xn={image:new Set(t.image_models||[]),chat:new Set(t.chat_models||[]),video:new Set(t.video_models||[])};let i=String(t.protocol||``).toLowerCase();i&&i!==String(u?.value||``).toLowerCase()&&Kn(i),t.image_request_mode&&Gn(t.image_request_mode);let a=document.getElementById(`openPickerBtn`);a&&(a.disabled=!1,a.style.opacity=`1`);let o=i===`volcengine`||vt(e)?` · 已识别方舟协议，火山聊天建议改填 ep-... 接入点`:``,s=K(d?.value||e.image_request_mode)===`openai-json`?` · 图片接口已设为 OpenAI JSON`:``;E(`已拉取 ${t.total} 个模型 · 点「选择模型」勾选要导入的${o}${s}`),$n()}catch(e){alert(`拉取失败：`+(e.message||e)),E(`拉取失败`)}finally{t&&(t.disabled=!1,t.querySelector(`span`).textContent=T(`api.fetchModels`)||`拉取模型`)}}let q={category:{},selected:{}},Qn=[];function $n(){let e=O();if(!e||!Yn.length){alert(`没有拉取到模型`);return}let t={image:new Set(e.image_models||[]),chat:new Set(e.chat_models||[]),video:new Set(e.video_models||[])},n=new Set([...Yn,...e.image_models||[],...e.chat_models||[],...e.video_models||[]]);q={category:{},selected:{}},n.forEach(e=>{let n;n=t.image.has(e)?`image`:t.video.has(e)?`video`:t.chat.has(e)?`chat`:Xn?.image?.has(e)?`image`:Xn?.video?.has(e)?`video`:`chat`,q.category[e]=n,q.selected[e]=t.image.has(e)||t.chat.has(e)||t.video.has(e)}),document.querySelectorAll(`.picker-cat-tab`).forEach(e=>e.classList.toggle(`active`,e.dataset.cat===`all`)),document.getElementById(`modelPickerOverlay`).style.display=`flex`,tr()}function er(){document.getElementById(`modelPickerOverlay`).style.display=`none`}function tr(){let e=(document.getElementById(`pickerFilter`)?.value||``).toLowerCase(),t=document.querySelector(`.picker-cat-tab.active`)?.dataset.cat||`all`,n=Object.keys(q.category).sort(),r={all:n.length,image:0,chat:0,video:0},i={all:0,image:0,chat:0,video:0};n.forEach(e=>{let t=q.category[e];r[t]++,q.selected[e]&&(i[t]++,i.all++)});let a=n.filter(n=>e&&!n.toLowerCase().includes(e)?!1:t===`all`||q.category[n]===t);Qn=a,document.getElementById(`pickerCount`).textContent=`共 ${r.all} 个模型 · 当前显示 ${a.length} 个`,document.querySelectorAll(`.picker-cat-tab`).forEach(e=>{let t=e.dataset.cat;e.querySelector(`.cat-count`).textContent=`${i[t]}/${r[t]}`});let o=a.map((e,t)=>{let n=q.selected[e];return`
            <div class="picker-row ${n?`has-sel`:``}" onclick="togglePickerRowByIndex(${t})">
                <div class="picker-checkbox ${n?`checked`:``}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="picker-model-name" title="${$(e)}">${Q(e)}</div>
            </div>
        `}).join(``);document.getElementById(`pickerList`).innerHTML=o||`<div style="padding:32px;text-align:center;color:var(--faint);font-size:12px">无匹配</div>`;let s=document.getElementById(`sumImage`),c=document.getElementById(`sumChat`),l=document.getElementById(`sumVideo`),u=document.getElementById(`sumUnsel`);s&&(s.textContent=`生图 ${i.image}`,s.classList.toggle(`picker-sum-chip-empty`,i.image===0)),c&&(c.textContent=`LLM ${i.chat}`,c.classList.toggle(`picker-sum-chip-empty`,i.chat===0)),l&&(l.textContent=`视频 ${i.video}`,l.classList.toggle(`picker-sum-chip-empty`,i.video===0)),u&&(u.textContent=`未选 ${r.all-i.all}`)}function nr(e){q.selected[e]=!q.selected[e],tr()}function rr(e){let t=Qn[e];typeof t==`string`&&nr(t)}function ir(e){document.querySelectorAll(`.picker-cat-tab`).forEach(t=>t.classList.toggle(`active`,t.dataset.cat===e)),tr()}function ar(){let e=O();if(!e)return;let t=[],n=[],r=[];Object.entries(q.selected).forEach(([e,i])=>{if(!i)return;let a=q.category[e];a===`image`?t.push(e):a===`video`?r.push(e):n.push(e)}),e.image_models=t,e.chat_models=n,e.video_models=r,Y(`image`),Y(`chat`),Y(`video`),X(),E(`已应用 · 生图 ${t.length} / LLM ${n.length} / 视频 ${r.length}，点保存生效`),er()}async function or(){let e=O();if(!e)return;let t=f.value.trim();if(!t){alert(T(`api.enterKeyAlert`)||`请输入 Key`);return}e.api_key=t,await Z()&&(f.value=``)}async function sr(){let e=O();e&&(!e.has_key&&!f.value||confirm(T(`api.confirmClearKey`)||`确认清除当前 Key？`)&&(e._clearKey=!0,await Z()&&(f.value=``)))}let cr=new Set([`modelscope`,`volcengine`,`runninghub`]),lr=new Set([`modelscope`,`volcengine`,`runninghub`]);function J(e){let t=String(e?.protocol||``).toLowerCase();return!!e&&!lr.has(e.id)&&!lr.has(t)}function ur(e){return!!e&&!cr.has(e.id)}function dr(e,t,n,r){if(e===`video`||!ur(r))return``;let i=r.model_protocols&&typeof r.model_protocols==`object`?r.model_protocols:{},a=String(i[String(n||``).trim()]||``).toLowerCase(),o=(e,t)=>`<option value="${e}" ${a===e?`selected`:``}>${t}</option>`;return`<select class="model-protocol-select" title="该模型使用的协议，默认跟随平台全局协议" onchange="updateModelProtocol('${e}', ${t}, this.value)">
        <option value="" ${a===``?`selected`:``}>默认</option>
        ${o(`openai`,`OpenAI`)}
        ${o(`gemini`,`Gemini`)}
    </select>`}function fr(e,t,n){return(e?.model_prices||[]).find(e=>e.kind===t&&e.model===String(n||``).trim()&&!Number(e.effective_to||0))}function pr(e,t,n,r){if(e===`chat`)return``;let i=fr(r,e,n)||{},a=i.billing_type||(e===`video`?`per_second`:`per_image`),o=e===`video`?`<select class="model-price-type" title="计费方式" onchange="updateModelPrice('${e}', ${t}, null, this.value)">
        <option value="per_second" ${a===`per_second`?`selected`:``}>每秒</option>
        <option value="per_call" ${a===`per_call`?`selected`:``}>每次</option>
    </select>`:``,s=e===`image`?`张`:a===`per_call`?`次`:`秒`;return`${o}<input class="model-price-input" type="number" min="0" step="0.000001" value="${$(i.unit_price||``)}" placeholder="¥/${s}" title="人民币单价；留空表示待定价" onchange="updateModelPrice('${e}', ${t}, this.value)">`}function Y(e){let t=O(),n=e===`image`?`image_models`:e===`video`?`video_models`:`chat_models`,r=e===`image`?we:e===`video`?Ee:Te,i=t?.[n]||[];if(!i.length){r.innerHTML=`<div class="empty">${T(`api.noModels`)}</div>`;return}let a=e!==`video`&&ur(t),o=e!==`chat`;r.innerHTML=i.map((n,r)=>`
        <div class="model-row${a?` has-protocol`:``}${o?` has-price`:``}">
            <input value="${$(n)}" oninput="updateModel('${e}', ${r}, this.value)">
            ${dr(e,r,n,t)}
            ${pr(e,r,n,t)}
            <button class="icon-btn" type="button" onclick="removeModel('${e}', ${r})" title="删除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    `).join(``),w()}function mr(e){let t=O();return A([e,...Pe,...t?.image_models||[]]).filter(Boolean).map(t=>`<option value="${$(t)}" ${t===e?`selected`:``}>${Q(t)}</option>`).join(``)}function hr(e){let t=Number(e);return Number.isFinite(t)?Math.max(0,Math.min(2,t)):.8}function X(){let e=O();if(!(!Oe||!e||e.id!==`modelscope`)){if(e.ms_loras=Array.isArray(e.ms_loras)?e.ms_loras:[],!e.ms_loras.length){Oe.innerHTML=`<div class="lora-empty">${T(`api.loraEmpty`)}</div>`;return}Oe.innerHTML=e.ms_loras.map((e,t)=>{let n=e.target_model||e.model||Pe[0],r=hr(e.strength??e.default_strength??.8);return`
            <div class="lora-row">
                <label class="lora-field">
                    <span>${T(`api.loraId`)}</span>
                    <input value="${$(e.id||``)}" placeholder="${$(T(`api.loraIdPlaceholder`))}" oninput="updateMsLora(${t}, 'id', this.value)">
                </label>
                <label class="lora-field">
                    <span>${T(`api.loraTargetModel`)}</span>
                    <select onchange="updateMsLora(${t}, 'target_model', this.value)">${mr(n)}</select>
                </label>
                <label class="lora-field">
                    <span>${T(`api.loraDefaultStrength`)}</span>
                    <input type="number" min="0" max="2" step="0.05" value="${r}" oninput="updateMsLora(${t}, 'strength', this.value)">
                </label>
                <button class="icon-btn" type="button" onclick="removeMsLora(${t})" title="${$(T(`common.delete`))}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `}).join(``),w()}}function gr(){let e=O();!e||e.id!==`modelscope`||(e.ms_loras=Array.isArray(e.ms_loras)?e.ms_loras:[],e.ms_loras.push({id:``,name:``,target_model:(e.image_models||[])[0]||Pe[0],strength:.8,enabled:!0,note:``}),X())}function _r(e,t,n){let r=O();if(!r||r.id!==`modelscope`)return;r.ms_loras=Array.isArray(r.ms_loras)?r.ms_loras:[];let i=r.ms_loras[e];i&&(t===`strength`?i.strength=hr(n):i[t]=n)}function vr(e){let t=O();!t||t.id!==`modelscope`||(t.ms_loras=Array.isArray(t.ms_loras)?t.ms_loras:[],t.ms_loras.splice(e,1),X())}function yr(n){Ye(e.find(e=>e.id===n))||(C=!1,H(),U(),F(),t=n,W())}function br(){C=!1,H(),U(),F();let n=`custom-api`,r=2;for(;e.some(e=>e.id===n);)n=`custom-api-${r++}`;e.push({id:n,name:`API`,base_url:``,protocol:`openai`,image_request_mode:`openai`,image_generation_endpoint:``,image_edit_endpoint:``,proxy_url:``,enabled:!0,primary:!1,image_models:[],chat_models:[],video_models:[],has_key:!1,key_preview:``}),t=n,W()}function xr(){let n=O();if(n){if(k(n)){alert(T(`api.defaultNoDelete`)||`默认平台不能删除`);return}if(e.length<=1){alert(T(`api.keepOne`));return}e=e.filter(e=>e.id!==n.id),t=e[0]?.id||``,W(),Z()}}async function Sr(e){let t=O();if(!t||t.id!==`runninghub`)return;let n=e===`wallet`?m:p;if(!n?.value.trim()){alert(`请输入 Key`);return}F(),await Z()&&n&&(n.value=``)}async function Cr(e){let t=O();!t||t.id!==`runninghub`||confirm(T(`api.confirmClearKey`)||`确认清除当前 Key？`)&&(e===`wallet`?t._clearWalletKey=!0:t._clearKey=!0,await Z()&&(e===`wallet`&&m&&(m.value=``),e!==`wallet`&&p&&(p.value=``)))}async function wr(){let e=O();if(!e||e.id!==`volcengine`)return;let t=h?.value.trim()||``,n=g?.value.trim()||``;if(!t&&!n){alert(`请输入火山素材库 AK 或 SK`);return}F(),await Z()&&(h&&(h.value=``),g&&(g.value=``))}async function Tr(){let e=O();!e||e.id!==`volcengine`||confirm(`确认清除火山素材库 AK/SK？`)&&(e._clearVolcengineAccessKey=!0,e._clearVolcengineSecretKey=!0,await Z()&&(h&&(h.value=``),g&&(g.value=``)))}function Er(e){let t=O(),n=e===`image`?`image_models`:e===`video`?`video_models`:`chat_models`;t[n]=[...t[n]||[],``],Y(e),e===`image`&&X()}function Dr(e,t){return!e||!t?!1:[`image_models`,`chat_models`,`video_models`].some(n=>Array.isArray(e[n])&&e[n].includes(t))}function Or(e,t,n){let r=O(),i=e===`image`?`image_models`:e===`video`?`video_models`:`chat_models`,a=String(r[i][t]||``).trim(),o=String(n||``).trim();if(r[i][t]=n,(r.model_prices||[]).forEach(t=>{!Number(t.effective_to||0)&&t.kind===e&&t.model===a&&(t.model=o)}),r.model_protocols&&typeof r.model_protocols==`object`&&a&&a!==o&&Object.prototype.hasOwnProperty.call(r.model_protocols,a)){let e=r.model_protocols[a];[`image_models`,`chat_models`,`video_models`].some(e=>Array.isArray(r[e])&&r[e].some((n,r)=>(e!==i||r!==t)&&String(n||``).trim()===a))||delete r.model_protocols[a],o&&(r.model_protocols[o]=e)}e===`image`&&X()}function kr(e,t,n,r){let i=O(),a=String(i?.[e===`image`?`image_models`:`video_models`]?.[t]||``).trim();if(!a)return;i.model_prices=Array.isArray(i.model_prices)?i.model_prices:[];let o=fr(i,e,a),s=n===null?String(o?.unit_price||``):String(n||``).trim();if(!Number(s)){i.model_prices=i.model_prices.filter(e=>e!==o),Y(e);return}o||(o={kind:e,model:a,currency:`CNY`,effective_from:0,effective_to:0},i.model_prices.push(o)),o.unit_price=s,o.billing_type=r||o.billing_type||(e===`video`?`per_second`:`per_image`),Y(e)}function Ar(e,t,n){let r=O(),i=String(r[e===`image`?`image_models`:e===`video`?`video_models`:`chat_models`]?.[t]||``).trim();if(!i)return;(!r.model_protocols||typeof r.model_protocols!=`object`)&&(r.model_protocols={});let a=String(n||``).trim().toLowerCase();a===`openai`||a===`gemini`?r.model_protocols[i]=a:delete r.model_protocols[i]}function jr(e,t){let n=O(),r=e===`image`?`image_models`:e===`video`?`video_models`:`chat_models`,i=String(n[r][t]||``).trim();n[r].splice(t,1),n.model_prices=(n.model_prices||[]).filter(t=>Number(t.effective_to||0)||t.kind!==e||t.model!==i),i&&n.model_protocols&&typeof n.model_protocols==`object`&&!Dr(n,i)&&delete n.model_protocols[i],Y(e),e===`image`&&X()}async function Mr(){E(T(`api.loading`));try{e=(await fetch(`/api/providers`).then(e=>e.json())).providers||[],t=Pn()[0]?.id||``,W(),E(``)}catch{E(T(`api.loadFailed`))}}async function Z(){if(F(),e.forEach(e=>{e.id=Ke(e.id),e.protocol=e.id===`runninghub`?`runninghub`:e.id===`volcengine`?`volcengine`:[`openai`,`apimart`,`gemini`,`volcengine`].includes(String(e.protocol||``).toLowerCase())?String(e.protocol).toLowerCase():`openai`,e.image_request_mode=K(e.id===`modelscope`||e.id===`runninghub`||e.id===`volcengine`?`openai`:e.image_request_mode),e.proxy_url=J(e)?String(e.proxy_url||``).trim():``,e.image_generation_endpoint=``,e.image_edit_endpoint=``,e.image_models=A(e.image_models||[]),e.chat_models=A(e.chat_models||[]),e.video_models=A(e.video_models||[]),e.rh_apps=j(e.rh_apps||[],`app`),e.rh_workflows=j(e.rh_workflows||[],`workflow`),e.ms_loras=(Array.isArray(e.ms_loras)?e.ms_loras:[]).map(e=>({id:String(e.id||``).trim(),name:String(e.name||e.id||``).trim(),target_model:String(e.target_model||``).trim(),strength:hr(e.strength??.8),enabled:e.enabled!==!1,note:String(e.note||``).trim()})).filter(e=>e.id&&e.target_model)}),new Set(e.map(e=>e.id)).size!==e.length)return alert(T(`api.duplicateId`)),!1;E(T(`api.saving`));try{let n=await fetch(`/api/providers`,{method:`PUT`,headers:{"Content-Type":`application/json`},body:JSON.stringify(e.map(e=>({id:e.id,name:e.name,base_url:e.base_url,protocol:e.id===`modelscope`?`openai`:e.id===`runninghub`?`runninghub`:e.id===`volcengine`?`volcengine`:e.protocol||`openai`,image_request_mode:e.image_request_mode||`openai`,image_generation_endpoint:e.image_generation_endpoint||``,image_edit_endpoint:e.image_edit_endpoint||``,proxy_url:J(e)&&e.proxy_url||``,enabled:e.enabled!==!1,primary:!1,image_models:e.image_models||[],chat_models:e.chat_models||[],video_models:e.video_models||[],model_prices:(e.model_prices||[]).filter(e=>!Number(e.effective_to||0)),model_protocols:e.model_protocols&&typeof e.model_protocols==`object`?e.model_protocols:{},ms_loras:e.id===`modelscope`&&e.ms_loras||[],ms_defaults_version:e.id===`modelscope`?e.ms_defaults_version||1:0,rh_apps:e.id===`runninghub`&&e.rh_apps||[],rh_workflows:e.id===`runninghub`&&e.rh_workflows||[],volcengine_project_name:e.id===`volcengine`?e.volcengine_project_name||je:``,volcengine_region:e.id===`volcengine`?e.volcengine_region||Me:``,volcengine_access_key_id:e.volcengine_access_key_id||void 0,volcengine_secret_access_key:e.volcengine_secret_access_key||void 0,api_key:e.api_key||void 0,wallet_api_key:e.wallet_api_key||void 0,clear_key:e._clearKey===!0,clear_wallet_key:e._clearWalletKey===!0,clear_volcengine_access_key_id:e._clearVolcengineAccessKey===!0,clear_volcengine_secret_access_key:e._clearVolcengineSecretKey===!0})))});if(!n.ok)throw Error((await n.json()).detail||T(`api.saveFailed`));return e=(await n.json()).providers||e,e.forEach(e=>{delete e.api_key,delete e.wallet_api_key,delete e.volcengine_access_key_id,delete e.volcengine_secret_access_key,delete e._clearKey,delete e._clearWalletKey,delete e._clearVolcengineAccessKey,delete e._clearVolcengineSecretKey}),t=O()?.id||e[0]?.id||``,W(),E(T(`api.saved`)),Ve(`providers-changed`),!0}catch(e){return E(e.message||T(`api.saveFailed`)),!1}}function Q(e){return String(e||``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function $(e){return Q(e).replace(/`/g,`&#96;`)}window.addEventListener(`message`,e=>{e.data?.type===`studio-theme`&&window.StudioTheme&&window.StudioTheme.set(e.data.theme),e.data?.type===`studio-lang`&&(C?U():W())}),_?.addEventListener(`mousedown`,e=>{e.target===_&&At()}),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&x.open&&At()}),document.addEventListener(`mousedown`,e=>{if(!x.open)return;let t=document.getElementById(`rhNodePopover`);t&&(t.contains(e.target)||e.target.closest(`.rh-editor-gnode,.rh-app-field-card`)||Kt())}),ke?.addEventListener(`mousedown`,e=>{e.target===ke&&jn()});let Nr=()=>{window.StudioTheme&&window.StudioTheme.apply(),H(),Mr(),a&&a.addEventListener(`input`,Je),u&&u.addEventListener(`change`,_t),d&&d.addEventListener(`change`,()=>{let e=O();e&&(e.image_request_mode=K(d.value))}),[f,p,m].forEach(e=>{e&&e.addEventListener(`input`,gt)})};Object.assign(window,{refreshIcons:w,tr:T,trf:Be,setStatus:E,broadcastStudioApiChange:Ve,rhEditorSideScrollEl:He,captureRhEditorScrollState:Ue,restoreRhEditorScrollState:We,withRhEditorScrollPreserved:D,findRhAppFieldCard:Ge,normalizeId:Ke,deriveIdFromName:qe,updateIdPreview:Je,provider:O,isProviderTemporarilyHidden:Ye,visibleProviders:Xe,isFixedProvider:k,unique:A,normalizeRhEntries:j,parseRunningHubRunRef:Ze,workflowNodeTitle:Qe,workflowNodeClass:$e,workflowNodeCategory:et,rhWorkflowFieldKey:M,rhWorkflowFieldKind:N,rhWorkflowFieldTypeLabel:tt,rhKnownOptionsForField:rt,normalizeRhWorkflowField:P,normalizeFetchedRhWorkflowField:it,rhWorkflowGroupKey:at,rhEditorSortedFields:ot,rhFreeKeyHintText:st,rhWalletKeyHintText:ct,volcengineArkKeyHintText:lt,volcengineAssetKeyHintText:ut,isNewUserProvider:dt,renderProviderOnboarding:ft,syncOnboardingKeyInput:pt,saveOnboardingRunningHubKey:mt,applyProviderOnboardingDefaults:ht,refreshProviderOnboarding:gt,syncEditor:F,ensureRunningHubLists:I,updateProtocolFromInput:_t,isVolcengineProvider:vt,handleRhPasteInput:yt,createRhEntryFromPaste:bt,updateRhEntry:xt,isStaticRunningHubEntry:St,removeRhEntry:Ct,readFileAsDataUrl:wt,loadImageForThumbnail:Tt,createRhThumbnailDataUrl:Et,pickRhThumbnail:Dt,openRhWorkflowEditor:Ot,openRhAppEditor:kt,closeRhWorkflowEditor:At,renderRhWorkflowEditorLoading:L,loadRhWorkflowEditorConfig:jt,normalizeRhWorkflowConfig:Mt,normalizeRhAppConfig:Nt,applyRhImageSlotDefaults:Pt,setRhWorkflowOptionalImageMode:Ft,rhAppFieldSourceList:It,normalizeFetchedRhAppField:Lt,extractRhEditorFieldOptions:Rt,loadRhAppEditorConfig:zt,fetchRhAppEditor:Bt,fetchRhWorkflowEditor:Vt,updateRhWorkflowEditorMeta:Ht,toggleRhWorkflowEditorGroup:Ut,focusRhWorkflowEditorNode:Wt,openRhWorkflowNodePopover:Gt,closeRhNodePopover:Kt,renderRhNodePopover:qt,toggleRhWorkflowEditorField:Jt,updateRhWorkflowEditorField:Yt,setRhWorkflowSaveButtonState:R,saveRhWorkflowEditor:Xt,renderRhWorkflowEditor:z,renderRhMappedPreview:B,renderRhMappedPreviewHtml:Zt,renderRhPreviewOutput:Qt,renderRhPreviewControl:$t,renderRhPreviewMedia:en,mediaAcceptForRhKind:tn,pickRhPreviewMedia:nn,toggleRhPreviewRandom:rn,updateRhPreviewValue:an,rhPreviewRandomValue:on,rhPreviewUploadValueIfNeeded:sn,buildRhPreviewNodeInfoList:cn,rhPreviewPruneWorkflow:ln,testRhMappedPreview:un,renderRhEditorSourcePane:dn,renderRhWorkflowEditorSummary:fn,renderRhWorkflowEditorNodeList:pn,renderRhWorkflowEditorField:mn,renderRhAppFieldCards:hn,restoreRhGraphWrap:gn,renderRhAppFieldCard:_n,openRhAppFieldPopover:vn,computeRhWorkflowEditorLayers:yn,renderRhWorkflowEditorGraph:bn,updateRhEditorZoom:xn,applyRhEditorGraphTransform:Sn,rhEditorGraphZoom:Cn,rhEditorGraphFit:wn,bindRhWorkflowEditorPanZoom:Tn,renderRunningHubCards:V,rhEntryThumbnailCandidates:En,renderRhEntryThumbnail:Dn,fallbackRhEntryThumbnail:On,renderRhEntryList:kn,openRecommendApi:An,closeRecommendApi:jn,syncRecommendView:H,renderRecommendApi:U,recommendedProviderForApi:Mn,saveRecommendedApi:Nn,sortedProviders:Pn,providerDragAttrs:Fn,renderProviderList:In,handleProviderDragStart:Ln,handleProviderDragOver:Rn,handleProviderDrop:zn,handleProviderDragEnd:Bn,renderEditor:W,showVerifyResult:G,clearVerifyResult:Vn,prettyJson:Hn,currentProviderApiKey:Un,normalizeImageRequestMode:K,imageRequestModeLabel:Wn,applyDetectedImageRequestMode:Gn,applyDetectedProtocol:Kn,probeAsync:qn,testConnection:Jn,fetchModels:Zn,openModelPicker:$n,closeModelPicker:er,renderModelPicker:tr,togglePickerRow:nr,togglePickerRowByIndex:rr,selectPickerCat:ir,applyModelPicker:ar,saveKeyOnly:or,clearKeyOnly:sr,providerSupportsProxy:J,providerSupportsModelProtocol:ur,modelProtocolSelectHtml:dr,currentModelPrice:fr,modelPriceHtml:pr,renderModels:Y,msLoraTargetOptions:mr,normalizeLoraStrength:hr,renderMsLoras:X,addMsLora:gr,updateMsLora:_r,removeMsLora:vr,selectProvider:yr,addProvider:br,deleteProvider:xr,saveRhKeyOnly:Sr,clearRhKeyOnly:Cr,saveVolcengineAssetKeys:wr,clearVolcengineAssetKeys:Tr,addModel:Er,modelProtocolStillUsed:Dr,updateModel:Or,updateModelPrice:kr,updateModelProtocol:Ar,removeModel:jr,loadProviders:Mr,saveProviders:Z,escapeHtml:Q,escapeAttr:$}),document.readyState===`complete`?Nr():window.addEventListener(`load`,Nr,{once:!0})}var l=r();function u(){return(0,i.useEffect)(()=>{c()},[]),(0,l.jsx)(`div`,{className:`api-settings-react-root`,dangerouslySetInnerHTML:{__html:o}})}t();var d=document.getElementById(`apiSettingsApp`);if(!d)throw Error(`Missing #apiSettingsApp`);(0,a.createRoot)(d).render((0,l.jsx)(i.StrictMode,{children:(0,l.jsx)(u,{})}));