const test=require('node:test');
const assert=require('node:assert/strict');
const {collect,matchTarget,create}=require('../static/js/member-media-preview.js');
const mediaUrl=require('../static/js/member-media.js');
const base='http://canvas.test/static/canvas.html';
const sample=()=>({nodes:[{id:'image',type:'image',url:'/assets/photo.png',name:'照片'},{id:'output',type:'output',images:[{url:'/api/media/movie/content',kind:'video',name:'视频'},{url:'/assets/sound.wav',name:'声音'}]}]});
function fixture() {
    const listeners=new Map(),elements=[],entry={options:{snapshot:()=>snapshot},lease:{epoch:1,canEdit:false,state:'view',maintenance:'normal'}};
    let snapshot=sample(),valid=true;
    class Element {
        constructor(tag){this.tagName=tag.toUpperCase();this.attributes=new Map();this.children=[];this.style={};this.events=new Map();this.isConnected=true;elements.push(this);}
        setAttribute(key,value){this.attributes.set(key,String(value));}getAttribute(key){return this.attributes.get(key)??null;}removeAttribute(key){this.attributes.delete(key);if(key==='src')this.src='';}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}remove(){this.isConnected=false;}
        addEventListener(type,fn){this.events.set(type,fn);}showModal(){this.open=true;}close(){this.open=false;this.events.get('close')?.();}pause(){this.paused=true;}load(){this.loads=(this.loads||0)+1;}
    }
    const document={createElement:tag=>new Element(tag),body:new Element('body'),querySelector:()=>null,querySelectorAll:()=>[]};
    const win={document,location:{href:base},CanvasSession:{enabled:true,paused:false,context:{member:{id:'m'},workspace:{id:'w',permissions:['canvas.read','asset.read','canvas.export']}}},MutationObserver:class{observe(){}disconnect(){this.stopped=true;}},
        addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}};
    win.MemberMediaUrl=url=>mediaUrl(url,win.CanvasSession,base);
    const controller=create({window:win,entry,valid:()=>valid&&!win.CanvasSession.paused});
    const byText=text=>elements.find(element=>element.textContent===text);
    const current=()=>elements.filter(element=>['IMG','VIDEO','AUDIO'].includes(element.tagName)&&element.src).at(-1);
    return {controller,entry,win,listeners,elements,byText,current,setSnapshot:value=>snapshot=value,invalidate:()=>valid=false};
}
test('collects classic and smart media without changing snapshots or accepting active URLs',()=>{
    const snapshot=sample();snapshot.nodes.push({id:'smart',images:['/assets/a.webp',{url:'javascript:alert(1)'},{url:'/assets/a.txt'},{url:'data:text/html,hi'},{url:'/assets/file',kind:'file'}]});
    const before=JSON.stringify(snapshot);const values=collect(snapshot,base);
    assert.deepEqual(values.map(item=>[item.nodeId,item.index,item.kind]),[['image',0,'image'],['output',0,'video'],['output',1,'audio'],['smart',0,'image']]);assert.equal(JSON.stringify(snapshot),before);
});
test('maps classic output and smart indexed thumbnails to current snapshot items',()=>{
    const items=collect(sample(),base);
    const target=(id,index,raw)=>{const node={dataset:{id}};const media={dataset:{originalSrc:raw},closest:selector=>selector.startsWith('.node')?node:selector==='[data-image-index]'&&index!==undefined?{dataset:{imageIndex:String(index)}}:null};return {closest:()=>media};};
    assert.equal(matchTarget(target('output',1),items).kind,'audio');assert.equal(matchTarget(target('output',undefined,'/api/media/movie/content'),items).kind,'video');
    assert.equal(matchTarget(target('output',99),items),null);assert.equal(matchTarget(target('other',0),items),null);
});
test('viewer navigates image/video/audio, binds identity, zooms and releases media on close',()=>{
    const f=fixture();f.controller.open();assert.equal(f.current().tagName,'IMG');assert.match(f.current().src,/workspace=w&member=m/);
    f.byText('放大').onclick();assert.equal(f.current().style.width,'125%');f.byText('适合窗口').onclick();assert.equal(f.current().style.width,'');
    f.byText('下一项').onclick();const video=f.current();assert.equal(video.tagName,'VIDEO');assert.equal(video.controls,true);
    f.byText('下一项').onclick();assert.equal(video.paused,true);assert.equal(video.src,'');const audio=f.current();assert.equal(audio.tagName,'AUDIO');
    f.controller.close();assert.equal(audio.paused,true);assert.equal(audio.src,'');assert.equal(f.current(),undefined);
});
test('readonly preview never invokes write, edit or generation methods',()=>{
    const f=fixture();for(const key of ['start','write','joinResult','finish'])f.entry.lease[key]=()=>assert.fail('unexpected lease '+key);
    f.entry.options.flush=()=>assert.fail('unexpected save');f.controller.open();f.byText('下一项').onclick();f.controller.close();assert.equal(f.entry.lease.state,'view');
});
test('session pause, changed epoch, offline maintenance and removed permission close and clear preview',()=>{
    for(const change of [f=>f.win.CanvasSession.paused=true,f=>f.entry.lease.epoch++,f=>f.entry.lease.maintenance='offline',f=>f.win.CanvasSession.context.workspace.permissions=[],f=>f.invalidate()]){
        const f=fixture();f.controller.open();const image=f.current();change(f);f.controller.sync();assert.equal(image.src,'');assert.equal(f.elements.find(el=>el.tagName==='DIALOG').open,false);f.controller.dispose();assert.equal(f.listeners.size,0);
    }
});
test('deleted or replaced media cannot remain open across document updates',()=>{
    const f=fixture();f.controller.open();f.setSnapshot({nodes:[{id:'image',type:'image',url:'/assets/replaced.png'}]});f.controller.sync();assert.equal(f.current(),undefined);
    f.controller.open({nodeId:'image',index:0,url:'/assets/photo.png'});assert.equal(f.current(),undefined);
});
test('export permission controls download and is rechecked on click',()=>{
    const f=fixture();f.controller.open();const link=f.byText('下载原件');assert.equal(link.hidden,false);assert.match(link.href,/member=m/);
    f.win.CanvasSession.context.workspace.permissions=['canvas.read','asset.read'];let prevented=false;link.events.get('click')({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(f.current(),undefined);
    f.controller.open();assert.equal(link.hidden,true);
});
test('media clicks are captured in view mode, invalid targets do not open unrelated media, edit events are untouched',()=>{
    const f=fixture(),item=collect(sample(),base)[0];const node={dataset:{id:item.nodeId}};const media={dataset:{originalSrc:item.url},closest:selector=>selector.startsWith('.node')?node:null};
    const target={closest:()=>media};let prevented=0;const event={type:'click',target,preventDefault(){prevented++;},stopImmediatePropagation(){}};
    f.listeners.get('click')(event);assert.equal(prevented,1);assert.equal(f.current().tagName,'IMG');f.controller.close();
    media.dataset.originalSrc='/assets/old.png';f.listeners.get('click')(event);assert.equal(f.current(),undefined);
    f.entry.lease.canEdit=true;f.listeners.get('click')(event);assert.equal(prevented,2);
});

const vm=require('node:vm');
const fs=require('node:fs');
test('smart media measurement keeps viewer documents clean; late loads cannot save after handoff',()=>{
    const source=fs.readFileSync('static/js/smart-canvas.js','utf8').replace(/\r\n/g,'\n');
    const start=source.indexOf('function measureSmartNodeImages('),end=source.indexOf('\nfunction bindConnectionEvents',start);
    for(const mode of ['view','editing','handoff','replaced']){
        const image={url:'/assets/photo.png'},node={id:'n',images:[image]},listeners={},draws=[];let saves=0;
        const entry={lease:{epoch:1}},win={CanvasSession:{enabled:true},MemberCanvasEdit:{active:entry,canEdit:mode!=='view'}};
        const img={tagName:'IMG',complete:false,naturalWidth:480,naturalHeight:270,isConnected:true,closest:selector=>({dataset:selector==='.image-node'?{id:'n'}:{imageIndex:'0'}}),addEventListener:(name,fn)=>listeners[name]=fn};
        const root={querySelectorAll:()=>[img]};
        const ctx=vm.createContext({window:win,nodes:[node],world:root,bindImageProxyFallback(){},isSmartPreviewImage:()=>false,applyThumbDisplaySizeToElement(){},updateImageResolutionBadgeElement(){},singleImageLayout:()=>({width:480,height:270}),mediaNodeDefaultScale:()=>1,updateNodeElementDuringResize:value=>draws.push(value),isNodeSelected:()=>false,updateComposer(){},scheduleSave(){saves++;}});
        vm.runInContext(source.slice(start,end),ctx);ctx.measureSmartNodeImages(root);
        if(mode==='handoff'){entry.lease.epoch++;win.MemberCanvasEdit.canEdit=false;}
        if(mode==='replaced')node.images=[{url:'/assets/new.png'}];
        listeners.load();
        assert.equal(saves,mode==='editing'?1:0,mode);assert.equal(image.natural_w,mode==='editing'?480:undefined,mode);
        assert.equal(draws.length,mode==='replaced'?0:1,mode);
    }
});

test('view annotations restore original keyboard and drag attributes on edit and disposal',()=>{
    const f=fixture(),media=f.win.document.createElement('img'),node={dataset:{id:'image'}};
    media.dataset={originalSrc:'/assets/photo.png'};
    media.closest=selector=>selector.startsWith('.image-preview-wrap')?media:selector.startsWith('.node')?node:null;
    media.setAttribute('draggable','true');media.setAttribute('aria-label','原名称');
    f.win.document.querySelectorAll=()=>[media];f.controller.sync();
    assert.equal(media.getAttribute('tabindex'),'0');assert.equal(media.getAttribute('role'),'button');assert.equal(media.getAttribute('draggable'),'false');
    f.entry.lease.canEdit=true;f.controller.sync();assert.equal(media.getAttribute('tabindex'),null);assert.equal(media.getAttribute('role'),null);assert.equal(media.getAttribute('aria-label'),'原名称');assert.equal(media.getAttribute('draggable'),'true');
    f.entry.lease.canEdit=false;f.controller.sync();f.controller.dispose();assert.equal(media.getAttribute('data-member-preview'),null);
});
