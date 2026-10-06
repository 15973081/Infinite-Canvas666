/* Presentation adapters; document/session/API contracts stay in canvas.js. */
(() => {
 'use strict';
 const byId=id=>document.getElementById(id);let retry;
 let requestedCreate=new URLSearchParams(window.location.search).get('create')==='classic';
 const closePick=(pick,restore=false)=>{const trigger=pick.querySelector('.studio-pick-trigger');pick.querySelector('.studio-pick-menu').hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();};
 const choices=pick=>Array.from(pick.querySelectorAll('.gate-folder-main,[data-sort]')).filter(el=>!el.disabled);
 document.querySelectorAll('.studio-pick').forEach(pick=>{
  const trigger=pick.querySelector('.studio-pick-trigger'),menu=pick.querySelector('.studio-pick-menu');
  const open=focus=>{
   document.querySelectorAll('.studio-pick').forEach(other=>{if(other!==pick)closePick(other);});
   menu.hidden=false;trigger.setAttribute('aria-expanded','true');
   const rect=trigger.getBoundingClientRect(),below=window.innerHeight-rect.bottom-16;
   const above=below<160&&rect.top>below;
   menu.style.top=above?'auto':'calc(100% + 6px)';menu.style.bottom=above?'calc(100% + 6px)':'auto';
   menu.style.maxHeight=Math.min(420,Math.max(120,above?rect.top-16:below))+'px';
   if(focus)(menu.querySelector('.active .gate-folder-main,[data-sort].active')||choices(pick)[0])?.focus();
  };
  trigger.addEventListener('click',()=>menu.hidden?open(false):closePick(pick));
  trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open(true);}});
  menu.addEventListener('click',e=>{if(e.target.closest('.gate-folder-main,[data-sort]'))closePick(pick,true);});
  pick.addEventListener('keydown',e=>{
   if(e.defaultPrevented)return;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePick(pick,true);return;}
   if(menu.hidden)return;
   if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const list=choices(pick),index=list.indexOf(document.activeElement);let next=index;if(e.key==='Home')next=0;else if(e.key==='End')next=list.length-1;else next=(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length;e.preventDefault();list[next]?.focus();}
  });
  pick.addEventListener('focusout',e=>{if(e.relatedTarget&&!pick.contains(e.relatedTarget))closePick(pick);});
 });
 document.addEventListener('pointerdown',e=>{document.querySelectorAll('.studio-pick').forEach(pick=>{if(!pick.contains(e.target))closePick(pick);});document.querySelectorAll('.studio-card-menu[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;});});
 window.addEventListener('resize',()=>document.querySelectorAll('.studio-card-menu[open]').forEach(menu=>menu.open=false));
 window.CanvasHome={
  syncControls(){const folder=byId('gateFolderTree')?.querySelector('.active .gate-folder-name');if(byId('studioFolderLabel'))byId('studioFolderLabel').textContent=folder?.textContent==='全部画布'?'全部文件夹':folder?.textContent||'全部文件夹';if(byId('studioSortLabel'))byId('studioSortLabel').textContent=byId('gateSortSwitch')?.querySelector('.active')?.textContent||'最近编辑';},
  renderRecent({items,trashMode,folderId,query,open,formatTime}){
   const section=byId('studioRecent'),list=byId('studioRecentList');
   section.hidden=trashMode||folderId!=='all'||Boolean(String(query||'').trim())||items.length<4;
   if(section.hidden){list.replaceChildren();return;}
   const stamp=value=>typeof value==='number'?value:Date.parse(value)||0;
   const recent=[...items].sort((a,b)=>stamp(b.updated_at||b.created_at)-stamp(a.updated_at||a.created_at)).slice(0,3),fragment=document.createDocumentFragment();
   for(const item of recent){const button=document.createElement('button');button.type='button';button.className='studio-recent-item';button.title=item.title||'未命名画布';const type=document.createElement('span');type.className='studio-recent-type';type.textContent=item.kind==='smart'?'智能':'经典';const info=document.createElement('span');info.className='studio-recent-info';const title=document.createElement('strong');title.textContent=item.title||'未命名画布';const time=document.createElement('small');time.textContent=formatTime(item.updated_at||item.created_at);info.append(title,time);button.append(type,info);button.onclick=()=>open(item.id);fragment.append(button);}
   list.replaceChildren(fragment);
  },
  coverMarkup(item){return window.CanvasCover.markup(item);},
  setLoadState(state,onRetry){
   retry=onRetry||retry;const feedback=byId('studioHomeFeedback');feedback.replaceChildren();feedback.hidden=state==='ready';byId('canvasGate').setAttribute('aria-busy',String(state==='loading'));
   if(state==='ready'){
    if(requestedCreate){requestedCreate=false;const url=new URL(window.location.href);url.searchParams.delete('create');history.replaceState(history.state,'',url);queueMicrotask(()=>window.CanvasHome.beginCreate());}
    return;
   }
   const message=document.createElement('span');message.textContent=state==='loading'?'正在加载画布…':'画布列表加载失败，请重试。';feedback.append(message);
   if(state==='error'){const button=document.createElement('button');button.type='button';button.textContent='重新加载';button.onclick=()=>retry?.();feedback.append(button);}
  },
  async beginCreate(){
   if(typeof canvas!=='undefined'&&canvas){
    // Use the existing flush guard before adding a new route out of a live document.
    if(!window.CanvasSession?.enabled&&!await flushClassicCanvasBeforeFrontendReload()){setStatus('画布尚未保存，请重试');return false;}
    await returnToCanvasManager();if(canvas)return false;
   }
   if(typeof trashMode!=='undefined'&&trashMode)await setTrashMode(false);
   setCreateMode(true);return true;
  }
 };
})();
