/* Shared model-specific video duration rules for both editors. */
(function(root){
    function bounds(provider,model,defaults={min:1,max:60,auto:false}){
        const rule=provider?.model_policies?.['video:'+model];
        const configured=Number.isSafeInteger(rule?.duration_min)&&Number.isSafeInteger(rule?.duration_max)&&rule.duration_min>=1&&rule.duration_max>=rule.duration_min;
        return configured ? {min:rule.duration_min,max:rule.duration_max,auto:false,configured:true} : {...defaults,configured:false};
    }
    function clamp(value,range){
        const n=Number(value);
        if(range.auto && n===-1)return -1;
        return Math.max(range.min,Math.min(range.max,Math.round(Number.isFinite(n)&&n>0?n:5)));
    }
    function choices(range,values){
        return [...new Set([range.min,...values,range.max])].filter(n=>n===-1?range.auto:n>=range.min&&n<=range.max).sort((a,b)=>a-b);
    }
    function watch({read,apply,win=window}){
        let pending=false,last=0;
        async function refresh(){
            if(pending || win.document.hidden || Date.now()-last<1000)return;
            pending=true;
            try{apply(await read());last=Date.now();}catch(e){/* Keep the last valid rules during a temporary network failure. */}
            finally{pending=false;}
        }
        const visible=()=>{if(!win.document.hidden)void refresh();};
        const open=event=>{if(event.target.closest?.('.generation-settings-disclosure>summary,.duration-control>.smart-pill'))void refresh();};
        win.addEventListener('focus',visible);
        win.addEventListener('pageshow',visible);
        win.document.addEventListener('visibilitychange',visible);
        win.document.addEventListener('click',open,true);
        return ()=>{win.removeEventListener('focus',visible);win.removeEventListener('pageshow',visible);win.document.removeEventListener('visibilitychange',visible);win.document.removeEventListener('click',open,true);};
    }
    const api={bounds,clamp,choices,watch};
    if(typeof module==='object'&&module.exports)module.exports=api;else root.VideoDurationPolicy=api;
})(typeof window==='undefined'?globalThis:window);
