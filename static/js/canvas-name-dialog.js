(() => {
    let current = null;
    window.CanvasNameDialog = {
        open(options) {
            if (current) return;
            const previous = document.activeElement;
            const dialog = document.createElement('dialog');
            dialog.className = 'canvas-name-dialog';
            dialog.setAttribute('aria-labelledby', 'canvasNameHeading');
            dialog.innerHTML = '<form novalidate><div class="name-dialog-heading"><h2 id="canvasNameHeading"></h2><button type="button" class="name-dialog-close" aria-label="关闭">×</button></div><p class="name-dialog-description"></p><label for="canvasNameField"></label><input id="canvasNameField" type="text" maxlength="80" autocomplete="off" aria-describedby="canvasNameHint canvasNameError"><p id="canvasNameHint" class="name-dialog-hint"></p><p id="canvasNameError" class="name-dialog-error" role="alert" hidden></p><div class="name-dialog-actions"><button type="button" class="name-dialog-cancel">取消</button><button type="submit" class="name-dialog-confirm"></button></div></form>';
            const find = selector => dialog.querySelector(selector);
            const input = find('input');
            const error = find('.name-dialog-error');
            const confirm = find('.name-dialog-confirm');
            find('h2').textContent = options.title;
            find('label').textContent = options.label || '名称';
            find('.name-dialog-description').textContent = options.description || '为你的创作取一个容易辨认的名字。';
            find('.name-dialog-hint').textContent = options.allowEmpty ? '最多 80 个字符，留空将自动命名。' : '最多 80 个字符。';
            input.value = options.value || '';
            input.placeholder = options.placeholder || '输入名称';
            confirm.textContent = options.confirm || '保存';
            const matches=()=>options.requiredName===undefined||input.value.trim()===options.requiredName;
            if(options.requiredName!==undefined){find('.name-dialog-hint').textContent='请输入“'+options.requiredName+'”以确认';input.oninput=()=>{confirm.disabled=!matches();};confirm.disabled=!matches();}
            let busy = false;
            const observer=options.scopeValid?new MutationObserver(()=>{if(dialog.isConnected&&!options.scopeValid())dialog.close();}):null;
            const close = () => { if (!busy) dialog.close(); };
            find('.name-dialog-close').onclick = close;
            find('.name-dialog-cancel').onclick = close;
            dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
            dialog.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            dialog.addEventListener('close', () => {
                observer?.disconnect();dialog.remove(); current = null;
                if (previous?.isConnected) previous.focus();
            });
            find('form').onsubmit = async event => {
                event.preventDefault();
                if (busy) return;
                if(!matches())return;
                const value = input.value.trim();
                if (!value && !options.allowEmpty) {
                    error.textContent = '请输入名称'; error.hidden = false;
                    input.setAttribute('aria-invalid', 'true'); input.focus(); return;
                }
                error.hidden = true; input.removeAttribute('aria-invalid');
                busy = true; dialog.setAttribute('aria-busy', 'true');
                dialog.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
                confirm.textContent = options.busyText || '保存中…';
                try { await options.onSubmit(value); busy = false; dialog.close(); }
                catch (e) {
                    busy = false; dialog.removeAttribute('aria-busy');
                    dialog.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
                    confirm.textContent = options.confirm || '保存';
                    confirm.disabled=!matches();
                    error.textContent = e?.message || '保存失败，请重试'; error.hidden = false; input.focus();
                }
            };
            document.body.appendChild(dialog); current = dialog;
            observer?.observe(document.body,{attributes:true,childList:true,subtree:true});
            dialog.showModal(); input.focus(); input.select();
        }
    };
})();
