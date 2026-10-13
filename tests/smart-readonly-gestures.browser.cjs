const test = require('node:test'), assert = require('node:assert/strict');
const {fixture} = require('./helpers/canvas-browser.cjs');

async function setup(t) {
    const f = await fixture(t, 'smart', true);
    await f.page.waitForLoadState('networkidle');
    // The lease fixture replaces MemberCanvasEdit, which normally loads this CSS.
    await f.page.addStyleTag({url:'/static/css/member-canvas-edit.css'});
    await f.page.evaluate(() => {
        const image = name => ({url:'/test-image.svg', name, kind:'image', natural_w:320, natural_h:240});
        nodes = [
            {id:'a', type:'smart-image', x:160, y:170, scale:1, images:[image('one')]},
            {id:'g', type:'smart-image', x:590, y:170, scale:1, images:[image('two'), image('three')]}
        ];
        canvas.nodes = nodes; canvas.connections = [];
        viewport.x = 0; viewport.y = 0; viewport.scale = 1;
        smartSelection.boxSelection(['a','g']);
        render(); clearTimeout(saveTimer); saveTimer = null;
        undoStack.length = 0; pendingUndoSnapshot = null; smartCanvasDirty = false;
        const changed = MemberCanvasEdit.options.changed;
        MemberCanvasEdit.options.changed = lease => {
            document.body.classList.toggle('member-canvas-view', !lease.canEdit);
            changed(lease);
        };
    });
    return f;
}

const documentState = p => p.evaluate(() => ({nodes:JSON.parse(JSON.stringify(nodes)),
    connections:JSON.parse(JSON.stringify(canvas.connections)), undo:undoStack.length,
    pending:Boolean(pendingUndoSnapshot), dirty:smartCanvasDirty}));
async function point(p, selector) {
    const box = await p.locator(selector).first().boundingBox();
    assert.ok(box, selector);
    return {x:box.x + box.width / 2, y:box.y + box.height / 2};
}
async function drag(p, start, end, beforeRelease) {
    await p.mouse.move(start.x, start.y); await p.mouse.down();
    await p.mouse.move(end.x, end.y, {steps:6});
    if(beforeRelease) await beforeRelease();
    await p.mouse.up();
}

for(const port of ['in', 'out']) test('Viewing cannot drag '+port+' port into a new node or connection', async t => {
    const {page:p, errors, writes} = await setup(t);
    await p.evaluate(() => MemberCanvasEdit.setEditable(false));
    const before = await documentState(p), start = await point(p, '.image-node[data-id="a"] .node-port[data-port="'+port+'"]');
    await drag(p, start, {x:480, y:570});
    const target = await point(p, '.image-node[data-id="g"] .node-port[data-port="'+(port==='out'?'in':'out')+'"]');
    await drag(p, start, target);
    assert.deepEqual(await documentState(p), before);
    assert.equal(writes.filter(w => w.path==='/api/canvases/canvas-test' && w.method==='PUT').length, 0);
    assert.deepEqual(errors, []);
});

test('Viewing blocks group extraction, Alt duplication, node movement and resizing', async t => {
    const {page:p, errors} = await setup(t);
    await p.evaluate(() => MemberCanvasEdit.setEditable(false));
    const before = await documentState(p);
    for(const selector of ['.image-node[data-id="g"] .thumb-item', '.image-node[data-id="a"] .node-body', '.image-node[data-id="a"] .node-resize-handle']) {
        await drag(p, await point(p, selector), {x:470, y:540});
    }
    await p.keyboard.down('Alt');
    await drag(p, await point(p, '.image-node[data-id="a"] .node-body'), {x:450, y:580});
    await p.keyboard.up('Alt');
    // Even dispatched events must obey permissions; CSS alone cannot be the guard.
    await p.evaluate(() => {
        for(const selector of ['.node-port', '.thumb-item', '.node-resize-handle', '.node-body']) {
            const el = world.querySelector(selector);
            el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, button:0, clientX:200, clientY:200, altKey:true}));
            window.dispatchEvent(new MouseEvent('mousemove', {clientX:400, clientY:540}));
            window.dispatchEvent(new MouseEvent('mouseup', {clientX:400, clientY:540}));
        }
    });
    assert.deepEqual(await documentState(p), before); assert.deepEqual(errors, []);
});

test('Ending edit during a port drag cancels it, even if editing resumes before release', async t => {
    const {page:p, errors} = await setup(t);
    const before = await documentState(p);
    await drag(p, await point(p, '.image-node[data-id="a"] .node-port[data-port="out"]'), {x:460,y:540}, async () => {
        assert.equal(await p.evaluate(() => Boolean(portDragState)), true);
        await p.evaluate(() => {MemberCanvasEdit.setEditable(false); MemberCanvasEdit.setEditable(true);});
    });
    assert.deepEqual(await documentState(p), before);
    assert.equal(await p.locator('.port-drag-temp').count(), 0); assert.deepEqual(errors, []);
});

test('Ending edit cancels unfinished node movement and size changes', async t => {
    const {page:p, errors} = await setup(t);
    const before = await documentState(p);
    for(const selector of ['.image-node[data-id="a"] .node-body', '.image-node[data-id="a"] .node-resize-handle']) {
        await p.evaluate(() => MemberCanvasEdit.setEditable(true));
        await p.locator('.image-node[data-id="a"]').hover();
        const start = await point(p, selector);
        await drag(p, start, {x:start.x+60,y:start.y+60}, async () => {
            assert.equal(await p.evaluate(() => Boolean(dragState || resizeState)), true);
            await p.evaluate(() => MemberCanvasEdit.setEditable(false));
        });
        assert.deepEqual(await documentState(p), before);
        assert.equal(await p.evaluate(() => Boolean(dragState || resizeState || pendingUndoSnapshot)), false);
    }
    assert.deepEqual(errors, []);
});

test('Editing creates a connected typed media node after choosing the output kind', async t => {
    const {page:p, errors} = await setup(t);
    await drag(p, await point(p, '.image-node[data-id="a"] .node-port[data-port="out"]'), {x:470,y:580});
    await p.getByRole('menuitem',{name:'视频节点',exact:true}).click();
    const state = await documentState(p);
    assert.equal(state.nodes.length, 3); assert.equal(state.connections.length, 1);
    assert.equal(state.nodes[2].generationKind,'video');
    assert.equal(state.connections[0].from, 'a'); assert.equal(state.connections[0].to, state.nodes[2].id);
    assert.equal(state.undo, 1); assert.equal(state.dirty, true); assert.deepEqual(errors, []);
});

test('Viewing retains canvas pan, zoom and media preview', async t => {
    const {page:p, errors} = await setup(t);
    await p.evaluate(() => {
        CanvasSession.context.workspace.permissions = ['canvas.read','asset.read'];
        window.MemberMediaUrl = url => new URL(url, location.href).href;
        MemberCanvasEdit.active.options = MemberCanvasEdit.options;
        window.gesturePreview = MemberMediaPreview.create({entry:MemberCanvasEdit.active, valid:()=>true});
    });
    await p.evaluate(() => MemberCanvasEdit.setEditable(false));
    await p.evaluate(() => gesturePreview.sync());
    const before = await documentState(p), viewportBefore = await p.evaluate(() => ({...viewport}));
    await drag(p, {x:430,y:700}, {x:485,y:730});
    assert.notEqual(await p.evaluate(() => viewport.x), viewportBefore.x);
    await p.keyboard.down('Control');await p.mouse.wheel(0, -80);await p.keyboard.up('Control');
    await p.waitForFunction(scale => viewport.scale !== scale, viewportBefore.scale);
    await p.locator('.image-node[data-id="a"] .image-wrap img').click();
    await p.waitForFunction(() => document.querySelector('.member-media-preview')?.open);
    await p.keyboard.press('Escape');
    assert.deepEqual(await documentState(p), before); assert.deepEqual(errors, []);
});
