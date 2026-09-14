/* Bind rendered media requests, which cannot carry fetch's workspace headers. */
(() => {
    'use strict';
    function mediaUrl(value, session=window.CanvasSession, base=location.href) {
        const raw=String(value || '');
        if(!raw || !session?.enabled)return raw;
        let url;try{url=new URL(raw,base);}catch{return '';}
        if(url.origin!==new URL(base).origin || !/^\/(?:assets\/|output\/|api\/media(?:\/|-preview(?:$|\/)))/.test(url.pathname))return raw;
        const context=session.context;
        if(session.paused || !context?.member?.id || !context?.workspace?.id)return '';
        if((url.searchParams.has('workspace') && url.searchParams.get('workspace')!==context.workspace.id) ||
            (url.searchParams.has('member') && url.searchParams.get('member')!==context.member.id))return '';
        url.searchParams.set('workspace',context.workspace.id);url.searchParams.set('member',context.member.id);
        return url.pathname+url.search+url.hash;
    }
    if(typeof module==='object'&&module.exports)module.exports=mediaUrl;else window.MemberMediaUrl=mediaUrl;
})();
