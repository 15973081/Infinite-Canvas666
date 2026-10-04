const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
const root=path.join(__dirname,'../static/js'),results=fs.readFileSync(path.join(root,'canvas/smart/smart-results.js'),'utf8');

test('Smart panorama owns a lazy frozen scalar snapshot; mutable state and GPU helpers are not global',()=>{
 const c=vm.createContext({});vm.runInContext(results,c);
 for(const name of ['panoramaState','PANORAMA_RATIO_PRESETS','ensurePanoramaRenderer','drawPanoramaFrame','applyPanoramaTexture','disposePanoramaTexture','startPanoramaLoop','stopPanoramaLoop'])assert.equal(vm.runInContext('typeof '+name,c),'undefined',name);
 const owner=vm.runInContext('createSmartPanoramaPreview()',c);assert.ok(Object.isFrozen(owner));const s=owner.state;assert.ok(Object.isFrozen(s));assert.equal(s.enabled,false);assert.equal(s.destroyed,false);assert.ok(Object.values(s).every(v=>typeof v!=='object'));
 assert.deepEqual(JSON.parse(JSON.stringify(owner.resolutionValue())),{w:1536,h:864});
 const entry=fs.readFileSync(path.join(root,'smart-canvas.js'),'utf8');assert.doesNotMatch(entry,/\bpanoramaState\b|__smartCanvasPanoramaState/);assert.match(entry,/const smartPanoramaPreview = createSmartPanoramaPreview\(\)/);
});

test('Smart panorama workspace and editor collaborate by intent while editing receipts retain strict item identity',()=>{
 const workspace=fs.readFileSync(path.join(root,'canvas/smart/smart-workspace.js'),'utf8'),editor=fs.readFileSync(path.join(root,'canvas/smart/smart-media-editor.js'),'utf8');
 for(const file of [workspace,editor])assert.doesNotMatch(file,/\bpanoramaState\b|(?:element|getElementById)\(['"]panorama(?:Canvas|ToggleBtn|ExportBtn|Controls|RatioW|RatioH|Stage)['"]\)/);
 assert.match(workspace,/smartPanoramaPreview\.moveDrag\(e\)/);assert.match(workspace,/smartPanoramaPreview\.endDrag\(\)/);
 assert.match(functionSource(editor,'targetValid'),/target\.node\.images\?\.\[target\.index\]===target\.item/);
 assert.match(functionSource(editor,'guardPanoramaCallback'),/origin\.generation===generation/);assert.match(functionSource(editor,'guardPanoramaCallback'),/origin\.revision===editRevision/);
 const owner=functionSource(results,'createSmartPanoramaPreview');assert.doesNotMatch(owner,/\b(?:selectedIds|selectedId|selectedImage|nodes|connections|undoStack|redoStack)\s*=/);assert.match(owner,/applySmartPanoramaExport\(frame,task\.point\)/);
});

test('Smart panorama teardown is idempotent and cancels owned resources without removing shared workspace handlers',()=>{
 const owner=functionSource(results,'createSmartPanoramaPreview');assert.match(functionSource(owner,'destroy'),/if\(destroyed\)return/);assert.match(functionSource(owner,'bind'),/clearListeners\(\)/);
 const release=functionSource(owner,'releaseRenderer');for(const name of ['geometry.dispose','material.dispose','renderer?.dispose','renderer?.forceContextLoss'])assert.ok(release.includes(name));
 assert.ok(release.indexOf('panoramaState.renderer=null')<release.indexOf('renderer?.dispose'));
 assert.match(functionSource(owner,'pause'),/releaseRenderer\(true\)/);assert.doesNotMatch(functionSource(owner,'resume'),/setPanoramaEnabled\(true\)/);
 assert.doesNotMatch(owner,/onmousemove\s*=|onmouseup\s*=|onkeydown\s*=/);
});

test('Smart panorama committed export captures facts before encoding; close does not invalidate upload completion',()=>{
 const owner=functionSource(results,'createSmartPanoramaPreview'),exporter=functionSource(owner,'exportPanoramaFrame');
 const awaitAt=exporter.indexOf('await new Promise');assert.ok(exporter.indexOf('canvasId:canvas.id')<awaitAt);assert.ok(exporter.indexOf('width:canvasEl.width')<awaitAt);assert.ok(exporter.indexOf('filename:safeExportFileName')<awaitAt);
 assert.doesNotMatch(exporter.slice(awaitAt),/currentEditImage\(|panoramaState|canvasEl\.(?:width|height)|smartImageEditor|loadToken/);
 assert.match(exporter,/canvas\?\.id!==task\.canvasId \|\| isSmartCanvasLocked\(\)/);assert.match(exporter,/finally \{exportsPending--;\}/);
});
