const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
async function setup(t, canEdit=true){
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const state={config:JSON.parse(fs.readFileSync('config/credit-policy-defaults.json','utf8')),version:0,saves:[],quotes:[],conflict:false};
  const bindings=[];
  for(const [file,kind] of [['credit-image-models.json','image'],['credit-media-models.json','video']]){
    for(const [provider_id,models] of Object.entries(JSON.parse(fs.readFileSync('config/'+file,'utf8')))){
      for(const [model_id,mapping] of Object.entries(models)){
        const variants=typeof mapping==='string'?{default:mapping}:mapping;
        for(const [variant,model_code] of Object.entries(variants))bindings.push({
          id:JSON.stringify([provider_id,kind,model_id,variant]),provider_id,provider_name:provider_id,
          model_id,model_code,enabled:true,rule_available:true,
          variant_label:typeof mapping==='string'?'':variant==='draft'?'Draft · draft=true':'常规 / 样片升级 · draft=false'});
      }
    }
  }
  bindings.push({id:'disabled-chat',provider_id:'disabled-provider',provider_name:'停用供应商',model_id:'gemini-2.5-pro',model_code:'GEMINI_25_PRO',enabled:false,rule_available:true,variant_label:''});
  state.model_catalog={bindings,unmapped_models:[],summary:{enabled_models:18,enabled_bindings:19,enabled_rules:17,unbound_rules:66}};
  await page.route('**/*',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync('management/frontend/index.html','utf8')});
    if(path.startsWith('/static/')){
      const name=path.split('/').pop(),dir=name==='billing-view.js'?'static/js/':name==='billing-view.css'?'static/css/':'management/frontend/';
      return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(dir+name,'utf8')});
    }
    if(path==='/api/me')return route.fulfill({json:{member:{id:'admin',display_name:'管理员'},permissions:canEdit?['credits.configure.platform']:['audit.platform'],workspaces:[]}});
    if(path==='/api/credits/policy'){
      if(req.method()==='PUT'){
        const body=req.postDataJSON();state.saves.push(body);
        if(state.conflict)return route.fulfill({status:409,json:{detail:{code:'credit_policy_changed'}}});
        state.config=body.config;state.version++;
      }
      return route.fulfill({json:{config:state.config,version:state.version,reference:'Pixmax 2026-10-16',mode:'active',model_catalog:state.model_catalog}});
    }
    if(path==='/api/credits/policy/preview'){
      const body=req.postDataJSON();state.quotes.push(body);
      return route.fulfill({json:body.kind==='topup'?{base:1035,gift:155,firstRecharge:body.first_recharge?500:0,total:body.first_recharge?1690:1190}:{credits:120,original:120,discountApplied:false}});
    }
    return route.fulfill({json:{manageable_spaces:0,members:{total:0},tasks:{total:0},services:[],maintenance:{mode:'normal'}}});
  });
  await page.goto('http://localhost:8770/');
  await page.getByRole('button',{name:'积分规则',exact:true}).click();
  await page.getByText('尚未保存 · 当前显示参考配置',{exact:true}).waitFor();
  return {page,state,errors};
}
test('credit policy edits, previews and persists all 84 rules',async t=>{
  const {page,state,errors}=await setup(t);
  await page.getByLabel('符合首充资格',{exact:true}).check();
  await page.getByRole('button',{name:'计算积分',exact:true}).click();
  await page.getByText(/合计 1,690 积分/).waitFor();
  await page.getByLabel('每元兑换积分',{exact:true}).fill('20');
  assert.equal(await page.locator('.credit-policy-result').textContent(),'');
  await page.getByLabel('搜索模型',{exact:true}).fill('doubao-seedance-2-5-260628');
  await page.getByLabel('普通参数价格 / 720P',{exact:true}).fill('43');
  await page.getByLabel('修改原因',{exact:true}).fill('更新充值和视频积分');
  await page.getByRole('button',{name:'保存积分规则',exact:true}).click();
  await page.getByText('已保存版本 1',{exact:true}).waitFor();
  assert.equal(state.saves.length,1);
  assert.equal(state.saves[0].config.rules.length,84);
  assert.equal(state.saves[0].config.creditsPerCNY,20);
  assert.equal(state.saves[0].config.rules.find(r=>r.modelCode==='PIXDANCE_2_5').pricingConfig.combinationPrices['720P'],43);
  await page.getByLabel('试算类型',{exact:true}).selectOption('model');
  await page.getByLabel('参数 resolution',{exact:true}).selectOption('720P');
  await page.getByLabel('输入视频数量',{exact:true}).fill('1');
  await page.getByLabel('输入视频总时长（秒）',{exact:true}).fill('3');
  await page.getByRole('button',{name:'计算积分',exact:true}).click();
  await page.getByText(/预计 120 积分/).waitFor();
  assert.equal(state.quotes.at(-1).params.duration,5);
  assert.equal(state.quotes.at(-1).input_video_seconds,3);
  assert.deepEqual(errors,[]);
  fs.mkdirSync('.local/credit-catalog',{recursive:true});
  await page.screenshot({path:'.local/credit-catalog/editor.png',fullPage:true});
});
test('auditors can inspect models and quote but cannot edit',async t=>{
  const {page,state,errors}=await setup(t,false);
  assert.equal(await page.getByLabel('每元兑换积分',{exact:true}).isDisabled(),true);
  await page.getByLabel('模型范围',{exact:true}).selectOption('presets');
  await page.getByLabel('选择模型',{exact:true}).selectOption('preset:ELEVENLABS_V2');
  assert.equal(await page.getByLabel('基础积分',{exact:true}).isDisabled(),true);
  await page.getByLabel('试算类型',{exact:true}).selectOption('model');
  await page.getByLabel('试算文本',{exact:true}).fill('测试');
  await page.getByRole('button',{name:'计算积分',exact:true}).click();
  await page.getByText(/预计 120 积分/).waitFor();
  assert.equal(await page.getByRole('button',{name:'保存积分规则',exact:true}).count(),0);
  assert.equal(state.saves.length,0);assert.deepEqual(errors,[]);
});

test('model choices use real IDs and isolate unbound presets in editor and trial',async t=>{
  const {page,state,errors}=await setup(t);
  const select=page.getByLabel('选择模型',{exact:true});
  assert.equal(await select.locator('option').count(),19);
  const labels=await select.locator('option').allTextContents();
  assert.ok(labels.every(s=>!s.includes('PIXDANCE_')));
  assert.ok(labels.every(s=>!s.includes('PixImage')));
  assert.ok(labels.every(s=>s.includes('[')));
  assert.ok(!labels.some(s=>s.includes('ElevenLabs')));
  await page.getByLabel('搜索模型',{exact:true}).fill('gpt-image-2-vip');
  await page.locator('.credit-policy-bindings li').filter({hasText:'gpt-image-2-vip'}).waitFor();
  assert.equal(await page.locator('.credit-policy-bindings li').count(),2);
  await page.getByLabel('搜索模型',{exact:true}).fill('doubao-seedance-2-5-260628');
  const draft=state.model_catalog.bindings.find(b=>b.variant_label.includes('draft=true'));
  await select.selectOption(draft.id);
  await page.getByLabel('试算类型',{exact:true}).selectOption('model');
  await page.getByText(/试算模型：.*draft=true/).waitFor();
  await page.getByRole('button',{name:'计算积分',exact:true}).click();
  await page.getByText(/预计 120 积分/).waitFor();
  assert.equal(state.quotes.at(-1).model_code,'PIXDANCE_2_5_DRAFT');
  await page.getByLabel('模型范围',{exact:true}).selectOption('inactive');
  assert.equal(await select.locator('option').count(),1);
  await page.getByText('当前未关联任何已启用供应商模型',{exact:true}).waitFor();
  await page.getByLabel('模型范围',{exact:true}).selectOption('presets');
  await select.selectOption('preset:ELEVENLABS_V2');
  await page.getByText('当前未关联任何已启用供应商模型',{exact:true}).waitFor();
  assert.equal(await page.locator('.credit-policy form').getAttribute('data-dirty'),null);
  assert.deepEqual(errors,[]);
});

test('empty search clears stale model quotes and prevents quoting an invisible model',async t=>{
  const {page,state,errors}=await setup(t);
  await page.getByLabel('试算类型',{exact:true}).selectOption('model');
  await page.getByLabel('搜索模型',{exact:true}).fill('not-installed');
  assert.equal(await page.getByLabel('选择模型',{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'计算积分',exact:true}).click();
  assert.equal(state.quotes.length,0);assert.deepEqual(errors,[]);
});
test('conflict preserves draft and unsaved status',async t=>{
  const {page,state}=await setup(t);state.conflict=true;
  await page.getByLabel('每元兑换积分',{exact:true}).fill('18');
  await page.getByLabel('修改原因',{exact:true}).fill('冲突测试');
  await page.getByRole('button',{name:'保存积分规则',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'积分规则已被其他管理员修改'}).waitFor();
  assert.equal(await page.getByLabel('每元兑换积分',{exact:true}).inputValue(),'18');
  assert.equal(await page.locator('.credit-policy form').getAttribute('data-dirty'),'true');
});
