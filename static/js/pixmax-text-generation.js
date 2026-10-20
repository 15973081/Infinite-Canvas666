/* Text generation uses the captured Pixmax form; tasks and permissions stay local. */
(() => {
    'use strict';
    let active, loading;
    const jobs = new WeakMap();
    const runtime = () => loading ||= import('/static/vendor/pixmax/editors.js').then(value => value.canvasSegmentReshoot).catch(error => { loading = null; throw error; });
    const scope = () => JSON.stringify([window.CanvasSession?.context?.member?.id, window.CanvasSession?.context?.workspace?.id]);
    const busy = node => ['submitting', 'queued', 'running'].includes(jobs.get(node)?.status);
    function config(node) {
        const saved = node.textGeneration || {}, preferred=CanvasCore.workspaceModelDefault(pixmaxChatProviders(),'chat'), provider = pixmaxChatProviders().find(p=>p.id===preferred?.provider_id)||pixmaxChatProviders()[0];
        return {...saved, input:saved.input || '', systemPrompt:saved.systemPrompt || '',
            providerId:saved.providerId ?? provider?.id ?? '', model:saved.model ?? (saved.providerId?undefined:preferred?.model) ?? provider?.chat_models?.[0] ?? ''};
    }
    function modelOptions() {
        return pixmaxChatProviders().flatMap(provider => provider.chat_models.map(model => {
            const policy = provider.model_policies?.['chat:' + model];
            return {value:JSON.stringify([provider.id, model]), text:model, subtitle:(provider.name || provider.id)+(provider.workspace_defaults?.chat===model?' · 空间默认':''),
                disabled:policy?.enabled === false, tooltip:policy?.enabled === false ? '此模型已停用' : ''};
        }).filter(option => provider.model_policies?.['chat:' + JSON.parse(option.value)[1]]?.visible !== false));
    }
    function references(node) {
        const incoming = new Set((canvas.connections || []).filter(edge => edge.to === node.id).map(edge => edge.from));
        const entries = [], count = {text:0, image:0, video:0};
        for(const source of nodes.filter(value => incoming.has(value.id))) {
            if(source.type === 'smart-prompt') entries.push({id:source.id, nodeId:source.id, kind:'text', name:source.label || '文本', text:source.text || '', alias:'文本' + (++count.text)});
            for(const [index, media] of (source.images || []).entries()) {
                const kind = mediaKindForItem(media);
                if(!media.url || !['image', 'video'].includes(kind)) continue;
                entries.push({id:index ? source.id + '::' + index : source.id, nodeId:source.id, kind, media,
                    name:media.name || source.label || '素材', alias:(kind === 'image' ? '图片' : '视频') + (++count[kind])});
            }
        }
        return entries;
    }
    function plainPrompt(node, input) {
        const refs = references(node);
        return input.replace(/%%@\[([^\]]*)\]\[(text|image|audio|video)\]\[(\d+)\]\(([^)]+)\)%%/g, (_token, _name, kind, _index, id) => {
            const entry = refs.find(ref => ref.id === id && ref.kind === kind);
            if(!entry) throw Error('引用素材已移除，请重新选择');
            return entry.alias;
        });
    }
    function readable(session) {
        return active === session && !session.closed && session.root.isConnected && canvas === session.canvas &&
            nodes.includes(session.node) && scope() === session.scope && !window.CanvasSession?.paused;
    }
    const editable = session => readable(session) && session.guard.valid() && !isSmartCanvasLocked();
    function dispose() {
        const session = active; if(!session) return;
        active = null; session.closed = true; session.resize?.disconnect(); session.handle?.destroy();
        for(const root of session.roots) root.remove();
        session.root.remove();
    }
    function position() {
        const session = active; if(!session || !readable(session)) return;
        session.handle?.setViewport(viewport);
        const card = world.querySelector(`[data-id="${CSS.escape(session.node.id)}"]`);
        if(!card) { session.root.hidden = true; return; }
        session.root.hidden = false;
        const box = card.getBoundingClientRect(), scale = safeScale(viewport.scale);
        session.root.style.transform = `scale(${scale})`;
        session.root.style.left = (box.left + box.width / 2 - 360 * scale) + 'px';
        session.root.style.top = (box.bottom + 16 * scale) + 'px';
    }
    function formData(session) {
        const node = session.node, value = config(node), options = modelOptions(), chosen = JSON.stringify([value.providerId, value.model]);
        if(!options.some(option => option.value === chosen)) options.push({value:chosen, text:value.model || '未配置文本模型', subtitle:'请配置可用的文本模型', disabled:true});
        const refs = references(node), unavailable = !options.some(option => option.value === chosen && !option.disabled);
        return {
            schema:options.map(option => ({modelCode:option.value, modelName:option.text, filedConfig:[{name:'prompt', type:'text', default:''}]})),
            modelOptions:options, value:{model:chosen, prompt:value.input}, generateLabel:'生成',
            validation:{invalid:unavailable || !value.input.trim(), sourceDetails:{}, summary:[], groups:[]},
            graph:{nodes:[{id:node.id, type:'text-gen', position:{x:node.x, y:node.y}, data:{params:{prompt:value.input, model:chosen}}},
                ...refs.map(ref => ({id:ref.id, type:ref.kind, data:{label:ref.name, text:ref.text,
                    url:ref.media ? displayMediaUrl(ref.media.url) : undefined, thumbnailUrl:ref.kind === 'image' ? smartMediaPreviewUrl(ref.media, 256) : undefined,
                    poster:ref.kind === 'video' ? pixmaxMediaPoster(ref.media) : undefined}}))],
                edges:refs.map(ref => ({id:ref.id + '->' + node.id, source:ref.id, target:node.id}))},
            referenceNames:Object.fromEntries(refs.map(ref => [ref.id, ref.alias + ' · ' + ref.name]))
        };
    }
    function refresh(session) {
        if(!readable(session)) return;
        const next = formData(session), signature = JSON.stringify(next);
        if(signature !== session.signature) { session.signature = signature; session.handle?.setData(next); }
        session.handle?.setDisabled(!editable(session) || busy(session.node));
        for(const root of [session.root, ...session.roots]) for(const editor of root.querySelectorAll('[role="textbox"][contenteditable]')) editor.contentEditable = String(editable(session) && !busy(session.node));
        const status = jobs.get(session.node);
        session.status.textContent = status?.message || (!modelOptions().some(option => !option.disabled) ? CanvasCore.modelUnavailableMessage() : '');
        position();
    }
    function changed(session, value) {
        if(!editable(session)) return;
        const previous = config(session.node), [providerId, model] = JSON.parse(value.model);
        const next = {...previous, providerId, model, input:value.prompt ?? ''};
        if(JSON.stringify(previous) === JSON.stringify(next)) return;
        if(!session.edited) { pushUndo(); session.edited = true; }
        session.node.textGeneration = next; scheduleSave(); refresh(session);
    }
    function status(node, value) {
        jobs.set(node, value);
        if(nodes.includes(node)) refreshSmartNodes([node.id]);
        if(active?.node === node) refresh(active);
    }
    async function submit(session) {
        if(!editable(session) || busy(session.node)) return;
        const node = session.node, value = config(node), selected = JSON.stringify([value.providerId, value.model]);
        if(!modelOptions().some(option => option.value === selected && !option.disabled)) return toast('请选择可用的文本模型');
        if(!value.input.trim()) return;
        try {
            const prompt = plainPrompt(node, value.input), context = pixmaxTextContext(node);
            if(!node.textGeneration) { pushUndo(); node.textGeneration = value; scheduleSave(); }
            const input = JSON.stringify(node.textGeneration), bound = scope();
            status(node, {status:'submitting', message:'正在提交…'});
            await runPixmaxTextTask(node, {...value, ...context, message:[prompt, context.text ? '引用文本：\n' + context.text : ''].filter(Boolean).join('\n\n')},
                text => { node.text = text; }, () => scope() === bound && JSON.stringify(node.textGeneration) === input, text => text,
                {onStatus:task => { if(nodes.includes(node) && scope() === bound) status(node, {status:task.status === 'queued' ? 'queued' : 'running',
                    message:task.status === 'queued' ? '排队中…' : '正在生成文本…', taskId:task.id || task.task_id}); }});
            status(node, {status:'done', message:'文本已更新到节点'});
        } catch(error) { status(node, {status:'error', message:error.message || '文本生成失败', taskId:error.taskId}); }
    }
    function connect(session, id) {
        if(!editable(session)) return;
        const source = nodes.find(node => node.id === id);
        if(!source || source === session.node || !pixmaxCanConnect(source, session.node)) return;
        if((canvas.connections || []).some(edge => edge.from === id && edge.to === session.node.id)) return;
        pushUndo(); canvas.connections ||= []; canvas.connections.push({from:id, to:session.node.id, kind:'input'}); render(); scheduleSave();
    }
    async function sync() {
        const ids = selectedNodeIds(), node = ids.length === 1 ? nodes.find(node => node.id === ids[0]) : null;
        if(node?.type !== 'smart-prompt' || window.CanvasSession?.paused) { dispose(); return; }
        const epoch = window.MemberCanvasEdit?.active?.lease?.epoch;
        if(active && active.node === node && active.epoch === epoch && readable(active)) { refresh(active); return; }
        dispose();
        const root = document.createElement('section'); root.className = 'pixmax-text-generation'; root.setAttribute('aria-label', '文本生成面板');
        const target = document.createElement('div'); target.className = 'pixmax-native-generation-form';
        const message = document.createElement('p'); message.className = 'pixmax-text-generation-status'; message.setAttribute('role', 'status');
        const choose=document.createElement('button');choose.type='button';choose.textContent='搜索 / 切换模型';
        choose.onclick=()=>{const session=active;if(!session||!editable(session)||busy(node))return;const c=config(node);const picker=CanvasCore.openModelPicker({providers:()=>pixmaxChatProviders(),kind:'chat',value:{provider_id:c.providerId,model:c.model},valid:()=>editable(session)&&!busy(node),onSelect:value=>changed(session,{model:JSON.stringify([value.provider_id,value.model]),prompt:config(node).input})});session.roots.add(picker);picker.addEventListener('close',()=>session.roots.delete(picker),{once:true});};
        root.append(choose);
        root.append(target, message); document.body.append(root);
        const session = {node, canvas, epoch, scope:scope(), guard:canvasTaskWriteGuard(node), root, status:message, roots:new Set(), closed:false}; active = session;
        for(const type of ['pointerdown','mousedown','click','dblclick','keydown','wheel','contextmenu']) root.addEventListener(type, event => event.stopPropagation());
        session.resize = new ResizeObserver(position); session.resize.observe(root); position();
        try {
            const api = await runtime(); if(!readable(session)) return;
            const handle = await api.mountGenerationForm(target, {nodeId:node.id, formVariant:'text-gen', data:formData(session), viewport,
                disabled:!editable(session), promptAriaLabel:'文本创作要求', enabledProtocols:['at-mention'], showCamerawork:false,
                subjectApi:{async assetLibraryGroupList(){return {success:true, data:[]};}},
                onChange:value => changed(session, value), onSubmit:() => submit(session), onNotice:toast,
                atMentionPicker:{getModel:() => { const refs = references(node); return {cited:refs.map(ref => ({id:ref.id, type:ref.kind,
                    index:Number(ref.alias.replace(/\D/g, '')) - 1, tokenTitle:ref.name.replace(/[\[\]\r\n]/g, ' '), displayTitle:ref.alias + ' (' + ref.name + ')'})),
                    allowedCategories:['text','image','video'], canvasItems:nodes.filter(source => source !== node && !source.hidden && !refs.some(ref => ref.nodeId === source.id))
                        .map(source => ({id:source.id, category:source.type === 'smart-prompt' ? 'text' : mediaKindForItem(source.images?.[0]), label:source.label || '素材'}))
                        .filter(source => ['text','image','video'].includes(source.category))}; }, connect:id => connect(session, id)},
                graphActions:{removeIncomingEdge(targetId, sourceId) { if(!editable(session) || targetId !== node.id) return;
                    const source = references(node).find(ref => ref.id === sourceId); if(!source) return;
                    pushUndo(); canvas.connections = canvas.connections.filter(edge => !(edge.from === source.nodeId && edge.to === node.id)); render(); scheduleSave(); }},
                onFormRoot(surface, fullscreen) {
                    queueMicrotask(() => {
                        if(!readable(session) || !surface.isConnected) return;
                        for(const root of session.roots) if(!root.isConnected) session.roots.delete(root);
                        if(fullscreen) { const overlay = surface.parentElement; overlay.classList.add('pixmax-native-generation-fullscreen'); session.roots.add(overlay);
                            // Portalled native buttons delegate clicks to document, beyond this overlay.
                            for(const type of ['pointerdown','mousedown','dblclick','keydown','wheel']) overlay.addEventListener(type, event => event.stopPropagation()); }
                        refresh(session);
                    });
                }});
            if(!readable(session)) { handle.destroy(); return; }
            session.handle = handle; refresh(session);
        } catch(error) { if(readable(session)) message.textContent = error.message || '文本面板加载失败，请重新选择节点'; }
    }
    function body(node) {
        const job = jobs.get(node);
        if(!job || job.status === 'done') return '';
        const skeleton = busy(node) ? '<div class="pixmax-text-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' : '';
        return `<div class="pixmax-text-task" role="status">${skeleton}<span>${escapeHtml(job.message)}</span>${job.taskId ? `<small>任务：${escapeHtml(job.taskId)}</small>` : ''}</div>`;
    }
    window.PixmaxTextGeneration = Object.freeze({sync, position, dispose, body, busy, plainPrompt,
        open(node) { smartSelection.panelTarget(node.id); syncSelectionUi(); void sync(); }});
    window.addEventListener('resize', position);
    window.addEventListener('member-session:paused', dispose);
    window.addEventListener('pagehide', dispose);
    window.addEventListener('pageshow', () => { void sync(); });
})();
