const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
    constructor(tag, text='') { this.tag=tag; this.textContent=text; this.children=[]; this._value=''; this.disabled=false; }
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
async function fixture() {
    let confirms=0;
    const context={document:{createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text)},
        Option:function(text,value){const e=new Element('option',text);e.value=value;return e;},
        window:{confirm:()=>{confirms++;return true;}},structuredClone,Date};
    vm.runInNewContext(fs.readFileSync('management/frontend/model-billing.js','utf8'),context);
    const row={id:'p',version:1,config:{name:'Provider',image_models:['A','B'],model_policies:{
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
