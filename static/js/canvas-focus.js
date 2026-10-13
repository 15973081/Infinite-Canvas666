/* Window-sized canvas focus mode: no navigation, reload or document writes. */
(() => {
    const host=document.querySelector('#pixmaxSettingsMenu') || document.querySelector('#quickToolbar') || document.querySelector('#smartWorkflowToggle')?.parentElement;
    if(!host) return;
    const button=document.createElement('button');
    button.type='button';button.className='tool-btn canvas-focus-toggle';
    const smart=Boolean(document.getElementById('smartWorkflowToggle'));
    if(smart) button.classList.add('smart-focus-toggle');
    const expand='<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>';
    const shrink='<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>';
    let active=false,parentDoc=null,parentWin=null;
    function update(){
        button.title=active?'退出全屏（Esc）':'全屏画布';
        button.setAttribute('aria-label',active?'退出全屏':'全屏画布');
        button.setAttribute('aria-pressed',String(active));
        button.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(active?shrink:expand)+'</svg>';
        if(host.id==='pixmaxSettingsMenu')button.insertAdjacentHTML('beforeend','<span>'+(active?'退出全屏':'全屏画布')+'</span>');
    }
    function setFocus(value){
        active=value;
        document.documentElement.classList.toggle('canvas-focus-mode',active);
        if(parentDoc){
            parentDoc.documentElement.classList.toggle('canvas-focus-host',active);
            if(active) parentWin.addEventListener('keydown',escape,true);
            else parentWin.removeEventListener('keydown',escape,true);
        }
        update();
        window.dispatchEvent(new Event('resize'));
    }
    function modalVisible(doc){
        return Array.from(doc.querySelectorAll('dialog[open],[role="dialog"],[class*="modal"],[class*="lightbox"]')).some(el=>{
            if(el.getAttribute('aria-hidden')==='true') return false;
            const style=doc.defaultView.getComputedStyle(el);
            return style.display!=='none' && style.visibility!=='hidden' && el.getClientRects().length>0;
        });
    }
    function escape(event){
        if(!active || event.key!=='Escape' || event.defaultPrevented || modalVisible(document) || (parentDoc && modalVisible(parentDoc))) return;
        event.preventDefault();event.stopImmediatePropagation();setFocus(false);button.focus();
    }
    try {
        if(window.parent!==window && window.frameElement?.id==='frame-canvas'){
            parentWin=window.parent;parentDoc=parentWin.document;
        }
    } catch(_) {}
    button.addEventListener('click',event=>{event.stopPropagation();setFocus(!active);});
    button.addEventListener('mousedown',event=>event.stopPropagation());
    window.addEventListener('keydown',escape,true);
    window.addEventListener('pagehide',()=>setFocus(false));
    document.getElementById('backToManagerBtn')?.addEventListener('click',()=>setFocus(false));
    update();host.append(button);
})();
