/* Credit policy editor. All quotes are calculated by the backend. */
(() => {
  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const localTime = seconds => {
    if (seconds == null) return '';
    const d = new Date(seconds * 1000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  };
  async function create({api, canEdit}) {
    let data = await api('/api/credits/policy');
    const draft = structuredClone(data.config);
    const root = el('section', undefined, 'credit-policy');
    const form = el('form'), status = el('p', '', 'muted'), error = el('p', '', 'error');
    status.setAttribute('role', 'status'); error.setAttribute('role', 'alert');
    root.append(el('p', '积分规则用于充值和任务价格试算。自动支付入账、奖励发放和任务扣费尚未接入。', 'credit-policy-notice'),
      el('p', `参考数据：${data.reference} · ${draft.rules.length} 条模型规则。积分有效期：永久。`, 'muted'), status, form, error);
    const versionText = () => status.textContent = data.version ? `已保存版本 ${data.version}` : '尚未保存 · 当前显示参考配置';
    versionText();
    let epoch = 0, quoteSerial = 0;
    const quoteResult = el('output', '', 'credit-policy-result');
    quoteResult.setAttribute('aria-live', 'polite');
    const changed = () => {
      epoch++; form.dataset.dirty = 'true'; status.textContent = '有未保存修改';
      quoteResult.textContent = ''; error.textContent = '';
    };
    const section = (title, text) => {
      const s = el('fieldset', undefined, 'provider-block');
      s.disabled = !canEdit;
      s.append(el('legend', title));
      if (text) s.append(el('p', text, 'muted'));
      form.append(s); return s;
    };
    function field(parent, title, object, key, {type='number', min=0, max=1000000000, step='1', percent=false}={}) {
      const label = el('label', title), input = el('input');
      input.type = type; input.setAttribute('aria-label', title);
      if (type === 'checkbox') { input.checked = object[key]; label.className = 'check'; }
      else {
        input.value = object[key] == null ? '' : percent ? Number((object[key] * 100).toFixed(6)) : object[key];
        if (type === 'number') { input.min=min; input.max=max; input.step=step; input.required=true; }
      }
      input.oninput = () => {
        object[key] = type === 'checkbox' ? input.checked : type === 'number' ? (input.value === '' ? null : Number(input.value) / (percent ? 100 : 1)) : input.value;
        changed();
      };
      label.append(input); parent.append(label); return input;
    }
    function select(parent, title, choices, value) {
      const label = el('label', title), input = el('select');
      input.setAttribute('aria-label', title);
      choices.forEach(([v, name]) => input.append(new Option(name, v)));
      input.value = value; label.append(input); parent.append(label); return input;
    }
    const topup = section('充值档位', '赠送积分向下取整；自定义金额按达到的最高门槛计算。');
    field(topup, '每元兑换积分', draft, 'creditsPerCNY', {min:1,max:100000});
    const tiers = el('div', undefined, 'credit-policy-tiers'); topup.append(tiers);
    function drawTiers() {
      tiers.replaceChildren();
      draft.tiers.forEach((tier, i) => {
        const row=el('div', undefined, 'provider-fields');
        field(row, `档位 ${i+1} · 充值门槛（元）`, tier, 'minAmount', {min:1,max:1000000});
        field(row, `档位 ${i+1} · 赠送比例（%）`, tier, 'bonusRate', {max:1000,step:'0.01',percent:true});
        const remove=el('button','删除档位','danger'); remove.type='button';
        remove.onclick=()=>{draft.tiers.splice(i,1);changed();drawTiers();};
        row.append(remove); tiers.append(row);
      });
    }
    drawTiers();
    const add=el('button','新增档位'); add.type='button';
    add.onclick=()=>{if(draft.tiers.length>=20)return;draft.tiers.push({minAmount:Math.max(0,...draft.tiers.map(t=>t.minAmount))+100,bonusRate:0});changed();drawTiers();};
    topup.append(add);
    const rewards=section('奖励规则','以下为资格与额度配置。首充试算需要显式选择“符合首充资格”；创作奖励须审核，最高额度不是固定发放值。');
    const rewardGrid=el('div',undefined,'provider-fields');rewards.append(rewardGrid);
    field(rewardGrid,'启用首充奖励',draft.rewards,'firstRechargeEnabled',{type:'checkbox'});
    field(rewardGrid,'首充最低金额（元）',draft.rewards,'firstRechargeMinimum');
    field(rewardGrid,'首充奖励积分',draft.rewards,'firstRechargeCredits');
    field(rewardGrid,'启用邀请奖励',draft.rewards,'referralEnabled',{type:'checkbox'});
    field(rewardGrid,'邀请人积分',draft.rewards,'inviterCredits');
    field(rewardGrid,'被邀请人积分',draft.rewards,'inviteeCredits');
    field(rewardGrid,'最多奖励邀请次数',draft.rewards,'maxReferralCount');
    field(rewardGrid,'启用创作奖励',draft.rewards,'creationEnabled',{type:'checkbox'});
    field(rewardGrid,'创作最高奖励积分',draft.rewards,'creationMaxCredits');
    field(rewardGrid,'作品平台完成比例（%）',draft.rewards,'creationMinimumPercent',{max:100});

    const models=section('模型积分价格','分辨率、声音、输入视频等参数共同决定价格。输入素材附加费按任务计；原始矩阵保留全部组合。');
    const picker=el('div',undefined,'provider-fields'), search=el('input'), searchLabel=el('label','搜索模型');
    search.type='search';search.setAttribute('aria-label','搜索模型');searchLabel.append(search);picker.append(searchLabel);
    const model=select(picker,'选择模型',draft.rules.map(r=>[r.modelCode,`${r.modelName} · ${r.modelCode}`]),draft.rules[0].modelCode);
    models.append(picker); const modelBody=el('div');models.append(modelBody);
    const modelByCode=()=>draft.rules.find(r=>r.modelCode===model.value);
    function renderModel() {
      modelBody.replaceChildren(); const rule=modelByCode(); if(!rule)return;
      const grid=el('div',undefined,'provider-fields');modelBody.append(grid);
      field(grid,'启用模型报价',rule,'enabled',{type:'checkbox'});
      field(grid,'模型显示名称',rule,'modelName',{type:'text'});
      field(grid,'基础积分',rule,'basePrice',{step:'0.000001'});
      modelBody.append(el('p',`计费方式：${rule.billingType==='INPUT_TEXT'?'按输入字符':'按任务参数'}；参数顺序：${rule.pricingConfig.selectedParams?.join(' / ')||'无'}。`,'muted'));
      const p=rule.pricingConfig;
      for(const [key,title] of [['imageExtraPrice','每张输入图片附加积分'],['videoExtraPrice','每个输入视频附加积分'],['audioExtraPrice','每个输入音频附加积分']]){
        p[key]??=0;field(grid,title,p,key,{step:'0.000001'});
      }
      if(rule.billingType==='INPUT_TEXT'){
        field(grid,'每计费单位字符数',p,'unitChars',{min:1});
        field(grid,'最低积分',p,'minPrice',{step:'0.000001'});
      } else {
        for(const [key,title] of [['isPerSecond','按输出秒数计费'],['isInputVideo','有视频输入时切换价格矩阵'],['isInputVideoPerSecond','另收输入视频秒数费用']]){
          p[key]??=false;field(grid,title,p,key,{type:'checkbox'});
        }
      }
      const discounts=el('div',undefined,'provider-fields');
      const discount=select(discounts,'折扣类型',[['NONE','无折扣'],['ACTIVITY','活动折扣'],['USER','用户折扣']],rule.discountType);
      discount.onchange=()=>{rule.discountType=discount.value;if(discount.value!=='NONE'&&rule.discountRate==null)rule.discountRate=1;changed();renderModel();};
      if(rule.discountType!=='NONE'){
        field(discounts,'折后支付比例（%）',rule,'discountRate',{min:0.0001,max:100,step:'0.0001',percent:true});
        if(rule.discountType==='USER')field(discounts,'返回折后报价',rule,'returnDiscountedPrice',{type:'checkbox'});
      }
      for(const [key,title] of [['activityStartTime','活动开始时间'],['activityEndTime','活动结束时间（不含）']]){
        const proxy={value:localTime(rule[key])},input=field(discounts,title,proxy,'value',{type:'datetime-local'});
        input.step='1';input.oninput=()=>{rule[key]=input.value?Math.floor(new Date(input.value).getTime()/1000):null;changed();};
      }
      modelBody.append(discounts,el('p','时间使用当前浏览器时区；两项均为空表示长期活动。折后积分四舍五入，最低 1 积分。','muted'));
      for(const [key,title] of [['combinationPrices','普通参数价格'],['combinationPricesWithVideo','含视频输入价格'],['videoInputSecondPrices','输入视频每秒价格']]){
        const matrix=p[key];if(!matrix||!Object.keys(matrix).length)continue;
        const block=el('details');block.open=key==='combinationPrices';
        block.append(el('summary',`${title} · ${Object.keys(matrix).length} 个组合`));
        const rows=el('div',undefined,'credit-policy-matrix');
        Object.keys(matrix).forEach(combination=>field(rows,`${title} / ${combination}`,matrix,combination,{step:'0.000001'}));
        block.append(rows);modelBody.append(block);
      }
      if(!rule.basePrice&&!Object.keys(p.combinationPrices||{}).length&&rule.billingType!=='INPUT_TEXT')
        modelBody.append(el('p','此规则缺少有效价格，试算会拒绝报价。','credit-policy-notice'));
      renderTrial();
    }
    search.oninput=event=>{
      event.stopPropagation();
      const q=search.value.trim().toLowerCase(),current=model.value;
      const matching=draft.rules.filter(r=>(r.modelName+' '+r.modelCode).toLowerCase().includes(q));
      model.replaceChildren(...matching.map(r=>new Option(`${r.modelName} · ${r.modelCode}`,r.modelCode)));
      if(matching.some(r=>r.modelCode===current))model.value=current;
      renderModel();
    };
    search.onchange=event=>event.stopPropagation();
    model.oninput=event=>event.stopPropagation();
    model.onchange=event=>{event.stopPropagation();renderModel();};
    // Search and model selection remain available to read-only auditors.
    models.disabled=false;
    const trial=el('section',undefined,'provider-block'), trialFields=el('div',undefined,'provider-fields');
    trial.append(el('h3','积分试算'),el('p','按当前表单计算（包括未保存修改）；试算不会产生订单或余额变动。','muted'));
    const trialKind=select(trial,'试算类型',[['topup','充值'],['model','当前模型']],'topup');
    trial.append(trialFields,quoteResult);root.append(trial);
    let trialValues={},paramInputs=[];
    function trialInput(title,key,value,type='number'){
      const label=el('label',title),input=el('input');input.type=type;input.setAttribute('aria-label',title);
      if(type==='checkbox')input.checked=value;else input.value=value;
      if(type==='number'){input.min=0;input.step='1';}
      input.oninput=()=>{quoteSerial++;quoteResult.textContent='';};
      label.append(input);trialFields.append(label);trialValues[key]=input;return input;
    }
    function renderTrial(){
      quoteSerial++;quoteResult.textContent='';trialFields.replaceChildren();trialValues={};paramInputs=[];
      if(trialKind.value==='topup'){
        trialInput('试算充值金额（元）','amount',69).min='1';
        trialInput('符合首充资格','first_recharge',false,'checkbox');
      }else{
        const rule=modelByCode();if(!rule){trialFields.append(el('p','请先选择模型。'));return;}
        for(const key of rule.pricingConfig.selectedParams||[]){
          const pos=rule.pricingConfig.selectedParams.indexOf(key);
          const keys=[...Object.keys(rule.pricingConfig.combinationPrices||{}),...Object.keys(rule.pricingConfig.combinationPricesWithVideo||{})];
          const choices=[...new Set(keys.map(k=>k.split('||')[pos]))];
          const input=select(trialFields,`参数 ${key}`,choices.map(v=>[v,v||'默认']),choices[0]);
          input.onchange=()=>{quoteSerial++;quoteResult.textContent='';};paramInputs.push([key,input]);
        }
        if(rule.pricingConfig.isPerSecond)trialInput('输出时长（秒）','duration',5).min='1';
        trialInput('生成数量','count',1).min='1';
        if(rule.billingType==='INPUT_TEXT')trialInput('试算文本','prompt','你好，世界','text');
        for(const [key,title] of [['input_image_count','输入图片数量'],['input_video_count','输入视频数量'],['input_audio_count','输入音频数量'],['input_video_seconds','输入视频总时长（秒）']])trialInput(title,key,0);
      }
    }
    trialKind.onchange=renderTrial;
    const calculate=el('button','计算积分');calculate.type='button';trial.append(calculate);
    calculate.onclick=async()=>{
      const serial=++quoteSerial,revision=epoch;
      const body={kind:trialKind.value,config:draft,params:{},model_code:model.value};
      for(const [key,input] of Object.entries(trialValues)){
        const value=input.type==='checkbox'?input.checked:input.type==='number'?(input.value===''?null:Number(input.value)):input.value;
        if(key==='duration')body.params.duration=value;else body[key]=value;
      }
      for(const [key,input] of paramInputs)body.params[key]=key==='duration'?Number(input.value):input.value;
      calculate.disabled=true;quoteResult.textContent='正在计算…';
      try{
        const result=await api('/api/credits/policy/preview',{method:'POST',body:JSON.stringify(body)});
        if(serial!==quoteSerial||revision!==epoch)return;
        quoteResult.textContent=body.kind==='topup'?`合计 ${result.total.toLocaleString()} 积分 = 基础 ${result.base.toLocaleString()} + 充值赠送 ${result.gift.toLocaleString()} + 首充奖励 ${result.firstRecharge.toLocaleString()}`:
          `预计 ${result.credits.toLocaleString()} 积分 · 原价 ${result.original.toLocaleString()}${result.discountApplied?' · 已应用折扣':''}`;
      }catch(e){if(serial===quoteSerial&&revision===epoch)quoteResult.textContent=e.message;}
      finally{calculate.disabled=false;}
    };
    const actions=el('div',undefined,'actions'),reason=el('input'),reasonLabel=el('label','修改原因');
    reason.setAttribute('aria-label','修改原因');reason.required=true;reason.maxLength=1000;reasonLabel.append(reason);
    const save=el('button','保存积分规则','primary');save.type='submit';
    actions.append(reasonLabel,save);if(canEdit)form.append(actions);
    form.onsubmit=async event=>{
      event.preventDefault();if(!canEdit||form.dataset.saving==='true')return;
      form.dataset.saving='true'; save.disabled=true;error.textContent='';
      const controls=[...form.querySelectorAll('input,select,button')],disabled=controls.map(e=>e.disabled);
      controls.forEach(e=>e.disabled=true);
      try{
        data=await api('/api/credits/policy',{method:'PUT',body:JSON.stringify({config:draft,expected_version:data.version,reason:reason.value})});
        form.dataset.dirty='false';reason.value='';versionText();
      }catch(e){error.textContent=e.message;}
      finally{form.dataset.saving='false';controls.forEach((e,i)=>e.disabled=disabled[i]);save.disabled=false;}
    };
    const originalRender=renderModel;
    // Lock only editable model controls; search/select and trial stay usable.
    const lockModel=()=>{if(!canEdit)modelBody.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);};
    model.addEventListener('change',lockModel);search.addEventListener('input',lockModel);
    originalRender();lockModel();
    return root;
  }
  window.ManagementCreditPolicy={create};
})();
