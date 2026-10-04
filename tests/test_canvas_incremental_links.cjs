const {installWorkspaceView}=require('./helpers/workspace-view.cjs');
const {functionSource}=require('./helpers/canvas-source.cjs');
const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = readCanvasSource(require('node:path').join(__dirname, '../static/js/canvas.js'), 'utf8').replace(/\r\n/g, '\n');
class Element {
    constructor() { this.children=[]; this.dataset={}; this.style={}; this.attrs={}; this.classList={toggle(){}}; }
    setAttribute(k,v){ this.attrs[k]=v; }
    appendChild(el){ el.remove(); this.children.push(el); el.parentNode=this; }
    remove(){ if(this.parentNode) this.parentNode.children=this.parentNode.children.filter(el=>el!==this); this.parentNode=null; }
    querySelectorAll(){ return this.children.filter(el=> /temp|knife-trail/.test(el.attrs.class)); }
}
function setup(){
    const measured=[];
    const ctx=vm.createContext({nodes:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}], connections:[{id:'ab',from:'a',to:'b'},{id:'cd',from:'c',to:'d'}],
        linksEl:new Element(), linkControlsEl:new Element(), hoveredConnectionId:'', tempLink:null,
        document:{createElement:()=>new Element(),createElementNS:()=>new Element()}, tr:s=>s, isConnectionSelected:()=>false,
        offset:0, portPoint(id,kind){ measured.push(id+kind); return {x:id.charCodeAt(0)+ctx.offset,y:20}; }, renderKnifeTrail(){} });
    installWorkspaceView(ctx,'classic');
    for(const name of ['connectionPathData','pathEl','linkHitEl','linkDeleteButton','renderLinks']){
        const start=source.indexOf(`function ${name}(`);
        vm.runInContext(functionSource(source,name),ctx);
    }
    const edge=id=>({path:ctx.linksEl.children.find(el=>el.dataset.connectionId===id&&el.attrs.class==='link'),hit:ctx.linksEl.children.find(el=>el.dataset.connectionId===id&&el.attrs.class==='link-hit'),button:ctx.linkControlsEl.children.find(el=>el.dataset.connectionId===id)});
    return {ctx,measured,edge};
}
test('partial refresh measures only related endpoints and preserves every edge DOM identity',()=>{
    const {ctx,measured,edge}=setup(); ctx.renderLinks();
    const ab=edge('ab'), cd=edge('cd'), old=cd.path.attrs.d;
    measured.length=0; ctx.offset=10; ctx.renderLinks(['a']);
    assert.deepEqual(measured,['aout','bin']);
    assert.equal(edge('ab').path,ab.path);
    assert.equal(edge('cd').path,cd.path);
    assert.equal(cd.path.attrs.d,old);
    assert.notEqual(ab.path.attrs.d,old);
    assert.equal(ctx.linksEl.children.length,4);
    ctx.renderLinks(); assert.equal(edge('ab').path,ab.path);
    ctx.nodes=ctx.nodes.slice();measured.length=0;ctx.renderLinks([]);
    assert.equal(edge('ab').path,ab.path);assert.equal(edge('cd').path,cd.path);assert.deepEqual(measured,[]);
});
test('partial pass reconciles added/deleted/rebound edges and externally replaced layers',()=>{
    const {ctx,edge}=setup(); ctx.renderLinks(); const old=edge('ab');
    ctx.connections=[{id:'cd',from:'a',to:'d'},{id:'new',from:'b',to:'c'}]; ctx.renderLinks([]);
    assert.equal(old.path.parentNode,null); assert.equal(old.button.parentNode,null);
    assert.equal(edge('ab').path,undefined);
    assert.equal(edge('cd').path.attrs.d.includes(String('a'.charCodeAt(0))),true);
    const cd=edge('cd'); cd.hit.remove(); ctx.renderLinks([]);
    assert.notEqual(edge('cd').hit,cd.hit);
    assert.equal(ctx.linksEl.children.length,4);
});
test('temporary connections do not accumulate across keyed updates',()=>{
    const {ctx,edge}=setup(); ctx.tempLink={x1:0,y1:0,x2:10,y2:10};
    for(let i=0;i<5;i++) ctx.renderLinks([]);
    assert.equal(ctx.linksEl.querySelectorAll().length,1);
    ctx.tempLink=null; ctx.renderLinks([]); assert.equal(ctx.linksEl.querySelectorAll().length,0);
});
