const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/js/canvas-api.js'), 'utf8');

function setup(session) {
    const calls = [];
    const window = {CanvasSession: session};
    vm.runInNewContext(source, {window, fetch: async url => {
        calls.push(url);
        return {ok: true, json: async () => ({items: [{id: url}]})};
    }});
    return {api: window.CanvasApi, calls};
}

test('member canvases load workspace assets without querying the disabled legacy catalog', async () => {
    const {api, calls} = setup({enabled: true});
    const [shared, local] = await api.getAssetLibraries();
    assert.deepEqual(calls, ['/api/asset-library']);
    assert.equal(shared.items[0].id, '/api/asset-library');
    assert.equal(local.items.length, 0);
    assert.equal(local.tree, null);
    const fallback = {items: [], tree: null};
    assert.equal(await api.getLocalAssets(fallback), fallback);
});

test('legacy mode still loads its local catalog', async () => {
    for (const session of [undefined, {enabled: false}]) {
        const {api, calls} = setup(session);
        const [, local] = await api.getAssetLibraries();
        assert.deepEqual(calls, ['/api/asset-library', '/api/local-assets']);
        assert.equal(local.items[0].id, '/api/local-assets');
    }
});

test('workspace asset requests still pass through the existing edit and session transport', async () => {
    const calls = [];
    const window = {CanvasSession: {enabled: true}, MemberCanvasEdit: {
        send: async url => { calls.push(url); return {ok: true, json: async () => ({items: []})}; }
    }};
    vm.runInNewContext(source, {window, fetch: () => { throw new Error('transport bypass'); }});
    await window.CanvasApi.getAssetLibraries();
    assert.deepEqual(calls, ['/api/asset-library']);
});
