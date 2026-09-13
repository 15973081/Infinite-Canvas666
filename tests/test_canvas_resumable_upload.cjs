const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto, createHash} = require('node:crypto');

function harness(fetch, crypto=webcrypto){
    const saved = new Map();
    const context = {window:{}, fetch, crypto, Blob,
        sessionStorage:{getItem:key=>saved.get(key), setItem:(key,value)=>saved.set(key,value), removeItem:key=>saved.delete(key)},
        setTimeout:resolve=>setImmediate(resolve)};
    vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../static/js/canvas-api.js'),'utf8'), context);
    return {api:context.window.CanvasApi, saved};
}
function file(text){
    const blob = new Blob([text]);
    blob.name = 'sample.bin';
    blob.lastModified = 123;
    return blob;
}
function reply(body, status=200){
    return {ok:status>=200 && status<300, status, json:async()=>body, headers:{get:()=>null}};
}
function model(){
    let key, blocked = true;
    const parts = new Map(), putCounts = new Map();
    const fetch = async (path, init={}) => {
        if(path.endsWith('/capabilities')) return reply({resumable:true,max_file_bytes:100});
        if(path === '/api/media/uploads'){
            const body = JSON.parse(init.body);
            if(key) assert.equal(body.idempotency_key,key,'retry must retain upload identity');
            key = body.idempotency_key;
            return reply({media_asset_id:'ast_test', status:'uploading', part_size:4,part_count:2,expires_at:Date.now()/1000+3600,
                parts:Array.from(parts,([part_number,sha256])=>({part_number,sha256}))});
        }
        if(path.endsWith('/complete') && !path.includes('/parts/')){
            assert.equal(parts.size,2);
            return reply({status:'ready',url:'/assets/cloud/ast_test/sample.bin'});
        }
        const number = Number(path.match(/parts\/(\d+)/)?.[1]);
        if(path.endsWith('/content')){
            putCounts.set(number,(putCounts.get(number)||0)+1);
            if(number===2 && blocked) throw new TypeError('connection interrupted');
            parts.set(number,createHash('sha256').update(Buffer.from(await init.body.arrayBuffer())).digest('hex'));
            return reply({});
        }
        if(path.endsWith('/complete')) return reply({});
        return reply({url:`/api/media/uploads/ast_test/parts/${number}/content`,headers:{}});
    };
    return {fetch,parts,putCounts,unblock:()=>{blocked=false;}};
}

test('local storage keeps its existing multipart form upload',async()=>{
    const calls=[];
    const {api}=harness(async(path,init)=>{calls.push([path,init]);return reply(path.endsWith('capabilities')?{resumable:false}:{files:[]});});
    const form={getAll:()=>[file('test')]};
    await api.uploadAi(form);
    assert.equal(calls[1][0],'/api/ai/upload');
    assert.equal(calls[1][1].body,form);
});

test('reselecting after interruption skips confirmed parts and clears resume state on success',async()=>{
    const server=model(), {api,saved}=harness(server.fetch);
    const form={getAll:()=>[file('abcdefgh')]};
    await assert.rejects(api.uploadAi(form),/connection interrupted/);
    assert.equal(server.putCounts.get(1),1);
    assert.equal(server.putCounts.get(2),3);
    assert.equal(saved.size,1);
    server.unblock();
    const value=await api.uploadAi(form);
    assert.equal(value.files[0].status,'ready');
    assert.equal(server.putCounts.get(1),1);
    assert.equal(server.putCounts.get(2),4);
    assert.equal(saved.size,0);
});

test('resume detects a mismatched confirmed-part hash instead of returning unrelated media',async()=>{
    const server=model(), {api,saved}=harness(server.fetch);
    const form={getAll:()=>[file('abcdefgh')]};
    await assert.rejects(api.uploadAi(form));
    server.parts.set(1,'0'.repeat(64));
    server.unblock();
    await assert.rejects(api.uploadAi(form),/文件内容已改变/);
    assert.equal(saved.size,0);
    assert.equal(server.putCounts.get(2),3);
});

test('private HTTP LAN upload hashes match SHA-256 without secure-context Web Crypto',async()=>{
    for(const size of [1,55,56,63,64,65,1000]){
        const raw = 'a'.repeat(size);
        let declared;
        const fetch = async(path,init={})=>{
            if(path.endsWith('/capabilities')) return reply({resumable:true,max_file_bytes:2000});
            if(path === '/api/media/uploads') return reply({media_asset_id:'ast_test',status:'uploading',part_size:2000,part_count:1,expires_at:Date.now()/1000+3600,parts:[]});
            if(path.endsWith('/content')) return reply({});
            if(path.endsWith('/complete')) return reply({status:'ready'});
            declared=JSON.parse(init.body).sha256;
            return reply({url:'/parts/1/content',headers:{}});
        };
        const {api}=harness(fetch,{getRandomValues:bytes=>webcrypto.getRandomValues(bytes)});
        await api.uploadAi({getAll:()=>[file(raw)]});
        assert.equal(declared,createHash('sha256').update(raw).digest('hex'));
    }
});
