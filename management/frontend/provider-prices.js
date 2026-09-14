/* Management-only edits of desired current prices; the server owns history. */
(() => {
    function update(item,index,resolution,hasVideo,value) {
        if(item.id!=='volcengine' && item.protocol!=='volcengine')return;
        const model=String(item.video_models?.[index]||'').trim();
        if(!model)return;
        const text=String(value).trim();
        if(text!=='' && (!/^\d+(?:\.\d{1,6})?$/.test(text) || !Number.isFinite(Number(text))))
            throw new Error('单价需为非负数，最多保留六位小数。');
        item.model_prices=(item.model_prices||[]).filter(p=>!(p.model===model && p.kind==='video'
            && p.billing_type==='per_million_tokens' && p.resolution===resolution && p.has_video_input===hasVideo
            && (p.service_tier||'default')==='default' && !Number(p.effective_to)));
        if(text!=='')item.model_prices.push({kind:'video',model,billing_type:'per_million_tokens',resolution,
            has_video_input:hasVideo,service_tier:'default',unit_price:text,currency:'CNY',effective_from:0,effective_to:0});
    }
    window.ManagementProviderPrices=Object.freeze({update});
})();
