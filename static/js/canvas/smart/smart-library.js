/* Smart canvas: Asset libraries, prompt templates and their permission-aware actions.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function loadPromptPresets(){
    try {
        const list = JSON.parse(localStorage.getItem(PROMPT_PRESETS_KEY) || '[]');
        promptPresets = Array.isArray(list) ? list.filter(p => p?.id && typeof p.text === 'string') : [];
    } catch(e) {
        promptPresets = [];
    }
}

function savePromptPresets(){
    localStorage.setItem(PROMPT_PRESETS_KEY, JSON.stringify(promptPresets));
}

function defaultPromptTemplateGroups(){
    return [
        {id:'view', name:'视角'},
        {id:'storyboard', name:'分镜'},
        {id:'character', name:'角色'},
        {id:'product', name:'产品'},
        {id:'lighting', name:'光影'},
        {id:'mine', name:'我的'}
    ];
}

function loadPromptTemplateGroups(){
    try {
        const list = JSON.parse(localStorage.getItem(PROMPT_TEMPLATE_GROUPS_KEY) || '[]');
        const valid = Array.isArray(list) ? list.filter(g => g?.id && g?.name) : [];
        const defaults = defaultPromptTemplateGroups();
        promptTemplateGroups = defaults.map(group => valid.find(g => g.id === group.id) || group);
        valid.filter(g => !promptTemplateGroups.some(x => x.id === g.id)).forEach(g => promptTemplateGroups.push(g));
    } catch(e) {
        promptTemplateGroups = defaultPromptTemplateGroups();
    }
}

function savePromptTemplateGroups(){
    localStorage.setItem(PROMPT_TEMPLATE_GROUPS_KEY, JSON.stringify(promptTemplateGroups));
}

function loadPromptTemplateOverrides(){
    try {
        const data = JSON.parse(localStorage.getItem(PROMPT_TEMPLATE_OVERRIDES_KEY) || '{}');
        promptTemplateOverrides = {
            hiddenBuiltinIds:Array.isArray(data.hiddenBuiltinIds) ? data.hiddenBuiltinIds : [],
            editedBuiltins:data.editedBuiltins && typeof data.editedBuiltins === 'object' ? data.editedBuiltins : {}
        };
    } catch(e) {
        promptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
    }
}

function savePromptTemplateOverrides(){
    localStorage.setItem(PROMPT_TEMPLATE_OVERRIDES_KEY, JSON.stringify(promptTemplateOverrides));
}

async function loadPromptTemplates(){
    try {
        const data = await window.CanvasApi.getPromptLibraries();
        promptLibraries = Array.isArray(data.library?.libraries) ? data.library.libraries : [];
        if(!promptLibraries.length) {
            const fallback = await fetch('/api/smart-canvas/prompt-templates').then(r => r.ok ? r.json() : {templates:[]});
            builtinPromptTemplates = Array.isArray(fallback.templates) ? fallback.templates.filter(t => t?.id && t?.positive) : [];
            promptLibraries = [{id:'system', name:'系统提示词库', readonly:true, items:builtinPromptTemplates}];
        } else {
            const system = promptLibraries.find(lib => lib.id === 'system') || promptLibraries[0];
            builtinPromptTemplates = Array.isArray(system?.items) ? system.items.filter(t => t?.id && t?.positive) : [];
        }
        if(!promptLibraries.some(lib => lib.id === activePromptLibraryId)) activePromptLibraryId = promptLibraries[0]?.id || 'system';
        renderPromptLibrarySelect();
    } catch(e) {
        builtinPromptTemplates = [];
        promptLibraries = [];
    }
}

function activePromptLibrary(){
    return promptLibraries.find(lib => lib.id === activePromptLibraryId) || promptLibraries[0] || {id:'system', name:'系统提示词库', readonly:true, items:builtinPromptTemplates};
}

function renderPromptLibrarySelect(){
    if(!promptTemplateLibrarySelect) return;
    promptTemplateLibrarySelect.innerHTML = promptLibraries.map(lib => `<option value="${escapeAttr(lib.id)}" ${lib.id === activePromptLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '提示词库')}</option>`).join('');
}

function promptTemplateItems(){
    const activeLibrary = activePromptLibrary();
    if(activeLibrary.id !== 'system'){
        return (activeLibrary.items || []).filter(t => t?.id && t?.positive).map(t => ({
            ...t,
            sourceId:t.id,
            builtin:false,
            remote:true,
            libraryId:activeLibrary.id
        }));
    }
    // 系统库的条目同样走后端（/api/prompt-libraries），与素材库管理共用一套数据。
    // 这样画布里修改/删除系统提示词会实时同步，不再依赖各端不互通的 localStorage 覆盖。
    // 仍保留 builtin:true 用于“内置”标签与完整提示词（含负向/参数）的展示。
    const source = Array.isArray(activeLibrary.items) && activeLibrary.items.length ? activeLibrary.items : builtinPromptTemplates;
    const builtins = source
        .filter(t => t?.id && t?.positive)
        .map(t => ({...t, sourceId:t.id, builtin:true, remote:true, libraryId:'system'}));
    const mine = promptPresets.map(p => ({
        id:`mine:${p.id}`,
        sourceId:p.id,
        name:p.name || '未命名预设',
        // 系统库分组以后端为准（custom=“我的”），本地旧预设归到 custom 分组下展示，避免无对应标签。
        category:(p.category && p.category !== 'mine') ? p.category : 'custom',
        scene:'我的提示词预设',
        positive:p.text || '',
        negative:'',
        params:{},
        builtin:false
    }));
    return [...builtins, ...mine];
}

function promptTemplateText(template, mode='positive'){
    const positive = String(template?.positive || '').trim();
    if(mode === 'positive' || !template?.builtin) return positive;
    const negative = String(template?.negative || '').trim();
    const params = Object.entries(template?.params || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    return [positive, negative ? `Negative prompt:\n${negative}` : '', params ? `Params:\n${params}` : ''].filter(Boolean).join('\n\n');
}

function promptTemplateName(template){

    return template?.name || '';
}

function promptTemplateScene(template){

    return template?.scene || '';
}

function promptTemplateSearchText(template){
    return [
        template?.name,
        template?.name_en,
        template?.scene,
        template?.scene_en,
        template?.positive,
        template?.negative
    ].join(' ').toLowerCase();
}

function activePromptTemplateGroups(){
    const lib = activePromptLibrary();
    // 系统库的分组也以后端 categories 为准，与素材库管理共用同一份分组数据（可重命名/删除并同步）。
    const fromLib = Array.isArray(lib?.categories) ? lib.categories.filter(c => c?.id && c?.name) : [];
    if(fromLib.length) return fromLib;
    if(!lib || lib.id === 'system') return promptTemplateGroups;
    return [];
}

function promptTemplateCategoryLabel(category){
    if(category === 'all') return '全部';
    // 分组名优先以后端 categories 为准（含内置分组重命名），保证两端显示一致。
    const fromGroups = activePromptTemplateGroups().find(g => g.id === category)?.name;
    if(fromGroups) return fromGroups;
    const builtin = {
        view:'视角',
        storyboard:'分镜',
        character:'角色',
        product:'产品',
        lighting:'光影',
        custom:'我的',
        mine:'我的'
    };
    return builtin[category] || promptTemplateGroups.find(g => g.id === category)?.name || category;
}

function promptTemplateSelectedItem(){
    return promptTemplateItems().find(item => item.id === promptTemplateSelectedId) || promptTemplateItems()[0] || null;
}

function currentPromptPreset(id){
    return promptPresets.find(p => p.id === id) || null;
}

function defaultPromptPresetName(text){
    return (String(text || '').trim().split(/\r?\n/)[0] || '提示词预设').slice(0, 28);
}

function promptPresetPanelNode(){
    return nodes.find(n => n.id === promptPresetPanel?.dataset.nodeId) || null;
}

function setPromptPresetStatus(text='', tone=''){
    if(!promptPresetStatus) return;
    promptPresetStatus.textContent = text;
    promptPresetStatus.classList.toggle('warn', tone === 'warn');
    promptPresetStatus.classList.toggle('ok', tone === 'ok');
}

function resetPromptPresetDeleteState(){
    promptPresetDeleteArmed = false;
    if(promptPresetDelete){
        promptPresetDelete.textContent = '删除';
        promptPresetDelete.classList.remove('confirm-danger');
    }
}

function createPromptPresetFromNode(node, {openPanel=true, openTemplatePanel=false}={}){
    const text = String(node?.text || '').trim();
    if(!text){ toast('提示词为空'); return null; }
    const preset = {id:uid('preset'), name:defaultPromptPresetName(text), text, createdAt:Date.now(), updatedAt:Date.now()};
    promptPresets.unshift(preset);
    savePromptPresets();
    if(node) node.promptPresetId = preset.id;
    render();
    scheduleSave();
    if(openPanel) openPromptPresetPanel(node?.id || '', preset.id, {status:'已存为新预设', tone:'ok'});
    if(openTemplatePanel) {
        promptTemplateCategory = 'mine';
        promptTemplateSelectedId = `mine:${preset.id}`;
        promptTemplateEditing = true;
        openPromptTemplatePanel(node?.id || '', promptTemplateSelectedId);
    }
    return preset;
}

function createPromptPresetFromComposer(){
    const text = promptPlainText();
    if(!text){ toast('提示词为空'); return null; }
    const preset = {id:uid('preset'), name:defaultPromptPresetName(text), text, category:'mine', createdAt:Date.now(), updatedAt:Date.now()};
    promptPresets.unshift(preset);
    savePromptPresets();
    savePromptDraftForCurrent();
    scheduleSave();
    return preset;
}

function savePromptNodeAsPreset(node){
    createPromptPresetFromNode(node);
}

function renderPromptPresetPanel(selectedId='', message=''){
    if(!promptPresetSelect) return;
    resetPromptPresetDeleteState();
    promptPresetSelect.innerHTML = promptPresets.length
        ? promptPresets.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name || '未命名预设')}</option>`).join('')
        : `<option value="">${escapeHtml('暂无预设')}</option>`;
    const preset = currentPromptPreset(selectedId) || promptPresets[0] || null;
    if(preset && promptPresetSelect.value !== preset.id) promptPresetSelect.value = preset.id;
    promptPresetName.value = preset?.name || '';
    promptPresetText.value = preset?.text || '';
    const hasPreset = Boolean(preset);
    const nodeHasText = Boolean(String(promptPresetPanelNode()?.text || '').trim());
    promptPresetApply.disabled = !hasPreset;
    promptPresetDelete.disabled = !hasPreset;
    promptPresetSave.disabled = !hasPreset;
    if(promptPresetNew) promptPresetNew.disabled = !nodeHasText;
    setPromptPresetStatus(message || (hasPreset ? '选择预设后可直接修改名称和内容。' : '当前还没有预设，可以先把当前提示词存为新预设。'));
}

function openPromptPresetPanel(nodeId='', presetId='', options={}){
    if(!promptPresetPanel) return;
    promptPresetPanel.dataset.nodeId = nodeId || '';
    const node = nodes.find(n => n.id === nodeId);
    const preferred = presetId || node?.promptPresetId || promptPresets[0]?.id || '';
    renderPromptPresetPanel(preferred, options.status || '');
    if(options.tone) setPromptPresetStatus(options.status || '', options.tone);
    const nodeEl = nodeId ? world.querySelector(`.image-node[data-id="${CSS.escape(nodeId)}"]`) : null;
    const rect = nodeEl?.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const maxLeft = Math.max(18, shellRect.width - 410);
    const maxTop = Math.max(18, shellRect.height - 330);
    const left = rect ? Math.min(maxLeft, Math.max(18, rect.right - shellRect.left + 12)) : 80;
    const top = rect ? Math.min(maxTop, Math.max(18, rect.top - shellRect.top)) : 80;
    promptPresetPanel.style.left = `${left}px`;
    promptPresetPanel.style.top = `${top}px`;
    promptPresetPanel.classList.add('open');
    refreshIcons();
}

function closePromptPresetPanel(){
    promptPresetPanel?.classList.remove('open');
    resetPromptPresetDeleteState();
}

function promptTemplateScrollSnapshot(){
    if(!promptTemplatePanel) return null;
    return {
        panelTop:promptTemplatePanel.scrollTop || 0,
        tabLeft:promptTemplatePanel.querySelector('.prompt-template-tabs')?.scrollLeft || 0,
        listTop:promptTemplatePanel.querySelector('.prompt-template-list')?.scrollTop || 0,
        detailTop:promptTemplatePanel.querySelector('.prompt-template-preview-content')?.scrollTop || 0
    };
}

function restorePromptTemplateScroll(snapshot){
    if(!snapshot || !promptTemplatePanel) return;
    requestAnimationFrame(() => {
        promptTemplatePanel.scrollTop = snapshot.panelTop || 0;
        const tabs = promptTemplatePanel.querySelector('.prompt-template-tabs');
        const list = promptTemplatePanel.querySelector('.prompt-template-list');
        const detail = promptTemplatePanel.querySelector('.prompt-template-preview-content');
        if(tabs) tabs.scrollLeft = snapshot.tabLeft || 0;
        if(list) list.scrollTop = snapshot.listTop || 0;
        if(detail) detail.scrollTop = snapshot.detailTop || 0;
    });
}

function renderPromptTemplatePanel(options={}){
    if(!promptTemplatePanel || !promptTemplateBody || !promptTemplateCats) return;
    renderPromptLibrarySelect();
    const scrollSnapshot = options.preserveScroll === false ? null : promptTemplateScrollSnapshot();
    const query = String(promptTemplateSearch?.value || '').trim().toLowerCase();
    const allTemplates = promptTemplateItems();
    const activeGroups = activePromptTemplateGroups();
    // 防御：若当前分类筛选不属于当前词库（例如刚切换词库或分类已被删除），回到“全部”，避免列表被过滤为空。
    if(promptTemplateCategory !== 'all' && !activeGroups.some(g => g.id === promptTemplateCategory)) promptTemplateCategory = 'all';
    const categories = [{id:'all', name:'全部'}, ...activeGroups.map(group => ({...group, name:promptTemplateCategoryLabel(group.id)}))];
    const groupCounts = allTemplates.reduce((map, item) => {
        map[item.category || 'mine'] = (map[item.category || 'mine'] || 0) + 1;
        return map;
    }, {all:allTemplates.length});
    promptTemplateCats.innerHTML = promptTemplateGroupEditMode ? `
        <div class="prompt-template-group-panel">
            <div class="prompt-template-group-title">
                <div>
                    <strong>${escapeHtml('分组管理')}</strong>
                    <span>${escapeHtml('这里只调整上方分类，不影响模板内容')}</span>
                </div>
                <div class="prompt-template-group-tools">
                    <button type="button" data-template-cat-new><i data-lucide="plus"></i><span>${escapeHtml('新增')}</span></button>
                    <button type="button" class="primary" data-template-group-edit><i data-lucide="check"></i><span>${escapeHtml('完成')}</span></button>
                </div>
            </div>
            <div class="prompt-template-group-list">
                ${activeGroups.map(group => `
                    <div class="prompt-template-group-row has-delete">
                        <button type="button" class="group-name ${group.id === promptTemplateCategory ? 'active' : ''}" data-template-cat="${escapeHtml(group.id)}">
                            <span>${escapeHtml(promptTemplateCategoryLabel(group.id))}</span>
                            <small>${groupCounts[group.id] || 0}</small>
                        </button>
                        <button type="button" class="group-tool" data-template-cat-edit="${escapeHtml(group.id)}" title="${escapeAttr('重命名')}"><i data-lucide="pencil"></i></button>
                        <button type="button" class="group-tool danger" data-template-cat-delete="${escapeHtml(group.id)}" title="${escapeAttr('删除')}"><i data-lucide="trash-2"></i></button>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : `
        <div class="prompt-template-nav">
            <div class="prompt-template-tabs">
                ${categories.map(cat => `
                    <button type="button" class="${cat.id === promptTemplateCategory ? 'active' : ''}" data-template-cat="${escapeHtml(cat.id)}">
                        <span>${escapeHtml(cat.name)}</span>
                        <small>${groupCounts[cat.id] || 0}</small>
                    </button>
                `).join('')}
            </div>
            <button type="button" class="prompt-template-manage-groups" data-template-group-edit><i data-lucide="settings-2"></i><span>${escapeHtml('管理分组')}</span></button>
        </div>
    `;
    const items = allTemplates.filter(item => {
        if(promptTemplateCategory !== 'all' && item.category !== promptTemplateCategory) return false;
        if(!query) return true;
        return promptTemplateSearchText(item).includes(query);
    });
    if(items.length && !items.some(item => item.id === promptTemplateSelectedId)) promptTemplateSelectedId = items[0].id;
    const selected = items.find(item => item.id === promptTemplateSelectedId) || items[0] || null;
    const selectedPreset = selected?.builtin || selected?.remote
        ? {id:selected.id, name:selected.name || '', text:selected.positive || '', category:selected.category || 'storyboard', builtin:Boolean(selected.builtin)}
        : (selected ? currentPromptPreset(selected.sourceId) : null);
    const target = promptTemplatePanel.dataset.target || 'node';
    const node = nodes.find(n => n.id === promptTemplatePanel.dataset.nodeId);
    const activeLibrary = activePromptLibrary();
    // 系统库 readonly=false，其条目也可编辑/删除（经后端持久化），因此只看 readonly。
    const canEditCurrentLibrary = !activeLibrary.readonly;
    const editMode = Boolean(promptTemplateEditing && selectedPreset);
    promptTemplateBody.innerHTML = `
        <div class="prompt-template-list">
            <div class="prompt-template-list-tools">
                <button type="button" data-template-save-current><i data-lucide="bookmark-plus"></i><span>${escapeHtml('存当前')}</span></button>
                <button type="button" data-template-new><i data-lucide="file-plus-2"></i><span>${escapeHtml('新模板')}</span></button>
            </div>
            ${items.length ? items.map(item => `<button type="button" class="prompt-template-card ${item.id === selected?.id ? 'active' : ''}" data-template-id="${escapeHtml(item.id)}">
                <span class="prompt-template-card-top">
                    <span class="prompt-template-name">${escapeHtml(promptTemplateName(item))}</span>
                    <span class="prompt-template-source">${escapeHtml(item.builtin ? '内置' : '我的')}</span>
                </span>
                <span class="prompt-template-scene">${escapeHtml(promptTemplateScene(item) || item.positive || '')}</span>
                <span class="prompt-template-tag">${escapeHtml(promptTemplateCategoryLabel(item.category || 'mine'))}</span>
            </button>`).join('') : `<div class="prompt-template-list-empty">${escapeHtml('没有匹配的模板')}</div>`}
        </div>
        <div class="prompt-template-detail">
            ${selected ? `
                <div class="prompt-template-detail-head">
                    <div>
                        <strong>${escapeHtml(promptTemplateName(selected) || '')}</strong>
                        <span>${escapeHtml(promptTemplateCategoryLabel(selected.category || ''))} · ${escapeHtml(selected.builtin ? '内置模板' : '我的模板')}</span>
                    </div>
                    ${editMode ? '' : `
                        <div class="prompt-template-icon-actions">
                            <button type="button" ${!canEditCurrentLibrary ? 'disabled' : ''} data-template-edit title="${escapeAttr('修改模板')}"><i data-lucide="pencil"></i><span>${escapeHtml('编辑')}</span></button>
                            <button type="button" ${!canEditCurrentLibrary ? 'disabled' : ''} class="danger" data-template-delete title="${escapeAttr('删除模板')}"><i data-lucide="trash-2"></i><span>${escapeHtml('删除')}</span></button>
                        </div>
                    `}
                </div>
            ${editMode ? `
                <div class="prompt-template-edit-fields">
                    <label>${escapeHtml('模板名称')}</label>
                    <input data-template-edit-name value="${escapeAttr(selectedPreset.name || '')}" placeholder="${escapeAttr('模板名称')}">
                    <label>${escapeHtml('所属分组')}</label>
                    <select data-template-edit-category>
                        ${activeGroups.map(group => `<option value="${escapeAttr(group.id)}" ${group.id === (selectedPreset.category || selected?.category || 'mine') ? 'selected' : ''}>${escapeHtml(promptTemplateCategoryLabel(group.id))}</option>`).join('')}
                    </select>
                    <label>${escapeHtml('模板内容')}</label>
                    <textarea data-template-edit-text placeholder="${escapeAttr('模板内容')}">${escapeHtml(selectedPreset.text || '')}</textarea>
                </div>
            ` : `
                <div class="prompt-template-preview-content">
                <div class="prompt-template-section">
                    <label>${escapeHtml('正向提示词')}</label>
                    <p>${escapeHtml(selected?.positive || '')}</p>
                </div>
                ${selected?.negative ? `<div class="prompt-template-section">
                    <label>${escapeHtml('负向提示词')}</label>
                    <p>${escapeHtml(selected.negative)}</p>
                </div>` : ''}
                ${Object.keys(selected?.params || {}).length ? `<div class="prompt-template-section">
                    <label>${escapeHtml('参数建议')}</label>
                    <p>${escapeHtml(Object.entries(selected.params).map(([k,v]) => `${k}: ${v}`).join('\n'))}</p>
                </div>` : ''}
                </div>
            `}
            <div class="prompt-template-actions">
                ${editMode ? `
                    <button type="button" data-template-edit-cancel><i data-lucide="x"></i><span>${escapeHtml('取消')}</span></button>
                    <button type="button" class="danger" data-template-delete><i data-lucide="trash-2"></i><span>${escapeHtml('删除')}</span></button>
                    <button type="button" class="primary" data-template-edit-save><i data-lucide="save"></i><span>${escapeHtml('保存')}</span></button>
                ` : `
                    <button type="button" data-template-apply="positive"><i data-lucide="corner-down-left"></i><span>${escapeHtml('正向')}</span></button>
                    <button type="button" class="primary" data-template-apply="full"><i data-lucide="wand-sparkles"></i><span>${escapeHtml('完整应用')}</span></button>
                `}
            </div>
            ` : `<div class="prompt-template-empty">${escapeHtml('选择或新建一个模板')}</div>`}
        </div>
    `;
    refreshIcons();
    restorePromptTemplateScroll(scrollSnapshot);
}

function activePromptTemplateNodeId(){
    return promptTemplatePanel?.classList?.contains('open') && promptTemplatePanel.dataset.target !== 'composer' ? (promptTemplatePanel.dataset.nodeId || '') : '';
}

function syncComposerTemplateButton(){
    if(!composerTemplateBtn || !promptTemplatePanel) return;
    const active = promptTemplatePanel.classList.contains('open') && promptTemplatePanel.dataset.target === 'composer';
    composerTemplateBtn.classList.toggle('active', active);
    composerTemplateBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

async function openPromptTemplatePanel(nodeId='', templateId='', options={}){
    if(!promptTemplatePanel) return;
    const target = options.target === 'composer' ? 'composer' : 'node';
    promptTemplatePanel.dataset.target = target;
    promptTemplatePanel.dataset.nodeId = nodeId || '';
    if(promptTemplatePanel.parentElement !== shell) shell.appendChild(promptTemplatePanel);
    if(templateId) promptTemplateSelectedId = templateId;
    promptTemplatePanel.classList.add('open');
    // 每次打开都从后端拉取最新提示词库，确保素材库管理里的新增/修改/删除实时反映到画布（同根同源）。
    try { await loadPromptTemplates(); } catch(e){}
    if(!promptTemplateSelectedId || !promptTemplateItems().some(it => it.id === promptTemplateSelectedId)){
        promptTemplateSelectedId = promptTemplateItems()[0]?.id || '';
    }
    renderPromptTemplatePanel();
    if(target === 'node' && nodeId){
        selectedId = nodeId;
        selectedIds = [];
        selectedImage = {nodeId:'', index:-1};
    }
    render();
    syncComposerTemplateButton();
    promptTemplateSearch?.focus();
}

function closePromptTemplatePanel(){
    promptTemplatePanel?.classList.remove('open');
    syncComposerTemplateButton();
    render();
}

function applyPromptTemplateToNode(mode='positive'){
    const template = promptTemplateItems().find(item => item.id === promptTemplateSelectedId);
    if(!template) return;
    if(promptTemplatePanel?.dataset.target === 'composer'){
        const text = promptTemplateText(template, mode);
        setPromptText(text);
        delete promptInput.dataset.preserveDraftOnce;
        savePromptDraftForCurrent();
        renderInputThumbsRow(selectedNode());
        closePromptTemplatePanel();
        scheduleSave();
        return;
    }
    const node = nodes.find(n => n.id === promptTemplatePanel?.dataset.nodeId);
    if(!node) return;
    node.text = promptTemplateText(template, mode);
    node.promptPresetId = template.builtin ? '' : template.sourceId || '';
    closePromptTemplatePanel();
    render();
    scheduleSave();
}

async function saveCurrentPromptAsTemplate(){
    const library = activePromptLibrary();
    // 系统库 readonly=false，也允许新增条目（走后端，与素材库管理同步）。
    if(library.readonly){ toast('请选择可编辑的提示词库'); return; }
    const text = promptTemplatePanel?.dataset.target === 'composer'
        ? promptPlainText()
        : String(nodes.find(n => n.id === promptTemplatePanel?.dataset.nodeId)?.text || '').trim();
    if(!text){ toast('提示词为空'); return; }
    try {
        const data = await window.CanvasApi.createPromptItem({library_id:library.id, name:defaultPromptPresetName(text), category:promptTemplateCategory === 'all' ? 'custom' : promptTemplateCategory, positive:text, scene:'我的提示词预设'});
        promptLibraries = data.library?.libraries || promptLibraries;
        activePromptLibraryId = library.id;
        promptTemplateCategory = data.item?.category || 'custom';
        promptTemplateSelectedId = data.item?.id || '';
        promptTemplateEditing = true;
        renderPromptTemplatePanel({preserveScroll:false});
    } catch(err) {
        toast(err.message || '保存失败');
    }
}

async function createBlankPromptTemplate(){
    const library = activePromptLibrary();
    // 系统库 readonly=false，也允许新建空白条目（走后端，与素材库管理同步）。
    if(library.readonly){ toast('请选择可编辑的提示词库'); return; }
    const category = promptTemplateCategory && promptTemplateCategory !== 'all' ? promptTemplateCategory : 'custom';
    try {
        const data = await window.CanvasApi.createPromptItem({library_id:library.id, name:'新模板', category, positive:'新提示词', scene:'我的提示词预设'});
        promptLibraries = data.library?.libraries || promptLibraries;
        activePromptLibraryId = library.id;
        promptTemplateCategory = category;
        promptTemplateSelectedId = data.item?.id || '';
        promptTemplateEditing = true;
        renderPromptTemplatePanel({preserveScroll:false});
    } catch(err) {
        toast(err.message || '创建失败');
    }
}

async function savePromptTemplateEdit(){
    const item = promptTemplateSelectedItem();
    if(!item) return;
    const name = promptTemplatePanel.querySelector('[data-template-edit-name]')?.value?.trim() || '';
    const text = promptTemplatePanel.querySelector('[data-template-edit-text]')?.value?.trim() || '';
    const category = promptTemplatePanel.querySelector('[data-template-edit-category]')?.value || 'mine';
    if(!name || !text){ toast('模板名称和内容不能为空'); return; }
    if(item.remote){
        try {
            const data = await window.CanvasApi.updatePromptItem(item.id, {library_id:item.libraryId || activePromptLibrary().id, name, category, positive:text, scene:item.scene || '', negative:item.negative || ''});
            promptLibraries = data.library?.libraries || promptLibraries;
            promptTemplateSelectedId = data.item?.id || item.id;
        } catch(err) {
            toast(err.message || '保存失败');
            return;
        }
    } else if(item.builtin){
        promptTemplateOverrides.editedBuiltins = promptTemplateOverrides.editedBuiltins || {};
        promptTemplateOverrides.editedBuiltins[item.id] = {
            ...(promptTemplateOverrides.editedBuiltins[item.id] || {}),
            name,
            positive:text,
            category
        };
        savePromptTemplateOverrides();
    } else {
        const preset = currentPromptPreset(item.sourceId);
        if(!preset) return;
        const idx = promptPresets.findIndex(p => p.id === preset.id);
        if(idx >= 0) promptPresets[idx] = {...promptPresets[idx], name, text, category, updatedAt:Date.now()};
        savePromptPresets();
        nodes.forEach(node => { if(node.promptPresetId === preset.id) node.text = text; });
    }
    promptTemplateEditing = false;
    renderPromptTemplatePanel();
    render();
    scheduleSave();
}

async function deletePromptTemplate(){
    const item = promptTemplateSelectedItem();
    if(!item) return;
    if(item.remote){
        try {
            const data = await window.CanvasApi.deletePromptItem(item.id);
            promptLibraries = data.library?.libraries || promptLibraries;
        } catch(err) {
            toast(err.message || '删除失败');
            return;
        }
    } else if(item.builtin){
        promptTemplateOverrides.hiddenBuiltinIds = [...new Set([...(promptTemplateOverrides.hiddenBuiltinIds || []), item.id])];
        savePromptTemplateOverrides();
    } else {
        promptPresets = promptPresets.filter(p => p.id !== item.sourceId);
        nodes.forEach(node => { if(node.promptPresetId === item.sourceId) node.promptPresetId = ''; });
        savePromptPresets();
    }
    promptTemplateSelectedId = '';
    promptTemplateEditing = false;
    renderPromptTemplatePanel({preserveScroll:false});
    render();
    scheduleSave();
}

async function createPromptTemplateGroup(){
    const name = window.prompt('新分组名称', '新分组');
    if(!String(name || '').trim()) return;
    const lib = activePromptLibrary();
    // 系统库（readonly=false）也走后端新增分组，与素材库管理同步。
    if(lib && !lib.readonly){
        try {
            const data = await window.CanvasApi.createPromptCategory({name:String(name).trim().slice(0, 24), library_id:lib.id});
            promptLibraries = data.library?.libraries || promptLibraries;
            promptTemplateCategory = data.category?.id || promptTemplateCategory;
            renderPromptTemplatePanel({preserveScroll:false});
        } catch(err){ if(typeof setStatus === 'function') setStatus(err.message || '新增分组失败'); }
        return;
    }
    const group = {id:uid('tpl_group'), name:String(name).trim().slice(0, 24)};
    promptTemplateGroups.push(group);
    savePromptTemplateGroups();
    promptTemplateCategory = group.id;
    renderPromptTemplatePanel({preserveScroll:false});
}

async function renamePromptTemplateGroup(groupId){
    const lib = activePromptLibrary();
    const group = activePromptTemplateGroups().find(g => g.id === groupId);
    if(!group) return;
    const name = window.prompt('分组名称', group.name || '');
    if(!String(name || '').trim()) return;
    // 系统库的内置分组也走后端重命名（后端已放开内置分组限制），两端同步。
    if(lib && !lib.readonly){
        try {
            const data = await window.CanvasApi.updatePromptCategory(groupId, {name:String(name).trim().slice(0, 24), library_id:lib.id});
            promptLibraries = data.library?.libraries || promptLibraries;
            renderPromptTemplatePanel();
        } catch(err){ if(typeof setStatus === 'function') setStatus(err.message || '重命名失败'); }
        return;
    }
    group.name = String(name).trim().slice(0, 24);
    savePromptTemplateGroups();
    renderPromptTemplatePanel();
}

async function deletePromptTemplateGroup(groupId){
    const lib = activePromptLibrary();
    // 系统库的内置分组也走后端删除（后端已放开限制并把孤立条目改挂到剩余分组），两端同步。
    if(lib && !lib.readonly){
        if(!window.confirm('删除分组？该分组里的我的模板会移动到“我的”。')) return;
        try {
            const data = await window.CanvasApi.deletePromptCategory(groupId);
            promptLibraries = data.library?.libraries || promptLibraries;
            if(promptTemplateCategory === groupId) promptTemplateCategory = 'all';
            renderPromptTemplatePanel({preserveScroll:false});
        } catch(err){ if(typeof setStatus === 'function') setStatus(err.message || '删除失败'); }
        return;
    }
    if(!window.confirm('删除分组？该分组里的我的模板会移动到“我的”。')) return;
    promptTemplateGroups = promptTemplateGroups.filter(g => g.id !== groupId);
    promptPresets = promptPresets.map(p => p.category === groupId ? {...p, category:'mine'} : p);
    Object.entries(promptTemplateOverrides.editedBuiltins || {}).forEach(([id, item]) => {
        if(item?.category === groupId) promptTemplateOverrides.editedBuiltins[id] = {...item, category:'mine'};
    });
    if(promptTemplateCategory === groupId) promptTemplateCategory = 'all';
    savePromptTemplateGroups();
    savePromptPresets();
    savePromptTemplateOverrides();
    renderPromptTemplatePanel({preserveScroll:false});
}

function editPromptPresetForNode(node){
    openPromptTemplatePanel(node?.id || '', node?.promptPresetId ? `mine:${node.promptPresetId}` : '');
}

function assetCategories(type='image'){
    const library = activeAssetLibrary();
    return (library?.categories || assetLibrary.categories || []).filter(cat => (cat.type || 'image') === type);
}

function workflowAssetCategories(){
    return assetCategories('workflow');
}

function assetLibraries(){
    return Array.isArray(assetLibrary.libraries) && assetLibrary.libraries.length ? assetLibrary.libraries : [{id:'default', name:'默认资产库', categories:assetLibrary.categories || []}];
}

function localAssetFolderCategories(){
    const result = [];
    const walk = node => {
        if(!node) return;
        const isRoot = (node.id || node.path || '__root__') === '__root__';
        result.push({
            id: node.id || (node.path ? node.path : '__root__'),
            name: node.name || (node.path ? node.path.split('/').pop() : '全部上传'),
            type: 'image',
            items: (isRoot ? (localAssetLibrary.items || []) : (node.items || [])).filter(item => assetMediaKind(item) === 'image'),
            readonly: true,
            source: 'local',
        });
        (node.children || []).forEach(walk);
    };
    walk(localAssetLibrary.tree || {id:'__root__', name:'全部上传', items:localAssetLibrary.items || [], children:[]});
    return result.filter(cat => cat.id === '__root__' || cat.items.length || (localAssetLibrary.tree?.children || []).length);
}

function assetLibraryIsLocal(){
    return activeAssetLibraryId === LOCAL_ASSET_LIBRARY_ID;
}

function currentAssetSourceLibraries(){
    return [
        ...assetLibraries(),
        {id:LOCAL_ASSET_LIBRARY_ID, name:'本地素材', categories:localAssetFolderCategories(), readonly:true, source:'local'}
    ];
}

function activeAssetLibrary(){
    if(assetLibraryIsLocal()) return currentAssetSourceLibraries().find(lib => lib.id === LOCAL_ASSET_LIBRARY_ID);
    const libs = assetLibraries();
    return libs.find(lib => lib.id === activeAssetLibraryId) || libs[0] || null;
}

function activeAssetCategory(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === activeAssetCategoryId) || cats[0];
}

function activeWorkflowAssetCategory(){
    const cats = workflowAssetCategories();
    if(!cats.length) return null;
    return cats.find(cat => cat.id === activeWorkflowAssetCategoryId) || cats[0];
}

function currentAssetTabIsWorkflow(){
    return assetTab === 'workflow';
}

function currentAssetTabCategories(){
    return currentAssetTabIsWorkflow() ? workflowAssetCategories() : assetCategories('image');
}

function activeAssetTabCategory(){
    return currentAssetTabIsWorkflow() ? activeWorkflowAssetCategory() : activeAssetCategory();
}

function setActiveAssetTabCategory(categoryId=''){
    if(currentAssetTabIsWorkflow()) activeWorkflowAssetCategoryId = categoryId || '';
    else activeAssetCategoryId = categoryId || '';
}

async function loadAssetLibrary(){
    try {
        const [data, localData] = await window.CanvasApi.getAssetLibraries();
        localAssetLibrary = {items:Array.isArray(localData.items) ? localData.items : [], tree:localData.tree || null};
        setAssetLibraryFromResponse(data, {render:false});
        renderAssetLibrary();
    } catch(e) {
        toast('资产库加载失败');
    }
}

function refreshAssetLibrarySoon(delay=120){
    clearTimeout(assetLibraryRefreshTimer);
    assetLibraryRefreshTimer = setTimeout(async () => {
        await loadAssetLibrary();
        if(mentionPicker?.classList?.contains('open') && mentionSource === 'asset') renderMentionPicker('asset');
    }, delay);
}

function handleAssetLibraryUpdatedMessage(data={}){
    const remoteUpdatedAt = Number(data.updated_at || 0);
    if(remoteUpdatedAt && remoteUpdatedAt <= Number(assetLibraryUpdatedAt || 0)) return;
    refreshAssetLibrarySoon();
}

function setAssetLibraryFromResponse(data, options={}){
    const signature = node => JSON.stringify((node.images || []).map(img => smartFaceAuthState(img)));
    const before = new Map(nodes.map(node => [node.id,signature(node)]));
    assetLibrary = data.library || assetLibrary;
    const changed = nodes.filter(node => before.get(node.id) !== signature(node)).map(node => node.id);
    if(changed.length) refreshSmartNodes(changed);
    assetLibraryUpdatedAt = Number(assetLibrary.updated_at || assetLibraryUpdatedAt || 0);
    const libs = assetLibraries();
    if(!activeAssetLibraryId) activeAssetLibraryId = assetLibrary.active_library_id || libs[0]?.id || '';
    if(activeAssetLibraryId && activeAssetLibraryId !== LOCAL_ASSET_LIBRARY_ID && !libs.some(lib => lib.id === activeAssetLibraryId)) activeAssetLibraryId = libs[0]?.id || '';
    const cats = assetCategories('image');
    if(activeAssetCategoryId && !cats.some(cat => cat.id === activeAssetCategoryId)) activeAssetCategoryId = '';
    if(!activeAssetCategoryId) activeAssetCategoryId = activeAssetCategory()?.id || '';
    const workflowCats = workflowAssetCategories();
    if(activeWorkflowAssetCategoryId && !workflowCats.some(cat => cat.id === activeWorkflowAssetCategoryId)) activeWorkflowAssetCategoryId = '';
    if(!activeWorkflowAssetCategoryId) activeWorkflowAssetCategoryId = activeWorkflowAssetCategory()?.id || '';
    if(mentionAssetCategoryId && !cats.some(cat => cat.id === mentionAssetCategoryId)) mentionAssetCategoryId = '';
    if(!mentionAssetCategoryId) mentionAssetCategoryId = activeAssetCategoryId;
    if(options.render !== false) {
        renderAssetLibrary();
        if(mentionPicker?.classList?.contains('open') && mentionSource === 'asset') renderMentionPicker('asset');
    }
}

function toggleAssetLibrary(open=!assetLibraryOpen){
    if(!assetPanel || !assetToggle) return;
    assetLibraryOpen = !!open;
    assetPanel.classList.toggle('open', assetLibraryOpen);
    assetToggle?.classList.toggle('active', assetLibraryOpen);
    if(assetLibraryOpen) loadAssetLibrary();
    render();
}

function assetCategoryForMention(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === mentionAssetCategoryId)
        || cats.find(cat => cat.id === activeAssetCategoryId)
        || cats.find(cat => (cat.items || []).length)
        || cats[0];
}

function assetMediaKind(item){
    if(!item) return 'image';
    if(item.kind === 'workflow' || item.type === 'workflow') return 'workflow';
    if(item.kind === 'video' || item.type === 'video') return 'video';
    if(item.kind === 'audio' || item.type === 'audio') return 'audio';
    const url = String(item.url || item.thumbnail || '').toLowerCase().split('?')[0];
    const name = String(item.name || '').toLowerCase();
    if(/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(url) || /\.(mp4|webm|mov|m4v|avi|mkv)$/.test(name)) return 'video';
    if(/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(url) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return 'audio';
    if(/\.(json|zip)$/.test(url) || /\.(json|zip)$/.test(name)) return 'workflow';
    return 'image';
}

function assetThumbHtml(item){
    const url = escapeAttr(item.url || '');
    const thumb = item.thumbnail || item.thumb || item.preview || item.url || '';
    const kind = assetMediaKind(item);
    const faceBadge = smartFaceVerifiedBadgeHtml(assetRegisteredUris(item));
    if(kind === 'video'){
        return `<div class="asset-thumb-wrap">${smartVideoPreviewHtml(item, 512, 'class="asset-thumb" alt=""')}<span class="asset-video-badge"><i data-lucide="film"></i>VIDEO</span></div>`;
    }
    if(kind === 'audio'){
        return `<div class="asset-thumb-wrap media-thumb audio-thumb asset-thumb"><i data-lucide="file-audio"></i><span>${escapeHtml(item.name || 'Audio')}</span></div>`;
    }
    if(kind === 'workflow'){
        return `<div class="asset-thumb-wrap media-thumb workflow-thumb asset-thumb"><i data-lucide="workflow"></i><span>${escapeHtml(item.name || 'Workflow')}</span></div>`;
    }
    return `<div class="asset-thumb-wrap">${smartPreviewImgHtml({...item, url:thumb}, 512, 'class="asset-thumb" alt=""')}${faceBadge}</div>`;
}

function renderAssetLibrary({preserveScroll=false}={}){
    if(!assetPanel || !assetGrid || !assetCategorySelect) return;
    const scrollTop = preserveScroll ? assetGrid.scrollTop : 0;
    document.querySelectorAll('[data-asset-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.assetTab === assetTab));
    const libs = currentAssetSourceLibraries();
    if(!activeAssetLibraryId || !libs.some(lib => lib.id === activeAssetLibraryId)) activeAssetLibraryId = assetLibrary.active_library_id || assetLibraries()[0]?.id || LOCAL_ASSET_LIBRARY_ID;
    if(assetLibrarySelect){
        assetLibrarySelect.innerHTML = libs.map(lib => `<option value="${escapeHtml(lib.id)}" ${lib.id === activeAssetLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '资产库')}</option>`).join('');
    }
    const imageMode = assetTab === 'image';
    const workflowMode = assetTab === 'workflow';
    assetImageControls.style.display = (imageMode || workflowMode) ? 'block' : 'none';
    const localMode = assetLibraryIsLocal();
    assetDropZone.style.display = (imageMode && !localMode) ? 'flex' : 'none';
    assetGrid.style.display = (imageMode || workflowMode) ? 'grid' : 'none';
    workflowEmpty.style.display = 'none';
    if(!imageMode && !workflowMode){ refreshIcons(); return; }
    const cats = workflowMode ? workflowAssetCategories() : assetCategories('image');
    const activeCatId = workflowMode ? activeWorkflowAssetCategoryId : activeAssetCategoryId;
    if(workflowMode && !cats.some(cat => cat.id === activeWorkflowAssetCategoryId)) activeWorkflowAssetCategoryId = cats[0]?.id || '';
    if(imageMode && !cats.some(cat => cat.id === activeAssetCategoryId)) activeAssetCategoryId = cats[0]?.id || '';
    assetCategorySelect.innerHTML = cats.map(cat => `<option value="${escapeHtml(cat.id)}" ${cat.id === (workflowMode ? activeWorkflowAssetCategoryId : activeAssetCategoryId) ? 'selected' : ''}>${escapeHtml(cat.name || (workflowMode ? '工作流' : '新文件夹'))}</option>`).join('');
    const cat = workflowMode ? activeWorkflowAssetCategory() : activeAssetCategory();
    const query = assetNameSearchQuery.trim().toLowerCase();
    const allItems = cat?.items || [];
    const items = query ? allItems.filter(item => String(item?.name || '').toLowerCase().includes(query)) : allItems;
    const renderKey = `${activeAssetLibraryId}\u0000${assetTab}\u0000${cat?.id || ''}\u0000${query}`;
    if(renderKey !== assetSidebarRenderKey){
        assetSidebarRenderKey = renderKey;
        assetSidebarRenderedCount = ASSET_SIDEBAR_BATCH_SIZE;
    }
    assetSidebarFilteredCount = items.length;
    assetSidebarRenderedCount = Math.min(Math.max(ASSET_SIDEBAR_BATCH_SIZE, assetSidebarRenderedCount), items.length);
    const visibleItems = items.slice(0, assetSidebarRenderedCount);
    if(assetAddCategoryBtn) assetAddCategoryBtn.disabled = localMode;
    if(assetRenameCategoryBtn) assetRenameCategoryBtn.disabled = !cat || localMode;
    assetGrid.innerHTML = visibleItems.length ? visibleItems.map(item => `
        <div class="asset-item ${workflowMode ? 'workflow-asset-item' : ''}" draggable="${workflowMode ? 'false' : 'true'}" data-asset-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-name="${escapeHtml(item.name || 'asset')}" data-kind="${escapeHtml(assetMediaKind(item))}" data-asset-uris="${escapeHtml(JSON.stringify(assetRegisteredUris(item)))}">
            ${assetThumbHtml(item)}
            <div class="asset-meta">
                <span class="asset-name" title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || 'asset')}</span>
                ${workflowMode
                    ? `<button class="asset-mini-btn" type="button" data-rename-workflow-asset="${escapeHtml(item.id)}" title="${escapeHtml('重命名')}"><i data-lucide="pencil"></i></button>
                       <button class="asset-mini-btn" type="button" data-delete-workflow-asset="${escapeHtml(item.id)}" title="${escapeHtml('删除')}"><i data-lucide="trash-2"></i></button>`
                    : localMode ? `<span class="asset-local-tag">本地</span>` : `<button class="asset-mini-btn" type="button" data-rename-asset="${escapeHtml(item.id)}" title="${escapeHtml('重命名')}"><i data-lucide="pencil"></i></button>
                       <button class="asset-mini-btn" type="button" data-delete-asset="${escapeHtml(item.id)}" title="${escapeHtml('删除')}"><i data-lucide="trash-2"></i></button>`}
            </div>
        </div>
    `).join('') + (visibleItems.length < items.length ? '<div class="asset-load-more">继续向下滚动加载更多</div>' : '') : `<div class="asset-empty">${escapeHtml(query && allItems.length ? '没有找到匹配名称的素材' : (localMode ? '暂无本地素材，请在素材库管理中上传' : (workflowMode ? '暂无工作流资产' : '这个文件夹还没有图片。把画布里的图片拖进来保存。')))}</div>`;
    if(workflowMode) bindWorkflowAssetItemEvents();
    else bindAssetItemEvents();
    bindSmartPreviewImageFallbacks(assetGrid);
    assetGrid.scrollTop = preserveScroll ? scrollTop : 0;
    refreshIcons();
}

function openAssetNameDialog({title='', value='', placeholder='', cancelValue='', multiline=false }={}){
    if(!assetDialogBackdrop || !assetDialogInput || !assetDialogOk || !assetDialogCancel) return Promise.resolve(cancelValue);
    return new Promise(resolve => {
        if(assetDialogTarget) assetDialogTarget.hidden = true;
        assetDialogInput.hidden = false;
        assetDialogTitle.textContent = title || '重命名';
        assetDialogInput.value = value || '';
        assetDialogInput.placeholder = placeholder || '';
        assetDialogInput.classList.toggle('is-multiline', Boolean(multiline));
        assetDialogInput.rows = multiline ? 5 : 1;
        assetDialogBackdrop.hidden = false;
        assetDialogBackdrop.classList.add('open');
        assetDialogInput.focus();
        assetDialogInput.select();
        const cleanup = result => {
            assetDialogBackdrop.classList.remove('open');
            assetDialogBackdrop.hidden = true;
            assetDialogOk.onclick = null;
            assetDialogCancel.onclick = null;
            assetDialogInput.onkeydown = null;
            assetDialogBackdrop.onmousedown = null;
            assetDialogInput.classList.remove('is-multiline');
            assetDialogInput.rows = 1;
            resolve(result);
        };
        assetDialogOk.onclick = () => cleanup(assetDialogInput.value.trim());
        assetDialogCancel.onclick = () => cleanup(cancelValue);
        assetDialogInput.onkeydown = event => {
            if(event.key === 'Enter' && !multiline) cleanup(assetDialogInput.value.trim());
            if(event.key === 'Enter' && multiline && (event.ctrlKey || event.metaKey)) cleanup(assetDialogInput.value.trim());
            if(event.key === 'Escape') cleanup(cancelValue);
        };
        assetDialogBackdrop.onmousedown = event => {
            if(event.target === assetDialogBackdrop) cleanup(cancelValue);
        };
    });
}

function positionAssetHoverPreview(event){ smartAssetHover.move(event); }

function showAssetHoverPreview(event, item){ smartAssetHover.enter(event, item); }

function hideAssetHoverPreview(){ smartAssetHover.hide(); }

function positionAssetHoverPreviewNow(event){
    if(!assetHoverPreview || assetHoverPreview.hidden || assetHoverPreview.style.display === 'none') return;
    const pad = 14;
    const w = assetHoverPreview.offsetWidth || 260;
    const h = assetHoverPreview.offsetHeight || 300;
    let left = event.clientX - w - 16;
    if(left < pad) left = event.clientX + 16;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    const top = Math.max(pad, Math.min(window.innerHeight - h - pad, event.clientY + 12));
    assetHoverPreview.style.left = `${left}px`;
    assetHoverPreview.style.top = `${top}px`;
}

function showAssetHoverPreviewNow(event, item){
    if(!assetHoverPreview || !item?.url) return;
    let media = assetHoverPreview.querySelector('img,video');
    const name = assetHoverPreview.querySelector('.asset-hover-name');
    if(media?.tagName?.toLowerCase() !== 'img'){
        media?.pause?.();
        media?.removeAttribute('src');
        media?.replaceWith(document.createElement('img'));
        media = assetHoverPreview.querySelector('img');
    }
    // Reuse the already loaded library thumbnail; hover must not fetch/play
    // full originals while the user is trying to drag a card.
    media.decoding = 'async';
    media.src = item.previewUrl || smartMediaPreviewUrl(item, 512);
    media.alt = 'asset preview';
    name.textContent = item.name || 'asset';
    assetHoverPreview.hidden = false;
    assetHoverPreview.style.display = 'block';
    positionAssetHoverPreview(event);
}

function hideAssetHoverPreviewNow(){
    if(!assetHoverPreview) return;
    assetHoverPreview.style.display = 'none';
    assetHoverPreview.hidden = true;
    const media = assetHoverPreview.querySelector('img,video');
    media?.pause?.();
    media?.removeAttribute('src');
    media?.load?.();
}

function beginAssetInlineRename(assetId){
    const item = (activeAssetCategory()?.items || []).find(x => x.id === assetId)
        || (activeWorkflowAssetCategory()?.items || []).find(x => x.id === assetId);
    const card = [...assetGrid.querySelectorAll('.asset-item')].find(el => el.dataset.assetId === assetId);
    const nameEl = card?.querySelector('.asset-name');
    if(!item || !card || !nameEl || card.querySelector('.asset-rename-input')) return;
    hideAssetHoverPreview();
    const previousName = item.name || 'asset';
    const previousDraggable = card.draggable;
    const input = document.createElement('input');
    input.className = 'asset-rename-input';
    input.type = 'text';
    input.value = previousName;
    input.setAttribute('aria-label', '重命名');
    card.draggable = false;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const restore = () => {
        if(input.isConnected) input.replaceWith(nameEl);
        card.draggable = previousDraggable;
    };
    const finish = async save => {
        if(done) return;
        done = true;
        const name = input.value.trim();
        if(!save || !name || name === previousName){
            restore();
            return;
        }
        input.disabled = true;
        try {
            const data = await window.CanvasApi.updateAssetItem(assetId, {name});
            setAssetLibraryFromResponse(data);
        } catch(err){
            restore();
            toast(err.message || '保存资产失败');
        }
    };
    input.addEventListener('keydown', event => {
        event.stopPropagation();
        if(event.key === 'Enter'){
            event.preventDefault();
            finish(true);
        } else if(event.key === 'Escape'){
            event.preventDefault();
            finish(false);
        }
    });
    input.addEventListener('pointerdown', event => event.stopPropagation());
    input.addEventListener('mousedown', event => event.stopPropagation());
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('blur', () => finish(true));
}

function bindAssetItemEvents(){
    assetGrid.querySelectorAll('.asset-item').forEach(el => {
        const thumb = el.querySelector('.asset-thumb');
        thumb?.addEventListener('mouseenter', e => showAssetHoverPreview(e, {url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind, previewUrl:thumb?.currentSrc || thumb?.querySelector('img')?.currentSrc}));
        thumb?.addEventListener('mousemove', e => positionAssetHoverPreview(e));
        thumb?.addEventListener('mouseleave', hideAssetHoverPreview);
        el.addEventListener('dragstart', e => {
            hideAssetHoverPreview();
            e.dataTransfer.effectAllowed = 'copy';
            let assetUris = {};
            try { assetUris = JSON.parse(el.dataset.assetUris || '{}') || {}; } catch(e) {}
            e.dataTransfer.setData('application/x-smart-asset', JSON.stringify({url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind, asset_uris:assetUris}));
            e.dataTransfer.setData('text/plain', el.dataset.url || '');
        });
    });
    assetGrid.querySelectorAll('[data-rename-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault(); e.stopPropagation();
            beginAssetInlineRename(btn.dataset.renameAsset);
        };
    });
    assetGrid.querySelectorAll('[data-delete-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault(); e.stopPropagation();
            btn.disabled = true;
            try {
                const data = await window.CanvasApi.deleteAssetItem(btn.dataset.deleteAsset);
                setAssetLibraryFromResponse(data);
            } catch(err){
                btn.disabled = false;
                toast(err.message || '保存资产失败');
            }
        };
    });
}

function bindWorkflowAssetItemEvents(){
    assetGrid.querySelectorAll('[data-rename-workflow-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault();
            e.stopPropagation();
            beginAssetInlineRename(btn.dataset.renameWorkflowAsset);
        };
    });
    assetGrid.querySelectorAll('[data-delete-workflow-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault();
            e.stopPropagation();
            const item = (activeWorkflowAssetCategory()?.items || []).find(x => x.id === btn.dataset.deleteWorkflowAsset);
            if(!item) return;
            btn.disabled = true;
            try {
                const data = await window.CanvasApi.deleteAssetItem(item.id);
                setAssetLibraryFromResponse(data);
            } catch(err){
                btn.disabled = false;
                toast(err.message || '保存资产失败');
            }
        };
    });
}

async function addUrlToAssetLibrary(url, name=''){
    if(assetLibraryIsLocal()){ toast('本地素材请在素材库管理中上传'); return; }
    const cat = activeAssetCategory();
    if(!cat){ toast('请先新建一个图片文件夹'); return; }
    const data = await window.CanvasApi.createAssetItem({library_id:activeAssetLibraryId, category_id:cat.id, url, name}, {errorFallback:'保存资产失败'});
    setAssetLibraryFromResponse(data);
    toast('已保存到资产库');
}

async function chooseSmartAssetTarget(){
    await loadAssetLibrary();
    const targets = assetLibraries().flatMap(library => library.readonly ? [] : (library.categories || [])
        .filter(category => ['image','media'].includes(String(category.type || 'image').toLowerCase()) && !category.readonly)
        .map(category => ({libraryId:library.id, categoryId:category.id, label:`${library.name || '素材库'} / ${category.name || '分组'}`})));
    if(!targets.length){ toast('请先创建可编辑的素材库和图片分组'); return null; }
    return new Promise(resolve => {
        assetDialogTitle.textContent = '选择素材库 / 分组';
        assetDialogInput.hidden = true;
        assetDialogTarget.hidden = false;
        assetDialogTarget.innerHTML = targets.map((target, index) => `<option value="${index}" ${target.libraryId === activeAssetLibraryId && target.categoryId === activeAssetCategoryId ? 'selected' : ''}>${escapeHtml(target.label)}</option>`).join('');
        assetDialogBackdrop.hidden = false;
        assetDialogBackdrop.classList.add('open');
        assetDialogTarget.focus();
        const cleanup = result => {
            assetDialogBackdrop.classList.remove('open');
            assetDialogBackdrop.hidden = true;
            assetDialogTarget.hidden = true;
            assetDialogInput.hidden = false;
            assetDialogOk.onclick = assetDialogCancel.onclick = assetDialogBackdrop.onmousedown = null;
            resolve(result);
        };
        assetDialogOk.onclick = () => cleanup(targets[Number(assetDialogTarget.value || 0)] || targets[0]);
        assetDialogCancel.onclick = () => cleanup(null);
        assetDialogBackdrop.onmousedown = event => { if(event.target === assetDialogBackdrop) cleanup(null); };
    });
}

function smartAssetItemLocation(itemId){
    for(const library of assetLibraries()) for(const category of library.categories || []) {
        const item = (category.items || []).find(entry => entry.id === itemId);
        if(item) return {item, libraryId:library.id, categoryId:category.id};
    }
    return null;
}

function smartAuthenticatedUris(item){
    return window.CanvasAssetAuth.resolve({},item).uris;
}

function smartVolcengineAssetUrisForRef(ref, provider=null){
    return smartFaceAuthState(ref,provider).uris;
}

function smartFaceAuthState(ref, provider=null){
    provider ||= (apiProviders || []).find(p => p.id === 'volcengine');
    return window.CanvasAssetAuth.resolve(ref,window.CanvasAssetAuth.findItem(assetLibraries(),ref),provider);
}

function smartCurrentFaceAuthRef(ref){
    if(!ref?.nodeId) return ref;
    const owner = nodes.find(node => node.id === ref.nodeId);
    const urls = [ref.url, ref.originalLocalUrl, ref.sourceUrl].filter(Boolean);
    const matches = image => image && [image.url, image.originalLocalUrl, localDisplayUrlForMediaItem(image)]
        .some(url => url && urls.includes(url));
    const image = (matches(owner?.images?.[ref.imageIndex]) && owner.images[ref.imageIndex])
        || owner?.images?.find(matches);
    if(!image) throw new Error('引用的素材已被替换或删除，请重新选择后生成。');
    // Mentions can predate authentication. Use the matching live image, never a stale index.
    return {...ref, asset_uris:image.asset_uris || {}, asset_item_id:image.asset_item_id || '',
        asset_library_id:image.asset_library_id || '', face_auth_status:image.face_auth_status || ''};
}

async function ensureSmartImageAsset(node, index, target){
    const image = node?.images?.[index];
    const sourceUrl = image?.url;
    const linked = image?.asset_item_id && smartAssetItemLocation(image.asset_item_id);
    if(linked && linked.libraryId === target.libraryId && linked.categoryId === target.categoryId) return linked;
    const data = await window.CanvasApi.createAssetItem({library_id:target.libraryId, category_id:target.categoryId, url:image.url, name:image.name || smartImageNameFromUrl(image.url)}, {errorFallback:'上传素材库失败'});
    setAssetLibraryFromResponse(data);
    if(!nodes.includes(node) || node.images[index] !== image || image.url !== sourceUrl) throw new Error('图片已更改，请重新认证。');
    image.asset_item_id = data.item?.id || '';
    image.asset_library_id = target.libraryId;
    image.asset_uris = smartAuthenticatedUris(data.item);
    image.face_auth_status = '';
    scheduleSave();
    return {item:data.item, libraryId:target.libraryId, categoryId:target.categoryId};
}

async function saveSmartImageToAssetLibrary(nodeId, index){
    const node = nodes.find(entry => entry.id === nodeId);
    const image = node?.images?.[index];
    if(!image?.url) return;
    const target = await chooseSmartAssetTarget();
    if(!target) return;
    try {
        const linked = image.asset_item_id && smartAssetItemLocation(image.asset_item_id);
        await ensureSmartImageAsset(node, index, target);
        toast(linked?.libraryId === target.libraryId && linked?.categoryId === target.categoryId ? '该素材已在素材库中' : '已上传到素材库');
    } catch(e) { toast(e.message || '上传素材库失败'); }
}

function smartAvatarPlatform(provider){
    return window.CanvasAssetAuth.registrationPlatform(provider);
}

function quickSmartAvatarProvider(){
    return window.CanvasAssetAuth.registrationProvider(apiProviders);
}

async function smartAvatarRequest(path, libraryId, providerId){
    const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:libraryId, provider_id:providerId})});
    if(!response.ok) throw new Error(await responseErrorMessage(response, '素材认证失败'));
    return response.json();
}

function pollSmartImageFaceAuth(nodeId, index, itemId, libraryId, provider, attempt=0){
    if(attempt >= 100) return;
    const source = nodes.find(node => node.id === nodeId)?.images?.[index];
    const sourceUrl = source?.url;
    const isCurrent = () => source && nodes.find(node => node.id === nodeId)?.images?.[index] === source
        && source.url === sourceUrl && source.asset_item_id === itemId && source.asset_library_id === libraryId;
    setTimeout(async () => {
        const image = nodes.find(node => node.id === nodeId)?.images?.[index];
        if(!isCurrent()) return;
        try {
            const data = await smartAvatarRequest(`/api/asset-library/items/${encodeURIComponent(itemId)}/avatar-status`, libraryId, provider.id);
            setAssetLibraryFromResponse(data);
            if(!isCurrent()) return;
            const registration = data.item?.registrations?.[smartAvatarPlatform(provider)] || {};
            if(registration.status === 'Active'){
                image.face_auth_status = 'Active';
                image.asset_uris = smartAuthenticatedUris(data.item);
                render(); scheduleSave(); toast('素材认证已通过');
            } else if(registration.status === 'Failed'){
                image.face_auth_status = 'Failed';
                image.asset_uris = {};
                render(); scheduleSave(); toast(registration.detail || '素材认证未通过');
            } else pollSmartImageFaceAuth(nodeId, index, itemId, libraryId, provider, attempt + 1);
        } catch(e) {
            if(!isCurrent()) return;
            if(attempt < 2) pollSmartImageFaceAuth(nodeId, index, itemId, libraryId, provider, attempt + 1);
            else toast(e.message || '认证状态查询失败');
        }
    }, 6000);
}

async function quickFaceAuthSmartImage(nodeId, index){
    const node = nodes.find(entry => entry.id === nodeId);
    const image = node?.images?.[index];
    if(!image?.url) return;
    const sourceUrl = image.url;
    const isCurrent = () => nodes.includes(node) && node.images[index] === image && image.url === sourceUrl;
    const provider = quickSmartAvatarProvider();
    if(!provider) return toast('请先在 API 平台管理中配置火山引擎');
    if(!window.CanvasAssetAuth.registrationReady(provider)) return toast('火山引擎素材认证需要 AK/SK，请在管理平台补齐 Access Key ID 和 Secret Access Key。');
    const target = await chooseSmartAssetTarget();
    if(!target || !isCurrent()) return;
    try {
        toast('正在上传素材并提交素材认证…');
        const {item, libraryId} = await ensureSmartImageAsset(node, index, target);
        if(!isCurrent()) return;
        const registration = item?.registrations?.[smartAvatarPlatform(provider)] || {};
        const auth = window.CanvasAssetAuth.resolve({},item,provider);
        if(auth.status === 'ScopeMismatch') return toast(window.CanvasAssetAuth.error(auth.status));
        if(registration.status === 'Active'){
            image.face_auth_status = 'Active'; image.asset_uris = smartAuthenticatedUris(item); render(); scheduleSave(); return toast('该素材已通过素材认证');
        }
        image.face_auth_status = 'Processing'; image.asset_uris = {}; render(); scheduleSave();
        if(registration.status !== 'Processing') await smartAvatarRequest(`/api/asset-library/items/${encodeURIComponent(item.id)}/register-avatar`, libraryId, provider.id);
        if(!isCurrent()) return;
        toast('已提交审核，稍后自动更新');
        pollSmartImageFaceAuth(nodeId, index, item.id, libraryId, provider);
    } catch(e) {
        if(!isCurrent()) return;
        image.face_auth_status = 'Failed'; image.asset_uris = {}; render(); scheduleSave(); toast(e.message || '素材认证提交失败');
    }
}

function canvasImageDragPayload(node, index=0){
    const img = node?.images?.[index];
    if(!img?.url) return null;
    return {url:img.url, name:img.name || node.title || 'image'};
}

// SmartCanvas 只消费已通过审核的火山 asset:// 地址。
function assetRegisteredUris(item){
    return smartAuthenticatedUris(item);
}

function smartVolcengineFaceVerified(assetUris, image=null){
    return smartFaceAuthState(image || {asset_uris:assetUris}).ready;
}

function smartFaceVerifiedBadgeHtml(assetUris, onNode=false, image=null){
    return smartVolcengineFaceVerified(assetUris,image) ? `<span class="smart-face-verified-badge ${onNode ? 'node-face-badge' : ''}" title="素材已就绪" aria-label="素材已就绪"><i data-lucide="shield-check"></i></span>` : '';
}

function assetMentionCandidateImages(categoryId=''){
    const cats = assetCategories('image');
    const cat = cats.find(c => c.id === categoryId) || assetCategoryForMention();
    if(!cat) return [];
    mentionAssetCategoryId = cat.id;
    const items = (cat.items || []).map(item => ({...item, categoryName:cat.name || '', categoryId:cat.id}));
    const seen = new Set();
    return items.filter(item => {
        if(!item?.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    }).map((item, index) => ({
        url:item.url,
        kind:assetMediaKind(item),
        name:item.name || `资产${index + 1}`,
        alias:item.name || `资产${index + 1}`,
        role:'asset',
        categoryName:item.categoryName || '',
        asset_uris:assetRegisteredUris(item),
        mentionId:`asset_${index}_${Math.random().toString(36).slice(2, 7)}`
    }));
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartLibraryToggle(){
    if(assetToggle) assetToggle.onclick = () => toggleAssetLibrary();
    if(assetCloseBtn) assetCloseBtn.onclick = () => toggleAssetLibrary(false);
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartLibraryControls(){
    assetPanel?.addEventListener('pointerdown', e => e.stopPropagation());
    assetPanel?.addEventListener('mousedown', e => e.stopPropagation());
    assetPanel?.addEventListener('click', e => e.stopPropagation());
    assetPanel?.addEventListener('wheel', e => {
        e.stopPropagation();
        const scroller = e.target.closest?.('.asset-grid') || assetGrid;
        if(!scroller || getComputedStyle(scroller).display === 'none') return;
        const canScroll = scroller.scrollHeight > scroller.clientHeight || scroller.scrollWidth > scroller.clientWidth;
        if(!canScroll) return;
        e.preventDefault();
        scroller.scrollTop += e.deltaY;
        scroller.scrollLeft += e.deltaX;
    }, {passive:false, capture:true});
    assetGrid?.addEventListener('scroll', () => {
        if(assetSidebarRenderedCount >= assetSidebarFilteredCount) return;
        if(assetGrid.scrollHeight - assetGrid.scrollTop - assetGrid.clientHeight > 180) return;
        assetSidebarRenderedCount += ASSET_SIDEBAR_BATCH_SIZE;
        renderAssetLibrary({preserveScroll:true});
    });
    assetDialogBackdrop?.addEventListener('pointerdown', e => e.stopPropagation());
    assetDialogBackdrop?.addEventListener('mousedown', e => e.stopPropagation());
    assetDialogBackdrop?.addEventListener('click', e => e.stopPropagation());
    promptPresetPanel?.addEventListener('pointerdown', e => e.stopPropagation());
    promptPresetPanel?.addEventListener('mousedown', e => e.stopPropagation());
    promptPresetPanel?.addEventListener('click', e => e.stopPropagation());
    promptTemplatePanel?.addEventListener('pointerdown', e => e.stopPropagation());
    promptTemplatePanel?.addEventListener('mousedown', e => e.stopPropagation());
    promptTemplatePanel?.addEventListener('wheel', e => e.stopPropagation(), {passive:false});
    promptTemplatePanel?.addEventListener('click', e => {
        e.stopPropagation();
        const apply = e.target.closest('[data-template-apply]');
        if(apply){ applyPromptTemplateToNode(apply.dataset.templateApply || 'positive'); return; }
        if(e.target.closest('[data-template-save-current]')){ saveCurrentPromptAsTemplate(); return; }
        if(e.target.closest('[data-template-new]')){ createBlankPromptTemplate(); return; }
        if(e.target.closest('[data-template-edit]')) { promptTemplateEditing = true; renderPromptTemplatePanel(); return; }
        if(e.target.closest('[data-template-edit-cancel]')) { promptTemplateEditing = false; renderPromptTemplatePanel(); return; }
        if(e.target.closest('[data-template-edit-save]')){ savePromptTemplateEdit(); return; }
        if(e.target.closest('[data-template-delete]')){ deletePromptTemplate(); return; }
        const cat = e.target.closest('[data-template-cat]');
        if(cat){
            promptTemplateCategory = cat.dataset.templateCat || 'all';
            promptTemplateSelectedId = '';
            promptTemplateEditing = false;
            renderPromptTemplatePanel({preserveScroll:false});
            return;
        }
        const catEdit = e.target.closest('[data-template-cat-edit]');
        if(catEdit){
            const id = catEdit.dataset.templateCatEdit || '';
            renamePromptTemplateGroup(id);
            return;
        }
        const catDelete = e.target.closest('[data-template-cat-delete]');
        if(catDelete){
            deletePromptTemplateGroup(catDelete.dataset.templateCatDelete || '');
            return;
        }
        if(e.target.closest('[data-template-group-edit]')){
            promptTemplateGroupEditMode = !promptTemplateGroupEditMode;
            renderPromptTemplatePanel({preserveScroll:false});
            return;
        }
        if(e.target.closest('[data-template-cat-new]')) { createPromptTemplateGroup(); return; }
        const card = e.target.closest('[data-template-id]');
        if(card){
            promptTemplateSelectedId = card.dataset.templateId || '';
            promptTemplateEditing = false;
            renderPromptTemplatePanel();
            return;
        }
    });
    if(promptPresetClose) promptPresetClose.onclick = closePromptPresetPanel;
    if(promptTemplateClose) promptTemplateClose.onclick = closePromptTemplatePanel;
    if(promptTemplateSearch) promptTemplateSearch.oninput = () => renderPromptTemplatePanel({preserveScroll:false});
    if(promptTemplateLibrarySelect) promptTemplateLibrarySelect.onchange = async () => {
        activePromptLibraryId = promptTemplateLibrarySelect.value || 'system';
        promptTemplateSelectedId = '';
        // 切换词库必须重置分类筛选，否则上一个库的分类（如系统的“视角”）会把新库内容过滤为空。
        promptTemplateCategory = 'all';
        promptTemplateEditing = false;
        // 拉取最新数据，确保素材库管理里新建/新增的词库与提示词在画布即时可见。
        const want = activePromptLibraryId;
        try { await loadPromptTemplates(); } catch(e){}
        if(promptLibraries.some(lib => lib.id === want)) activePromptLibraryId = want;
        renderPromptLibrarySelect();
        renderPromptTemplatePanel({preserveScroll:false});
    };
    if(composerTemplateBtn) composerTemplateBtn.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        if(promptTemplatePanel?.classList?.contains('open') && promptTemplatePanel.dataset.target === 'composer'){
            closePromptTemplatePanel();
            return;
        }
        openPromptTemplatePanel(activeComposerNode()?.id || selectedNode()?.id || '', promptTemplateSelectedId, {target:'composer'});
    };
    if(promptPresetSelect) promptPresetSelect.onchange = () => renderPromptPresetPanel(promptPresetSelect.value);
    [promptPresetName, promptPresetText].forEach(input => {
        input?.addEventListener('input', () => {
            resetPromptPresetDeleteState();
            setPromptPresetStatus('编辑完成后点击保存修改。');
        });
    });
    if(promptPresetApply) promptPresetApply.onclick = () => {
        const preset = currentPromptPreset(promptPresetSelect.value);
        const node = promptPresetPanelNode();
        if(!preset || !node) return;
        node.promptPresetId = preset.id;
        node.text = preset.text || '';
        closePromptPresetPanel();
        render();
        scheduleSave();
    };
    if(promptPresetSave) promptPresetSave.onclick = () => {
        const preset = currentPromptPreset(promptPresetSelect.value);
        if(!preset) return;
        const name = promptPresetName.value.trim();
        const text = promptPresetText.value.trim();
        if(!name || !text){ setPromptPresetStatus('名称和内容都不能为空。', 'warn'); return; }
        const idx = promptPresets.findIndex(p => p.id === preset.id);
        if(idx >= 0) promptPresets[idx] = {...promptPresets[idx], name, text, updatedAt:Date.now()};
        savePromptPresets();
        const node = promptPresetPanelNode();
        if(node?.promptPresetId === preset.id) node.text = text;
        renderPromptPresetPanel(preset.id, '修改已保存');
        setPromptPresetStatus('修改已保存', 'ok');
        render();
        scheduleSave();
    };
    if(promptPresetNew) promptPresetNew.onclick = () => {
        const node = promptPresetPanelNode();
        const preset = createPromptPresetFromNode(node, {openPanel:false});
        if(!preset) return;
        renderPromptPresetPanel(preset.id, '已存为新预设');
        setPromptPresetStatus('已存为新预设', 'ok');
        promptPresetName?.focus();
        promptPresetName?.select();
    };
    if(promptPresetDelete) promptPresetDelete.onclick = () => {
        const preset = currentPromptPreset(promptPresetSelect.value);
        if(!preset) return;
        if(!promptPresetDeleteArmed){
            promptPresetDeleteArmed = true;
            promptPresetDelete.textContent = '再次点击删除';
            promptPresetDelete.classList.add('confirm-danger');
            setPromptPresetStatus('将删除“{name}”，再次点击确认。'.replace('{name}', preset.name || '未命名预设'), 'warn');
            return;
        }
        promptPresets = promptPresets.filter(p => p.id !== preset.id);
        nodes.forEach(node => { if(node.promptPresetId === preset.id) node.promptPresetId = ''; });
        savePromptPresets();
        renderPromptPresetPanel(promptPresets[0]?.id || '', '预设已删除');
        setPromptPresetStatus('预设已删除', 'ok');
        render();
        scheduleSave();
    };
    document.querySelectorAll('[data-asset-tab]').forEach(btn => {
        btn.onclick = () => {
            assetTab = btn.dataset.assetTab;
            if(assetTab === 'workflow' && assetLibraryIsLocal()){
                activeAssetLibraryId = assetLibrary.active_library_id || assetLibraries()[0]?.id || '';
            }
            renderAssetLibrary();
        };
    });
    if(assetLibrarySelect) assetLibrarySelect.onchange = () => {
        activeAssetLibraryId = assetLibrarySelect.value || '';
        activeAssetCategoryId = '';
        activeWorkflowAssetCategoryId = '';
        mentionAssetCategoryId = '';
        if(activeAssetLibraryId === LOCAL_ASSET_LIBRARY_ID) assetTab = 'image';
        renderAssetLibrary();
    };
    if(assetCategorySelect) assetCategorySelect.onchange = () => {
        if(assetTab === 'workflow') activeWorkflowAssetCategoryId = assetCategorySelect.value;
        else activeAssetCategoryId = assetCategorySelect.value;
        renderAssetLibrary();
    };
    if(assetNameSearch) assetNameSearch.oninput = () => {
        assetNameSearchQuery = assetNameSearch.value || '';
        renderAssetLibrary();
    };
    if(assetAddCategoryBtn) assetAddCategoryBtn.onclick = async () => {
        if(assetLibraryIsLocal()){ toast('本地素材请在素材库管理中管理文件夹'); return; }
        const workflowMode = currentAssetTabIsWorkflow();
        const fallbackName = workflowMode ? '工作流' : '新文件夹';
        const name = await openAssetNameDialog({title:'新建文件夹', value:fallbackName, placeholder:fallbackName});
        if(!name) return;
        const data = await window.CanvasApi.createAssetCategory({library_id:activeAssetLibraryId, name, type:workflowMode ? 'workflow' : 'image'});
        setActiveAssetTabCategory(data.category?.id || '');
        setAssetLibraryFromResponse(data);
    };
    if(assetRenameCategoryBtn) assetRenameCategoryBtn.onclick = async () => {
        if(assetLibraryIsLocal()){ toast('本地素材请在素材库管理中管理文件夹'); return; }
        const cat = activeAssetTabCategory();
        if(!cat) return;
        const name = await openAssetNameDialog({title:'重命名文件夹', value:cat.name || '', placeholder:currentAssetTabIsWorkflow() ? '工作流' : '新文件夹'});
        if(!name) return;
        const data = await window.CanvasApi.updateAssetCategory(cat.id, {name});
        setAssetLibraryFromResponse(data);
    };
}

function hasCanvasImageDrag(event){
    return Array.from(event.dataTransfer?.types || []).includes('application/x-smart-canvas-image');
}

function setAssetDragOver(active){
    if(!assetDropZone || !assetPanel) return;
    assetDropZone.classList.toggle('drag-over', !!active);
    assetPanel.classList.toggle('drag-over', !!active);
}

function handleAssetPanelDragOver(e){
    if(hasCanvasImageDrag(e) || hasSmartImageDropData(e.dataTransfer)){
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setAssetDragOver(true);
    }
}

async function handleAssetPanelDrop(e){
    if(!hasCanvasImageDrag(e) && !hasSmartImageDropData(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setAssetDragOver(false);
    const raw = e.dataTransfer.getData('application/x-smart-canvas-image');
    if(raw){
        try {
            const payload = JSON.parse(raw);
            if(payload?.url) await addUrlToAssetLibrary(payload.url, payload.name || '');
            return;
        } catch(e) {
            toast('保存资产失败');
            return;
        }
    }
    try {
        const payload = await resolveSmartImageDropPayload(e.dataTransfer);
        if(payload.type === 'files') {
            const uploaded = await uploadFiles(payload.files);
            for(const file of uploaded) if(file?.url) await addUrlToAssetLibrary(file.url, file.name || '');
        } else if(payload.type === 'localPaths') {
            const imported = await importSmartLocalImages(payload.localPaths);
            for(const file of imported) if(file?.url) await addUrlToAssetLibrary(file.url, file.name || '');
        } else if(payload.type === 'url') {
            await addUrlToAssetLibrary(payload.url, smartImageNameFromUrl(payload.url));
        }
    } catch(err) {
        toast(err.message || '保存资产失败');
    }
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartLibraryDropEvents(){
    assetDropZone?.addEventListener('dragover', e => {
        if(hasCanvasImageDrag(e) || hasSmartImageDropData(e.dataTransfer)){
            e.preventDefault();
            e.stopPropagation();
            assetDropZone?.classList.add('drag-over');
        }
    });
    assetDropZone?.addEventListener('dragleave', () => assetDropZone?.classList.remove('drag-over'));
    assetDropZone?.addEventListener('drop', handleAssetPanelDrop);
    assetPanel?.addEventListener('dragover', handleAssetPanelDragOver);
    assetPanel?.addEventListener('dragleave', e => { if(!assetPanel?.contains(e.relatedTarget)) setAssetDragOver(false); });
    assetPanel?.addEventListener('drop', handleAssetPanelDrop);
}
