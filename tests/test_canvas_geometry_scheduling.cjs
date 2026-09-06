const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../static/js/canvas.js'), 'utf8').replace(/\r\n/g, '\n');
function load(context, names) {
    for (const name of names) {
        const start = source.indexOf(`function ${name}(`);
        assert.ok(start >= 0, `${name} exists`);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
    }
}
function setup() {
    let frameId = 0;
    const frames = new Map(), classes = new Set(), elements = new Map();
    const calls = {links: 0, selection: 0, save: 0, render: 0};
    const context = vm.createContext({
        geometryRefreshFrame: null, geometryRefreshPasses: 0,
        geometryRefreshAll: false, geometryRefreshNodes: new Set(),
        canvas: {}, viewport: {scale: 2},
        knifeActive: false, knifePoint: null, knifeTrail: [], knifeChanged: false, knifeNeedsRender: false,
        dragNode: null, resizeNode: null, dragBoard: null, minimapDrag: null, llmPaneDrag: null,
        tempLink: null, textSelectionGuard: null, workflowTransferModal: null,
        document: {body: {classList: {
            contains: value => classes.has(value),
            toggle(value, active) { if (active) classes.add(value); else classes.delete(value); },
            remove(...values) { values.forEach(value => classes.delete(value)); },
        }}},
        nodesEl: {querySelector(selector) {
            const id = selector.match(/data-id="([^"]+)"/)[1];
            if (!elements.has(id)) elements.set(id, {style: {}, classList: {add() {}}});
            return elements.get(id);
        }},
        requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame(id) { frames.delete(id); },
        renderLinks() { calls.links++; }, renderSelectionHub() { calls.selection++; },
        scheduleMinimapRender() {}, scheduleViewportRefresh() {}, updateWorkflowTransferMeta() {}, updateGroupMembership() {},
        endWindowPointerSession() {}, scheduleSave() { calls.save++; }, scheduleViewportSave() {},
        render() { calls.render++; }, defaultNodeSize() { return {w: 260, h: 160}; },
    });
    load(context, ['refreshGeometry', 'scheduleGeometryRefresh', 'flushScheduledGeometryRefresh',
        'refreshGeometryAfterLayout', 'setKnifeMode', 'onNodeDrag', 'onNodeResize', 'endDrag']);
    return {context, calls, frames, elements, classes, tick() {
        const current = [...frames];
        current.forEach(([id]) => frames.delete(id));
        current.forEach(([, callback]) => callback());
    }};
}

test('partial scopes merge and a full correction cannot be downgraded by later drags', () => {
    const {context, tick} = setup(), scopes=[];
    context.renderLinks = ids => scopes.push(ids === null ? null : [...ids]);
    context.scheduleGeometryRefresh(1, ['a']);
    context.scheduleGeometryRefresh(1, ['b']);
    tick(); assert.deepEqual(scopes.pop(), ['a','b']);
    context.scheduleGeometryRefresh(1, ['a']);
    context.refreshGeometryAfterLayout();
    context.scheduleGeometryRefresh(1, ['b']);
    tick(); tick(); assert.deepEqual(scopes, [null,null]);
    context.scheduleGeometryRefresh(1, ['c']);
    context.flushScheduledGeometryRefresh();
    assert.deepEqual(scopes.pop(), ['c']);
});

test('120 inactive knife exits do not rebuild links; a real exit still cleans up once', () => {
    const {context, calls, classes} = setup();
    for (let i = 0; i < 120; i++) context.setKnifeMode(false);
    assert.equal(calls.links, 0);
    context.setKnifeMode(true);
    context.knifeActive = true;
    context.knifeTrail = [{x: 1, y: 2}, {x: 3, y: 4}];
    context.setKnifeMode(false);
    assert.equal(calls.links, 1);
    assert.equal(context.knifeActive, false);
    assert.equal(context.knifeTrail.length, 0);
    assert.equal(classes.has('canvas-knife'), false);
    context.setKnifeMode(false);
    assert.equal(calls.links, 1);
});

test('30 simultaneous layout notifications retain two correction frames, not 60 draws', () => {
    const {context, calls, frames, tick} = setup();
    for (let i = 0; i < 30; i++) context.refreshGeometryAfterLayout();
    assert.equal(frames.size, 1);
    tick();
    assert.equal(calls.links, 1);
    assert.equal(frames.size, 1);
    tick();
    assert.equal(calls.links, 2);
    assert.equal(calls.selection, 2);
    assert.equal(frames.size, 0);
});

test('a new layout notification between correction frames gets its own final correction', () => {
    const {context, calls, frames, tick} = setup();
    context.refreshGeometryAfterLayout();
    tick();
    context.refreshGeometryAfterLayout();
    tick();
    assert.equal(frames.size, 1);
    tick();
    assert.equal(calls.links, 3);
    assert.equal(frames.size, 0);
});

test('multi-node drag keeps exact scaled positions while coalescing shared drawing', () => {
    const {context, calls, elements, frames, tick} = setup();
    const node = {id: 'a', x: 10, y: 20}, child = {id: 'b', x: 110, y: 220};
    context.dragNode = {node, ox: 10, oy: 20, sx: 0, sy: 0,
        children: [{node: child, ox: 110, oy: 220}]};
    for (let i = 1; i <= 120; i++) context.onNodeDrag({clientX: i, clientY: i * 2});
    assert.deepEqual([node.x, node.y, child.x, child.y], [70, 140, 170, 340]);
    assert.equal(elements.get('a').style.left, '70px');
    assert.equal(elements.get('b').style.top, '340px');
    assert.equal(calls.links, 0);
    assert.equal(frames.size, 1);
    tick();
    assert.equal(calls.links, 1);
    context.onNodeDrag({clientX: 140, clientY: 280});
    context.endDrag({shiftKey: false});
    assert.deepEqual([node.x, node.y], [80, 160]);
    assert.equal(calls.links, 2);
    assert.equal(calls.save, 1);
    assert.equal(frames.size, 0);
    assert.equal(context.dragNode, null);
    tick();
    assert.equal(calls.links, 2);
});

test('resize clamps dimensions and flushes the final geometry before the next frame', () => {
    const {context, calls, elements, frames} = setup();
    const node = {id: 'resize'};
    context.resizeNode = {node, sx: 0, sy: 0, sw: 300, sh: 200};
    context.onNodeResize({clientX: -1000, clientY: -1000});
    assert.deepEqual([node.w, node.h], [220, 96]);
    context.onNodeResize({clientX: 100, clientY: 80});
    assert.deepEqual([node.w, node.h], [350, 240]);
    assert.equal(elements.get('resize').style.width, '350px');
    context.endDrag({shiftKey: false});
    assert.equal(calls.links, 1);
    assert.equal(calls.save, 1);
    assert.equal(frames.size, 0);
});

test('ending an unchanged knife stroke while holding Shift removes its trail', () => {
    const {context, calls, classes} = setup();
    context.setKnifeMode(true);
    context.knifeActive = true;
    context.knifeTrail = [{x: 0, y: 0}, {x: 10, y: 10}];
    context.endDrag({shiftKey: true});
    assert.equal(context.knifeTrail.length, 0);
    assert.equal(calls.links, 1);
    assert.equal(classes.has('canvas-knife'), true);
    context.setKnifeMode(false);
    assert.equal(classes.has('canvas-knife'), false);
});

test('finishing a cut preserves full node refresh and saving', () => {
    const {context, calls} = setup();
    context.setKnifeMode(true);
    context.knifeChanged = true;
    context.knifeNeedsRender = true;
    context.endDrag({shiftKey: false});
    assert.equal(calls.render, 1);
    assert.equal(calls.save, 1);
});

test('flushing pending drag drawing does not discard a layout correction', () => {
    const {context, calls, frames, tick} = setup();
    context.refreshGeometryAfterLayout();
    context.flushScheduledGeometryRefresh();
    assert.equal(calls.links, 1);
    assert.equal(frames.size, 1);
    tick();
    assert.equal(calls.links, 2);
    assert.equal(frames.size, 0);
});

test('wheel bursts preserve the world point under the cursor while drawing once per frame', () => {
    const {context, calls, frames, tick} = setup();
    context.viewport = {x: 10, y: 20, scale: 1};
    context.board = {getBoundingClientRect: () => ({left: 0, top: 0})};
    context.screenToWorld = (x, y) => ({
        x: (x - context.viewport.x) / context.viewport.scale,
        y: (y - context.viewport.y) / context.viewport.scale,
    });
    context.applyViewport = () => {};
    const start = source.indexOf('board.onwheel = e => {');
    vm.runInContext(source.slice(start, source.indexOf('\n};', start) + 3), context);
    const before = context.screenToWorld(400, 300);
    for (let i = 0; i < 8; i++) context.board.onwheel({
        clientX: 400, clientY: 300, deltaY: i % 2 ? 1 : -1, preventDefault() {},
    });
    const after = context.screenToWorld(400, 300);
    assert.ok(Math.abs(before.x - after.x) < 1e-9);
    assert.ok(Math.abs(before.y - after.y) < 1e-9);
    assert.equal(calls.links, 0);
    assert.equal(frames.size, 1);
    tick();
    assert.equal(calls.links, 1);
});

test('the real ordinary-mousemove handler does not redraw when the knife is inactive', () => {
    const {context, calls} = setup();
    let move;
    context.board = {addEventListener(event, handler) { if (event === 'mousemove') move = handler; }};
    context.screenToWorld = (x, y) => ({x, y});
    context.scheduleConnectionHover = () => {};
    context.isEditableTarget = () => false;
    const start = source.indexOf("board.addEventListener('mousemove', e => {");
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), context);
    for (let i = 0; i < 120; i++) move({clientX: i, clientY: 10, target: {}, shiftKey: false});
    assert.equal(calls.links, 0);
});
