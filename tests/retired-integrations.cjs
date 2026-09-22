const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function source(file) { return readCanvasSource(path.join(root,file),'utf8'); }
function fn(text,name) {
    const start = text.indexOf('function '+name+'(');
    assert.ok(start >= 0, name);
    const begin = text.slice(start-6,start) === 'async ' ? start-6 : start;
    const end = text.indexOf('\n}',start)+2;
    return text.slice(begin,end);
}
test('removed tool pages and creation menus are absent; shell scripts still parse',()=>{
    for(const page of ['zimage','enhance','klein','angle','comfyui-settings']) assert.equal(fs.existsSync(path.join(root,'static',page+'.html')),false);
    const shell=source('static/index.html');
    for(const page of ['zimage','enhance','klein','angle','comfyui-settings']) assert.ok(!shell.includes('frame-'+page));
    for(const match of shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/src=|type=["'](?:module|importmap)/.test(match[1])) new vm.Script(match[2]);
    const classic=source('static/canvas.html'),smart=source('static/smart-canvas.html');
    for(const name of ['comfy','msgen','ltxDirector']) assert.ok(!classic.includes("menuAdd('"+name+"')"));
    for(const name of ['comfy','modelscope']) assert.ok(!smart.includes('option value="'+name+'"'));
});
test('historical nodes render a retirement notice without changing stored parameters',()=>{
    const text=source('static/js/canvas.js');
    const ctx={document:{createElement:()=>({})}};
    for(const name of ['renderComfyBody','renderMsGenBody','renderLTXDirectorBody']) {
        vm.runInNewContext(fn(text,name),ctx);
        const node={type:'comfy',comfyWorkflow:'custom/original.json',comfyParams:{seed:17},timeline:'original',images:['/assets/old.png']};
        const before=JSON.stringify(node);
        assert.match(ctx[name](node).textContent,/已移除/);
        assert.equal(JSON.stringify(node),before);
    }
    vm.runInNewContext(fn(text,'pruneMissingComfyWorkflows'),ctx);
    assert.doesNotThrow(()=>ctx.pruneMissingComfyWorkflows());
});
test('retired execution fails before any network or node mutation',async()=>{
    for(const [file,names] of [
        ['static/js/canvas.js',['runComfyNode','runMsGenNode','runLTXDirectorNode','uploadCanvasUrlToComfy','comfyNameForRef','runComfyUpscale']],
        ['static/js/smart-canvas.js',['generateComfyUrlsWithSettings','runModelscopeGeneration','runComfyGeneration','runComfyText','runComfyEnhance','runComfyEdit','comfyNameForRef']]
    ]) {
        const text=source(file), ctx={settings:{}};
        for(const name of names) {vm.runInNewContext(fn(text,name),ctx);await assert.rejects(()=>ctx[name]('legacy'),/已移除/);}
    }
});
test('legacy generation and workflow methods are removed from the shared client',()=>{
    const text=source('static/js/canvas-api.js');
    for(const route of ["'/api/generate'","'/api/upload'","'/api/workflows'",'/api/workflows/']) assert.ok(!text.includes(route),route);
    assert.ok(text.includes('/api/canvas-image-tasks'));
    assert.ok(text.includes('/api/media/uploads'));
});
