/* Tabler presentation adapter. Existing data-lucide/createIcons calls stay valid. */
(function(global){
    'use strict';
    const registry = global.StudioTabler;
    const namespace = 'http://www.w3.org/2000/svg';
    const warned = new Set();
    const normalize = value => String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

    function render(element, options){
        const nameAttr = options.nameAttr || 'data-lucide';
        const name = normalize(element.getAttribute(nameAttr) || element.getAttribute('data-tabler'));
        const target = registry.aliases[name] || name;
        const nodes = registry.icons[target];
        if(!nodes){
            if(!warned.has(name)){warned.add(name);console.warn('Unknown studio icon:', name);}
            return;
        }
        // Repeated refreshes must preserve SVG identity, listeners and animated state.
        if(element.tagName.toLowerCase() === 'svg' && element.dataset.studioIcon === name && element.dataset.tabler === target && !options.attrs) return;
        const svg = document.createElementNS(namespace, 'svg');
        const attrs = {
            xmlns:namespace, width:'24', height:'24', viewBox:'0 0 24 24',
            fill:'none', stroke:'currentColor', 'stroke-linecap':'round', 'stroke-linejoin':'round',
            ...Object.fromEntries([...element.attributes].map(attr => [attr.name, attr.value])),
            ...(options.attrs || {}), 'stroke-width':'1.5', 'data-tabler':target, 'data-studio-icon':name
        };
        const classes = new Set(String(attrs.class || '').split(/\s+/).filter(Boolean));
        ['studio-icon','icon-tabler',`icon-tabler-${target}`,'lucide',`lucide-${name}`].forEach(value => classes.add(value));
        attrs.class = [...classes].join(' ');
        if(!attrs['aria-label'] && attrs.role !== 'img') attrs['aria-hidden'] = 'true';
        for(const [key,value] of Object.entries(attrs)) svg.setAttribute(key, String(value));
        for(const [tag,attributes] of nodes){
            const child = document.createElementNS(namespace, tag);
            for(const [key,value] of Object.entries(attributes)) child.setAttribute(key,value);
            svg.append(child);
        }
        element.replaceWith(svg);
    }

    function createIcons(options = {}){
        const root = options.root || document;
        const nameAttr = options.nameAttr || 'data-lucide';
        root.querySelectorAll(`[${nameAttr}],[data-tabler]`).forEach(element => render(element, options));
        if(options.inTemplates) root.querySelectorAll('template').forEach(template => createIcons({...options, root:template.content}));
    }

    global.StudioIcons = {createIcons, aliases:registry.aliases, icons:registry.icons, commit:registry.commit};
    // Only studio entry pages load this adapter. Legacy generators keep their own library.
    global.lucide = {createIcons};
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => createIcons(), {once:true});
    else createIcons();
})(window);
