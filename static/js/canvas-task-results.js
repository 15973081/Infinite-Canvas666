/* A late task response cannot mutate another canvas, member, or edit generation. */
(() => {
    'use strict';
    function capture(win=window) {
        if(!win.CanvasSession?.enabled) return () => true;
        const entry=win.MemberCanvasEdit?.active, epoch=entry?.lease.epoch, generation=entry?.lease.generation;
        const allowed=Boolean(entry?.lease.canEdit), member=entry?.memberId, workspace=entry?.workspaceId;
        return () => Boolean(allowed && entry===win.MemberCanvasEdit?.active && entry.lease.epoch===epoch &&
            entry.lease.generation===generation && entry.lease.canEdit && !win.CanvasSession.paused &&
            win.CanvasSession.context?.member.id===member && win.CanvasSession.context?.workspace.id===workspace);
    }
    const api={capture};
    if(typeof module==='object' && module.exports) module.exports=api;
    else window.CanvasTaskResults=api;
})();
