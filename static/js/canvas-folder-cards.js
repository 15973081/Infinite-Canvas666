/* Folder cards reuse catalog thumbnails and existing folder operations. */
(() => {
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function positionMenus(){
  document.querySelectorAll('.project-folder-menu[open]').forEach(menu=>{
   const rect=menu.querySelector('summary').getBoundingClientRect(),actions=menu.querySelector('.project-folder-actions');
   actions.style.left=Math.max(12,Math.min(rect.right-actions.offsetWidth,innerWidth-actions.offsetWidth-12))+'px';
   actions.style.top=Math.max(12,rect.bottom+actions.offsetHeight+6>innerHeight?rect.top-actions.offsetHeight-6:rect.bottom+6)+'px';
  });
 }
 function card(folder,options){
  const {canvases,folders,open,rename,remove,createChild,move,formatTime}=options;
  const items=canvases.filter(item=>(item.folder_id||'')===folder.id);
  const children=folders.filter(item=>(item.parent_id||'')===folder.id);
  const updated=Math.max(Number(folder.updated_at||folder.created_at)||0,...items.map(item=>Number(item.updated_at||item.created_at)||0));
  const element=document.createElement('div');element.className='project-folder-card';element.dataset.folderCard=folder.id;
  const previews=Array.from({length:3},(_,i)=>items[i]
   ? window.CanvasCoverPreview.markup(items[i])
   : '<div class="project-folder-placeholder"><i data-lucide="folder"></i></div>').join('');
  element.innerHTML=`<button class="project-folder-open" type="button" aria-label="打开文件夹 ${escape(folder.name)}">
   <span class="project-folder-mosaic" aria-hidden="true">${previews}<span class="project-folder-enter"><i data-lucide="folder-open"></i>打开文件夹</span></span>
   <span class="project-folder-info"><strong title="${escape(folder.name)}">${escape(folder.name)}</strong><span class="project-folder-meta"><span>${updated?'更新于 '+escape(formatTime(updated)):'文件夹'}</span><span>${items.length} 个画布${children.length?' · '+children.length+' 个子文件夹':''}</span></span></span>
  </button>
  <details class="project-folder-menu"><summary aria-label="文件夹操作：${escape(folder.name)}"><i data-lucide="ellipsis"></i></summary><div class="project-folder-actions">
   <button type="button" data-action="child"><i data-lucide="folder-plus"></i>新建子文件夹</button>
   <button type="button" data-action="rename"><i data-lucide="pencil"></i>重命名</button>
   <button type="button" data-action="delete"><i data-lucide="trash-2"></i>删除文件夹</button>
  </div></details>`;
  element.querySelector('.project-folder-open').onclick=()=>open(folder.id);
  const menu=element.querySelector('details');
  const handlers={child:createChild,rename,delete:remove};
  menu.addEventListener('click',event=>{const action=event.target.closest('[data-action]');if(action){menu.open=false;handlers[action.dataset.action](folder.id);}});
  menu.addEventListener('toggle',()=>{if(menu.open){document.querySelectorAll('.project-folder-menu[open],.studio-card-menu[open]').forEach(other=>{if(other!==menu)other.open=false;});positionMenus();}});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary').focus();}});
  element.addEventListener('dragover',event=>{if(!event.dataTransfer?.types.includes('text/canvas-id'))return;event.preventDefault();element.classList.add('drag-over');});
  element.addEventListener('dragleave',event=>{if(!element.contains(event.relatedTarget))element.classList.remove('drag-over');});
  element.addEventListener('drop',event=>{element.classList.remove('drag-over');const id=event.dataTransfer?.getData('text/canvas-id');if(id){event.preventDefault();move(id,folder.id);}});
  return element;
 }
 document.addEventListener('pointerdown',event=>document.querySelectorAll('.project-folder-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;}));
 window.addEventListener('resize',positionMenus);
 document.addEventListener('scroll',positionMenus,true);
 window.CanvasFolderCards=Object.freeze({card});
})();
