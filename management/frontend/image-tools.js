/* Both tools are saved as one versioned workspace configuration. */
(() => {
  function create({data,save}) {
    const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const form=el('form');form.className='card';
    form.append(el('h2','图片工具'),el('p','基于选中的图片生成。模型、比例、清晰度和提示词统一应用于当前空间；每次生成 1 张，按所选模型正常计费。'));
    const controls={};
    const field=(parent,title,control)=>{const label=el('label',title);control.setAttribute('aria-label',title);label.append(control);parent.append(label);return control;};
    const select=(values,current)=>{const s=el('select');values.forEach(([value,label])=>{const o=el('option',label);o.value=value;s.append(o);});s.value=current;return s;};
    for(const [kind,title] of [['panorama','生成全景图'],['depth','生成深度图']]){
      const config=data.config[kind],section=el('fieldset');section.append(el('legend',title));form.append(section);
      const enabled=el('input');enabled.type='checkbox';enabled.checked=config.enabled;field(section,'启用此工具',enabled);
      const provider=field(section,'供应商',select([['','请选择'],...data.providers.map(p=>[p.id,p.name])],config.provider_id));
      const model=field(section,'图片模型',el('select'));
      const models=value=>{model.replaceChildren();const values=data.providers.find(p=>p.id===provider.value)?.models || [];const first=el('option','请选择');first.value='';model.append(first);values.forEach(name=>{const o=el('option',name);o.value=name;model.append(o);});model.value=values.includes(value)?value:'';};
      models(config.model);provider.onchange=()=>models('');
      const ratio=field(section,'画面比例',select(data.ratios.map(v=>[v,v]),config.ratio));
      const resolution=field(section,'清晰度',select(['1k','2k','4k'].map(v=>[v,v.toUpperCase()]),config.resolution));
      const quality=field(section,'生成质量',select([['auto','自动'],['low','低'],['medium','中'],['high','高']],config.quality));
      const prompt=field(section,'生成提示词',el('textarea'));prompt.value=config.prompt;prompt.rows=6;prompt.maxLength=8000;prompt.required=true;
      section.append(el('p',kind==='panorama'?'360 全景建议使用 2:1，模型须支持对应比例。':'默认提示词输出近白远黑的灰度相对深度图；比例需与用途相符。'));
      controls[kind]={enabled,provider_id:provider,model,ratio,resolution,quality,prompt};
    }
    const reason=field(form,'修改原因',el('input'));reason.required=true;reason.maxLength=1000;
    const status=el('p');status.setAttribute('role','status');
    const submit=el('button','保存图片工具配置');submit.type='submit';submit.className='primary';form.append(status,submit);
    let revision=data.revision,busy=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;busy=true;
      const config=Object.fromEntries(Object.entries(controls).map(([kind,fields])=>[kind,Object.fromEntries(Object.entries(fields).map(([key,control])=>[key,key==='enabled'?control.checked:control.value]))]));
      const inputs=[...form.querySelectorAll('input,select,textarea,button')];inputs.forEach(e=>e.disabled=true);status.textContent='正在保存…';
      try{const result=await save({config,expected_revision:revision,reason:reason.value});revision=result.revision;status.textContent='已保存，新提交的任务将使用此配置。';reason.value='';}
      catch(error){status.textContent=error.message || '保存失败，请刷新后重试。';}
      finally{busy=false;inputs.forEach(e=>e.disabled=false);}
    };
    return form;
  }
  window.ManagementImageTools={create};
})();
