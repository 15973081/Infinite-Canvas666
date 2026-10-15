(function(){
    // Layout follows the CSS viewport. Browser/OS zoom and canvas zoom remain native.
    document.documentElement.classList.add('studio-theme-dark', 'theme-dark');
    const SCALE_KEY = 'studio_ui_scale_mode';
    function applyDisplay(){
        document.body?.classList.add('studio-theme-dark', 'theme-dark');
        document.getElementById('studio-scale-style')?.remove();
        document.documentElement.classList.remove('studio-ui-scaled', 'studio-scale-managed');
        document.body?.classList.remove('studio-scale-host', 'studio-scale-viewport');
        document.documentElement.style.setProperty('--studio-ui-scale', '1.000');
        try { localStorage.removeItem(SCALE_KEY); } catch (_) {}
        window.dispatchEvent(new CustomEvent('studio-ui-scale-change', {detail:{mode:'100',scale:1}}));
    }
    // Older embedded pages can still call the API, but cannot re-enable page scaling.
    window.StudioScale = {
        key:SCALE_KEY, options:['100'], getMode:()=>'100', getScale:()=>1,
        apply:applyDisplay, set:applyDisplay
    };
    applyDisplay();
    document.addEventListener('DOMContentLoaded', applyDisplay);
    window.StudioFrameMessages.subscribe(['studio-ui-scale'], applyDisplay);
    window.addEventListener('storage', event => {
        if(event.key === SCALE_KEY) applyDisplay();
    });
})();
