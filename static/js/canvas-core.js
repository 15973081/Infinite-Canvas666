(function(){
    function apiErrorMessage(data, fallback='请求失败'){
        if(!data) return fallback;
        if(typeof data === 'string') return data || fallback;
        const detail = data.detail ?? data.error ?? data.message;
        if(typeof detail === 'string') return detail || fallback;
        if(Array.isArray(detail)){
            const messages = detail.map(item => {
                if(typeof item === 'string') return item;
                const loc = Array.isArray(item?.loc) ? item.loc.filter(x => x !== 'body').join('.') : '';
                const msg = item?.msg || item?.message || JSON.stringify(item);
                return loc ? `${loc}: ${msg}` : msg;
            }).filter(Boolean);
            return messages.join('\n') || fallback;
        }
        if(detail && typeof detail === 'object'){
            return detail.message || detail.msg || JSON.stringify(detail);
        }
        try {
            return JSON.stringify(data);
        } catch(e) {
            return fallback;
        }
    }

    async function responseErrorMessage(response, fallback='请求失败'){
        try {
            const data = await response.clone().json();
            return apiErrorMessage(data, fallback);
        } catch(e) {
            try {
                const text = await response.text();
                return text || fallback;
            } catch(_) {
                return fallback;
            }
        }
    }

    function safeFileName(name, fallback='download'){
        return String(name || fallback).replace(/[\\/:*?"<>|]+/g, '_').trim() || fallback;
    }

    function escapeHtml(str){
        return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({
            '&':'&amp;',
            '<':'&lt;',
            '>':'&gt;',
            '"':'&quot;',
            "'":'&#39;'
        }[s]));
    }

    function parseSizeValue(value){
        const match = String(value || '').trim().match(/^(\d+)\s*[xX*]\s*(\d+)$/);
        return match ? {width:match[1], height:match[2]} : null;
    }

    function parseSizePair(value){
        const match = String(value || '').match(/(\d+)\s*x\s*(\d+)/i);
        return match ? {width:Number(match[1]), height:Number(match[2])} : null;
    }

    function gcdInt(a, b){
        a = Math.abs(Math.round(Number(a) || 0));
        b = Math.abs(Math.round(Number(b) || 0));
        while(b){ const t = b; b = a % b; a = t; }
        return a || 1;
    }

    function nowMs(){
        return Date.now();
    }

    function extensionFromNameOrUrl(name='', url='', fallback='.png'){
        const source = [name, url]
            .map(value => String(value || '').split('?')[0].split('#')[0])
            .find(value => /\.[a-z0-9]{2,8}$/i.test(value));
        return source?.match(/(\.[a-z0-9]{2,8})$/i)?.[1] || fallback;
    }

    function fileNameFromUrl(url=''){
        try {
            const parsed = new URL(String(url || ''), window.location.href);
            return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
        } catch(e) {
            return decodeURIComponent(String(url || '').split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '');
        }
    }

    function downloadBlob(blob, filename='download'){
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    function dataTransferItemEntry(item){
        try { return item?.webkitGetAsEntry?.() || null; } catch { return null; }
    }

    async function filesFromEntry(entry){
        if(!entry) return [];
        if(entry.isFile){
            return new Promise(resolve => entry.file(file => resolve(file ? [file] : []), () => resolve([])));
        }
        if(!entry.isDirectory) return [];
        const reader = entry.createReader();
        const children = [];
        while(true){
            const batch = await new Promise(resolve => reader.readEntries(resolve, () => resolve([])));
            if(!batch.length) break;
            children.push(...batch);
        }
        const nested = await Promise.all(children.map(filesFromEntry));
        return nested.flat();
    }

    function imageSizeForRatio(ratio, longSide, pixelLimit){
        if(!Number.isFinite(ratio) || ratio <= 0) return '';
        // Scale BOTH sides together: clamping only the short side breaks the
        // aspect ratio and can submit a higher (and more expensive) image tier.
        const width = Math.min(longSide, longSide * ratio, Math.sqrt(pixelLimit * ratio));
        const height = width / ratio;
        return `${Math.max(64, Math.floor(width / 16) * 16)}x${Math.max(64, Math.floor(height / 16) * 16)}`;
    }

    function createAssetHoverController(show, hide, position){
        let timer = 0, frame = 0, point, dragging = false;
        const clear = () => {
            clearTimeout(timer); timer = 0;
            cancelAnimationFrame(frame); frame = 0;
            hide();
        };
        const move = event => {
            point = {clientX:event.clientX, clientY:event.clientY};
            if(dragging || event.buttons){ clear(); return; }
            if(!frame) frame = requestAnimationFrame(() => {frame = 0; position(point);});
        };
        document.addEventListener('dragstart', () => {dragging = true; clear();}, true);
        for(const type of ['dragend','drop']) document.addEventListener(type, () => {dragging = false; clear();}, true);
        document.addEventListener('pointerdown', clear, true);
        window.addEventListener('blur', () => {dragging = false; clear();});
        return {
            enter(event, item){
                clear();
                if(dragging || event.buttons) return;
                point = {clientX:event.clientX, clientY:event.clientY};
                timer = setTimeout(() => {timer = 0; if(!dragging) show(point, item);}, 180);
            }, move, hide:clear
        };
    }

    function modelResolutions(provider, kind, model, defaults){
        if(!provider || provider.enabled === false) return [];
        const models = provider[kind + '_models'];
        if(Array.isArray(models) && !models.includes(model)) return [];
        const rule = provider.model_policies?.[kind + ':' + model];
        if(rule?.visible === false || rule?.enabled === false) return [];
        return defaults.filter(value => !Array.isArray(rule?.resolutions) || rule.resolutions.includes(value.toLowerCase()));
    }

    function availableModelProviders(providers){
        return providers.filter(provider => provider.enabled !== false).map(provider => {
            const result = {...provider};
            for(const kind of ['image','video','chat']){
                result[kind + '_models'] = (provider[kind + '_models'] || []).filter(model => {
                    const rule = provider.model_policies?.[kind + ':' + model];
                    return rule?.visible !== false && rule?.enabled !== false;
                });
            }
            return result;
        });
    }

    window.CanvasCore = {
        imageSizeForRatio,
        createAssetHoverController,
        modelResolutions,
        availableModelProviders,
        apiErrorMessage,
        responseErrorMessage,
        safeFileName,
        escapeHtml,
        parseSizeValue,
        parseSizePair,
        gcdInt,
        nowMs,
        extensionFromNameOrUrl,
        fileNameFromUrl,
        downloadBlob,
        dataTransferItemEntry,
        filesFromEntry
    };
})();
