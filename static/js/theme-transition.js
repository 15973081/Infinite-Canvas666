(function(){
    const CLASS = 'studio-theme-transitioning';
    let busy = false;

    function prepareDocuments(doc, prepared, frozenHovers){
        // Snapshot capture clears :hover; preserve opt-in layout states until it finishes.
        doc.querySelectorAll('[data-theme-transition-hover]').forEach(element => {
            frozenHovers.push({element, value:element.getAttribute('data-theme-transition-hover')});
            element.setAttribute('data-theme-transition-hover', element.matches(':hover') ? 'on' : 'off');
        });
        if(!doc.getElementById('studio-theme-transition-style')){
            const style = doc.createElement('style');
            style.id = 'studio-theme-transition-style';
            style.textContent = `
                html.${CLASS} *, html.${CLASS} *::before, html.${CLASS} *::after {
                    transition: none !important;
                    view-transition-name: none !important;
                }
                html.${CLASS}::view-transition-group(root) { animation: none; }
                html.${CLASS}::view-transition-image-pair(root) { isolation: auto; }
                html.${CLASS}::view-transition-old(root),
                html.${CLASS}::view-transition-new(root) {
                    animation: none;
                    mix-blend-mode: normal;
                    opacity: 1;
                }
                html.${CLASS}::view-transition-old(root) { z-index: 1; }
                html.${CLASS}::view-transition-new(root) { z-index: 2; }
            `;
            doc.head.appendChild(style);
        }
        doc.documentElement.classList.add(CLASS);
        prepared.push(doc);
        doc.querySelectorAll('iframe').forEach(frame => {
            try {
                if(frame.contentDocument?.documentElement) prepareDocuments(frame.contentDocument, prepared, frozenHovers);
            } catch(e) { /* Cross-origin frames keep their own theme handling. */ }
        });
        return prepared;
    }

    function originFor(event){
        const touch = event?.changedTouches?.[0] || event?.touches?.[0];
        const pointer = touch || (event?.detail !== 0 ? event : null);
        if(Number.isFinite(pointer?.clientX) && Number.isFinite(pointer?.clientY)){
            return {x:pointer.clientX, y:pointer.clientY};
        }
        const rect = (event?.currentTarget || event?.target)?.getBoundingClientRect?.();
        return rect ? {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2}
            : {x:window.innerWidth / 2, y:window.innerHeight / 2};
    }

    async function run(update, event){
        // Ignore a second activation until the current snapshot has been released.
        if(busy) return false;
        busy = true;
        const origin = originFor(event);
        const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x),
            Math.max(origin.y, window.innerHeight - origin.y));
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const prepared = [], frozenHovers = [];
        let transition, animation, committed = false, interrupted = false;
        const commit = () => {
            if(committed) return;
            committed = true;
            update();
            // Finish existing color transitions before the new snapshot is captured.
            prepared.forEach(doc => doc.documentElement.getBoundingClientRect());
        };
        const interrupt = () => {
            interrupted = true;
            transition?.skipTransition();
            animation?.cancel();
        };
        const onMotion = () => { if(motion.matches) interrupt(); };
        const fade = async () => {
            commit();
            if(motion.matches || interrupted || !document.body?.animate) return;
            try {
                animation = document.body.animate([{opacity:0.94}, {opacity:1}],
                    {duration:140, easing:'ease-out'});
                await animation.finished;
            } catch(e) { /* Animation support must never block changing the theme. */ }
        };
        window.addEventListener('resize', interrupt);
        motion.addEventListener?.('change', onMotion);
        try {
            prepareDocuments(document, prepared, frozenHovers);
            if(motion.matches){ commit(); return true; }
            if(!document.startViewTransition || !document.documentElement.animate ||
                !window.CSS?.supports('clip-path', 'circle(1px at 0px 0px)')){
                await fade();
                return true;
            }
            try {
                transition = document.startViewTransition(commit);
                // A skipped transition rejects ready; observe every promise immediately.
                const finished = transition.finished.catch(() => {});
                const updated = transition.updateCallbackDone.catch(() => {});
                try {
                    await transition.ready;
                    if(!interrupted && !motion.matches){
                        animation = document.documentElement.animate({clipPath:[
                            `circle(0px at ${origin.x}px ${origin.y}px)`,
                            `circle(${radius}px at ${origin.x}px ${origin.y}px)`
                        ]}, {duration:520, easing:'cubic-bezier(0.4, 0, 0.2, 1)',
                            fill:'both', pseudoElement:'::view-transition-new(root)'});
                        await animation.finished;
                    }
                } catch(e) {
                    transition.skipTransition();
                    await updated;
                    await finished;
                    await fade();
                }
                await finished;
            } catch(e) {
                await fade();
            }
            return true;
        } finally {
            animation?.cancel();
            prepared.forEach(doc => doc.documentElement.classList.remove(CLASS));
            frozenHovers.forEach(({element, value}) => element.setAttribute('data-theme-transition-hover', value));
            window.removeEventListener('resize', interrupt);
            motion.removeEventListener?.('change', onMotion);
            busy = false;
        }
    }

    window.StudioThemeTransition = {run};
})();
