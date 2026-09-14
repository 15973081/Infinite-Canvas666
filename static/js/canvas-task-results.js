/* A late task response cannot mutate another canvas, member, or edit generation. */
(() => {
    'use strict';
    function capture(win=window) {
        if(!win.CanvasSession?.enabled) return () => true;
        const entry=win.MemberCanvasEdit?.active, epoch=entry?.lease?.epoch, generation=entry?.lease?.generation;
        const allowed=Boolean(entry?.lease?.canEdit), member=entry?.memberId, workspace=entry?.workspaceId;
        return () => Boolean(allowed && win.CanvasSession?.enabled && entry===win.MemberCanvasEdit?.active && entry.lease?.epoch===epoch &&
            entry.lease?.generation===generation && entry.lease?.canEdit && !win.CanvasSession?.paused &&
            win.CanvasSession?.context?.member?.id===member && win.CanvasSession?.context?.workspace?.id===workspace);
    }
    function pending() {
        const error=new Error('画布或编辑资格已变化，已提交任务的结果保留在生成结果列表。');
        error.resultPending=true;return error;
    }
    function guard(targets, read, win=window) {
        const validSession=capture(win), original=read();
        let paused=false;
        const valid=()=>{
            if(paused || !validSession())return false;
            const current=read();
            return !win.CanvasSession?.enabled || (current.canvas===original.canvas && targets.every(node=>node && current.nodes.includes(node)));
        };
        const pause=()=>{paused=true;return pending();};
        return {valid,pause,check(){if(!valid())throw pause();}};
    }
    const api={capture,guard,pending};
    if(typeof module==='object' && module.exports) module.exports=api;
    else window.CanvasTaskResults=api;
})();
