const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/canvas-browser.cjs');

async function scenario(page,kind){
    await page.evaluate(async kind=>{
        const libraries=['system','one','two'].map(id=>({id,name:id,readonly:id==='system',
            categories:[{id:'view',name:'View'},{id:'custom',name:'Custom'}],items:[
                {id:id+'-a',name:'Alpha',positive:'alpha text',category:'view',negative:'negative',params:{steps:20}},
                {id:id+'-b',name:'Beta',positive:'beta text',category:'custom'}]}));
        window.CanvasApi.getPromptLibraries=async()=>({library:{libraries:structuredClone(libraries)}});
        nodes=[{id:'p',type:kind==='classic'?'prompt':'smart-prompt',text:'old',x:50,y:50,images:[]},
            {id:'q',type:kind==='classic'?'prompt':'smart-prompt',text:'other',x:500,y:50,images:[]}];
        if(kind==='smart')smartSelection.panelTarget('p');
        else {selectedId='p';selectedIds=[];}
        render();
        const owner=kind==='classic'?classicPromptPanel:smartPromptPanels;
        if(kind==='classic'){canvasPromptTemplatesLoaded=false;await loadCanvasPromptTemplates();}
        else await loadPromptTemplates();
        owner.dataChanged();await owner.selectLibrary('one');
        window.promptTest={owner,libraries,kind,saves:0,renders:0,
            snapshot:()=>({library:{libraries:structuredClone(libraries)}})};
        scheduleSave=()=>promptTest.saves++;
        const original=render;render=(...args)=>{promptTest.renders++;return original(...args);};
        await owner.open('p');
    },kind);
}

for(const kind of ['classic','smart']){
    test(`${kind}: prompt commands own choices, immutable snapshots and DOM mirrors; paint never repairs selection`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await scenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner}=promptTest,states=[];
            const snapshot=owner.state;try{snapshot.itemId='tamper';}catch(_){}
            const readonly=Object.isFrozen(owner)&&Object.isFrozen(snapshot)&&owner.state.itemId!=='tamper';
            owner.selectCategory('view');await owner.selectLibrary('two');states.push(owner.state.categoryId);
            owner.selectCategory('missing');states.push(owner.state.categoryId);
            owner.selectTemplate('two-b');owner.setQuery('alpha');states.push(owner.state.itemId);
            owner.setQuery('absent');states.push([owner.state.itemId,owner.state.editing]);
            owner.setQuery('');owner.selectCategory('custom');owner.startEditing();owner.cancelEditing();
            states.push([owner.state.itemId,owner.state.editing]);
            // Input/dataset are mirrors: unsubmitted external changes cannot redirect apply/paint.
            document.getElementById('promptTemplateSearch').value='absent';
            if(kind==='smart')document.getElementById('promptTemplatePanel').dataset.nodeId='q';
            const before=JSON.stringify(owner.state);
            if(kind==='classic')renderPromptTemplateModal();else renderPromptTemplatePanel();
            const pure=before===JSON.stringify(owner.state);
            const cards=document.querySelectorAll('[data-template-id]').length;
            const renders=promptTest.renders;
            owner.selectCategory('view');owner.selectTemplate('two-a');
            if(kind==='classic')applyPromptTemplateToPromptNode();else applyPromptTemplateToNode();
            return {readonly,states,pure,cards,renders,text:nodes.find(n=>n.id==='p').text,other:nodes.find(n=>n.id==='q').text};
        },kind);
        assert.equal(result.readonly,true);assert.equal(result.pure,true);assert.equal(result.cards,1);
        assert.equal(result.renders,1*(kind==='smart'),'search/selection only repaint their panel');
        assert.deepEqual(result.states,[kind==='classic'?'view':'all','all','two-a',['',false],['two-b',false]]);
        assert.equal(result.text,'alpha text');assert.equal(result.other,'other');assert.deepEqual(errors,[]);
    });

    test(`${kind}: repeated binding, Escape, cached return with drafts, destroy and unrelated listeners`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await scenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner}=promptTest;for(let i=0;i<4;i++){owner.bind();owner.bindLifecycle();}
            const search=document.getElementById('promptTemplateSearch');
            const before=owner.capture().version;
            search.value='alpha';search.dispatchEvent(new Event('input',{bubbles:true}));
            const changes=owner.capture().version-before;
            owner.startEditing();
            const draft=document.querySelector('[data-template-edit-text]');draft.value='unsaved draft';
            window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
            search.value='absent';search.dispatchEvent(new Event('input',{bubbles:true}));
            const suspendedQuery=owner.state.query;
            window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
            const restored=document.querySelector('[data-template-edit-text]')?.value;
            search.value='beta';search.dispatchEvent(new Event('input',{bubbles:true}));
            const resumedQuery=owner.state.query;
            document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            const escaped=!owner.state.open;
            await owner.open('p');
            let external=0;const listener=()=>external++;search.addEventListener('input',listener);
            window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
            const after=JSON.stringify(owner.state);
            search.dispatchEvent(new Event('input',{bubbles:true}));
            owner.bind();owner.setQuery('late');owner.startEditing();await owner.open('q');
            if(kind==='classic')await createBlankCanvasPromptTemplate();else await createBlankPromptTemplate();
            const untouched=after===JSON.stringify(owner.state);
            search.removeEventListener('input',listener);
            return {changes,suspendedQuery,restored,resumedQuery,escaped,external,untouched,destroyed:owner.destroyed,saves:promptTest.saves};
        },kind);
        assert.deepEqual(result,{changes:1,suspendedQuery:'alpha',restored:'unsaved draft',resumedQuery:'beta',escaped:true,external:1,untouched:true,destroyed:true,saves:0});
        assert.deepEqual(errors,[]);
    });

    test(`${kind}: delayed opens cannot reopen, select or focus old targets across close, reopen, deletion and canvas change`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await scenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner,snapshot}=promptTest;owner.close();let pending=[];
            const defer=()=>{let resolve;const promise=new Promise(done=>resolve=done);pending.push(resolve);return promise;};
            window.CanvasApi.getPromptLibraries=defer;
            const open=id=>{if(kind==='classic')canvasPromptTemplatesLoaded=false;return owner.open(id);};
            const focus=document.createElement('input');document.body.append(focus);focus.focus();
            const old=open('p');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            pending.shift()(snapshot());await old;
            const closed=!owner.state.open&&document.activeElement===focus;
            const cancelled=open('p');owner.selectCategory('custom');pending.shift()(snapshot());await cancelled;
            const settled=!owner.state.opening;owner.close();
            const a=open('p'),b=open('q');pending[1](snapshot());await b;
            pending[0](snapshot());await a;pending=[];
            const reopened=owner.state.nodeId==='q';
            const deleted=open('p');nodes=nodes.filter(n=>n.id!=='p');pending.shift()(snapshot());await deleted;
            const missing=!owner.state.open;
            const switched=open('q');owner.reset();canvas={...canvas,id:'other-canvas'};pending.shift()(snapshot());await switched;
            const changed=!owner.state.open&&owner.state.nodeId==='';
            focus.remove();return {closed,settled,reopened,missing,changed,saves:promptTest.saves};
        },kind);
        assert.deepEqual(result,{closed:true,settled:true,reopened:true,missing:true,changed:true,saves:0});assert.deepEqual(errors,[]);
    });

    test(`${kind}: submitted writes complete without restoring stale edit/category; group deletion validates selection`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await scenario(page,kind);
        const paints=await page.evaluate(async kind=>{
            const {owner,libraries,snapshot}=promptTest;let count=0;
            const observer=new MutationObserver(records=>count+=records.length);
            observer.observe(document.getElementById('promptTemplateBody'),{childList:true});
            window.CanvasApi.createPromptItem=async payload=>{
                const item={id:'quick',name:'Quick',positive:'quick text',category:payload.category};
                libraries.find(l=>l.id==='one').items.push(item);return {...snapshot(),item};
            };
            if(kind==='classic')await createBlankCanvasPromptTemplate();else await createBlankPromptTemplate();
            await Promise.resolve();observer.disconnect();owner.cancelEditing();owner.selectCategory('all');
            return count;
        },kind);
        assert.equal(paints,1,'a valid write receipt paints its template body once');
        const result=await page.evaluate(async kind=>{
            const {owner,libraries,snapshot}=promptTest;let finish,submitted;
            window.CanvasApi.createPromptItem=payload=>{submitted=payload;return new Promise(done=>finish=done);};
            const saving=kind==='classic'?createBlankCanvasPromptTemplate():createBlankPromptTemplate();
            owner.close();await owner.selectLibrary('two');await owner.open('q');owner.selectCategory('view');
            owner.startEditing();document.querySelector('[data-template-edit-text]').value='new session draft';
            const item={id:'created',name:'Created',positive:'created text',category:submitted.category};
            libraries.find(l=>l.id==='one').items.push(item);finish({...snapshot(),item});await saving;
            const kept=[owner.state.libraryId,owner.state.categoryId,owner.state.nodeId,document.querySelector('[data-template-edit-text]')?.value];
            const complete=(kind==='classic'?canvasPromptLibraries:promptLibraries).find(l=>l.id==='one').items.some(i=>i.id==='created');
            window.confirm=()=>true;
            window.CanvasApi.deletePromptCategory=async()=>{
                const lib=libraries.find(l=>l.id==='two');lib.categories=lib.categories.filter(c=>c.id!=='view');
                lib.items.forEach(i=>{if(i.category==='view')i.category='custom';});return snapshot();
            };
            if(kind==='classic')await deleteCanvasPromptTemplateGroup('view');else await deletePromptTemplateGroup('view');
            const category=owner.state.categoryId;
            owner.close();let finishDestroy;
            window.CanvasApi.createPromptItem=()=>new Promise(done=>finishDestroy=done);
            const committed=kind==='classic'?createBlankCanvasPromptTemplate():createBlankPromptTemplate();
            owner.destroy();finishDestroy({...snapshot(),item});await committed;
            return {kept,complete,category,closed:!owner.state.open,destroyed:owner.destroyed};
        },kind);
        assert.deepEqual(result,{kept:['two','view','q','new session draft'],complete:true,category:'all',closed:true,destroyed:true});assert.deepEqual(errors,[]);
    });

    test(`${kind}: apply uses the original canvas/node, full content, button state and one save`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await scenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner}=promptTest;
            const text='scroll row\n'.repeat(100);
            promptTest.libraries.find(l=>l.id==='one').items[0].positive=text;
            if(kind==='classic')canvasPromptLibraries=promptTest.snapshot().library.libraries;
            else promptLibraries=promptTest.snapshot().library.libraries;
            owner.dataChanged();
            owner.selectTemplate('one-a');
            const textarea=kind==='classic'?document.querySelector('.node[data-id="p"] textarea'):null;
            if(textarea){textarea.value=text;textarea.scrollTop=27;}
            const same=textarea;
            if(kind==='classic')applyPromptTemplateToPromptNode('full');else applyPromptTemplateToNode('full');
            const applied=nodes.find(n=>n.id==='p').text;
            const preserved=kind!=='classic'||same===document.querySelector('.node[data-id="p"] textarea');
            const scroll=textarea?.scrollTop;
            const active=kind==='classic'?document.querySelector('.node[data-id="p"] [data-prompt-template-open]')?.classList.contains('active'):activePromptTemplateNodeId();
            await owner.open('q');canvas={...canvas,id:'wrong-canvas'};
            if(kind==='classic')applyPromptTemplateToPromptNode();else applyPromptTemplateToNode();
            return {text:applied,preserved,scroll,active:!!active,saves:promptTest.saves,other:nodes.find(n=>n.id==='q').text};
        },kind);
        const text='scroll row\n'.repeat(100).trim();
        assert.deepEqual(result,{text:kind==='classic'?text+'\n\nNegative prompt:\nnegative\n\nParams:\nsteps: 20':text,
            preserved:true,scroll:kind==='classic'?27:undefined,active:false,saves:1,other:'other'});
        // Classic retains full details; Smart non-system templates retain positive-only apply.
        assert.deepEqual(errors,[]);
    });
}

for(const kind of ['classic','smart']){
    test(`${kind}: cached return resumes an interrupted open without reviving its old callback`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await scenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner,snapshot}=promptTest;owner.close();let pending=[];
            window.CanvasApi.getPromptLibraries=()=>new Promise(done=>pending.push(done));
            if(kind==='classic')canvasPromptTemplatesLoaded=false;
            const opening=owner.open('p');
            window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
            pending.shift()(snapshot());await opening;
            const focus=document.activeElement;
            window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
            if(pending.length)pending.shift()(snapshot());
            for(let i=0;i<16;i++)await Promise.resolve();
            const restored=owner.state.open&&owner.state.nodeId==='p';
            owner.close();return {restored,saves:promptTest.saves,alive:!owner.destroyed};
        },kind);
        assert.deepEqual(result,{restored:true,saves:0,alive:true});assert.deepEqual(errors,[]);
    });

    test(`${kind}: panel apply continues through the existing member save gate`,async t=>{
        const {page,errors,writes}=await fixture(t,kind,true);
        await page.evaluate(()=>{window.originalPromptScheduleSave=scheduleSave;});
        await scenario(page,kind);
        const result=await page.evaluate(async kind=>{
            scheduleSave=window.originalPromptScheduleSave;
            window.MemberCanvasEdit.setEditable(false);
            if(kind==='classic')applyPromptTemplateToPromptNode();else applyPromptTemplateToNode();
            const dirty=kind==='classic'?localCanvasDirty:smartCanvasDirty;
            await saveCanvas();return {dirty,closed:!promptTest.owner.state.open};
        },kind);
        assert.deepEqual(result,{dirty:false,closed:true});
        assert.equal(writes.filter(w=>w.method==='PUT').length,0);assert.deepEqual(errors,[]);
    });
}

test('classic: manager library selection uses the same command, clears only its multi-selection and retains cached loading',async t=>{
    const {page,errors}=await fixture(t,'classic',false);await scenario(page,'classic');
    const result=await page.evaluate(async()=>{
        const {owner}=promptTest;owner.selectCategory('view');let loads=0;
        window.CanvasApi.getPromptLibraries=async()=>{loads++;return promptTest.snapshot();};
        managerSelectedPromptIds.add('one-a');managerSelectedAssetIds.add('asset-kept');
        assetManagerTab='prompts';assetManagerModal.classList.add('open');renderAssetManager();
        document.querySelector('[data-manager-prompt-lib="two"]').click();
        const state=[owner.state.libraryId,owner.state.categoryId,owner.state.itemId];
        owner.close();await owner.open('p');
        return {state,selected:managerSelectedPromptIds.size,assets:managerSelectedAssetIds.size,loads};
    });
    assert.deepEqual(result,{state:['two','view','two-a'],selected:0,assets:1,loads:0});assert.deepEqual(errors,[]);
});

test('smart: node/composer template apply, independent preset session, DOM mirrors and scoped preset bindings',async t=>{
    const {page,errors}=await fixture(t,'smart',false);await scenario(page,'smart');
    const result=await page.evaluate(async()=>{
        const {owner}=promptTest;
        promptPresets=[{id:'local',name:'Local',text:'local text',category:'custom'}];owner.dataChanged();
        nodes.forEach(n=>n.promptPresetId='local');
        openPromptPresetPanel('p','local');
        const simultaneous=owner.state.open&&owner.state.preset.open&&Object.isFrozen(owner.state.preset);
        document.getElementById('promptPresetSelect').value=''; // DOM cannot change selection.
        document.getElementById('promptPresetPanel').dataset.nodeId='q';
        document.getElementById('promptPresetName').value='Edited';document.getElementById('promptPresetText').value='edited text';
        owner.savePreset();
        const scoped=nodes.map(n=>n.text);
        const stored=JSON.parse(localStorage.getItem(PROMPT_PRESETS_KEY))[0].text;
        const savesAfterEdit=promptTest.saves;
        owner.confirmDelete();const armed=owner.state.preset.deleteArmed&&promptPresets.length===1;
        owner.selectPreset('local');const disarmed=!owner.state.preset.deleteArmed;
        owner.confirmDelete();owner.confirmDelete();
        const deleted=promptPresets.length===0&&nodes.every(n=>!n.promptPresetId);
        const savesAfterDelete=promptTest.saves;
        owner.close();await owner.selectLibrary('system');await owner.open('p','system-a',{target:'composer'});
        applyPromptTemplateToNode('full');
        const composer=promptPlainText(),pressed=document.getElementById('composerTemplateBtn').getAttribute('aria-pressed');
        return {simultaneous,scoped,stored,savesAfterEdit,armed,disarmed,deleted,savesAfterDelete,composer,pressed,saves:promptTest.saves};
    });
    assert.deepEqual(result,{simultaneous:true,scoped:['edited text','other'],stored:'edited text',savesAfterEdit:1,armed:true,disarmed:true,deleted:true,savesAfterDelete:2,
        composer:'alpha text\n\nNegative prompt:\nnegative\n\nParams:\nsteps: 20',pressed:'false',saves:3});assert.deepEqual(errors,[]);
});

test('smart: local template editing updates all bound nodes; readonly template controls and outside close preserve permission rules',async t=>{
    const {page,errors}=await fixture(t,'smart',false);await scenario(page,'smart');
    const result=await page.evaluate(async()=>{
        const {owner}=promptTest;promptPresets=[{id:'local',name:'Local',text:'local text',category:'custom'}];
        nodes.forEach(n=>n.promptPresetId='local');await owner.selectLibrary('system');owner.selectTemplate('mine:local');owner.startEditing();
        document.querySelector('[data-template-edit-name]').value='Updated';document.querySelector('[data-template-edit-text]').value='all updated';
        await savePromptTemplateEdit();const texts=nodes.map(n=>n.text);
        owner.selectTemplate('system-a');const disabled=document.querySelector('[data-template-edit]').disabled;
        document.body.click();return {texts,disabled,closed:!owner.state.open,saves:promptTest.saves};
    });
    assert.deepEqual(result,{texts:['all updated','all updated'],disabled:true,closed:true,saves:1});assert.deepEqual(errors,[]);
});
