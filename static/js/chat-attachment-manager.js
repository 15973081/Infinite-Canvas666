(() => {
 'use strict';
 const trigger=document.getElementById('chatAttachmentManager');
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 async function api(url,init={}){const r=await fetch(url,init),data=await r.json().catch(()=>({}));if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'请求失败，请重试。');return data;}
 trigger.addEventListener('click',()=>{
  const dialog=node('dialog'),head=node('header'),title=node('h2','我的对话附件'),close=node('button','关闭'),help=node('p','新附件默认仅本人可访问。共享后当前空间成员可访问。移除输入框引用不会删除原文件；彻底删除会检查所有引用。'),list=node('div'),status=node('p');
  dialog.className='chat-attachment-dialog';dialog.setAttribute('aria-label','我的对话附件');close.type='button';close.onclick=()=>dialog.close();head.append(title,close);dialog.append(head,help,list,status);document.body.append(dialog);dialog.addEventListener('close',()=>{trigger.focus();dialog.remove();},{once:true});dialog.showModal();
  let offset=0;
  const action=(text,handler)=>{const b=node('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await handler();}catch(error){status.textContent=error.message;}finally{b.disabled=false;}};return b;};
  async function load(more=false){status.textContent='加载中…';if(!more){offset=0;list.replaceChildren();}const data=await api('/api/chat/attachments?offset='+offset);if(!dialog.isConnected)return;for(const file of data.files){const row=node('article'),label=node('p',file.name+' · '+(file.shared?'空间共享':'仅本人')+' · '+Math.ceil((file.size||0)/1024)+' KB');row.append(label);if(file.status==='ready'){const download=node('a','下载');download.href=file.url;download.target='_blank';download.rel='noopener';row.append(download,action(file.shared?'取消共享':'共享给当前空间',async()=>{if(!confirm(file.shared?'取消共享后，其他成员将无法再读取此附件。继续？':'共享后当前空间成员可以读取此附件。继续？'))return;await api('/api/chat/attachments/'+file.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({shared:!file.shared})});await load();}));}row.append(action(file.status==='deleting'?'重试删除':'彻底删除',async()=>{if(!confirm('彻底删除“'+file.name+'”及其预览？仍被引用时会拒绝删除；既有备份和已发送给模型的内容不在此删除范围。'))return;await api('/api/chat/attachments/'+file.id+'?confirm_permanent=true',{method:'DELETE'});await load();}));list.append(row);}status.textContent=data.files.length?'':'没有本人上传的对话附件。';if(data.next_offset!==null){const moreButton=action('加载更多',async()=>{moreButton.remove();offset=data.next_offset;await load(true);});list.append(moreButton);}}
  load().catch(error=>{status.textContent=error.message;});
 });
 Promise.resolve(window.CanvasSession?.ready).then(()=>{trigger.hidden=!window.CanvasSession?.enabled;});
})();
