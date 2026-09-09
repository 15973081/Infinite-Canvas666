/* Shared presentation of server-side Ark accounting; never estimate tokens here. */
(function(root){
    const copy = value => JSON.parse(JSON.stringify(value));
    function isProvider(provider){
        return provider?.id === 'volcengine' || provider?.protocol === 'volcengine';
    }
    function family(model){
        const match = String(model || '').toLowerCase().replaceAll('.', '-').match(/^(?:doubao-)?seedance-(2-5|2-0)(-fast|-mini)?(?:-\d{6})?$/);
        return match ? `seedance-${match[1]}${match[2] || ''}` : '';
    }
    function metadata(result={}){
        if(result.cost?.billing_source !== 'volcengine_usage') return {};
        return {usage:copy(result.usage || {}), video_info:copy(result.video_info || {}), cost:copy(result.cost)};
    }
    function costFor(run={}, log={}, identity={}, providers=[]){
        const saved = log.cost?.billing_source === 'volcengine_usage' ? log.cost : run.cost;
        if(saved?.billing_source === 'volcengine_usage') return copy(saved);
        const provider = providers.find(p => p.id === identity.providerId);
        if(identity.kind !== 'video' || !(identity.providerId === 'volcengine' || isProvider(provider))) return undefined;
        if(log.status === 'failed') return null;
        return {...identity, status:'unknown', source:'actual', reason:'missing_usage', billing_source:'volcengine_usage'};
    }
    function details(log={}){
        const info = log.video_info || {};
        const usage = log.usage || {};
        const cost = log.cost || {};
        if(!log.video_info && cost.billing_source !== 'volcengine_usage') return [];
        return [info.model || info.requested_model,
            info.resolution, info.ratio,
            Number(info.duration) > 0 ? `${info.duration}秒` : '',
            Number(info.framespersecond) > 0 ? `${info.framespersecond}fps` : '',
            typeof info.has_video_input === 'boolean' ? (info.has_video_input ? '含视频输入' : '无视频输入') : '',
            Number.isSafeInteger(usage.completion_tokens) ? `${usage.completion_tokens.toLocaleString('zh-CN')} tokens` : 'token待返回',
            cost.status === 'priced' ? `¥${cost.unit_price}/百万tokens` : '',
        ].filter(Boolean);
    }
    function pendingLabel(cost){
        if(cost?.billing_source !== 'volcengine_usage') return '待定价';
        return ({missing_usage:'待核算：缺少token', missing_video_spec:'待核算：缺少规格',
            missing_price:'待核算：缺少单价', invalid_price:'待核算：单价无效'})[cost?.reason] || '待核算';
    }
    root.VolcengineVideoBilling = {isProvider, family, metadata, costFor, details, pendingLabel};
})(typeof window === 'undefined' ? globalThis : window);
