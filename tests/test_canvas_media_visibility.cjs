const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm');
const source=readCanvasSource(require('node:path').join(__dirname,'../static/js/canvas.js'),'utf8').replace(/\r\n/g,'\n');
function setup(){
    const img={tagName:'IMG',dataset:{previewSrc:'/preview',originalSrc:'/original'},style:{width:'',height:'',visibility:''},
        attrs:{src:'/preview',srcset:'/preview2 2x'},complete:true,naturalWidth:640,offsetWidth:240,offsetHeight:180,
        getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
        addEventListener(type,fn){this[type]=fn;}};
    const node={id:'a',type:'image',mediaKind:'video',url:'/original',x:2000,y:0};
    const el={dataset:{id:'a'},querySelectorAll:()=>[img],querySelector:()=>null,contains:()=>false};
    let geometry=0;
    const ctx=vm.createContext({canvas:{id:'qa'},nodes:[node],nodesEl:{querySelectorAll:()=>[el]},selected:new Set(),
        dragNode:null,resizeNode:null,dragBoard:null,classicMinimap:{dragging:false},selectDrag:null,tempLink:null,knifeActive:false,internalDrag:false,
        classicImageEditor:{isEditingNode:()=>false},currentOutputLightboxOutId:'',currentOutputLightboxUrl:'',cascadeRunningNodeIds:new Set(),document:{activeElement:null},
        mediaKindForNode:n=>n.mediaKind,isNodeInCanvasViewport:(n,margin)=>n.x<=margin,
        suspendedCanvasPreviewImages:new WeakMap(),refreshGeometryAfterLayout:()=>geometry++});
    for(const name of ['suspendCanvasPreviewImage','restoreCanvasPreviewImage','refreshCanvasMediaVisibility','isCanvasPreviewImage','bindCanvasPreviewImageFallbacks']){
        const start=source.indexOf(`function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
    return {ctx,img,node,el,geometry:()=>geometry};
}
test('offscreen release unloads sources but retains DOM, dimensions, handlers and model; reentry restores them',()=>{
    const {ctx,img,node,el,geometry}=setup();const before=JSON.stringify(node), click=()=>{};img.onclick=click;
    ctx.refreshCanvasMediaVisibility();assert.equal(img.getAttribute('src'),null);assert.equal(img.getAttribute('srcset'),null);
    assert.equal(img.style.height,'180px');assert.equal(img.style.visibility,'hidden');assert.equal(img.onclick,click);
    assert.equal(el.querySelectorAll()[0],img);assert.equal(JSON.stringify(node),before);assert.equal(geometry(),0);
    assert.equal(ctx.isCanvasPreviewImage(img),true);
    node.x=600;ctx.refreshCanvasMediaVisibility();assert.equal(img.getAttribute('src'),null,'hysteresis keeps it suspended');
    node.x=300;ctx.refreshCanvasMediaVisibility();assert.equal(img.getAttribute('src'),'/preview');assert.equal(img.getAttribute('srcset'),'/preview2 2x');
    assert.equal(img.style.height,'');assert.equal(img.style.visibility,'');assert.equal(img.onclick,click);assert.equal(geometry(),1);
    node.x=600;ctx.refreshCanvasMediaVisibility();assert.equal(img.getAttribute('src'),'/preview','hysteresis keeps it loaded');
});
test('active interactions defer release; selected, focused, running and lightbox/editor assets are protected',()=>{
    for(const key of ['dragNode','resizeNode','dragBoard','minimapDrag','selectDrag','tempLink','knifeActive','internalDrag']){
        const {ctx,img}=setup();if(key==='minimapDrag')ctx.classicMinimap.dragging=true;else ctx[key]=true;ctx.refreshCanvasMediaVisibility();assert.equal(img.getAttribute('src'),'/preview',key);
    }
    const guards=[({ctx})=>ctx.selected.add('a'),({node})=>node.running=true,({node})=>node._pending=[{}],
        ({ctx})=>ctx.cascadeRunningNodeIds.add('a'),({node})=>node.runStatus='queued',({el})=>el.contains=()=>true,
        ({el})=>el.querySelector=()=>({}),({ctx})=>ctx.classicImageEditor.isEditingNode=id=>id==='a',({ctx})=>ctx.currentOutputLightboxOutId='a',
        ({ctx})=>ctx.currentOutputLightboxUrl='/original',({ctx})=>{ctx.nodes.push({id:'g',type:'group',items:['a']});ctx.selected.add('g');}];
    for(const guard of guards){const fixture=setup();guard(fixture);fixture.ctx.refreshCanvasMediaVisibility();assert.equal(fixture.img.getAttribute('src'),'/preview');}
    const {ctx,img}=setup();ctx.refreshCanvasMediaVisibility();ctx.selected.add('a');ctx.refreshCanvasMediaVisibility();assert.equal(img.getAttribute('src'),'/preview');
});
test('audio, generators, incomplete/failed previews and the 400–800 buffer are not released',()=>{
    for(const change of [({node})=>node.mediaKind='audio',({node})=>node.type='video',({img})=>img.complete=false,({img})=>img.naturalWidth=0,({node})=>node.x=600]){
        const fixture=setup();change(fixture);fixture.ctx.refreshCanvasMediaVisibility();assert.equal(fixture.img.getAttribute('src'),'/preview');
    }
});
test('suspension error events do not fetch originals or build a video fallback',()=>{
    const {ctx,img}=setup();ctx.bindCanvasPreviewImageFallbacks({querySelectorAll:()=>[img]});
    img.dataset.previewKind='video';ctx.suspendCanvasPreviewImage(img);img.error();assert.equal(img.getAttribute('src'),null);
    assert.equal(img.dataset.canvasMediaSuspended,'1');
});
test('repeated cycles restore exact inline styles without accumulating state',()=>{
    const {ctx,img}=setup();img.style.width='75%';img.style.height='140px';img.style.visibility='visible';
    for(let i=0;i<30;i++){
        assert.equal(ctx.suspendCanvasPreviewImage(img),true);assert.equal(ctx.suspendCanvasPreviewImage(img),false);
        assert.equal(ctx.restoreCanvasPreviewImage(img),true);assert.equal(ctx.restoreCanvasPreviewImage(img),false);
        assert.deepEqual(img.style,{width:'75%',height:'140px',visibility:'visible'});
        assert.equal(ctx.suspendedCanvasPreviewImages.has(img),false);
    }
});
