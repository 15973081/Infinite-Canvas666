/* Independent model access, prices and discount configuration. */
(() => {
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const select=(label,items,value)=>{const wrap=node('label',label),e=node('select');for(const [v,t] of items)e.append(new Option(t,v));e.value=value;wrap.append(e);return [wrap,e];};
  const input=(label,value='',type='text')=>{const wrap=node('label',label),e=node('input');e.type=type;e.value=value;wrap.append(e);return [wrap,e];};
  const check=(label,value)=>{const wrap=node('label',undefined,'check'),e=node('input');e.type='checkbox';e.checked=value;wrap.append(e,document.createTextNode(label));return [wrap,e];};
  const localTime=ms=>{if(!ms)return '';const d=new Date(ms);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  async function create({catalog,save}){
    const root=node('section',undefined,'provider-editor'),pick=node('div',undefined,'provider-fields'),body=node('div');
    root.append(node('p','供应商连接与凭证在“供应商与分配”中维护；此处单独配置模型开放范围、分档单价与有效期折扣。','muted'),pick,body);
    if(!catalog.providers.length){body.append(node('p','请先保存一个供应商。'));return root;}
    let rows=catalog.providers,dirty=false;
    const [pl,provider]=select('供应商',rows.map(r=>[r.id,r.config.name||r.id]),rows[0].id);
    const [kl,kind]=select('类型',[['image','图片'],['video','视频'],['chat','对话']],'image');
    const [ml,model]=select('模型',[],'');pick.append(pl,kl,ml);
    const guard=()=>!dirty||window.confirm('当前模型配置未保存，是否放弃修改？');
    let previousProvider=provider.value,previousKind=kind.value,previousModel='';
    function models(){const row=rows.find(r=>r.id===provider.value);model.replaceChildren(...(row.config[kind.value+'_models']||[]).map(m=>new Option(m,m)));previousModel=model.value;render();}
    provider.onchange=()=>{if(!guard()){provider.value=previousProvider;return;}previousProvider=provider.value;models();};
    kind.onchange=()=>{if(!guard()){kind.value=previousKind;return;}previousKind=kind.value;models();};
    model.onchange=()=>{if(!guard()){model.value=previousModel;return;}previousModel=model.value;render();};
    function render(){
      dirty=false;body.replaceChildren();if(!model.value){body.append(node('p','该分类暂无模型，请到供应商页面添加。'));return;}
      const row=rows.find(r=>r.id===provider.value),k=kind.value,m=model.value,key=k+':'+m;let config=structuredClone(row.config);
      const form=node('form'),policy=config.model_policies?.[key]||{},access=node('section',undefined,'provider-block');body.append(form);
      access.append(node('h3','模型使用范围'),node('p','隐藏或停用后不能发起新任务，模型配置与历史账单保留。已提交到上游的任务仍可取回结果。','muted'));
      const [vl,visible]=check('向成员显示',policy.visible!==false),[el,enabled]=check('允许新任务',policy.enabled!==false);access.append(vl,el);
      const [rl,restricted]=check('限制开放规格',Array.isArray(policy.resolutions));const sizeChecks=[];
      if(k!=='chat'){access.append(rl);const sizes=node('div',undefined,'toolbar');for(const s of k==='image'?['1k','2k','4k']:['480p','720p','1080p','4k']){const [l,c]=check(s.toUpperCase(),policy.resolutions?policy.resolutions.includes(s):true);sizes.append(l);sizeChecks.push([s,c]);}access.append(sizes);}
      let durationMin, durationMax;
      if(k==='video'){
        const block=node('section',undefined,'provider-block'),grid=node('div',undefined,'provider-fields');
        block.append(node('h3','视频时长范围'),node('p','两项均留空时沿用模型默认规则。设置后前端和新任务按此范围限制，单位为整数秒；自动时长不可选。','muted'));
        const [minLabel,minInput]=input('最短秒数',policy.duration_min??'','number'),[maxLabel,maxInput]=input('最长秒数',policy.duration_max??'','number');
        durationMin=minInput;durationMax=maxInput;
        for(const field of [durationMin,durationMax]){field.min='1';field.step='1';field.placeholder='未设置';}
        grid.append(minLabel,maxLabel);block.append(grid);access.append(block);
      }
      form.append(access);const priceInputs=[];
      if(k!=='chat'){
        const priceBlock=node('section',undefined,'provider-block');priceBlock.append(node('h3','基础价格 · CNY'),node('p','先按规格单价 × 数量计算基础金额，再应用下面的折扣。空白表示未配置；0 表示免费。分档价优先于通用价。保存后只影响新任务，历史金额不重算。','muted'));
        const existing=config.model_prices||[],tokenMode=k==='video'&&(row.id==='volcengine'||config.protocol==='volcengine');
        const current=existing.find(p=>p.kind===k&&p.model===m&&!p.effective_to);
        const [bl,billing]=select('计费单位',k==='image'?[['per_image','元 / 张'],['per_call','元 / 次']]:tokenMode?[['per_million_tokens','元 / 百万输出 tokens']]:[['per_second','元 / 秒'],['per_call','元 / 次']],current?.billing_type||(k==='image'?'per_image':tokenMode?'per_million_tokens':'per_second'));priceBlock.append(bl);
        const grid=node('div',undefined,'provider-fields');priceBlock.append(grid);
        for(const resolution of tokenMode?['480p','720p','1080p','4k']:k==='image'?['','1k','2k','4k']:['','480p','720p','1080p','4k']){
          for(const hasVideo of tokenMode?[false,true]:[null]){
            const match=p=>p.kind===k&&p.model===m&&(p.resolution||'')===resolution&&(hasVideo===null||p.has_video_input===hasVideo)&&(p.service_tier||'default')==='default';
            const old=existing.find(p=>match(p)&&!p.effective_to);
            const [l,e]=input((resolution?resolution.toUpperCase():'通用')+(hasVideo===null?'':hasVideo?' · 有视频输入':' · 无视频输入'),old?.unit_price??'','number');e.min='0';e.step='0.000001';grid.append(l);priceInputs.push({e,match,resolution,hasVideo});
          }
        }
        form.append(priceBlock);form.billingSelect=billing;
      }
      const discountInputs=[];
      if(k!=='chat'){
        const block=node('section',undefined,'provider-block'),list=node('div');block.append(node('h3','当前模型的限时折扣'),node('p',`仅适用于 ${row.config.name||row.id} / ${m}（${k==='image'?'图片':'视频'}）。其他模型的优惠时段与支付比例分别配置；未配置或不在优惠时段时按基础价格计费。`,'muted'),node('p','按任务提交时刻匹配，开始时间包含、结束时间不含。支付比例 80% = 八折；100% = 不打折。具体规格优先于通用折扣，只应用一条；同规格时段重叠或交叉范围不明确时不能保存。不与账号折扣叠加。时间使用当前浏览器时区。','muted'),list);
        function add(row={}){const line=node('div',undefined,'provider-fields');const [sl,start]=input('开始时间',localTime(row.effective_from),'datetime-local'),[tl,end]=input('结束时间（不含）',localTime(row.effective_to),'datetime-local'),[pl,rate]=input('支付比例（%）',row.rate!=null?String(Number(row.rate)*100):'100','number'),[nl,label]=input('折扣说明',row.label||'');rate.min='0';rate.max='100';rate.step='0.0001';start.required=true;label.maxLength=120;const remove=node('button','删除此时段');remove.type='button';const [resLabel,resolution]=select('适用分辨率',[['','全部'],...(k==='image'?['1k','2k','4k']:['480p','720p','1080p','4k']).map(s=>[s,s.toUpperCase()])],row.resolution||'');
          const [videoLabel,video]=select('视频输入',[['','全部'],['false','无视频输入'],['true','有视频输入']],typeof row.has_video_input==='boolean'?String(row.has_video_input):'');
          const preview=node('p','','muted');
          function refreshPreview(){
            const percent=Number(rate.value);
            if(!rate.value.trim()||!Number.isFinite(percent)||percent<0||percent>100){preview.textContent='请输入 0–100 的支付比例。';return;}
            const prices=priceInputs.filter(p=>(!resolution.value||!p.resolution||p.resolution===resolution.value)&&(!video.value||p.hasVideo===null||String(p.hasVideo)===video.value));
            preview.textContent='本条规则折后单价预览：'+prices.filter(p=>p.e.value.trim()!==''&&Number.isFinite(Number(p.e.value))).map(p=>
              (p.resolution?p.resolution.toUpperCase():'通用')+(p.hasVideo===null?'':p.hasVideo?'·有视频输入':'·无视频输入')+' '+Number((Number(p.e.value)*percent/100).toFixed(6))
            ).join('；')+'（单位同基础价格；实际按时段及最具体规则匹配，不叠加。基础价已含优惠时会再次打折。）';
          }
          line.append(resLabel);if(k==='video')line.append(videoLabel);
          const record={line,start,end,rate,label,resolution,video,refreshPreview};remove.onclick=()=>{line.remove();discountInputs.splice(discountInputs.indexOf(record),1);dirty=true;};rate.required=true;line.append(sl,tl,pl,nl,preview,remove);list.append(line);discountInputs.push(record);refreshPreview();}
        (config.model_discounts||[]).filter(r=>r.kind===k&&r.model===m).forEach(add);const plus=node('button','添加折扣时段');plus.type='button';plus.onclick=()=>{add({effective_from:Date.now()});dirty=true;};block.append(plus);form.append(block);
      }
      const [reasonLabel,reason]=input('修改原因');reason.required=true;reason.maxLength=1000;const submit=node('button','保存当前模型配置','primary'),status=node('p','','muted');status.setAttribute('role','status');const footer=node('section',undefined,'provider-block');footer.append(reasonLabel,submit,status);form.append(footer);form.oninput=form.onchange=()=>{dirty=true;discountInputs.forEach(r=>r.refreshPreview());};
      form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;status.textContent='正在保存…';try{
        const next=structuredClone(config);delete next.id;delete next.primary;
        next.model_policies={...next.model_policies,[key]:{visible:visible.checked,enabled:enabled.checked,...(k!=='chat'&&restricted.checked?{resolutions:sizeChecks.filter(([,c])=>c.checked).map(([s])=>s)}:{})}};
        if(k==='video' && (durationMin.value!=='' || durationMax.value!=='')){
          const min=Number(durationMin.value),max=Number(durationMax.value);
          if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<1||max<min)throw Error('请填写完整的整数秒数范围，最短秒数不得大于最长秒数。');
          Object.assign(next.model_policies[key],{duration_min:min,duration_max:max});
        }
        if(k!=='chat'){
          next.model_prices=[...(next.model_prices||[])];
          for(const p of priceInputs){next.model_prices=next.model_prices.filter(r=>r.effective_to||!p.match(r));const text=p.e.value.trim();if(text!==''){if(!/^\d+(?:\.\d{1,6})?$/.test(text))throw Error('单价最多六位小数。');next.model_prices.push({kind:k,model:m,billing_type:form.billingSelect.value,unit_price:text,currency:'CNY',effective_from:0,effective_to:0,...(p.resolution?{resolution:p.resolution}:{}),...(p.hasVideo!==null?{has_video_input:p.hasVideo,service_tier:'default'}:{})});}}
          next.model_discounts=(next.model_discounts||[]).filter(r=>r.kind!==k||r.model!==m);
          for(const r of discountInputs){const start=new Date(r.start.value).getTime(),end=r.end.value?new Date(r.end.value).getTime():0;if(!Number.isFinite(start)||!Number.isFinite(end)||end&&end<=start)throw Error('请检查折扣起止时间。');next.model_discounts.push({kind:k,model:m,rate:(Number(r.rate.value)/100).toFixed(6),effective_from:start,effective_to:end,label:r.label.value.trim(),...(r.resolution.value?{resolution:r.resolution.value}:{}),...(k==='video'&&r.video.value!==''?{has_video_input:r.video.value==='true'}:{})});}
        }
        const saved=await save(row,{config:next,expected_version:row.version,reason:reason.value});
        row.version=saved.version;row.config=saved.config;config=structuredClone(saved.config);
        status.textContent=`已保存 ${m} 的配置；其他模型配置不变，历史任务费用保持原快照。`;dirty=false;
        submit.disabled=false;
      }catch(error){status.textContent=error.message;submit.disabled=false;}};
    }
    models();return root;
  }
  window.ManagementModelBilling={create};
})();
