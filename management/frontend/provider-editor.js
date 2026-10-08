(() => {
  'use strict';
  const modelKeys=['image_models','video_models','chat_models'];
  const secretKeys=['api_key','volcengine_access_key_id','volcengine_secret_access_key'];
  const explicit=['media_input_modes','id','name','base_url','protocol','enabled',...modelKeys,'proxy_url','image_request_mode','image_generation_endpoint','image_edit_endpoint','volcengine_project_name','volcengine_region'];
  function payload(row,values) {
    let extra;try{extra=JSON.parse(values.get('advanced') || '{}');}catch{throw new Error('高级配置不是有效 JSON。');}
    if(!extra || Array.isArray(extra) || typeof extra!=='object' || Object.keys(extra).some(k=>explicit.includes(k)))throw new Error('高级配置只填写模型价格、逐模型协议等附加选项；基础字段请在表单中修改。');
    const config={...extra};
    for(const key of ['name','base_url','protocol','proxy_url','image_request_mode','image_generation_endpoint','image_edit_endpoint'])config[key]=String(values.get(key) || '').trim();
    config.media_input_modes=Object.fromEntries(['image','video','audio'].map(kind=>[kind,String(values.get('media_mode_'+kind)||'url')]));
    config.enabled=values.has('enabled');
    for(const key of modelKeys)config[key]=[...new Set(String(values.get(key)||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];
    for(const key of ['volcengine_project_name','volcengine_region'])config[key]=String(values.get(key)||row.config?.[key]||'').trim();
    const secrets={},clear_secrets=[];
    for(const key of secretKeys){const value=String(values.get(key)||'').trim();if(value)secrets[key]=value;if(values.has('clear_'+key))clear_secrets.push(key);}
    if(clear_secrets.some(key=>secrets[key]))throw new Error('同一凭证不能同时替换和清除。');
    const id=row.id || String(values.get('id')||'').trim();
    if(!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id))throw new Error('平台 ID 请使用小写字母、数字、短横线或下划线，最多 40 个字符。');
    return {id,body:{config,secrets,clear_secrets,expected_version:row.version||0,reason:String(values.get('reason')||'').trim()}};
  }
  function rows(providers,presets) {
    const saved=new Map(providers.map(p=>[p.id,p]));
    const builtins=(presets?.builtin||[]).map(p=>({...p,...(saved.get(p.id)||{version:0,configured_secrets:[]}),builtin:true}));
    return [...builtins,...providers.filter(p=>!builtins.some(b=>b.id===p.id))];
  }
  function create({row,current,save,probe,diagnose,prices,onDirty=()=>{}}) {
    const config=row.config||{},form=document.createElement('form');form.className='provider-editor';
    const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
    const action=(text,fn,cls)=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;};
    const section=(title,description)=>{const s=node('section',undefined,'provider-block');s.append(node('h3',title),node('p',description,'muted'));form.append(s);return s;};
    const field=(parent,key,label,value='',{type='text',hint='',required=false,placeholder=''}={})=>{
      const l=node('label',label),input=node(type==='textarea'?'textarea':'input');input.name=key;input.value=value;input.required=required;
      if(type!=='textarea')input.type=type;input.placeholder=placeholder;input.maxLength=type==='password'?8192:2000;
      l.append(input);if(hint)l.append(node('small',hint,'muted'));parent.append(l);return input;
    };
    const select=(parent,key,label,options,value)=>{const l=node('label',label),input=node('select');input.name=key;
      for(const [id,text] of options){const o=node('option',text);o.value=id;input.append(o);}input.value=value;l.append(input);parent.append(l);return input;};
    const check=(parent,key,label,value=false)=>{const l=node('label',undefined,'check'),i=node('input');i.type='checkbox';i.name=key;i.checked=value;l.append(i,document.createTextNode(label));parent.append(l);return i;};
    const head=node('div',undefined,'provider-editor-head'),title=node('div');title.append(node('h2',config.name||'新增自定义平台'),node('p',row.description||(row.version?'配置地址、凭证和可用模型。':'填写配置后保存，再分配到协作空间。'),'muted'));
    const saveButton=node('button','保存配置','primary');saveButton.type='submit';head.append(title,saveButton);form.append(head);
    if(row.builtin && !row.version)form.append(node('div','内置平台 · 已准备默认配置，填写 Key 后保存即可。','provider-guide'));
    const basic=section('基本信息','平台名称与连接配置'),grid=node('div',undefined,'provider-fields');basic.append(grid);
    field(grid,'name','平台名称',config.name||'',{required:true,placeholder:'例如：团队 API'});
    const protocol=select(grid,'protocol','接口协议',[['openai','OpenAI 兼容'],['apimart','APIMART 异步协议'],['gemini','Gemini 原生协议'],['volcengine','火山引擎 · 方舟']],config.protocol||'openai');
    if(row.builtin) {protocol.disabled=true;const hidden=node('input');hidden.type='hidden';hidden.name='protocol';hidden.value=config.protocol;grid.append(hidden);}
    const base=field(basic,'base_url','请求地址',config.base_url||'',{type:'url',required:true,placeholder:'https://api.example.com/v1'});
    if(row.id)basic.append(node('small','平台 ID：'+row.id+' · 创建后保持不变','muted'));else field(basic,'id','平台 ID','api-'+crypto.randomUUID().slice(0,8),{required:true,hint:'已自动生成，也可自定义；之后改名不会改变 ID。'}).maxLength=40;
    check(basic,'enabled','启用平台',config.enabled!==false);
    const credentials=section('API Key','凭证仅写入加密存储，不回显；已配置时留空保留。');
    function secret(parent,key,label,hint=''){
      const configured=(row.configured_secrets||[]).includes(key);
      const input=field(parent,key,label,'',{type:'password',hint:hint||(configured?'已配置 · 留空保留':'尚未配置'),placeholder:configured?'留空保留已保存凭证':'粘贴 '+label});input.autocomplete='off';
      if(configured)check(parent,'clear_'+key,'清除已保存的 '+label);
    }
    secret(credentials,'api_key','API Key');
    const volc=section('火山引擎 · 素材库','方舟 API Key 用于模型生成；素材库 AK/SK 用于素材上传，两者不能互相替代。');
    const volcGrid=node('div',undefined,'provider-fields');volc.append(volcGrid);secret(volcGrid,'volcengine_access_key_id','Access Key ID');secret(volcGrid,'volcengine_secret_access_key','Secret Access Key');
    field(volcGrid,'volcengine_project_name','ProjectName',config.volcengine_project_name||'default',{hint:'与生成所用方舟 API Key 的项目保持一致。'});
    field(volcGrid,'volcengine_region','Region',config.volcengine_region||'cn-beijing',{hint:'旧版默认地域：cn-beijing。'});
    const volcHint=node('div','方舟默认地址：https://ark.cn-beijing.volces.com/api/v3。视频模型已按旧版预填；对话模型可填写控制台中的 ep-… 推理接入点。','provider-guide');basic.append(volcHint);
    function visibility(){const enabled=protocol.value==='volcengine';volc.hidden=volcHint.hidden=!enabled;for(const i of volc.querySelectorAll('input'))i.disabled=!enabled;}
    protocol.onchange=()=>{visibility();onDirty(true);};visibility();
    const models=section('模型列表','从上游拉取后选择应用，也可手动维护。已有模型、逐模型协议和历史价格会保留。');
    const modelActions=node('div',undefined,'toolbar');
    const probeButton=action('拉取上游模型',()=>{if(!form.reportValidity())return;if(form.dataset.dirty==='true'){status.textContent='请先保存当前配置，再拉取上游模型。';return;}probe();});
    probeButton.disabled=!row.version;modelActions.append(probeButton);
    if((row.id==='volcengine'||config.protocol==='volcengine')&&config.video_models?.length&&row.version)modelActions.append(action('视频规格价格',()=>{if(form.dataset.dirty==='true'){status.textContent='请先保存当前配置，再编辑价格。';return;}prices();}));
    models.append(modelActions);if(!row.version)models.append(node('p','首次配置请先保存地址与 Key，再拉取模型。','muted'));
    const modelTabs=node('div',undefined,'provider-model-tabs'),panels=[];models.append(modelTabs);
    const labels=['生图模型','视频模型','对话模型'],hints=['供在线生图和画布图片节点选择。','供画布视频生成节点选择。','供 GPT 对话和画布 LLM 节点选择。'];
    modelKeys.forEach((key,index)=>{const panel=node('div'),tab=action(labels[index]+' · '+(config[key]||[]).length,()=>{panels.forEach((p,i)=>p.hidden=i!==index);for(const b of modelTabs.children)b.classList.toggle('active',b===tab);});
      panel.hidden=index!==0;tab.classList.toggle('active',index===0);field(panel,key,labels[index],(config[key]||[]).join('\n'),{type:'textarea',hint:hints[index]+' 每行一个模型 ID。',placeholder:'从上游拉取，或粘贴模型 ID'}).maxLength=100000;
      modelTabs.append(tab);models.append(panel);panels.push(panel);});
    const mediaModes=node('section',undefined,'provider-block');mediaModes.append(node('h3','参考素材传输方式'),node('p','按素材类型选择，默认 URL。适用于支持对应格式的生成接口；已认证素材优先 asset://。认证及 APIMart 视频等仅接受 URL 的接口仍使用 URL，文件编辑与 Gemini 内联接口保留其必需格式。未配置可访问的存储地址时 URL 模式兼容原有传输方式。','muted'));
    for(const [kind,label] of [['image','图片'],['video','视频'],['audio','音频']])select(mediaModes,'media_mode_'+kind,label,[['url','URL（默认）'],['base64','Base64']],config.media_input_modes?.[kind]||'url');
    form.append(mediaModes);
    const advanced=node('details',undefined,'provider-block');advanced.append(node('summary','高级连接与模型配置'));form.append(advanced);
    select(advanced,'image_request_mode','图片请求格式',[['openai','自动 / OpenAI'],['openai-json','OpenAI JSON']],config.image_request_mode||'openai');
    field(advanced,'proxy_url','代理地址',config.proxy_url||'',{type:'url',placeholder:'http://127.0.0.1:7890',hint:'按供应商支持情况使用；留空不单独指定。'});
    field(advanced,'image_generation_endpoint','生图接口覆盖',config.image_generation_endpoint||'',{placeholder:'/v1/images/generations'});
    field(advanced,'image_edit_endpoint','编辑接口覆盖',config.image_edit_endpoint||'',{placeholder:'/v1/images/edits'});
    const extras=Object.fromEntries(Object.entries(config).filter(([key])=>!explicit.includes(key)&&!['ms_loras','ms_defaults_version'].includes(key)));
    field(advanced,'advanced','附加配置 JSON',JSON.stringify(extras,null,2),{type:'textarea',hint:'model_protocols 可为单个模型指定协议；model_prices 为价格记录。留空字段不改变其他空间分配。'}).maxLength=2000000;
    if(row.version)advanced.append(action('协议与任务端点诊断',()=>{if(form.dataset.dirty==='true'){status.textContent='请先保存当前配置，再进行诊断。';return;}diagnose();}));
    const navigation=node('div',undefined,'provider-section-tabs');navigation.setAttribute('role','tablist');navigation.setAttribute('aria-label','供应商配置分区');
    const groups=[['连接',[basic]],['凭证',[credentials,volc]],['模型',[models]],['高级配置',[mediaModes,advanced]]];
    const sectionPanels=[],sectionTabs=[];
    function activate(index,focus=false){sectionPanels.forEach((panel,i)=>panel.hidden=i!==index);sectionTabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});if(focus)sectionTabs[index].focus();}
    groups.forEach(([name,sections],index)=>{
      const panel=node('div',undefined,'provider-section-panel'),tab=action(name,()=>activate(index));
      const id='provider-section-'+index;panel.id=id;panel.setAttribute('role','tabpanel');tab.id=id+'-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',id);panel.setAttribute('aria-labelledby',tab.id);
      panel.append(...sections);navigation.append(tab);sectionPanels.push(panel);sectionTabs.push(tab);
      tab.onkeydown=event=>{let target;if(event.key==='ArrowRight')target=(index+1)%groups.length;if(event.key==='ArrowLeft')target=(index+groups.length-1)%groups.length;if(event.key==='Home')target=0;if(event.key==='End')target=groups.length-1;if(target!==undefined){event.preventDefault();activate(target,true);}};
    });
    advanced.open=true;form.append(navigation,...sectionPanels);activate(0);
    form.addEventListener('invalid',event=>{const index=sectionPanels.findIndex(panel=>panel.contains(event.target));if(index>=0)activate(index);},true);
    const footer=node('div',undefined,'provider-save-footer');field(footer,'reason','本次修改说明',row.version?'调整供应商配置':'配置供应商连接',{required:true,hint:'随配置变更记录，便于回溯。'}).maxLength=1000;
    const status=node('p','','provider-save-status');status.setAttribute('role','status');const bottom=node('button','保存配置','primary');bottom.type='submit';footer.append(bottom,status);form.append(footer);
    form.oninput=()=>{form.dataset.dirty='true';onDirty(true);status.textContent='有未保存的修改';};form.onchange=form.oninput;
    form.onsubmit=async e=>{e.preventDefault();if(!current()||form.dataset.saving==='true')return;
      let controls=[];status.textContent='正在保存…';
      try{const value=payload(row,new FormData(form));form.dataset.saving='true';controls=[...form.querySelectorAll('input,textarea,select,button')].map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);await save(value);if(current()){form.dataset.dirty='false';onDirty(false);status.textContent='配置已保存';}}
      catch(error){if(current())status.textContent=error.message;}
      finally{form.dataset.saving='false';controls.forEach(([control,disabled])=>control.disabled=disabled);}
    };
    return form;
  }
  const api={payload,rows,create};if(typeof module==='object'&&module.exports)module.exports=api;else window.ManagementProviderEditor=api;
})();
