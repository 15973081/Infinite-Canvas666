const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/login.js','utf8');

async function page({failFirstLogin=false}={}) {
    const nodes = new Map(), calls=[], signals=[];
    const store = new Map([['canvas:workspace:member-test','space_b'],['canvas:workspace:other','space_a'],['canvas-member:member-test:space_b:draft','unsaved draft']]);
    const get = id => {
        if (!nodes.has(id)) nodes.set(id,{value:'',textContent:'',hidden:false,checked:false,parentElement:{hidden:false},events:{},
            append(node){this.textContent+=node.textContent;},addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},removeAttribute(){},focus(){}});
        return nodes.get(id);
    };
    const location={origin:'http://localhost',search:'',replace(value){this.destination=value;}};
    vm.runInNewContext(source,{document:{getElementById:get,createElement:()=>({textContent:'',className:''})},location,URL,URLSearchParams,AbortSignal,
        sessionStorage:{removeItem:key=>store.delete(key)},
        localStorage:{setItem:(key,value)=>signals.push({key,value})},
        fetch:async (url,init={}) => {
            calls.push({url,body:init.body && JSON.parse(init.body)});
            if(url==='/api/auth/status') return Response.json({mode:'members',authenticated:false,setup_required:false});
            if(url==='/api/auth/activate') return Response.json({member:{id:'member-test',username:'assigned-artist'}});
            if(failFirstLogin && calls.filter(c=>c.url==='/api/auth/login').length===1) return Response.json({detail:{code:'invalid_credentials'}},{status:401});
            return Response.json({member:{id:'member-test'}});
        }});
    for(let i=0;i<5;i++) await new Promise(resolve=>setImmediate(resolve));
    get('activation-button').events.click();
    get('activation-token').value='synthetic-activation-token-only';
    get('password').value=get('confirm-password').value='synthetic-long-password';
    return {get,calls,location,store,signals,submit:()=>get('login-form').events.submit({preventDefault(){}})};
}

test('activation signs in using the server assigned username and clears the one time token',async()=>{
    const p=await page(); await p.submit();
    const activation=p.calls.find(c=>c.url==='/api/auth/activate');
    assert.deepEqual(Object.keys(activation.body).sort(),['password','token']);
    assert.equal(p.calls.find(c=>c.url==='/api/auth/login').body.username,'assigned-artist');
    assert.equal(p.get('activation-token').value,'');
    assert.equal(p.location.destination,'/');
});

test('a login failure after successful activation retries login without consuming the token again',async()=>{
    const p=await page({failFirstLogin:true}); await p.submit();
    assert.match(p.get('form-message').textContent,/账号或密码/);
    assert.equal(p.get('confirm-wrap').hidden,true);
    await p.submit();
    assert.equal(p.calls.filter(c=>c.url==='/api/auth/activate').length,1);
    assert.equal(p.calls.filter(c=>c.url==='/api/auth/login').length,2);
    assert.equal(p.location.destination,'/');
});

test('a fresh login forgets only this member workspace while failed login preserves it',async()=>{
    const p=await page({failFirstLogin:true});
    p.get('activation-button').events.click();
    p.get('username').value='assigned-artist';
    await p.submit();
    assert.equal(p.signals.length,0);
    assert.equal(p.store.get('canvas:workspace:member-test'),'space_b');
    assert.equal(p.location.destination,undefined);
    await p.submit();
    assert.equal(p.signals.length,1);assert.equal(p.signals[0].key,'canvas:member-session-change');
    assert.equal(p.signals[0].value.includes('member-test'),false);
    assert.equal(p.store.has('canvas:workspace:member-test'),false);
    assert.equal(p.store.get('canvas:workspace:other'),'space_a');
    assert.equal(p.store.get('canvas-member:member-test:space_b:draft'),'unsaved draft');
    assert.equal(p.location.destination,'/');
});
