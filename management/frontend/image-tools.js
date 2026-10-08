/* Both tools are saved as one versioned workspace configuration. */
(() => {
  function create({data,save}) {
    const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const form=el('form');form.className='card image-tools-form';
    const intro=el('p','基于选中的图片生成。模型、比例、清晰度和提示词统一应用于当前空间；每次生成 1 张，按所选模型正常计费。');intro.className='muted';
    const tools=el('div');tools.className='image-tools-grid';
    form.append(el('h2','工具配置'),intro,tools);
    const controls={};
    const field=(parent,title,control)=>{const label=el('label');control.setAttribute('aria-label',title);
      if(control.type==='checkbox'){label.className='check';label.append(control,document.createTextNode(title));}
      else{label.append(document.createTextNode(title),control);}
      parent.append(label);return control;};
    const select=(values,current)=>{const s=el('select');values.forEach(([value,label])=>{const o=el('option',label);o.value=value;s.append(o);});s.value=current;return s;};
    for(const [kind,title] of [['panorama','生成全景图'],['depth','生成深度图']]){
      const config=data.config[kind],section=el('fieldset');section.className='image-tool-section';section.append(el('legend',title));tools.append(section);
      const enabled=el('input');enabled.type='checkbox';enabled.checked=config.enabled;field(section,'启用此工具',enabled);
      const modelFields=el('div');modelFields.className='management-form-grid';section.append(modelFields);
      const provider=field(modelFields,'供应商',select([['','请选择'],...data.providers.map(p=>[p.id,p.name])],config.provider_id));
      const model=field(modelFields,'图片模型',el('select'));
      const models=value=>{model.replaceChildren();const values=data.providers.find(p=>p.id===provider.value)?.models || [];const first=el('option','请选择');first.value='';model.append(first);values.forEach(name=>{const o=el('option',name);o.value=name;model.append(o);});model.value=values.includes(value)?value:'';};
      models(config.model);provider.onchange=()=>models('');
      const specs=el('div');specs.className='image-tool-specs';section.append(specs);
      const ratio=field(specs,'画面比例',select(data.ratios.map(v=>[v,v]),config.ratio));
      const resolution=field(specs,'清晰度',select(['1k','2k','4k'].map(v=>[v,v.toUpperCase()]),config.resolution));
      const quality=field(specs,'生成质量',select([['auto','自动'],['low','低'],['medium','中'],['high','高']],config.quality));
      const prompt=field(section,'生成提示词',el('textarea'));prompt.value=config.prompt;prompt.rows=6;prompt.maxLength=8000;prompt.required=true;
      const note=el('p',kind==='panorama'?'360 全景建议使用 2:1，模型须支持对应比例。':'默认提示词输出近白远黑的灰度相对深度图；比例需与用途相符。');note.className='muted';section.append(note);
      controls[kind]={enabled,provider_id:provider,model,ratio,resolution,quality,prompt};
    }
    const footer=el('div');footer.className='management-form-footer';form.append(footer);
    const reason=field(footer,'修改原因',el('input'));reason.required=true;reason.maxLength=1000;reason.placeholder='简要说明本次配置调整';
    const status=el('p');status.className='management-save-status';status.setAttribute('role','status');
    const submit=el('button','保存图片工具配置');submit.type='submit';submit.className='primary';footer.append(submit,status);
    let revision=data.revision,busy=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;busy=true;form.dataset.saving='true';
      const config=Object.fromEntries(Object.entries(controls).map(([kind,fields])=>[kind,Object.fromEntries(Object.entries(fields).map(([key,control])=>[key,key==='enabled'?control.checked:control.value]))]));
      const inputs=[...form.querySelectorAll('input,select,textarea,button')];inputs.forEach(e=>e.disabled=true);status.textContent='正在保存…';
      try{const result=await save({config,expected_revision:revision,reason:reason.value});revision=result.revision;status.textContent='已保存，新提交的任务将使用此配置。';reason.value='';form.dataset.dirty='false';}
      catch(error){status.textContent=error.message || '保存失败，请刷新后重试。';}
      finally{busy=false;form.dataset.saving='false';inputs.forEach(e=>e.disabled=false);}
    };
    return form;
  }
  window.ManagementImageTools={create};
})();
