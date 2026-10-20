/* Page-local, hand-drawn asset symbols. Utility actions retain their existing icons. */
(function(){
    const paths={
        image:'M4 6h12v12H4z M8 3h12v12 M4 14l4-4 4 4 2-2 2 2 M13 9h.01',
        workflow:'M3 9h6v6H3z M15 3h6v6h-6z M15 15h6v6h-6z M9 12h3V6h3 M12 12v6h3',
        'layout-dashboard':'M3 4h15v13H3z M7 20h14V8 M7 8h4v5H7z M14 8h1 M14 12h1',
        'layout-grid':'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
        sparkles:'M12 3l8 5v8l-8 5-8-5V8z M4 8l8 5 8-5 M12 13v8 M8 6l8 5',
        folder:'M3 7h7l2 3h9v10H3z M3 7V4h7l2 3h7',
        'folder-open':'M3 7V4h7l2 3h7v3 M3 10h18l-3 10H3z',
        play:'M4 5h16v14H4z M10 9l5 3-5 3z M7 2h10 M7 22h10',
        'file-audio':'M4 12h2 M9 6v12 M14 3v18 M19 8v8',
        'file-text':'M5 3h11l3 3v15H5z M9 8h6 M9 12h6 M9 16h3'
    };
    window.AssetLibraryIcons={render(root=document){
        root.querySelectorAll('[data-lucide]').forEach(element=>{
            const name=element.getAttribute('data-lucide'),d=paths[name];
            if(!d)return;
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
            for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',class:'studio-icon asset-symbol '+(element.getAttribute('class')||'')}))svg.setAttribute(key,value);
            svg.dataset.assetSymbol=name;
            const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);element.replaceWith(svg);
        });
    }};
})();
