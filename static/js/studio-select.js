/* Opt-in select skin: the original control remains the source of business values. */
(() => {
    'use strict';
    if(window.StudioSelect)return;
    const controls = new Map();
    const scopes = new WeakMap();
    let nextId=0;
    let opened = null;
    const node = (tag, cls) => { const el = document.createElement(tag); el.className = cls; return el; };
    function enhance(select) {
        if (controls.has(select) || select.multiple || select.size>1 || !HTMLElement.prototype.showPopover) return;
        const labelCopy=select.labels?.[0]?.cloneNode(true);
        labelCopy?.querySelectorAll('select,input,button,textarea').forEach(el=>el.remove());
        const label = select.dataset.selectLabel || select.getAttribute('aria-label') || labelCopy?.textContent.trim() || select.title || '选择选项';
        const id=select.id||'studio-select-'+(++nextId);
        const wrap = node('div', 'studio-select'), trigger = node('button', 'studio-select-trigger');
        const text = node('span', 'studio-select-value'), arrow = icon('chevron-down');arrow.classList.add('studio-select-arrow');
        trigger.type = 'button'; trigger.id = id + '-trigger';
        trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-label', label);
        trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
        arrow.setAttribute('aria-hidden', 'true'); trigger.append(text, arrow);
        const menu = node('div', 'studio-select-menu'), list = node('div', 'studio-select-list');
        menu.hidden = true; menu.popover='manual'; list.id = id + '-options'; list.tabIndex = -1;
        list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
        trigger.setAttribute('aria-controls', list.id);
        const search = select.dataset.selectSearch !== undefined ? node('input', 'studio-select-search') : null;
        if (search) {
            search.type = 'search'; search.placeholder = '搜索' + label;
            search.setAttribute('aria-label', '搜索' + label); search.setAttribute('aria-controls', list.id);
            search.autocomplete = 'off'; menu.append(search);
        }
        menu.append(list);
        const oldTab=select.getAttribute('tabindex'),oldAria=select.getAttribute('aria-hidden');
        select.before(wrap); wrap.append(select, trigger, menu);
        select.classList.add('studio-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
        let active = -1, options = [], typed = '', typedAt = 0;
        const restorers=[],optionHooks=new Map();
        function watchProperty(target,prototype,key){
            const own=Object.getOwnPropertyDescriptor(target,key),native=Object.getOwnPropertyDescriptor(prototype,key);
            Object.defineProperty(target,key,{configurable:true,enumerable:native.enumerable,get(){return native.get.call(this);},set(value){native.set.call(this,value);sync();}});
            return ()=>{if(own)Object.defineProperty(target,key,own);else delete target[key];};
        }
        function close(focus = false) {
            if (menu.hidden) return;
            if(menu.matches(':popover-open'))menu.hidePopover();
            menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); wrap.classList.remove('is-open');
            if (opened === api) opened = null;
            if (focus && !trigger.disabled) trigger.focus();
        }
        function mark(index) {
            active = index;
            [...list.querySelectorAll('[role=option]')].forEach((el, i) => el.classList.toggle('is-active', i === index));
            const option = list.querySelectorAll('[role=option]')[index];
            if (option) {
                list.setAttribute('aria-activedescendant', option.id);
                const a = option.getBoundingClientRect(), b = list.getBoundingClientRect();
                const scale = list.getBoundingClientRect().width / list.offsetWidth || 1;
                if (a.top < b.top) list.scrollTop -= (b.top - a.top) / scale;
                else if (a.bottom > b.bottom) list.scrollTop += (a.bottom - b.bottom) / scale;
            }
            else list.removeAttribute('aria-activedescendant');
        }
        function render() {
            const query = (search?.value || '').trim().toLocaleLowerCase();
            options = [...select.options].filter(op => !op.hidden && !op.parentElement.hidden && op.text.toLocaleLowerCase().includes(query));
            list.replaceChildren();
            for (const op of options) {
                const item = node('button', 'studio-select-option'); item.type = 'button'; item.tabIndex = -1;
                item.id = list.id + '-' + op.index;
                const caption=node('span','studio-select-option-label');caption.textContent=op.text;item.append(caption,icon('check'));
                item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(op.selected));
                item.disabled = op.disabled || (op.parentElement.tagName === 'OPTGROUP' && op.parentElement.disabled);
                item.setAttribute('aria-disabled', String(item.disabled));
                item.addEventListener('pointermove', () => { if (!item.disabled) mark(options.indexOf(op)); });
                item.addEventListener('click', () => choose(options.indexOf(op))); list.append(item);
            }
            if (!options.length) { const empty = node('p', 'studio-select-empty'); empty.textContent = '没有匹配的选项'; empty.setAttribute('role','status'); list.append(empty); }
            mark(options.findIndex(op => op.selected && !op.disabled));
        }
        function position() {
            if(menu.hidden)return;
            const r=trigger.getBoundingClientRect(),bottom=innerHeight-r.bottom-14,top=r.top-14;
            const above=bottom<180&&top>bottom;
            menu.style.width=Math.min(Math.max(r.width,160),innerWidth-16)+'px';
            menu.style.maxHeight=Math.min(320,Math.max(40,above?top:bottom))+'px';
            menu.style.left=Math.max(8,Math.min(r.left,innerWidth-menu.getBoundingClientRect().width-8))+'px';
            menu.style.top=(above?Math.max(8,r.top-menu.getBoundingClientRect().height-6):r.bottom+6)+'px';
        }
        function sync() {
            for(const [op,restore]of optionHooks)if(!select.contains(op)){restore();optionHooks.delete(op);}
            for(const op of select.options)if(!optionHooks.has(op))optionHooks.set(op,watchProperty(op,HTMLOptionElement.prototype,'selected'));
            text.textContent = select.selectedOptions[0]?.text || '暂无可选项';
            trigger.title = text.textContent; trigger.disabled = select.matches(':disabled') || !select.options.length;
            trigger.setAttribute('aria-disabled', String(trigger.disabled));
            trigger.setAttribute('aria-required',String(select.required));trigger.removeAttribute('aria-invalid');wrap.hidden=select.hidden;
            if (trigger.disabled || !trigger.getClientRects().length) close();
            else if (!menu.hidden) { render(); position(); }
        }
        function open() {
            sync(); if (trigger.disabled) return;
            opened?.close(); opened = api;
            if (search) search.value = '';
            menu.hidden = false; menu.showPopover(); trigger.setAttribute('aria-expanded', 'true'); wrap.classList.add('is-open');
            render(); position(); mark(active); (search || list).focus({preventScroll:true});
        }
        function choose(index) {
            const op = options[index]; if (!op || op.disabled || (op.parentElement.tagName === 'OPTGROUP' && op.parentElement.disabled)) return;
            const changed = select.selectedIndex !== op.index;
            select.selectedIndex = op.index; close(true);
            if (changed) { select.dispatchEvent(new Event('input', {bubbles:true})); select.dispatchEvent(new Event('change', {bubbles:true})); }
            refresh();
        }
        function move(direction, edge) {
            const enabled = options.map((op,i) => !op.disabled && !(op.parentElement.tagName === 'OPTGROUP' && op.parentElement.disabled) ? i : -1).filter(i => i >= 0);
            if (!enabled.length) return;
            const current = enabled.indexOf(active);
            mark(edge === 'first' ? enabled[0] : edge === 'last' ? enabled.at(-1) : current < 0 ? (direction < 0 ? enabled.at(-1) : enabled[0]) : enabled[(current + direction + enabled.length) % enabled.length]);
        }
        function keyboard(event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
            else if (event.key === 'Tab') close();
            else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key) && (event.target !== search || event.key.startsWith('Arrow'))) {
                event.preventDefault(); move(event.key === 'ArrowUp' ? -1 : 1, event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : ''); list.focus({preventScroll:true});
            } else if (event.key === 'Enter' || (event.key === ' ' && event.target !== search)) { event.preventDefault(); choose(active); }
            else if (event.target !== search && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault(); typed = Date.now() - typedAt > 700 ? event.key : typed + event.key; typedAt = Date.now();
                const index = options.findIndex(op => !op.disabled && op.text.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase())); if (index >= 0) mark(index);
            }
        }
        trigger.addEventListener('click', () => menu.hidden ? open() : close());
        trigger.addEventListener('keydown', event => { if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); open(); if(event.key === 'Home' || event.key === 'End') move(0,event.key === 'Home'?'first':'last'); } });
        menu.addEventListener('keydown', keyboard);
        search?.addEventListener('input', () => { render(); position(); });
        const refreshLater=()=>queueMicrotask(refresh),focus=()=>trigger.focus(),invalid=event=>{event.preventDefault();trigger.setAttribute('aria-invalid','true');focus();};
        select.addEventListener('input',refreshLater);select.addEventListener('change',refreshLater);select.addEventListener('focus',focus);select.addEventListener('invalid',invalid);
        const form=select.form;form?.addEventListener('reset',refreshLater);
        const observer = new MutationObserver(sync);
        observer.observe(select, {childList:true,subtree:true,attributes:true,characterData:true});
        restorers.push(watchProperty(select,HTMLSelectElement.prototype,'value'),watchProperty(select,HTMLSelectElement.prototype,'selectedIndex'));
        function destroy(){
            close();observer.disconnect();restorers.forEach(restore=>restore());optionHooks.forEach(restore=>restore());
            select.removeEventListener('input',refreshLater);select.removeEventListener('change',refreshLater);select.removeEventListener('focus',focus);select.removeEventListener('invalid',invalid);form?.removeEventListener('reset',refreshLater);
            select.classList.remove('studio-select-native');for(const [key,value]of [['tabindex',oldTab],['aria-hidden',oldAria]]){if(value===null)select.removeAttribute(key);else select.setAttribute(key,value);}
            if(wrap.contains(select))wrap.replaceWith(select);else wrap.remove();controls.delete(select);
        }
        const api = {sync,close,wrap,position,destroy}; controls.set(select,api); sync();
    }
    function refresh() { for(const [select,api]of controls){if(select.isConnected)api.sync();else api.destroy();} }
    function observe(root){
        if(scopes.has(root))return scopes.get(root);
        const scan=()=>{root.querySelectorAll('select').forEach(enhance);refresh();};scan();
        const observer=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches('select')||n.querySelector('select')))))scan();});
        observer.observe(root,{childList:true,subtree:true});
        const dispose=()=>{observer.disconnect();for(const [select,api]of controls)if(root.contains(api.wrap)||!select.isConnected)api.destroy();scopes.delete(root);};
        if(root.matches('dialog'))root.addEventListener('close',dispose,{once:true});scopes.set(root,dispose);return dispose;
    }
    // Lucide 0.468.0 (ISC), independent of the Tabler presentation adapter.
    function icon(name){
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.75','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true','data-select-icon':name}))svg.setAttribute(key,value);
        const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',name==='check'?'M20 6 9 17l-5-5':'m6 9 6 6 6-6');svg.append(path);return svg;
    }
    document.addEventListener('pointerdown', event => { if (opened && !opened.wrap.contains(event.target)) opened.close(); });
    document.addEventListener('focusin', event => { if (opened && !opened.wrap.contains(event.target)) opened.close(); });
    window.addEventListener('resize', () => opened?.position());
    document.addEventListener('scroll', event => { if (opened && !opened.wrap.contains(event.target)) opened.position(); }, true);
    window.StudioSelect = {refresh,enhance,observe};
    const init = () => {document.querySelectorAll('select[data-studio-select]').forEach(enhance);document.querySelectorAll('.image-workspace-controls,#onlineInbox').forEach(observe);};
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
