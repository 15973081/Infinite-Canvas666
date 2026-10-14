const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
    constructor(tag, text='') { this.tag=tag; this.textContent=text; this.children=[]; this._value=''; this.disabled=false; this.dataset={}; }
    append(...items) { this.children.push(...items); if(this.tag==='select'&&!this._value)this._value=this.children[0]?.value||''; }
    replaceChildren(...items) { this.children=[]; this._value=''; this.append(...items); }
    setAttribute() {}
    get value() { return this._value; }
    set value(value) { this._value=String(value); }
    querySelectorAll(selector) {
        const tags=selector.split(',');
        return this.children.flatMap(child=>[...(tags.includes(child.tag)?[child]:[]),...child.querySelectorAll(selector)]);
    }
}
async function fixture(extra={}) {
    let confirms=0;
    const context={document:{createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text)},
        Option:function(text,value){const e=new Element('option',text);e.value=value;return e;},
        window:{confirm:()=>{confirms++;return true;}},structuredClone,Date};
    vm.runInNewContext(fs.readFileSync('management/frontend/model-billing.js','utf8'),context);
    const row={id:'p',version:1,config:{name:'Provider',image_models:['A','B'],...extra,model_policies:{
        'image:A':{visible:true,enabled:true},'image:B':{visible:true,enabled:true}}}};
    const writes=[];
    const root=await context.window.ManagementModelBilling.create({catalog:{providers:[row]},save:(row,body)=>
        new Promise((resolve,reject)=>writes.push({body:structuredClone(body),resolve,reject}))});
    const [provider,kind,model]=root.children[1].children.map(label=>label.children[0]);
    const form=()=>root.children[2].children[0];
    const field=(label)=>form().querySelectorAll('input').find(input=>
        form().querySelectorAll('label').some(wrap=>wrap.children.includes(input)&&
            (wrap.textContent===label||wrap.children.some(child=>child.tag==='text'&&child.textContent===label))));
    const change=(label,value)=>{const input=field(label);if(input.type==='checkbox')input.checked=value;else input.value=value;form().onchange();};
    const submit=()=>form().onsubmit({preventDefault(){}});
    const finish=(index)=>writes[index].resolve({version:writes[index].body.expected_version+1,config:writes[index].body.config});
    return {row,root,form,provider,kind,model,field,change,submit,writes,finish,confirms:()=>confirms};
}

test('saving locks editing and model switching; subsequent B save preserves A',async()=>{
    const f=await fixture();
    f.change('向成员显示',false);f.change('修改原因','Hide A');
    const pending=f.submit();
    assert.ok(f.root.querySelectorAll('input,select,button').every(e=>e.disabled));
    for(const [control,next,previous] of [[f.model,'B','A'],[f.kind,'video','image'],[f.provider,'other','p']]){
        control.value=next;control.onchange();assert.equal(control.value,previous);
    }
    await f.submit();assert.equal(f.writes.length,1,'ignore repeated submission');
    assert.equal(f.confirms(),0,'pending saves cannot be discarded');
    f.finish(0);await pending;
    assert.ok(f.root.querySelectorAll('input,select,button').every(e=>!e.disabled));
    f.model.value='B';f.model.onchange();f.change('允许新任务',false);f.change('修改原因','Disable B');
    const pendingB=f.submit();
    assert.equal(f.writes[1].body.expected_version,2);
    assert.equal(f.writes[1].body.config.model_policies['image:A'].visible,false);
    assert.equal(f.writes[1].body.config.model_policies['image:B'].enabled,false);
    f.finish(1);await pendingB;
});

test('failed saves unlock controls, retain dirty edits, and allow retry',async()=>{
    const f=await fixture();f.change('向成员显示',false);f.change('修改原因','Hide A');
    const pending=f.submit();f.writes[0].reject(new Error('Network failed'));await pending;
    assert.equal(f.field('向成员显示').checked,false);
    assert.ok(f.root.querySelectorAll('input,select,button').every(e=>!e.disabled));
    const retry=f.submit();assert.equal(f.writes[1].body.expected_version,1);
    f.writes[1].reject(new Error('Network failed'));await retry;
    f.model.value='B';f.model.onchange();assert.equal(f.confirms(),1,'failed edits are still dirty');
});

test('validation errors release the lock and repeated saves use their matching version',async()=>{
    const f=await fixture();f.change('通用','-1');await f.submit();
    assert.equal(f.writes.length,0);assert.equal(f.model.disabled,false);
    f.change('通用','1');f.change('修改原因','Price update');
    const first=f.submit();f.finish(0);await first;
    f.change('通用','2');const second=f.submit();
    assert.equal(f.writes[1].body.expected_version,2);
    assert.equal(f.writes[1].body.config.model_prices.find(p=>!p.resolution).unit_price,'2');
    f.finish(1);await second;
});

test('audio billing configures character and call prices with independent model access',async()=>{
    const f=await fixture({audio_models:['speech-2.8-hd','music-2.6']});
    f.kind.value='audio';f.kind.onchange();
    assert.equal(f.model.value,'speech-2.8-hd');assert.equal(f.form().billingSelect.value,'per_10k_characters');
    assert.equal(f.field('限制开放规格'),undefined);
    f.change('通用','6');f.change('修改原因','Audio price');
    const speech=f.submit();
    assert.equal(f.writes[0].body.config.model_prices[0].kind,'audio');
    assert.equal(f.writes[0].body.config.model_prices[0].billing_type,'per_10k_characters');
    assert.equal(f.writes[0].body.config.model_prices[0].resolution,undefined);f.finish(0);await speech;
    f.model.value='music-2.6';f.model.onchange();assert.equal(f.form().billingSelect.value,'per_call');
    f.change('通用','0.7');f.change('允许新任务',false);const music=f.submit();
    assert.equal(f.writes[1].body.config.model_prices.length,2);
    assert.equal(f.writes[1].body.config.model_policies['audio:music-2.6'].enabled,false);f.finish(1);await music;
});

test('3D models use per-call billing without image resolutions or video duration controls',async()=>{
    const f=await fixture({model_models:['3.0','3.1']});f.kind.value='model';f.kind.onchange();
    assert.equal(f.model.value,'3.0');assert.equal(f.form().billingSelect.value,'per_call');assert.equal(f.field('限制开放规格'),undefined);
    assert.equal(f.field('最短秒数'),undefined);f.change('通用','12');f.change('修改原因','3D pricing');
    const pending=f.submit();const price=f.writes[0].body.config.model_prices[0];
    assert.equal(price.kind,'model');assert.equal(price.billing_type,'per_call');assert.equal(price.unit_price,'12');assert.equal(price.resolution,undefined);f.finish(0);await pending;
});
