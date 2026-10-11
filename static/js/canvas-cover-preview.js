/* Covers reference node media; document ownership and saving belong to the editor. */
(() => {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const safeUrl = value => typeof value === 'string' && value.length <= 4096 && /^(https?:\/\/|\/(?!\/))/.test(value) ? value : '';
    const urlOf = value => typeof value === 'string' ? value : value?.url || value?.src || value?.path || '';
    function candidates(nodes){
        return (nodes || []).flatMap((node, order) => {
            if(!node?.id) return [];
            const values = ['image','video'].includes(node.type) ? [[-1,node]] : [];
            values.push(...(Array.isArray(node.images) ? node.images.map((value,index) => [index,value]) : []));
            return values.flatMap(([index,value]) => {
                const url = safeUrl(String(urlOf(value)).trim());
                const explicit = String(value?.kind || value?.mediaKind || value?.type || '').toLowerCase();
                const kind = explicit.includes('video') || /\.(mp4|webm|mov|m4v|ogv|ogg)([?#].*)?$/i.test(url) ? 'video'
                    : explicit === 'image' || /\.(png|jpe?g|webp|gif|avif|bmp|svg)([?#].*)?$/i.test(url) ? 'image' : '';
                const thumbnail = [value?.thumbnail_url,value?.preview_url,value?.thumbnail,value?.poster].find(v=>safeUrl(v) && /\.(png|jpe?g|webp|gif|avif|bmp|svg)([?#].*)?$/i.test(v)) || '';
                return url && kind ? [{node_id:String(node.id),index,kind,url,thumbnail,label:node.title || node.name || `节点 ${order + 1}`}]:[];
            });
        });
    }
    function resolve(nodes, choice){
        const list = candidates(nodes);
        return list.find(item => choice?.node_id === item.node_id && item.index === (choice.index ?? -1))
            || list.find(item => item.kind === 'video') || list[0] || null;
    }
    function mediaMarkup(media){
        const url = safeUrl(media?.url);
        if(!url) return '';
        // Reuse the existing authenticated image/video preview service and queue.
        const local = /^\/(assets|output)\//.test(url);
        const thumbnail=safeUrl(media?.thumbnail);
        const preview = thumbnail || (local ? `/api/media-preview?w=512&url=${encodeURIComponent(url)}` : media.kind==='image' ? url : '');
        if(!preview)return '';
        const source = window.CanvasMediaLoader?.imageAttributes(preview) || `src="${escape(window.MemberMediaUrl?.(preview) || preview)}"`;
        return `<img class="canvas-cover-media" ${source} alt="" loading="lazy" decoding="async">`;
    }
    function markup(item){
        const media = 'nodes' in item ? resolve(item.nodes,item.cover) : item.cover_media;
        const valid = media && safeUrl(media.url), image=valid ? mediaMarkup(media):'';
        return `<div class="studio-canvas-cover${image ? ' has-media':''}" aria-hidden="true">${image}<div class="canvas-cover-copy"><span class="studio-cover-label">${item.kind === 'smart' ? 'ASSISTED':'CLASSIC'} / SHADOX</span><strong class="studio-cover-title">${escape(item.cover?.text || item.title || '未命名画布')}</strong></div>${valid && media.kind==='video' ? '<span class="canvas-cover-kind">VIDEO</span>':''}<span class="canvas-cover-unavailable"${!valid || image ? ' hidden':''}>暂无缩略图</span></div>`;
    }
    function bind(root=document){
        root.querySelectorAll('.canvas-cover-media').forEach(media => {
            if(media.dataset.coverBound) return;
            media.dataset.coverBound='1';
            media.addEventListener('error',()=>{
                if(media.dataset.mediaPriorityPaused === '1') return;
                media.hidden=true;
                const host=media.closest('.studio-canvas-cover');
                host?.classList.remove('has-media');
                host?.querySelector('.canvas-cover-unavailable')?.removeAttribute('hidden');
            });
        });
        window.CanvasMediaLoader?.observe(root);
    }
    window.CanvasCoverPreview=Object.freeze({candidates,resolve,markup,bind,mediaMarkup});
})();
