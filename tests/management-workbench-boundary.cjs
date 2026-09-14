const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('management/frontend/management.js','utf8');
const priceHelper=fs.readFileSync('management/frontend/provider-prices.js','utf8');
test('management price dialog saves only selected specs with a version and preserves its original row',async()=>{
  const writes=[],dialogs=[];
  class Element {constructor(){this.value='';}append(){}setAttribute(){}querySelector(){return this;}}
  const c=vm.createContext({window:{},el:()=>new Element(),table:()=>new Element(),field:()=>new Element(),
    dialog:(title,nodes,submit)=>dialogs.push(submit),
    call:async(path,method,payload)=>writes.push({path,method,payload})});
  vm.runInContext(priceHelper,c);
  vm.runInContext(source.slice(source.indexOf('  function editVideoPrices('),source.indexOf('  function editProvider(')),c);
  const historical={kind:'video',model:'test',billing_type:'per_million_tokens',resolution:'720p',has_video_input:false,unit_price:'46',effective_from:1,effective_to:2};
  const current={...historical,unit_price:'50',effective_from:2,effective_to:0};
  const row={id:'volcengine',version:7,config:{name:'火山',protocol:'volcengine',video_models:['test'],model_prices:[historical,current]}};
  const original=JSON.stringify(row);c.editVideoPrices(row);
  await dialogs[0]({get:key=>key==='price_2'?'0':key==='reason'?'调整规格':''});
  assert.equal(writes[0].path,'/api/providers/volcengine');
  assert.equal(writes[0].payload.expected_version,7);
  assert.equal(writes[0].payload.config.model_prices.length,2);
  assert.equal(writes[0].payload.config.model_prices[0].effective_to,2);
  assert.equal(writes[0].payload.config.model_prices[1].unit_price,'0');
  assert.equal(JSON.stringify(row),original);
  assert.ok(!('secrets' in writes[0].payload));
});
test('invalid management prices never change historical or current prices',()=>{
  const c=vm.createContext({window:{}});vm.runInContext(priceHelper,c);
  for(const value of ['-1','NaN','1.1234567','Infinity']) {
    const item={id:'volcengine',video_models:['test'],model_prices:[{unit_price:'old'}]},before=JSON.stringify(item);
    assert.throws(()=>c.window.ManagementProviderPrices.update(item,0,'720p',false,value),/单价/);
    assert.equal(JSON.stringify(item),before);
  }
});
test('workbench management link carries no session and refuses unsafe destinations',async()=>{
  for(const [url,shown] of [['https://admin.example/',true],['http://127.0.0.1:8774/',true],
      ['http://admin.example/',false],['https://user:password@admin.example/',false],
      ['https://admin.example/?token=secret',false],['javascript:alert(1)',false],[null,false]]) {
    const link={hidden:true,href:''};
    const c=vm.createContext({URL,document:{readyState:'complete',getElementById:()=>link},
      fetch:async()=>({ok:true,json:async()=>({url})})});
    vm.runInContext(fs.readFileSync('static/js/management-entry.js','utf8'),c);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(!link.hidden,shown,url);
    if(shown)assert.equal(link.href,url);
  }
});
test('workbench shell has valid scripts and no embedded management UI',()=>{
  const html=fs.readFileSync('static/index.html','utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
  assert.ok(!html.includes('frame-api-settings')&&!html.includes('maintenance-modal'));
  assert.ok(html.includes('id="management-entry"')&&html.includes('rel="noopener noreferrer"'));
});
