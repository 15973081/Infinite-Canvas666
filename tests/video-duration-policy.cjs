const test=require('node:test');
const assert=require('node:assert/strict');
const {bounds,clamp,choices}=require('../static/js/video-duration-policy.js');
test('returning to canvas reloads rules, coalesces requests and does not mutate canvas state',async()=>{
 const {watch}=require('../static/js/video-duration-policy.js');
 const events=new Map(),docEvents=new Map();
 const doc={hidden:false,addEventListener:(k,v)=>docEvents.set(k,v),removeEventListener:k=>docEvents.delete(k)};
 const win={document:doc,addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
 let resolve,calls=0,applied;
 const dispose=watch({win,read:()=>{calls++;return new Promise(r=>resolve=r);},apply:cfg=>applied=cfg});
 events.get('focus')();events.get('focus')();
 assert.equal(calls,1);
 const config={api_providers:[{id:'p',model_policies:{'video:m':{duration_min:4,duration_max:30}}}]};
 resolve(config);await new Promise(r=>setImmediate(r));assert.equal(applied,config);
 assert.equal(bounds(applied.api_providers[0],'m').max,30);
 dispose();assert.equal(events.size,0);assert.equal(docEvents.size,0);
});
test('different models keep independent inclusive duration ranges',()=>{
 const provider={model_policies:{'video:short':{duration_min:4,duration_max:15},'video:long':{duration_min:4,duration_max:30},'video:late':{duration_min:7,duration_max:15}}};
 for(const [model,min,max] of [['short',4,15],['long',4,30],['late',7,15]]){
  const range=bounds(provider,model,{min:1,max:60,auto:true});
  assert.equal(clamp(2,range),min);assert.equal(clamp(40,range),max);
  assert.equal(clamp(min,range),min);assert.equal(clamp(max,range),max);
  assert.equal(clamp(-1,range),Math.max(min,5));
  assert.ok(choices(range,[-1,4,5,7,10,15,30]).every(n=>n>=min&&n<=max));
 }
 assert.equal(clamp(30,bounds(provider,'long')),30);
 assert.equal(clamp(30,bounds(provider,'short')),15);
});
test('unconfigured models preserve automatic duration and legacy limits',()=>{
 const range=bounds({},'legacy',{min:4,max:30,auto:true});
 assert.equal(clamp(-1,range),-1);assert.equal(clamp(NaN,range),5);
 assert.equal(clamp(9.8,range),10);
 assert.ok(choices(range,[-1,5,60]).includes(-1));
});
