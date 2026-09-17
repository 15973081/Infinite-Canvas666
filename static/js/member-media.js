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
    function download(value, filename, win=window){
        if(!win.CanvasSession?.enabled)return false;
        const url=new URL(String(value || ''),win.location.href);
        if(url.origin!==new URL(win.location.href).origin || !/^\/(?:assets\/|output\/|api\/media\/)/.test(url.pathname))return false;
        if(!win.CanvasSession.context?.workspace?.permissions?.includes('canvas.export'))throw new Error('当前账号没有导出权限。');
        const href=mediaUrl(value,win.CanvasSession,win.location.href);
        if(!href)throw new Error('页面身份已变化，请重新打开画布后下载。');
        // Navigate as the read-only viewer does. A cloud storage redirect need
        // not permit fetch/CORS, and large files need not be buffered in JS.
        const link=win.document.createElement('a');
        link.href=href;link.download=filename || 'download';link.target='_blank';link.rel='noopener';
        win.document.body.appendChild(link);
        try{link.click();}finally{link.remove();}
        return true;
    }
    mediaUrl.download=download;
    if(typeof module==='object'&&module.exports)module.exports=mediaUrl;
    else {window.MemberMediaUrl=mediaUrl;window.MemberMediaDownload=download;}

})();
