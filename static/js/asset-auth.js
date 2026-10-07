/* Shared readiness policy for cached canvas bindings and current library records. */
(function(root){
    const indexes = new WeakMap();
    function registrationPlatform(provider){
        if(provider?.avatar_registration) return provider.avatar_registration.platform === 'volcengine' ? 'volcengine' : '';
        return String(provider?.protocol || '').toLowerCase() === 'volcengine' || provider?.id === 'volcengine' ? 'volcengine' : '';
    }
    function registrationReady(provider){
        if(!provider || provider.enabled === false || !registrationPlatform(provider)) return false;
        if(provider.avatar_registration) return provider.avatar_registration.supported === true && provider.avatar_registration.credentials_configured === true;
        // Older local configuration may omit readiness flags; the server still
        // validates AK/SK. A generation API Key is not an asset credential.
        return provider.has_volcengine_access_key !== false && provider.has_volcengine_secret_key !== false;
    }
    function registrationProvider(providers){
        const candidates = (providers || []).filter(p => p && p.enabled !== false && registrationPlatform(p));
        return candidates.find(registrationReady) || candidates[0];
    }
    function findItem(libraries, ref={}){
        const cached = ref.asset_uris?.volcengine;
        let byUri, byUrl;
        for(const library of libraries || []){
            let index = indexes.get(library);
            if(!index){
                index = {ids:new Map(), uris:new Map(), urls:new Map()};
                for(const category of library.categories || []) for(const item of category.items || []){
                    if(item.id) index.ids.set(item.id, item);
                    const reg = item.registrations?.volcengine;
                    const uri = reg?.asset_uri || (reg?.asset_id || reg?.task_id ? `asset://${reg.asset_id || reg.task_id}` : '');
                    if(uri) index.uris.set(uri, item);
                    if(item.url && !index.urls.has(item.url)) index.urls.set(item.url, item);
                }
                indexes.set(library,index);
            }
            if(ref.asset_item_id && index.ids.has(ref.asset_item_id)) return index.ids.get(ref.asset_item_id);
            if(cached && index.uris.has(cached)) byUri = index.uris.get(cached);
            if(!byUrl && index.urls.has(ref.originalLocalUrl || ref.url)) byUrl = index.urls.get(ref.originalLocalUrl || ref.url);
        }
        return byUri || (!cached && !ref.asset_item_id ? byUrl : null);
    }
    function resolve(ref={}, item=null, provider=null){
        const cached = ref.asset_uris || {};
        const reg = item?.registrations?.volcengine;
        let status = reg ? String(reg.status || 'Missing') : String(ref.face_auth_status || (cached.volcengine ? 'Active' : ''));
        if(item && !reg && cached.volcengine) status = 'Missing';
        // A local in-flight/failed operation must not reuse a previous Active record.
        if(ref.face_auth_status && ref.face_auth_status !== 'Active' && status === 'Active') status = ref.face_auth_status;
        const uri = String(reg ? reg.asset_uri || '' : cached.volcengine || '').trim();
        const providerId = String(reg?.provider_id || cached.volcengine_provider_id || 'volcengine');
        const project = String(reg?.project_name || cached.volcengine_project_name || 'default').trim();
        if(status === 'Active' && !uri.startsWith('asset://')) status = 'Missing';
        if(status && provider && (providerId !== provider.id || project !== String(provider.volcengine_project_name || 'default').trim())){
            status = 'ScopeMismatch';
        }
        const uris = status === 'Active' ? {volcengine:uri,volcengine_provider_id:providerId,volcengine_project_name:project} : {};
        return {status,uris,ready:status === 'Active',blocked:Boolean(status && status !== 'Active')};
    }
    function error(status){
        if(status === 'ScopeMismatch') return '认证素材属于其他供应商或项目，请切回对应配置，或为目标项目新建素材后认证。';
        if(['Queued','Uploading','Processing'].includes(status)) return '素材仍在认证中，请等待认证通过后再生成。';
        if(status === 'Failed' || status === 'Cancelled') return '素材认证已失败或取消，请重新认证后再生成。';
        return '素材认证绑定已失效，请重新认证后再生成。';
    }
    const api = {findItem,resolve,error,registrationPlatform,registrationReady,registrationProvider};
    root.CanvasAssetAuth = api;
    if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
