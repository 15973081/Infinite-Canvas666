/* One CORS-approved, decoded original per editor session. Never changes signed URLs. */
(() => {
    'use strict';
    function create(win) {
        let current=null;
        function clear() {
            if(!current)return;
            current.controller.abort();
            if(current.url)win.URL.revokeObjectURL(current.url);
            current=null;
        }
        function load(source, {retry=false}={}) {
            const bound=win.MemberMediaUrl ? win.MemberMediaUrl(source) : source;
            if(!bound){clear();return Promise.reject(new Error('页面身份已变化，请重新打开素材。'));}
            if(!retry && current?.source===bound && current.state!=='failed')return current.promise;
            clear();
            const entry={source:bound,controller:new win.AbortController(),state:'loading',url:''};
            current=entry;
            entry.promise=(async()=>{
                try {
                    // Ignore old no-CORS browser cache entries, including cached redirects.
                    // CORS is still enforced; missing permission is never bypassed.
                    const response=await win.fetch(bound,{mode:'cors',credentials:'same-origin',cache:'reload',signal:entry.controller.signal});
                    if(!response.ok)throw new Error(`原图加载失败（${response.status}），请重试。`);
                    const blob=await response.blob();
                    if(current!==entry)throw new win.DOMException('Editor closed','AbortError');
                    entry.url=win.URL.createObjectURL(blob);
                    const image=new win.Image();image.crossOrigin='anonymous';
                    await new Promise((resolve,reject)=>{
                        const abort=()=>{image.onload=null;image.onerror=null;image.removeAttribute('src');reject(new win.DOMException('Editor closed','AbortError'));};
                        const finish=callback=>{entry.controller.signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;callback();};
                        image.onload=()=>finish(resolve);
                        image.onerror=()=>finish(()=>reject(new Error('原图无法解码，请确认素材仍可访问后重试。')));
                        entry.controller.signal.addEventListener('abort',abort,{once:true});
                        image.src=entry.url;
                    });
                    if(current!==entry)throw new win.DOMException('Editor closed','AbortError');
                    entry.state='ready';
                    return {source:bound,url:entry.url,image};
                } catch(error) {
                    entry.state='failed';
                    if(entry.url){win.URL.revokeObjectURL(entry.url);entry.url='';}
                    throw error;
                }
            })();
            return entry.promise;
        }
        return {load,clear};
    }
    if(typeof module==='object' && module.exports)module.exports={create};
    else window.CanvasEditableImage={create};
})();
