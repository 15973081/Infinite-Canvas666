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
