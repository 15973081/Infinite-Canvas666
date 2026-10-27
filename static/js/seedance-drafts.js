/* Draft identity belongs to the generated video, never to current prompt settings. */
(function(root){
    function supported(provider, model){
        if(!String(model || '').replaceAll('.', '-').includes('seedance-2-5')) return false;
        if(typeof provider?.seedance_draft === 'boolean') return provider.seedance_draft;
        try {
            const url = new URL(provider?.base_url || '');
            return (provider?.protocol === 'volcengine' || provider?.id === 'volcengine') &&
                String(model || '').replaceAll('.', '-').includes('seedance-2-5') &&
                url.protocol === 'https:' && url.hostname === 'ark.cn-beijing.volces.com' &&
                ['', '/api/v3'].includes(url.pathname.replace(/\/$/, ''));
        } catch { return false; }
    }
    function available(draft, now=Date.now()){
        return Boolean(draft?.source_task_id && draft?.task_id && Number(draft.expires_at) * 1000 > now);
    }
    function metadata(result={}){
        return {...(result.seedance_draft ? {seedance_draft:{...result.seedance_draft}} : {}),
            ...(result.draft_source_task_id ? {draft_source_task_id:result.draft_source_task_id} : {})};
    }
    function upgradePayload(draft){
        if(!available(draft)) throw new Error('样片已过期或缺少任务信息，请重新生成。');
        return {prompt:'样片升级为 1080p 正式视频', provider_id:draft.provider_id, model:draft.model,
            resolution:'1080p', draft_source_task_id:draft.source_task_id};
    }
    root.SeedanceDrafts = {supported, available, metadata, upgradePayload};
})(typeof window === 'undefined' ? globalThis : window);
