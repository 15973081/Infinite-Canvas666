const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/js/asset-manager.js'), 'utf8').replace(/\r\n/g, '\n');
function load(context, names) {
    for (const name of names) {
        const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
        assert.ok(start >= 0, name);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
    }
}

test('upload entry points reset file types after workflow -> local -> asset transitions', async () => {
    const opened = [];
    const context = vm.createContext({suppressClickAfterMarquee:false,
        uploadInput:{accept:'', click() { opened.push(this.accept); }}});
    load(context, ['openManagerUpload', 'handleClick']);
    for(const selector of ['[data-workflow-upload]', '[data-localup-upload]', '[data-asset-upload]']) {
        await context.handleClick({target:{closest: value => value === selector ? {} : null}});
    }
    assert.match(opened[0], /json/);
    assert.equal(opened[1], 'image/*,video/*,audio/*');
    assert.equal(opened[2], opened[1]);
});

test('canvas selection updates summary/actions in both directions without replacing detail', () => {
    const summary = {textContent:''}, clear = {disabled:true}, download = {disabled:true};
    const checkbox = {dataset:{canvasAssetCheck:'a'}, checked:false};
    const controls = new Map([[':scope > span', summary], ['[data-canvas-asset-clear-selection]', clear], ['[data-canvas-asset-download-selected]', download]]);
    const context = vm.createContext({selectedCanvasAssetId:'a', selectedCanvasAssetIds:new Set(['a']),
        document:{querySelectorAll: selector => selector.includes('check') ? [checkbox] : []},
        root:{querySelector: selector => { assert.equal(selector, '.asset-content .manage-tools'); return {querySelector: value => controls.get(value)}; }}});
    load(context, ['refreshCanvasAssetSelectionOnly']);
    context.refreshCanvasAssetSelectionOnly({detail:false});
    assert.equal(checkbox.checked, true);
    assert.match(summary.textContent, /1 个/);
    assert.equal(download.disabled, false);
    context.selectedCanvasAssetIds.clear();
    context.refreshCanvasAssetSelectionOnly({detail:false});
    assert.equal(checkbox.checked, false);
    assert.match(summary.textContent, /0 个/);
    assert.equal(clear.disabled, true);
    assert.equal(download.disabled, true);
});

test('virtual geometry follows width even when column count does not change', () => {
    const context = vm.createContext({getComputedStyle:()=>({gridTemplateColumns:'152px 152px 152px 152px 152px',rowGap:'10px',columnGap:'10px'})});
    load(context, ['assetVirtualMetrics', 'assetAnchorScrollTop']);
    const grid = {clientWidth:800,getBoundingClientRect:()=>({top:112})};
    const scroll = {kind:'element',viewportTop:100,top:0};
    const before = context.assetVirtualMetrics(grid,scroll);
    grid.clientWidth = 820;
    const after = context.assetVirtualMetrics(grid,scroll);
    assert.equal(after.columns,5);
    assert.equal(after.rowStride-before.rowStride,4);
    assert.equal(after.cardHeight,204);
    const items = Array.from({length:1000},(_,i)=>({id:String(i)}));
    const snapshot = {anchorId:'334',anchorOffset:-20,top:14000};
    assert.equal(context.assetAnchorScrollTop(snapshot,items,after),12+67*214+20);
    items.unshift(...Array.from({length:50},(_,i)=>({id:`new-${i}`})));
    assert.equal(context.assetAnchorScrollTop(snapshot,items,after),12+77*214+20);
    assert.equal(context.assetAnchorScrollTop({...snapshot,anchorId:'removed'},items,after),14000);
});
