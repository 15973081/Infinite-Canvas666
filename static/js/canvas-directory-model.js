/* Canvas directory data -> presentation model. It does not own documents or UI state. */
(() => {
    'use strict';
    const normalizeFolderId = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const compareFolders = (a, b) => (Number(a.order || 0) - Number(b.order || 0)) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN', {numeric:true, sensitivity:'base'});
    function folderChildren(folders, parentId='') {
        const target = normalizeFolderId(parentId);
        return folders.filter(folder => normalizeFolderId(folder.parent_id) === target).sort(compareFolders);
    }
    function countInFolder(canvases, folderId) {
        if(folderId === 'all') return canvases.length;
        const target = normalizeFolderId(folderId);
        return canvases.filter(item => normalizeFolderId(item.folder_id) === target).length;
    }
    function folderLabel(folders, id) {
        return id === 'all' ? '全部画布' : !id ? '未分类' : folders.find(folder => folder.id === id)?.name || '文件夹';
    }
    function folderDepth(folders, id) {
        let depth = 0, current = folders.find(folder => folder.id === id);
        const seen = new Set();
        while(current?.parent_id && !seen.has(current.id)) {
            seen.add(current.id); depth++;
            current = folders.find(folder => folder.id === current.parent_id);
        }
        return depth;
    }
    function compareRecords(a, b, sortMode) {
        const ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
        if(ap !== bp) return bp - ap;
        if(sortMode === 'name') {
            const result = String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN', {numeric:true, sensitivity:'base'});
            if(result !== 0) return result;
        }
        return Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0);
    }
    function visibleItems({canvases, deletedCanvases, trashMode, folderId, query}) {
        const target = normalizeFolderId(folderId);
        let items = trashMode ? deletedCanvases : folderId === 'all' ? canvases :
            canvases.filter(item => normalizeFolderId(item.folder_id) === target);
        const search = String(query || '').trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
        return search ? items.filter(item => String(item.title || '').normalize('NFKC').toLocaleLowerCase('zh-CN').includes(search)) : items;
    }
    function build({canvases, deletedCanvases, folders, trashMode, folderId, query, canvasId}) {
        const total = canvases.length;
        const counts = new Map(), children = new Map(), byId = new Map();
        for(const item of canvases) {
            const id = normalizeFolderId(item.folder_id);
            counts.set(id, (counts.get(id) || 0) + 1);
        }
        for(const folder of folders) {
            const parent = normalizeFolderId(folder.parent_id);
            if(!children.has(parent)) children.set(parent, []);
            children.get(parent).push(folder);
            if(!byId.has(folder.id)) byId.set(folder.id, folder);
        }
        for(const group of children.values()) {
            group.sort(compareFolders);
            Object.freeze(group);
        }
        const items = Object.freeze([...visibleItems({canvases, deletedCanvases, trashMode, folderId, query})]);
        const rows = Object.freeze(items.map(item => {
            const isSmartCanvas = (item.kind || 'classic') === 'smart';
            return Object.freeze({item, isSmartCanvas, color:String(item.color || '').trim(), owner:String(item.owner || '').trim(),
                pinned:!!item.pinned && !trashMode, active:canvasId === item.id,
                coverStyle:['type','editorial','sage','ink'].includes(item.cover_style) ? item.cover_style : 'type',
                icon:isSmartCanvas && /[^\x00-\x7F]/.test(item.icon || '') ? 'sparkles' : item.icon});
        }));
        const empty = Object.freeze([]);
        return Object.freeze({items, rows, trashMode, folderId, query,
            emptyKind:String(query || '').trim() ? 'search' : trashMode ? 'trash' : 'empty',
            count:id => id === 'all' ? total : counts.get(normalizeFolderId(id)) || 0,
            children:id => children.get(normalizeFolderId(id)) || empty,
            folderLabel:id => id === 'all' ? '全部画布' : !id ? '未分类' : byId.get(id)?.name || '文件夹'});
    }
    const api = Object.freeze({normalizeFolderId, compareRecords, visibleItems, folderChildren, countInFolder, folderLabel, folderDepth, build});
    if(typeof module === 'object' && module.exports) module.exports = api;
    else window.CanvasDirectoryModel = api;
})();
