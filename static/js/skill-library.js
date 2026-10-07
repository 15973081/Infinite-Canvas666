(() => {
 'use strict';
 const $=id=>document.getElementById(id), grid=$('skillGrid'), status=$('skillStatus');
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 let scope='all',query='',offset=0,sequence=0,busy=false,timer;
 const dropzone=$('skillDropzone'), dropMessage=$('skillDropMessage');
 const dropHelp='支持 .md 和 .zip，每次一个文件，最大 2 MiB；导入前可预览。';
 let canImport=false, importPending=false, dragDepth=0;
 function dropState(state,message){dropzone.dataset.state=state;dropMessage.textContent=message;}
 function resetDrag(){dragDepth=0;delete dropzone.dataset.dragging;}
 async function api(url,init={}){const response=await fetch(url,init),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:(window.CanvasSession?.errorText?.(data)||'请求失败，请重试。'));return data;}
 const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 function button(text,action,cls){const e=node('button',text,cls);e.type='button';e.addEventListener('click',async()=>{e.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{e.disabled=false;}});return e;}
 function dialog(title){const e=node('dialog',undefined,'skill-dialog'),head=node('header',undefined,'skill-dialog-head');e.setAttribute('aria-label',title);head.append(node('h2',title),button('关闭',()=>{if(e.dataset.locked!=='true')e.close();}));e.append(head);document.body.append(e);e.addEventListener('cancel',event=>{if(e.dataset.locked==='true')event.preventDefault();});e.addEventListener('close',()=>e.remove(),{once:true});e.addEventListener('click',event=>{if(event.target===e&&e.dataset.locked!=='true'){const r=e.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)e.close();}});e.showModal();return e;}
 async function details(skill){const e=dialog('Skill 详情'),loading=node('p','加载中…');e.append(loading);try{const data=await api('/api/skills/'+skill.id);if(!e.isConnected)return;loading.remove();e.append(node('h3',data.name),node('p',data.description),node('p','上传者：'+data.uploader_name+' · 来源：'+data.origin_workspace_name,'skill-meta'));for(const warning of data.warnings||[])e.append(node('p',warning,'skill-warning'));e.append(node('pre',data.instructions));for(const [path,text] of Object.entries(data.references||{})){const section=node('details');section.append(node('summary',path),node('pre',text));e.append(section);}e.append(node('p','仅作为文字参考，不会执行脚本或操作平台。','skill-meta'));if(skill.can_edit&&!skill.withdrawn){const footer=node('footer');footer.append(button(skill.visibility==='shared'?'改为本空间可见':'共享给其他空间',async()=>{await api('/api/skills/'+skill.id,json('PATCH',{visibility:skill.visibility==='shared'?'workspace':'shared'}));e.close();await load();}));footer.append(button('撤下发布',async()=>{if(!confirm('撤下后不再接受新安装。其他空间已安装的固定版本和历史对话会保留。'))return;await api('/api/skills/'+skill.id,{method:'DELETE'});e.close();await load();},'skill-danger'));e.append(footer);}}catch(error){loading.textContent=error.message;}}
 function card(skill){const e=node('article',undefined,'skill-card');e.dataset.enabled=String(skill.enabled);const head=node('div',undefined,'skill-card-head');head.append(node('span',skill.visibility==='shared'?'SHARED / 跨空间':'WORKSPACE / 本空间','skill-tag'),node('span',skill.withdrawn?'已撤下':skill.installed_version_id?'已安装':'待安装','skill-tag'));e.append(head,node('h2',skill.name),node('div',skill.description,'skill-description'));const meta=node('div',undefined,'skill-meta');meta.append(node('div','上传者：'+skill.uploader_name),node('div','来源：'+skill.origin_workspace_name));e.append(meta);const foot=node('div',undefined,'skill-card-foot');foot.append(button('查看详情',()=>details(skill)));if(skill.installed_version_id){const label=node('label',undefined,'skill-enabled'),check=node('input');check.type='checkbox';check.checked=skill.enabled;check.setAttribute('aria-label','启用 '+skill.name);check.addEventListener('change',async()=>{check.disabled=true;try{await api('/api/skills/'+skill.id+'/preference',json('PATCH',{enabled:check.checked}));skill.enabled=check.checked;e.dataset.enabled=String(check.checked);}catch(error){check.checked=skill.enabled;status.textContent=error.message;}finally{check.disabled=false;}});label.append(check,node('span','本人启用'));foot.append(label);if(skill.can_uninstall)foot.append(button('卸载',async()=>{if(!confirm('从当前空间卸载？同空间成员将无法再选择它，历史对话会保留。'))return;await api('/api/skills/'+skill.id+'/install',{method:'DELETE'});await load();}));}else if(skill.can_install)foot.append(button('安装到本空间',async()=>{await api('/api/skills/'+skill.id+'/install',{method:'POST'});await load();},'skill-primary'));e.append(foot);return e;}
 async function load(more=false){const current=++sequence;busy=true;grid.setAttribute('aria-busy','true');$('skillMore').disabled=true;status.textContent=more?'加载更多…':'正在加载 Skill 库…';if(!more)offset=0;try{const data=await api('/api/skills?'+new URLSearchParams({scope,q:query,offset:String(offset),limit:'60'}));if(current!==sequence)return;if(!more)grid.replaceChildren();for(const skill of data.skills)grid.append(card(skill));offset+=data.skills.length;canImport=Boolean(data.can_import);$('skillImport').disabled=$('skillChooseFile').disabled=!canImport;dropState(canImport?'ready':'disabled',canImport?dropHelp:'当前成员没有导入权限，可浏览或使用已启用的 Skill。');$('skillMore').hidden=!data.has_more;if(!offset)grid.append(node('div',query?'没有匹配的 Skill，试试其他关键词。':'这里还没有 Skill。导入一个技能包，或浏览跨空间共享。','skill-empty'));status.textContent=offset?'已显示 '+offset+' 个 Skill · 仅文字对话':'';}catch(error){if(current!==sequence)return;status.textContent=error.message;canImport=false;$('skillImport').disabled=$('skillChooseFile').disabled=true;dropState('disabled','暂时无法确认导入权限，请刷新重试。');if(!more)grid.replaceChildren(button('加载失败，点击重试',()=>load(),'skill-empty'));$('skillMore').hidden=true;}finally{if(current===sequence){busy=false;grid.setAttribute('aria-busy','false');$('skillMore').disabled=false;}}}
 async function preview(file){
  const e=dialog('导入 Skill'),message=node('p'),error=node('p');
  const fileSummary=node('div',undefined,'skill-file-summary');
  fileSummary.append(node('strong',file.name),node('span',(file.size/1024).toFixed(1)+' KiB · '+(/\.zip$/i.test(file.name)?'ZIP 技能包':'Markdown 文档')));
  const activity=node('div',undefined,'skill-import-activity'),phase=node('p'),progress=node('progress');
  phase.setAttribute('role','status');phase.setAttribute('aria-live','polite');
  progress.setAttribute('aria-label','文件处理进度');activity.append(phase,progress);
  error.setAttribute('role','alert');e.append(fileSummary,activity,message,error);
  const footer=node('footer');e.append(footer);
  const controller=new AbortController();e.addEventListener('close',()=>controller.abort(),{once:true});
  const close=e.querySelector('.skill-dialog-head button');
  const setActivity=(text,pending)=>{phase.textContent=text;progress.hidden=!pending;e.setAttribute('aria-busy',String(pending));};
  async function read(){
   error.textContent='';footer.replaceChildren();setActivity('正在上传并校验文件…',true);
   const form=new FormData();form.append('file',file);
   try{
    const data=await api('/api/skills/preview',{method:'POST',body:form,signal:controller.signal});
    if(!e.isConnected)return;
    setActivity('校验完成 · 确认内容后再导入',false);message.textContent=data.name+' · '+data.description;
    const contents=node('section');contents.append(node('p','将以当前登录成员作为上传者。安装后仅用于提示词优化。'));
    for(const warning of data.warnings||[])contents.append(node('p',warning,'skill-warning'));
    contents.append(node('pre',data.instructions));
    const label=node('label','可见范围'),select=node('select');select.setAttribute('aria-label','可见范围');
    for(const [value,text]of[['workspace','仅本空间'],['shared','跨空间共享']]){const option=node('option',text);option.value=value;select.append(option);}
    label.append(select);contents.append(label);e.insertBefore(contents,footer);
    const submit=button('确认导入并安装',async()=>{
     if(importPending)return;
     importPending=true;e.dataset.locked='true';close.disabled=select.disabled=true;
     error.textContent='';submit.textContent='正在上传并安装…';setActivity('正在上传并安装，请勿关闭页面…',true);
     const body=new FormData();body.append('file',file);body.append('visibility',select.value);
     try{
      await api('/api/skills/import',{method:'POST',body});
      delete e.dataset.locked;e.close();await load();
      status.textContent='已导入并安装，AI 对话中输入 @ 即可选择。';
      dropState(canImport?'success':'disabled',canImport?'导入完成，可以继续拖入下一个 Skill。':dropMessage.textContent);
     }catch(err){
      error.textContent=err.message;setActivity('导入失败 · 文件与可见范围已保留，可重试',false);submit.textContent='重试导入';
     }finally{
      importPending=false;delete e.dataset.locked;close.disabled=select.disabled=false;
     }
    },'skill-primary');footer.append(submit);
   }catch(err){
    if(!e.isConnected||err.name==='AbortError')return;
    message.textContent='未导入或安装此文件。';error.textContent=err.message;
    setActivity('校验失败 · 可重试或选择其他文件',false);
    footer.append(button('重新校验',read),button('选择其他文件',()=>{e.close();chooseFile();}));
   }
  }
  await read();
 }
 function chooseFile(){if(canImport&&!importPending&&!document.querySelector('dialog[open]'))$('skillFile').click();}
 function importFiles(files){
  resetDrag();
  if(!canImport){dropState('error','当前无法导入，请检查导入权限或刷新页面。');return;}
  if(importPending||document.querySelector('dialog[open]'))return;
  if(files.length!==1){dropState('error','每次导入一个 .md 或 .zip 文件；多个 Skill 请分别导入。');return;}
  const file=files[0];
  if(!/\.(md|zip)$/i.test(file.name)){dropState('error','格式不支持，请选择 .md 文档或 .zip 技能包。');return;}
  if(!file.size){dropState('error','文件为空，请选择包含 Skill 内容的文件。');return;}
  if(file.size>2*1024*1024){dropState('error','文件超过 2 MiB，请精简技能包后重试。');return;}
  dropState('ready',dropHelp);preview(file);
 }
 const hasFiles=event=>Array.from(event.dataTransfer?.types||[]).includes('Files')||Boolean(event.dataTransfer?.files.length);
 document.addEventListener('dragenter',event=>{if(!hasFiles(event))return;event.preventDefault();dragDepth++;if(canImport&&!importPending&&!document.querySelector('dialog[open]'))dropzone.dataset.dragging='true';});
 document.addEventListener('dragover',event=>{if(!hasFiles(event))return;event.preventDefault();event.dataTransfer.dropEffect=canImport&&!importPending&&!document.querySelector('dialog[open]')?'copy':'none';});
 document.addEventListener('dragleave',event=>{if(!hasFiles(event))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)resetDrag();});
 document.addEventListener('drop',event=>{
  if(!hasFiles(event))return;event.preventDefault();resetDrag();
  if(Array.from(event.dataTransfer.items||[]).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){dropState('error','请拖入 .md 文件或 .zip 技能包，不支持直接拖入文件夹。');return;}
  importFiles(Array.from(event.dataTransfer.files));
 });
 window.addEventListener('blur',resetDrag);
 document.addEventListener('dragend',resetDrag);
 $('skillScopes').addEventListener('click',event=>{const target=event.target.closest('[data-scope]');if(!target)return;scope=target.dataset.scope;for(const b of $('skillScopes').children)b.setAttribute('aria-pressed',String(b===target));load();});
 $('skillSearch').addEventListener('input',()=>{query=$('skillSearch').value.trim();clearTimeout(timer);timer=setTimeout(()=>load(),180);});$('skillRefresh').addEventListener('click',()=>load());$('skillMore').addEventListener('click',()=>{if(!busy)load(true);});$('skillImport').addEventListener('click',chooseFile);$('skillChooseFile').addEventListener('click',chooseFile);$('skillFile').addEventListener('change',()=>{const files=Array.from($('skillFile').files);$('skillFile').value='';if(files.length)importFiles(files);});
 $('skillTemplateDownload').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([$('skillTemplate').content.textContent.trim()+'\n'],{type:'text/markdown;charset=utf-8'})),link=node('a');link.href=url;link.download='SKILL.md';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 Promise.resolve(window.CanvasSession?.ready).then(()=>load()).catch(error=>{status.textContent=error.message;});
})();
