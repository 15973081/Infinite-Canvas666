/* A plain link opens the independent site with its own login and permissions. */
(() => {
    async function loadEntry() {
        const link=document.getElementById('management-entry');
        if(!link)return;
        try {
            const response=await fetch('/api/management-entry',{cache:'no-store'});
            const data=await response.json();
            if(!response.ok || !data.url)return;
            const url=new URL(data.url);
            if(url.username || url.password || url.search || url.hash || url.pathname!=='/')return;
            if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return;
            link.href=url.href;
            link.hidden=false;
        } catch (_) {}
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadEntry,{once:true});
    else loadEntry();
})();
