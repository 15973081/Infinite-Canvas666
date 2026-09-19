/* Visible thumbnails share a small queue; explicit previews suspend that queue. */
(() => {
    'use strict';
    function create(win, limit=4) {
        const doc=win.document, entries=new Map(), owners=new Set(), viewers=new Map();
        let active=0, deferred=[];
        const escape=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
        const observer=win.IntersectionObserver ? new win.IntersectionObserver(changes=>{
            changes.forEach(({target,isIntersecting})=>{const e=entries.get(target);if(e)e.visible=isIntersecting;});
            pump();
        }, {rootMargin:'120px'}) : null;
        function finish(e) {
            if(e.state!=='loading' || !e.img.hasAttribute('src') || !e.img.complete) return;
            e.state='done';active--;pump();
        }
        function prune() {
            for(const [img,e] of entries){
                if(img.isConnected)continue;
                if(e.state==='loading'){
                    active--;e.state='discarded';img.dataset.mediaPriorityPaused='1';
                    img.removeAttribute('src');
                }
                img.removeEventListener('load',e.finish);img.removeEventListener('error',e.finish);
                observer?.unobserve(img);entries.delete(img);
            }
        }
        function pump() {
            prune();
            if(owners.size || doc.hidden)return;
            for(const e of entries.values()){
                if(active>=limit)break;
                if(e.state!=='queued' || !e.visible)continue;
                const url=win.MemberMediaUrl ? win.MemberMediaUrl(e.url) : e.url;
                if(!url){e.state='blocked';continue;}
                e.state='loading';active++;
                delete e.img.dataset.mediaPriorityPaused;
                e.img.loading='eager';e.img.fetchPriority='low';e.img.decoding='async';
                e.img.src=url;
            }
        }
        function observe(root=doc, schedule=true) {
            const images=[...(root.querySelectorAll?.('img[data-canvas-media-src]') || [])];
            if(root.matches?.('img[data-canvas-media-src]'))images.push(root);
            for(const img of images){
                if(entries.has(img))continue;
                const e={img,url:img.dataset.canvasMediaSrc,state:'queued',visible:!observer};
                e.finish=()=>finish(e);entries.set(img,e);
                img.addEventListener('load',e.finish);img.addEventListener('error',e.finish);
                observer?.observe(img);
            }
            if(schedule)pump();
        }
        function begin(owner) {
            // Switching items reuses the same modal; dispose its old status hooks.
            if(owners.has(owner)){
                for(const dispose of viewers.values())dispose();
                viewers.clear();
            }
            owners.add(owner);
            for(const e of entries.values()){
                if(e.state!=='loading')continue;
                // Suppress ordinary thumbnail error fallbacks for intentional cancellation.
                e.img.dataset.mediaPriorityPaused='1';e.state='queued';active--;
                e.img.removeAttribute('src');
            }
        }
        function end(owner) {
            owners.delete(owner);
            if(owners.size)return;
            for(const dispose of viewers.values())dispose();
            viewers.clear();pump();flushDeferred();
        }
        function flushDeferred() {
            if(owners.size || doc.hidden)return;
            const jobs=deferred;deferred=[];
            jobs.forEach(job=>Promise.resolve().then(job).catch(error=>win.console?.warn('Background canvas load failed',error)));
        }
        function defer(job) { deferred.push(job);win.setTimeout(flushDeferred,1000); }
        function unwatch(media) { viewers.get(media)?.();viewers.delete(media); }
        function watch(media, host=media.parentElement, original='', options={}) {
            unwatch(media);
            const box=doc.createElement('div'),label=doc.createElement('span'),retry=doc.createElement('button');
            box.className='canvas-media-status';box.setAttribute('role','status');
            box.style.cssText='position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:90;padding:8px 12px;border-radius:8px;background:#202630eF;color:white;font:13px sans-serif;max-width:90%;text-align:center';
            retry.type='button';retry.textContent='重试';retry.hidden=true;
            retry.style.cssText='margin-left:10px;cursor:pointer;color:inherit;text-decoration:underline';
            box.append(label,retry);host?.append(box);
            const show=text=>{label.textContent=text;box.hidden=false;};
            show('正在加载素材…');
            const loaded=()=>{box.hidden=true;retry.hidden=true;media.style.visibility='';};
            const failed=()=>{media.style.visibility='hidden';show('素材加载失败，请重试');retry.hidden=false;};
            const waiting=()=>show('正在缓冲…');
            retry.onclick=event=>{
                event.stopPropagation();
                if(options.retry){options.retry();return;}
                const raw=media.getAttribute('src');
                const url=win.MemberMediaUrl ? win.MemberMediaUrl(raw) : raw;
                if(!url)return;
                media.style.visibility='';retry.hidden=true;show('正在加载素材…');
                media.removeAttribute('src');media.src=url;
                if(media.tagName!=='IMG')media.load();
            };
            media.fetchPriority='high';media.loading='eager';media.style.visibility='';
            if(media.tagName!=='IMG'){
                media.preload='auto';media.removeAttribute('poster');
                // Reuse only a finished poster already shown on this canvas.
                // Opening a video must not start another poster-generation job.
                const cached=[...entries.values()].find(e=>original && e.img.dataset.originalSrc===original && e.img.complete && e.img.naturalWidth);
                if(cached)media.poster=cached.img.currentSrc || cached.img.getAttribute('src');
            }
            media.addEventListener('load',loaded);media.addEventListener('loadeddata',loaded);
            media.addEventListener('playing',loaded);media.addEventListener('error',failed);media.addEventListener('waiting',waiting);
            const timer=win.setTimeout(()=>{if(!box.hidden && !retry.hidden)return;if(!box.hidden){show('加载较慢，可稍候或重试');retry.hidden=false;}},15000);
            viewers.set(media,()=>{
                win.clearTimeout(timer);box.remove();media.style.visibility='';
                media.removeEventListener('load',loaded);media.removeEventListener('loadeddata',loaded);
                media.removeEventListener('playing',loaded);media.removeEventListener('error',failed);media.removeEventListener('waiting',waiting);
            });
        }
        const mutation=win.MutationObserver ? new win.MutationObserver(records=>{
            for(const record of records)for(const node of record.addedNodes)observe(node,false);
            pump();
        }) : null;
        mutation?.observe(doc.body,{childList:true,subtree:true});
        doc.addEventListener('visibilitychange',()=>{pump();flushDeferred();});
        return {imageAttributes:url=>`data-canvas-media-src="${escape(url)}"`,observe,begin,end,watch,unwatch,defer};
    }
    if(typeof module==='object' && module.exports)module.exports={create};
    else window.CanvasMediaLoader=create(window);
})();
