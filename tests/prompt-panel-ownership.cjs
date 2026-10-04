const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

for(const kind of ['classic','smart']){
    test(`${kind}: prompt UI bindings and DOM names are private to the factory; workspace owns document writes`,()=>{
        const folder=path.join(__dirname,'../static/js/canvas',kind);
        const library=fs.readFileSync(path.join(folder,kind==='classic'?'canvas-library.js':'smart-library.js'),'utf8');
        const entry=fs.readFileSync(path.join(__dirname,'../static/js',kind==='classic'?'canvas.js':'smart-canvas.js'),'utf8');
        const workspace=fs.readFileSync(path.join(folder,kind==='classic'?'canvas-workspace.js':'smart-workspace.js'),'utf8');
        const context=vm.createContext({});vm.runInContext(library,context);
        const bindings=['promptTemplateNodeId','promptTemplateCategory','promptTemplateSelectedId','promptTemplateQuery',
            'promptTemplateEditing','activePromptLibraryId','promptTemplateGroupEditMode','promptTemplatePanel','promptTemplateBody',
            'promptTemplateSearch','promptTemplateLibrarySelect','promptTemplateCats','promptTemplateClose'];
        if(kind==='smart')bindings.push('promptPresetDeleteArmed','promptPresetPanel','promptPresetName','promptPresetText','promptPresetSelect');
        for(const binding of bindings){
            assert.equal(vm.runInContext(`typeof ${binding}`,context),'undefined',binding+' must not be exported by the library');
            assert.doesNotMatch(entry,new RegExp(`^(?:let|const|var) ${binding}\\b`,'m'),binding+' must not be owned by the entry');
        }
        const factory=kind==='classic'?'createClassicPromptPanel':'createSmartPromptPanels';
        const start=library.indexOf('function '+factory+'('),end=library.indexOf('\n}',start)+2;
        const owned=library.slice(start,end);
        assert.doesNotMatch(owned,/\b(?:node\.text|node\.promptPresetId|selectedId|selectedIds|selectedImage)\s*=/,
            'the prompt owner must delegate document/selection mutation to workspace');
        assert.match(workspace,/function apply(?:Classic|Smart)PromptPanelText\(/);
        assert.match(entry,new RegExp(`const ${kind==='classic'?'classicPromptPanel':'smartPromptPanels'} = ${factory}\\(\\);`));
    });
}
