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
                html.${CLASS}::view-transition-group(root) {
                    animation: none;
                    overflow: clip;
                    contain: paint;
                }
                html.${CLASS}::view-transition-image-pair(root) { isolation: auto; }
                html.${CLASS}::view-transition-old(root),
                html.${CLASS}::view-transition-new(root) {
                    animation: none;
                    mix-blend-mode: normal;
                    opacity: 1;
                }
                html.${CLASS}::view-transition-old(root) { z-index: 1; }
                html.${CLASS}::view-transition-new(root) {
                    z-index: 2;
                    will-change: clip-path;
                    transform: translateZ(0);
                    backface-visibility: hidden;
                }
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

    function circleFor(event){
        // Measure after freezing layout. DOM rects and client coordinates are both
        // viewport CSS pixels: never multiply either by devicePixelRatio.
        const rect = (event?.currentTarget || event?.target)?.getBoundingClientRect?.();
        const touch = event?.changedTouches?.[0] || event?.touches?.[0];
        const pointer = touch || (event?.detail !== 0 ? event : null);
        const width = window.innerWidth, height = window.innerHeight;
        const x = rect?.width > 0 && rect?.height > 0 ? rect.left + rect.width / 2
            : Number.isFinite(pointer?.clientX) ? pointer.clientX : width / 2;
        const y = rect?.width > 0 && rect?.height > 0 ? rect.top + rect.height / 2
            : Number.isFinite(pointer?.clientY) ? pointer.clientY : height / 2;
        const radius = Math.hypot(Math.max(Math.abs(x), Math.abs(width - x)),
            Math.max(Math.abs(y), Math.abs(height - y)));
        // circle() radius percentages use the normalized diagonal, not width.
        // Relative geometry survives uniform snapshot scaling; one CSS pixel
        // of overscan hides antialiasing at the farthest corner.
        const diagonal = Math.hypot(width, height) / Math.SQRT2;
        const center = (100 * x / width) + '% ' + (100 * y / height) + '%';
        return ['circle(0% at ' + center + ')',
            'circle(' + (100 * (radius + 1) / diagonal) + '% at ' + center + ')'];
    }

    function waitForLivePage(){
        // finished resolves before the browser paints the live page and restores :hover.
        // Keep the snapshot's layout until that handoff has crossed a paint boundary.
        if(document.hidden || !window.requestAnimationFrame) return Promise.resolve();
        return new Promise(resolve => {
            let frame;
            const finish = () => {
                window.cancelAnimationFrame(frame);
                document.removeEventListener('visibilitychange', onVisibility);
                resolve();
            };
            const onVisibility = () => { if(document.hidden) finish(); };
            document.addEventListener('visibilitychange', onVisibility);
            frame = window.requestAnimationFrame(() => {
                frame = window.requestAnimationFrame(finish);
            });
        });
    }

    async function run(update, event){
        // Ignore a second activation until the current snapshot has been released.
        if(busy) return false;
        busy = true;
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
            const circle = circleFor(event);
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
                        // r(t) = R * t/T: the edge never eases into a near-stop.
                        animation = document.documentElement.animate({clipPath:circle}, {
                            duration:520, easing:'linear',
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
            if(transition && !interrupted && !motion.matches) await waitForLivePage();
            prepared.forEach(doc => doc.documentElement.classList.remove(CLASS));
            frozenHovers.forEach(({element, value}) => element.setAttribute('data-theme-transition-hover', value));
            window.removeEventListener('resize', interrupt);
            motion.removeEventListener?.('change', onMotion);
            busy = false;
        }
    }

    window.StudioThemeTransition = {run};
})();
