const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function source(file,name){const text=fs.readFileSync(file,'utf8'),start=text.indexOf('async function '+name+'(');assert.ok(start>=0);return text.slice(start,text.indexOf('\n}',start)+2);}
const classic=source('static/js/canvas.js','syncRemoteCanvasNow');
const smart=source('static/js/smart-canvas.js','loadCanvas');
for(const [kind,body,name,args] of [['classic',classic,'syncRemoteCanvasNow',[]],['smart',smart,'loadCanvas',[{observe:true}]]]){
    test(kind+' viewer reads cannot replace a canvas after editing starts, identity changes or a newer revision arrives',async()=>{
        for(const change of ['editing','epoch','entry','canvas','newer']){
            let complete;const entry={lease:{epoch:1}},member={active:entry,canRefresh:true};
            const ctx={window:{CanvasSession:{enabled:true},MemberCanvasEdit:member,CanvasApi:{getCanvas:()=>new Promise(r=>complete=r)}},
                canvas:{id:'a',revision:3},canvasId:'a',lastCanvasUpdatedAt:0,tr:v=>v,console,
                applyRemoteCanvasData:()=>assert.fail('applied late response'),setStatus:()=>assert.fail('failed instead of discarding'),toast:()=>assert.fail('failed instead of discarding')};
            vm.createContext(ctx);vm.runInContext(body,ctx);const pending=ctx[name](...args);
            if(change==='editing')member.canRefresh=false;
            if(change==='epoch')entry.lease.epoch++;
            if(change==='entry')member.active={lease:{epoch:1}};
            if(change==='canvas'){ctx.canvasId='b';ctx.canvas={id:'b',revision:1};}
            if(change==='newer')ctx.canvas.revision=5;
            complete({canvas:{id:'a',revision:4,updated_at:500}});await pending;
            assert.equal(ctx.canvas.revision,change==='newer'?5:change==='canvas'?1:3);
        }
    });
}
test('classic member synchronization uses revisions when timestamps are equal',async()=>{
    const entry={lease:{epoch:1}};let applied;
    const ctx={window:{CanvasSession:{enabled:true},MemberCanvasEdit:{active:entry,canRefresh:true},CanvasApi:{getCanvas:async()=>({canvas:{id:'a',revision:4,updated_at:10}})}},
        canvas:{id:'a',revision:3},lastCanvasUpdatedAt:10,applyRemoteCanvasData:value=>applied=value,tr:v=>v,console,setStatus(){}};
    vm.createContext(ctx);vm.runInContext(classic,ctx);await ctx.syncRemoteCanvasNow();assert.equal(applied.revision,4);
});
