/* Directory-only destination picker. Uses the existing scoped move operation. */
(() => {
    let current = null;
    window.CanvasFolderPicker = {
        open({title, currentFolder, folders, canvases, onMove, restoreFocus}) {
            if (current) return;
            const dialog = document.createElement('dialog');
            current = dialog;
            dialog.className = 'canvas-folder-picker';
            dialog.setAttribute('aria-labelledby', 'folderPickerTitle');
            dialog.innerHTML = '<header><h2 id="folderPickerTitle">移动到文件夹</h2><button type="button" aria-label="关闭">×</button></header><div class="folder-picker-body"><p class="folder-picker-project"></p><div class="folder-picker-list" aria-label="目标文件夹"></div><p class="folder-picker-error" role="alert" hidden></p><p class="folder-picker-status" role="status" hidden>正在移动…</p></div>';
            dialog.querySelector('.folder-picker-project').textContent = title;
            const list = dialog.querySelector('.folder-picker-list');
            const error = dialog.querySelector('.folder-picker-error');
            const status = dialog.querySelector('.folder-picker-status');
            const folderMap = new Map(folders.map(folder => [folder.id, folder]));
            const pathFor = folder => {
                const names = [], seen = new Set();
                while (folder && !seen.has(folder.id)) {
                    seen.add(folder.id); names.unshift(folder.name); folder = folderMap.get(folder.parent_id);
                }
                return names.join(' / ');
            };
            const entries = [{id:'', name:currentFolder ? '移出文件夹' : '全部画布', path:'全部画布（未分类）', icon:'inbox'},
                ...folders.map(folder => ({...folder, path:pathFor(folder), icon:'folder'}))];
            let busy = false;
            const close = () => { if (!busy) dialog.close(); };
            dialog.querySelector('header button').onclick = close;
            dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
            dialog.addEventListener('keydown', event => event.stopPropagation());
            dialog.addEventListener('click', event => {
                const rect = dialog.getBoundingClientRect();
                if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
            });
            dialog.addEventListener('close', () => { dialog.remove(); current = null; restoreFocus?.(); });
            for (const entry of entries) {
                const button = document.createElement('button');
                button.type = 'button'; button.dataset.folderDestination = entry.id;
                const selected = entry.id === currentFolder;
                button.disabled = selected;
                if (selected) button.setAttribute('aria-current', 'location');
                button.innerHTML = '<i data-lucide="'+entry.icon+'"></i><span class="folder-picker-copy"><strong></strong><small></small></span><span class="folder-picker-count"></span>';
                button.querySelector('strong').textContent = entry.name;
                button.querySelector('small').textContent = entry.path;
                button.querySelector('small').hidden = entry.path === entry.name;
                button.querySelector('.folder-picker-count').textContent = selected ? '当前位置' : canvases.filter(item => (item.folder_id || '') === entry.id).length + ' 个画布';
                button.onclick = async () => {
                    if (busy || selected) return;
                    busy = true; error.hidden = true; status.hidden = false; dialog.setAttribute('aria-busy', 'true');
                    dialog.querySelectorAll('button').forEach(el => { el.disabled = true; });
                    try { await onMove(entry.id); dialog.close(); }
                    catch (failure) { error.textContent = failure?.message || '移动失败，请重试。'; error.hidden = false; }
                    finally {
                        busy = false; status.hidden = true; dialog.removeAttribute('aria-busy');
                        dialog.querySelectorAll('button').forEach(el => { el.disabled = el.hasAttribute('aria-current'); });
                        if (dialog.open) button.focus();
                    }
                };
                list.append(button);
            }
            document.body.append(dialog);
            window.lucide?.createIcons({root:dialog});
            dialog.showModal();
        }
    };
})();
