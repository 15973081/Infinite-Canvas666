/* Per-member, browser-local preferences. Existing canvas content is never rewritten. */
(() => {
  if(window.CanvasPreferences)return;
  const fonts=[12,14,15,16,18], defaults={font:14,connections:true,dots:true,names:{},prompts:[]};
  const shortcutKeys=['a','z','f6','f7','f8','f9'];
  const labels={image:'图像生成节点',video:'视频生成节点',text:'文本生成节点',audio:'音频生成节点',model:'3D模型生成节点'};
  const key=()=> 'canvas-preferences:v1:'+(window.CanvasSession?.context?.member?.id||'local');
  const clean=value=>({font:fonts.includes(value?.font)?value.font:14,connections:value?.connections!==false,dots:value?.dots!==false,
    shortcuts:value?.shortcuts&&value.shortcuts.asset!==value.shortcuts.zoom&&shortcutKeys.includes(value.shortcuts.asset)&&shortcutKeys.includes(value.shortcuts.zoom)?{asset:value.shortcuts.asset,zoom:value.shortcuts.zoom}:{asset:'a',zoom:'z'},
    names:Object.fromEntries(Object.keys(labels).map(k=>[k,typeof value?.names?.[k]==='string'?value.names[k].trim().slice(0,80):''])),
    prompts:Array.isArray(value?.prompts)?value.prompts.filter(p=>p&&typeof p.provider==='string'&&typeof p.model==='string'&&typeof p.text==='string').slice(0,100).map(p=>({provider:p.provider.slice(0,100),model:p.model.slice(0,200),text:p.text.slice(0,4000)})):[]});
  let value=clean(defaults), observer, queued=false, dialog;
  function selectedLines(){
    queued=false;
    const selected=new Set([...document.querySelectorAll('#world .image-node.selected')].map(n=>n.dataset.id));
    document.querySelectorAll('#world .smart-connection[data-from]').forEach(edge=>{
      edge.style.display=value.connections||selected.has(edge.dataset.from)||selected.has(edge.dataset.to)?'':'none';
    });
  }
  function apply(){
    document.documentElement.style.setProperty('--canvas-prompt-font',value.font+'px');
    document.documentElement.dataset.canvasDots=String(value.dots);selectedLines();
    document.querySelectorAll('[data-preference-shortcut]').forEach(n=>n.textContent=value.shortcuts[n.dataset.preferenceShortcut]?.toUpperCase()||'');
    window.dispatchEvent(new CustomEvent('canvas-preferences:changed',{detail:structuredClone(value)}));
  }
  function load(){try{value=clean(JSON.parse(localStorage.getItem(key())||'{}'));}catch(_){value=clean(defaults);}apply();}
  function start(){
    if(!window.CanvasSession?.enabled||window.CanvasSession.context)load();
    const world=document.getElementById('world');if(world&&!observer){observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(selectedLines);}});observer.observe(world,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});}
  }
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
  function show(){
    if(dialog?.open){dialog.focus();return;}
    dialog?.remove();dialog=null;
    const bound=window.CanvasSession?.context?.member?.id;
    if(window.CanvasSession?.enabled&&(!bound||window.CanvasSession.paused))throw Error('请先确认登录状态。');
    if(!document.getElementById('account-panel-style')){const css=el('link');css.id='account-panel-style';css.rel='stylesheet';css.href='/static/css/account-panel.css';document.head.append(css);}
    load();let draft=structuredClone(value),dirty=false;const previous=document.activeElement;
    const root=el('dialog',undefined,'canvas-preferences');dialog=root;root.setAttribute('aria-label','偏好管理');
    const close=()=>{if(dirty&&!window.confirm('偏好尚未保存，确定关闭？'))return;root.close();};
    const header=el('header'),x=button('×',close);x.className='account-close';x.setAttribute('aria-label','关闭偏好管理');header.append(el('h2','偏好管理'),x);
    const layout=el('div',undefined,'preferences-layout'),form=el('form'),preview=el('aside',undefined,'preferences-preview'),status=el('p','','account-status');status.setAttribute('role','status');
    function row(title,hint,control){const label=el('label',undefined,'preference-row'),text=el('div');text.append(el('strong',title));if(hint)text.append(el('small',hint));label.append(text,control);form.append(label);return control;}
    const font=el('select');font.setAttribute('aria-label','提示词输入框字体大小');['小','标准','标准+1','标准+2','大'].forEach((name,i)=>font.append(new Option(name,String(fonts[i]))));font.value=String(draft.font);
    row('提示词输入框 - 字体大小','调整输入框和节点文本的显示大小',font);
    const lines=el('input');lines.type='checkbox';lines.checked=draft.connections;lines.setAttribute('aria-label','画布连接线显示');row('画布-连接线显示','关闭后点击节点显示对应的上下游连接线',lines);
    const shortcuts=el('details');shortcuts.append(el('summary','快捷键 · 自定义'));
    const shortcutInputs={};
    for(const [kind,title]of [['asset','打开 / 关闭资源库'],['zoom','切换缩小预览']]){const label=el('label',title),select=el('select');select.setAttribute('aria-label',title);shortcutKeys.forEach(k=>select.append(new Option(k.toUpperCase(),k)));select.value=draft.shortcuts[kind];label.append(select);shortcuts.append(label);shortcutInputs[kind]=select;}
    shortcuts.append(el('p','复制、粘贴、撤销等组合键沿用画布标准键位。','account-muted'),button('查看全部快捷键',()=>{if(dirty&&!window.confirm('偏好尚未保存，确定离开？'))return;root.close();window.openSmartCanvasShortcuts?.();}));form.append(shortcuts);
    const names=el('details'),summary=el('summary','默认节点名称 · 自定义');names.append(summary);const nameInputs={};
    for(const [kind,label]of Object.entries(labels)){const item=el('label',label),input=el('input');input.maxLength=80;input.value=draft.names[kind]||'';input.placeholder=label;item.append(input);names.append(item);nameInputs[kind]=input;}form.append(names);
    const promptSettings=el('details');promptSettings.append(el('summary','模型默认填充文本内容 · 自定义'),el('p','仅在新建空白生成节点时填充，不改变已有节点。','account-muted'));
    const promptRows=el('div');promptSettings.append(promptRows);const catalog=window.CanvasPreferenceModels?.()||[];
    function addPrompt(saved){const block=el('div',undefined,'preference-prompt'),select=el('select'),text=el('textarea');select.setAttribute('aria-label','默认文本的模型');select.append(new Option('请选择模型',''));
      const choices=[...catalog];if(saved&&!choices.some(c=>c.provider===saved.provider&&c.model===saved.model))choices.push(saved);
      choices.forEach(c=>select.append(new Option((c.providerName||c.provider)+' / '+c.model,JSON.stringify([c.provider,c.model]))));if(saved)select.value=JSON.stringify([saved.provider,saved.model]);
      text.setAttribute('aria-label','模型默认填充文本');text.maxLength=4000;text.placeholder='请输入默认填充文本';text.value=saved?.text||'';
      const remove=button('移除',()=>{block.remove();dirty=true;});block.append(select,text,remove);promptRows.append(block);}
    draft.prompts.forEach(addPrompt);const add=button('新增',()=>{addPrompt();dirty=true;});promptSettings.append(add);if(!catalog.length)promptSettings.append(el('p','当前空间没有可用模型，可在配置模型后新增。','account-muted'));add.disabled=!catalog.length;form.append(promptSettings);
    const dots=el('input');dots.type='checkbox';dots.checked=draft.dots;dots.setAttribute('aria-label','显示点阵背景图');row('画布背景','显示点阵背景图',dots);
    const previewNode=el('div',undefined,'preference-preview-node'),previewText=el('textarea');previewText.readOnly=true;previewText.value='这是一句提示词文本';previewText.setAttribute('aria-label','偏好预览提示词');previewNode.append(el('strong','文生视频'),previewText,el('small','16:9　·　1080P　·　5s'));preview.append(el('small','偏好预览'),previewNode);
    function renderPreview(){preview.style.backgroundImage=dots.checked?'radial-gradient(#464650 1px,transparent 1px)':'none';previewText.style.fontSize=font.value+'px';previewNode.classList.toggle('preview-lines',lines.checked);}
    form.oninput=()=>{dirty=true;renderPreview();};form.onchange=()=>{dirty=true;renderPreview();};
    const actions=el('div',undefined,'preferences-actions'),save=el('button','保存偏好');save.type='submit';
    const restore=button('恢复默认',()=>{font.value='14';lines.checked=dots.checked=true;shortcutInputs.asset.value='a';shortcutInputs.zoom.value='z';Object.values(nameInputs).forEach(i=>i.value='');promptRows.replaceChildren();dirty=true;renderPreview();});actions.append(restore,save);form.append(status,el('p','保存在本浏览器，按登录账号分别生效。','account-muted'),actions);
    form.onsubmit=e=>{e.preventDefault();try{
      if(window.CanvasSession?.enabled&&(window.CanvasSession.paused||window.CanvasSession.context?.member?.id!==bound))throw Error('登录状态已变化，请重新打开偏好管理。');
      const prompts=[],seen=new Set();for(const block of promptRows.children){const select=block.querySelector('select'),text=block.querySelector('textarea');if(!select.value||!text.value.trim())throw Error('请选择模型并填写默认文本，或移除空白项。');if(seen.has(select.value))throw Error('同一模型只能设置一条默认文本。');seen.add(select.value);const [provider,model]=JSON.parse(select.value);prompts.push({provider,model,text:text.value});}
      if(prompts.length>100)throw Error('最多保存 100 条模型默认文本。');
      if(shortcutInputs.asset.value===shortcutInputs.zoom.value)throw Error('两个画布快捷键不能相同。');
      draft=clean({font:Number(font.value),connections:lines.checked,dots:dots.checked,shortcuts:{asset:shortcutInputs.asset.value,zoom:shortcutInputs.zoom.value},names:Object.fromEntries(Object.entries(nameInputs).map(([k,n])=>[k,n.value])),prompts});
      localStorage.setItem(key(),JSON.stringify(draft));value=draft;apply();dirty=false;status.textContent='偏好已保存';
    }catch(error){status.textContent=error.message||'保存失败，请检查浏览器存储权限。';}};
    const paused=()=>{dirty=false;root.close();};window.addEventListener('member-session:paused',paused);
    root.addEventListener('cancel',e=>{e.preventDefault();close();});root.addEventListener('close',()=>{window.removeEventListener('member-session:paused',paused);root.remove();if(dialog===root){dialog=null;if(previous?.isConnected)previous.focus();}},{once:true});
    for(const type of ['keydown','mousedown','wheel','dblclick'])root.addEventListener(type,e=>e.stopPropagation());
    layout.append(form,preview);root.append(header,layout);document.body.append(root);renderPreview();root.showModal();
  }
  window.CanvasPreferences={show,get:()=>structuredClone(value),shortcut:kind=>value.shortcuts[kind],defaultName(base){const kind=Object.keys(labels).find(k=>labels[k]===base);return kind&&value.names[kind]||base;},
    applyNode(node){if(!node.generationKind||node.images?.length)return;const settings=node.runSettings||{},video=node.generationKind==='video',provider=video?settings.videoProvider:settings.provider_id,model=video?settings.videoModel:settings.model;const p=value.prompts.find(p=>p.provider===provider&&p.model===model);if(p&&!node.promptDraftTouched&&!node.promptDraftText){node.promptDraftText=p.text;node.promptDraftHtml=p.text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));node.promptDraftTouched=true;}}};
  window.addEventListener('member-session:ready',load);window.addEventListener('member-session:paused',()=>{value=clean(defaults);apply();});
  window.addEventListener('storage',e=>{if(e.key===key()&&!window.CanvasSession?.paused)load();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
