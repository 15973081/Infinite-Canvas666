const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=readCanvasSource('static/js/canvas.js','utf8');
const summarySource=source.slice(source.indexOf('function generationSettingsSummary('),source.indexOf('function attachGenerationSettingsDisclosure('));
const context={};vm.runInNewContext(summarySource,context);
function controls(values){
    const immutable=value=>new Proxy(value,{set(){throw Error('Summary must not modify controls');}});
    const map={};
    for(const [selector,value] of Object.entries(values)){
        map[selector]=immutable(typeof value==='object' ? {tagName:'SELECT',value:value.value,selectedOptions:[{textContent:value.label}]} : {tagName:'INPUT',value});
    }
    return {querySelector:selectors=>selectors.split(',').map(s=>map[s]).find(Boolean)};
}
test('summary uses current chosen values without inserting preset parameters',()=>{
    const result=context.generationSettingsSummary(controls({'.video-model':{value:'custom-model',label:'Custom Model'},'.video-provider':{value:'custom',label:'Private Provider'},'.video-duration':'11','.video-aspect':{value:'4:3',label:'4:3'},'.video-resolution':{value:'480p',label:'480p'}}));
    assert.equal(result.title,'Custom Model · Private Provider');assert.equal(result.detail,'11 秒 · 4:3 · 480p');
});
test('unconfigured controls stay empty, with an actionable summary label',()=>{
    const result=context.generationSettingsSummary(controls({}));
    assert.equal(result.title,'选择模型与供应商');assert.equal(result.detail,'');
});
test('an explicit automatic resolution and automatic duration are preserved',()=>{
    const result=context.generationSettingsSummary(controls({'.video-duration':'-1','.video-resolution':{value:'',label:'Auto'}}));
    assert.equal(result.detail,'自动时长 · Auto');
});
test('custom image dimensions and ratios are summarized from their entered values',()=>{
    const result=context.generationSettingsSummary(controls({'.ratio':{value:'custom',label:'自定义'},'.resolution':{value:'custom',label:'自定义'},'.custom-ratio-w-input':'7','.custom-ratio-h-input':'5','.custom-w-input':'1408','.custom-h-input':'1024','.gen-count-input':'3'}));
    assert.equal(result.detail,'7:5 · 1408 × 1024 · 3 张');
});
test('near-limit counter counts Unicode characters and returns to its quiet state',()=>{
    const start=source.indexOf('function refreshPromptCounter('),end=source.indexOf('function canvasAssetLibraries(',start);
    const classes=new Set();const counter={classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},innerHTML:''};
    const env={PROMPT_TEXT_MAX_LENGTH:10,promptTextLength:text=>Array.from(text).length};vm.runInNewContext(source.slice(start,end),env);
    const container={querySelector:()=>counter};
    env.refreshPromptCounter(container,'😀'.repeat(9));assert.equal(classes.has('near-limit'),true);assert.equal(classes.has('over'),false);
    env.refreshPromptCounter(container,'😀'.repeat(11));assert.equal(classes.has('over'),true);
    env.refreshPromptCounter(container,'短句');assert.equal(classes.has('near-limit'),false);assert.equal(classes.has('over'),false);
});
