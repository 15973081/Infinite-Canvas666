/* Opt-in select skin: the original control remains the source of business values. */
(() => {
    'use strict';
    const controls = new Map();
    let opened = null;
    const node = (tag, cls) => { const el = document.createElement(tag); el.className = cls; return el; };
    function enhance(select) {
        if (controls.has(select) || select.multiple) return;
        const label = select.dataset.selectLabel || select.getAttribute('aria-label') || select.title || '选择选项';
        const wrap = node('div', 'studio-select'), trigger = node('button', 'studio-select-trigger');
        const text = node('span', 'studio-select-value'), arrow = node('span', 'studio-select-arrow');
        trigger.type = 'button'; trigger.id = select.id + '-trigger';
        trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-label', label);
        trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
        arrow.setAttribute('aria-hidden', 'true'); trigger.append(text, arrow);
        const menu = node('div', 'studio-select-menu'), list = node('div', 'studio-select-list');
        menu.hidden = true; list.id = select.id + '-options'; list.tabIndex = -1;
        list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
        trigger.setAttribute('aria-controls', list.id);
        const search = select.dataset.selectSearch !== undefined ? node('input', 'studio-select-search') : null;
        if (search) {
            search.type = 'search'; search.placeholder = '搜索' + label;
            search.setAttribute('aria-label', '搜索' + label); search.setAttribute('aria-controls', list.id);
            search.autocomplete = 'off'; menu.append(search);
        }
        menu.append(list);
        select.before(wrap); wrap.append(select, trigger, menu);
        select.classList.add('studio-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
        let active = -1, options = [], typed = '', typedAt = 0;
        function close(focus = false) {
            if (menu.hidden) return;
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
                item.id = list.id + '-' + op.index; item.textContent = op.text;
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
            menu.classList.remove('align-end', 'open-above'); menu.style.removeProperty('max-height');
            const r = trigger.getBoundingClientRect(), scale = r.width / trigger.offsetWidth || 1;
            const bottom = innerHeight - r.bottom - 12, top = r.top - 12;
            const above = bottom < 180 * scale && top > bottom;
            menu.classList.toggle('open-above', above);
            menu.style.maxHeight = Math.min(320, Math.max(64, (above ? top : bottom) / scale - 6)) + 'px';
            if (menu.getBoundingClientRect().right > innerWidth - 8) menu.classList.add('align-end');
        }
        function sync() {
            text.textContent = select.selectedOptions[0]?.text || '暂无可选项';
            trigger.title = text.textContent; trigger.disabled = select.disabled || !select.options.length;
            trigger.setAttribute('aria-disabled', String(trigger.disabled));
            if (trigger.disabled || !trigger.getClientRects().length) close();
            else if (!menu.hidden) { render(); position(); }
        }
        function open() {
            sync(); if (trigger.disabled) return;
            opened?.close(); opened = api;
            if (search) search.value = '';
            menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); wrap.classList.add('is-open');
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
        select.addEventListener('change', () => queueMicrotask(refresh));
        const observer = new MutationObserver(sync);
        observer.observe(select, {childList:true,subtree:true,attributes:true,characterData:true});
        const api = {sync,close,wrap,position}; controls.set(select,api); sync();
    }
    function refresh() { controls.forEach(api => api.sync()); }
    document.addEventListener('pointerdown', event => { if (opened && !opened.wrap.contains(event.target)) opened.close(); });
    document.addEventListener('focusin', event => { if (opened && !opened.wrap.contains(event.target)) opened.close(); });
    window.addEventListener('resize', () => opened?.position());
    document.addEventListener('scroll', event => { if (opened && !opened.wrap.contains(event.target)) opened.position(); }, true);
    window.StudioSelect = {refresh};
    const init = () => document.querySelectorAll('select[data-studio-select]').forEach(enhance);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
