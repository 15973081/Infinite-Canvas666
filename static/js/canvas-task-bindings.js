/* Shared semantic input protocol v3. Receipts are evidence, never edit permission. */
(() => {
    'use strict';
    const NODE_DISPLAY=new Set(['x','y','w','h','width','height','scale','selected','expanded','collapsed',
        'running','queued','pending','pendingTasks','_pending','runStatus','runError','_cascadeIdx','_cascadeFailed',
        'runStartedAt','runFinishedAt','runElapsedMs','runTimerHidden','updated_at']);
    const MEDIA_DISPLAY=new Set(['w','h','width','height','preview_url','thumbnail','thumbnail_url','viewed']);
    const EDGE_DISPLAY=new Set(['id','selected','hovered','color']);
    const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
    const invalid=()=>{throw new Error('画布输入格式无法核对，请检查后重试。');};
    function unicodeCompare(a,b) {
        const left=Array.from(a),right=Array.from(b);
        for(let i=0;i<Math.min(left.length,right.length);i++){
            const delta=left[i].codePointAt(0)-right[i].codePointAt(0);
            if(delta)return delta;
        }
        return left.length-right.length;
    }
    function portableValue(value) {
        if(value===null)return ['null'];
        if(typeof value==='boolean')return ['bool',value];
        if(typeof value==='number'){
            if(!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))invalid();
            const bytes=new Uint8Array(8);
            new DataView(bytes.buffer).setFloat64(0,value===0?0:value,false);
            return ['number',Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')];
        }
        if(typeof value==='string'){
            for(const char of value){const code=char.codePointAt(0);if(code>=0xd800 && code<=0xdfff)invalid();}
            return ['string',value];
        }
        if(Array.isArray(value))return ['array',Array.from(value,portableValue)];
        if(object(value) && Object.prototype.toString.call(value)==='[object Object]'){
            return ['object',Object.keys(value).sort(unicodeCompare).map(key=>[portableValue(key)[1],portableValue(value[key])])];
        }
        invalid();
    }
    const canonical=value=>JSON.stringify(portableValue(value));
    const without=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.has(key)));
    // Match the existing server's empty optional JSON fields, including []/{}.
    const optional=(value,fallback)=>value==null || value===false || value===0 || value==='' ||
        (Array.isArray(value) && !value.length) || (object(value) && !Object.keys(value).length) ? fallback : value;
    function semanticMedia(value) {
        if(Array.isArray(value))return value.map(semanticMedia);
        if(object(value)){
            const local=typeof value.url==='string' && /^\/(?:assets\/cloud|api\/media)\/ast_[A-Za-z0-9_-]+(?:\/|$)/.test(value.url);
            return Object.fromEntries(Object.entries(value).filter(([key])=>!(key==='media_asset_id' && local)).map(([key,item])=>[key,semanticMedia(item)]));
        }
        return value;
    }
    function nodeInput(node) {
        const result=without(node,NODE_DISPLAY);
        for(const key of ['images','refs','runInputRefs','runPromptRefs']){
            if(Array.isArray(result[key]))result[key]=result[key].map(item=>object(item)?without(item,MEDIA_DISPLAY):item);
        }
        return semanticMedia(result);
    }
    function graphValue(document,sourceId,targetId) {
        if(!object(document))invalid();
        const rawNodes=optional(document.nodes,[]),rawEdges=optional(document.connections,[]);
        if(!Array.isArray(rawNodes) || !Array.isArray(rawEdges) || rawNodes.length>20000 || rawEdges.length>100000)invalid();
        const nodes=new Map(),incoming=new Map();
        for(const node of rawNodes){
            if(!object(node) || typeof node.id!=='string')continue;
            if(nodes.has(node.id))invalid();
            nodes.set(node.id,node);
        }
        if(!nodes.has(sourceId) || !nodes.has(targetId))invalid();
        for(const edge of rawEdges){
            if(!object(edge) || typeof edge.from!=='string' || typeof edge.to!=='string')continue;
            if(!incoming.has(edge.to))incoming.set(edge.to,[]);
            incoming.get(edge.to).push(edge);
        }
        const visited=new Set(),edges=[],pending=[sourceId,targetId];
        while(pending.length){
            const id=pending.pop();
            if(visited.has(id))continue;
            if(!nodes.has(id))invalid();
            visited.add(id);
            const node=nodes.get(id);
            if(['group','promptGroup'].includes(node.type)){
                const items=optional(node.items,[]);
                if(!Array.isArray(items))invalid();
                for(const item of items)if(typeof item==='string')pending.push(item);
            }
            (incoming.get(id)||[]).forEach((edge,position)=>{
                edges.push({position,connection:without(edge,EDGE_DISPLAY)});pending.push(edge.from);
            });
        }
        edges.sort((a,b)=>unicodeCompare(a.connection.to,b.connection.to)||a.position-b.position);
        return {nodes:Array.from(visited).sort(unicodeCompare).map(id=>nodeInput(nodes.get(id))),
            connections:edges,settings:optional(document.settings,{})};
    }
    const graphCanonical=(document,sourceId,targetId)=>canonical(graphValue(document,sourceId,targetId));
    async function sha256(text,crypto=globalThis.crypto) {
        if(!crypto?.subtle)throw new Error('当前浏览器无法安全核对生成输入，请使用 HTTPS 或本机地址。');
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
        return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    }
    const graphFingerprint=(document,sourceId,targetId,crypto)=>sha256(graphCanonical(document,sourceId,targetId),crypto);
    function operation({canvasId,kind,sourceId,targetId,read,valid,flush,revision,crypto}) {
        // read() must return the same JSON projection used by save, including
        // any current unsaved edits. Callers additionally retain node identities.
        let expected=graphCanonical(read(),sourceId,targetId),paused=false,submitted=false,prepared=null;
        const receipts=new Map();
        const pause=()=>{
            paused=true;
            const error=new Error(submitted?'生成输入或编辑资格已变化，结果保留在生成结果列表，请确认后加入。':'生成输入或编辑资格已变化，请确认当前内容后重新生成。');
            error.resultPending=true;error.inputChanged=true;error.submitted=submitted;return error;
        };
        const check=()=>{
            if(paused || !valid())throw pause();
            try {if(graphCanonical(read(),sourceId,targetId)!==expected)throw pause();}
            catch(error){if(error?.inputChanged)throw error;throw pause();}
        };
        function mutate(apply) {
            check();
            try {
                const result=apply();
                if(result?.then)throw new Error('Input-bound mutations must be synchronous');
                expected=graphCanonical(read(),sourceId,targetId);
                return result;
            } catch(error){const stopped=pause();stopped.cause=error;throw stopped;}
        }
        function receipt(task) {
            const binding=task?.canvas_binding,id=task?.task_id||task?.id;
            if(!prepared || !id || binding?.version!==3 || binding.canvas_id!==canvasId || binding.canvas_kind!==kind ||
                binding.source_node_id!==sourceId || binding.target_node_id!==targetId ||
                binding.submitted_revision!==prepared.base_revision || binding.graph_sha256!==prepared.input_sha256 ||
                !/^[0-9a-f]{64}$/.test(binding.request_sha256||''))throw pause();
            return {id,key:canonical(binding)};
        }
        function verify(task,expectedTaskId) {
            check();
            const saved=receipt(task);
            if((expectedTaskId && saved.id!==expectedTaskId) || receipts.get(saved.id)!==saved.key)throw pause();
            return saved;
        }
        return {
            check,pause,mutate,verify,
            async prepare() {
                check();
                if(submitted)throw new Error('生成任务已提交，不能重新绑定输入。');
                prepared=null;
                if(!await flush())throw new Error('画布尚未保存成功，请保存后再生成。');
                check();
                const savedRevision=revision(),hash=await sha256(expected,crypto);
                check();
                if(!Number.isSafeInteger(savedRevision) || savedRevision<1 || savedRevision!==revision())throw pause();
                prepared=Object.freeze({source_node_id:sourceId,target_node_id:targetId,base_revision:savedRevision,input_sha256:hash});
                return {...prepared};
            },
            beginSubmission() {
                check();
                if(!prepared || prepared.base_revision!==revision())throw pause();
                submitted=true;
            },
            remember(task) {
                check();
                if(!submitted)throw pause();
                const saved=receipt(task),existing=receipts.get(saved.id);
                if(existing && existing!==saved.key)throw pause();
                receipts.set(saved.id,saved.key);
            },
            apply(task,write,expectedTaskId) {
                const saved=verify(task,expectedTaskId);
                // No await between input/receipt verification and the write. Advance
                // only after this batch's own write, so later siblings remain valid.
                const result=mutate(write);
                receipts.delete(saved.id);
                return result;
            }
        };
    }
    const api={portableValue,canonical,graphCanonical,graphFingerprint,operation};
    if(typeof module==='object' && module.exports)module.exports=api;
    else window.CanvasTaskBindings=api;
})();
