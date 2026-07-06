(function(global){
    'use strict';

    function refreshIcons(){
        if(global.lucide) global.lucide.createIcons();
    }

    function escapeHtml(value){
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
            '&':'&amp;',
            '<':'&lt;',
            '>':'&gt;',
            '"':'&quot;',
            "'":'&#39;'
        }[ch]));
    }

    function escapeAttr(value){
        return escapeHtml(value);
    }

    function apiErrorMessage(data, fallback='请求失败'){
        if(!data) return fallback;
        if(typeof data === 'string') return data || fallback;
        const detail = data.detail ?? data.error ?? data.message;
        if(typeof detail === 'string') return detail || fallback;
        if(Array.isArray(detail)){
            const messages = detail.map(item => {
                if(typeof item === 'string') return item;
                const loc = Array.isArray(item?.loc) ? item.loc.filter(part => part !== 'body').join('.') : '';
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
        } catch(_) {
            return fallback;
        }
    }

    async function responseErrorMessage(response, fallback='请求失败'){
        try {
            const data = await response.clone().json();
            return apiErrorMessage(data, fallback);
        } catch(_) {
            try {
                const text = await response.text();
                return text || fallback;
            } catch(__) {
                return fallback;
            }
        }
    }

    async function copyTextToClipboard(text){
        const value = String(text || '');
        if(!value) return false;
        try {
            if(navigator.clipboard?.writeText){
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch(_) {}
        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            return ok;
        } catch(_) {
            return false;
        }
    }

    function downloadBlob(blob, filename='download'){
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    function supportedUploadFile(file, extraExtensions=''){
        const type = String(file?.type || '').toLowerCase();
        const name = String(file?.name || '').toLowerCase();
        if(type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) return true;
        const base = 'png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|avi|mkv|mp3|wav|m4a|aac|ogg|flac';
        const extras = String(extraExtensions || '').trim();
        const pattern = extras ? `${base}|${extras}` : base;
        return new RegExp(`\\.(${pattern})(\\?|$)`, 'i').test(name);
    }

    function dataTransferItemEntry(item){
        try {
            return item?.webkitGetAsEntry?.() || null;
        } catch(_) {
            return null;
        }
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

    async function filesFromDataTransfer(dataTransfer, predicate=supportedUploadFile){
        const items = [...(dataTransfer?.items || [])];
        const entries = items.map(dataTransferItemEntry).filter(Boolean);
        const raw = entries.length
            ? (await Promise.all(entries.map(filesFromEntry))).flat()
            : [...(dataTransfer?.files || [])];
        return raw.filter(predicate);
    }

    function nowMs(){
        return Date.now();
    }

    global.StudioShared = {
        refreshIcons,
        escapeHtml,
        escapeAttr,
        apiErrorMessage,
        responseErrorMessage,
        copyTextToClipboard,
        downloadBlob,
        supportedUploadFile,
        dataTransferItemEntry,
        filesFromEntry,
        filesFromDataTransfer,
        nowMs
    };
})(window);
