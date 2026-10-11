/* In-editor cover selection; directory previews have no editor dependency. */
(() => {
    'use strict';
    const {candidates,resolve,markup,bind,mediaMarkup}=window.CanvasCoverPreview;
    function open({getCanvas,getNodes,canEdit,apply}){
        if(document.querySelector('.canvas-cover-dialog'))return;
        const origin=document.activeElement, current=getCanvas();
        if(!current)return;
        const dialog=document.createElement('dialog');dialog.className='canvas-cover-dialog';
        dialog.setAttribute('aria-labelledby','canvasCoverTitle');
        dialog.innerHTML='<header><div><h2 id="canvasCoverTitle">画布封面</h2><p>从画布节点选择图片或视频，文字显示在左上角。</p></div><button type="button" class="cover-close" aria-label="关闭封面设置">×</button></header><div class="canvas-cover-preview"></div><label class="canvas-cover-text-label">封面文字<input maxlength="80" aria-label="封面文字" placeholder="留空使用画布名称"></label><button type="button" class="cover-auto">自动封面 · 优先第一个视频节点</button><label class="canvas-cover-search-label">选择节点<input type="search" aria-label="搜索封面节点" placeholder="搜索节点名称"></label><div class="canvas-cover-choices" role="group" aria-label="封面节点"></div><button type="button" class="cover-more" hidden>显示更多节点</button><p class="canvas-cover-feedback" role="status"></p><footer><button type="button" class="cover-cancel">取消</button><button type="button" class="cover-apply">应用封面</button></footer>';
        let choice=current.cover?.node_id ? {node_id:current.cover.node_id,index:current.cover.index ?? -1}:null, limit=24;
        const input=dialog.querySelector('[aria-label="封面文字"]');input.value=current.cover?.text || '';
        const preview=dialog.querySelector('.canvas-cover-preview'), list=dialog.querySelector('.canvas-cover-choices'), feedback=dialog.querySelector('.canvas-cover-feedback');
        const config=()=>choice ? {...choice,text:input.value.trim()} : input.value.trim() ? {node_id:'',index:-1,text:input.value.trim()}:null;
        const update=()=>{
            preview.innerHTML=markup({...getCanvas(),nodes:getNodes(),cover:config()});bind(preview);
            dialog.querySelector('.cover-auto').setAttribute('aria-pressed',String(!choice));
            list.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(choice?.node_id===button.dataset.nodeId && choice?.index===Number(button.dataset.index))));
            const available=candidates(getNodes());
            const missing=choice && !available.some(c=>c.node_id===choice.node_id && c.index===choice.index);
            feedback.textContent=!canEdit() ? '当前为查看模式。请关闭此窗口，点击「开始编辑」后再设置封面。':missing ? '所选素材已移除，当前使用自动封面。':!available.length ? '还没有图片或视频。添加素材后会自动显示封面。':'应用后随画布自动保存；留空文字使用画布名称。';
            dialog.querySelector('.cover-apply').disabled=!canEdit();
        };
        const renderChoices=()=>{
            const query=dialog.querySelector('[aria-label="搜索封面节点"]').value.trim().toLocaleLowerCase();
            const available=candidates(getNodes()).filter(c=>c.label.toLocaleLowerCase().includes(query));
            list.replaceChildren();
            for(const item of available.slice(0,limit)){
                const button=document.createElement('button');button.type='button';button.dataset.nodeId=item.node_id;button.dataset.index=String(item.index);
                button.innerHTML=mediaMarkup(item) || '<span class="canvas-cover-choice-placeholder">暂无缩略图</span>';
                const caption=document.createElement('span');caption.textContent=`${item.label} · ${item.kind==='video'?'视频':'图片'}${item.index>=0 ? ' '+(item.index+1):''}`;
                button.append(caption);button.onclick=()=>{choice={node_id:item.node_id,index:item.index};update();};list.append(button);
            }
            if(!available.length){const empty=document.createElement('p');empty.textContent=query ? '没有匹配的图片或视频节点。':'画布中还没有可用的图片或视频节点。';list.append(empty);}
            dialog.querySelector('.cover-more').hidden=available.length<=limit;bind(list);update();
        };
        dialog.querySelector('.cover-auto').onclick=()=>{choice=null;update();};
        input.oninput=update;
        dialog.querySelector('[aria-label="搜索封面节点"]').oninput=()=>{limit=24;renderChoices();};
        dialog.querySelector('.cover-more').onclick=()=>{limit+=24;renderChoices();};
        dialog.querySelectorAll('.cover-close,.cover-cancel').forEach(button=>button.onclick=()=>dialog.close());
        dialog.querySelector('.cover-apply').onclick=()=>{
            if(getCanvas()?.id!==current.id || !canEdit()){update();return;}
            const next=config();
            if(next?.node_id && !candidates(getNodes()).some(c=>c.node_id===next.node_id && c.index===next.index)){
                choice=null;update();return;
            }
            apply(next);dialog.close();
        };
        dialog.addEventListener('keydown',event=>event.stopPropagation());
        dialog.addEventListener('close',()=>{
            dialog.remove();if(origin?.isConnected)origin.focus();
        });
        document.body.append(dialog);renderChoices();dialog.showModal();
    }
    window.CanvasCover={candidates,resolve,markup,bind,open};
    window.editCanvasCover=()=>open({
        getCanvas:()=>canvas, getNodes:()=>nodes,
        canEdit:()=>window.CanvasSession?.enabled ? Boolean(window.MemberCanvasEdit?.canEdit)
            : document.body.classList.contains('studio-smart-canvas') ? !isSmartCanvasLocked() : !isCanvasLockedByOther(),
        apply:value=>{canvas.cover=value;scheduleSave();}
    });
    window.CanvasCover.openRequested=()=>{
        const url=new URL(location.href);
        if(url.searchParams.get('cover')!=='1')return;
        url.searchParams.delete('cover');history.replaceState(history.state,'',url);
        window.editCanvasCover();
    };
})();
