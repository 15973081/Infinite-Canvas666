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
function setup(nodes = [{id: 'a', x: -2000, y: -2000}, {id: 'b', x: 3000, y: 3000}]) {
    const calls = {measurements: 0, rebuilds: 0};
    const frames = [], elements = new Map();
    let html = '', viewportElement = {style: {}};
    const content = {
        clientWidth: 172, clientHeight: 110,
        get innerHTML() { return html; },
        set innerHTML(value) { html = value; calls.rebuilds++; viewportElement = {style: {}}; },
        getBoundingClientRect() { return {left: 10, top: 20}; },
    };
    const context = vm.createContext({
        canvas: {id: 'canvas-a'}, nodes, selected: new Set(), viewport: {x: 0, y: 0, scale: 1},
        minimapState: null, minimapRenderQueued: false, minimapLayoutDirty: true,
        minimapContent: content, minimapViewport: viewportElement,
        board: {getBoundingClientRect: () => ({width: 800, height: 600})},
        document: {getElementById: () => viewportElement}, CSS: {escape: value => value},
        nodesEl: {querySelector(selector) {
            calls.measurements++;
            return elements.get(selector.match(/data-id="([^"]+)"/)[1]) || null;
        }},
        defaultNodeSize: () => ({w: 260, h: 160}),
        requestAnimationFrame(callback) { frames.push(callback); },
    });
    load(context, ['estimatedNodeRect', 'currentWorldViewRect', 'minimapNodeBounds', 'minimapBounds',
        'scheduleMinimapRender', 'renderMinimap', 'updateMinimapViewport', 'minimapEventToWorld']);
    return {context, content, calls, frames, elements, tick() { frames.splice(0).forEach(callback => callback()); }};
}
function assertCurrentBounds(context, expectedRects) {
    // Reference: the original bounds calculation includes both all nodes and the current view.
    const rects = [...expectedRects, context.currentWorldViewRect()];
    const left = Math.min(...rects.map(r => r.x)), top = Math.min(...rects.map(r => r.y));
    const right = Math.max(...rects.map(r => r.x + r.w)), bottom = Math.max(...rects.map(r => r.y + r.h));
    const pad = Math.max(240, Math.max(right - left, bottom - top) * 0.08);
    assert.deepEqual({...context.minimapState.bounds}, {x: left - pad, y: top - pad,
        w: Math.max(1, right - left + 2 * pad), h: Math.max(1, bottom - top + 2 * pad)});
}

test('full minimap renders measure each node once, including actual DOM dimensions', () => {
    const {context, calls, elements} = setup();
    elements.set('a', {offsetWidth: 480, offsetHeight: 360});
    context.renderMinimap();
    assert.equal(calls.measurements, 2);
    assert.equal(calls.rebuilds, 1);
    assert.equal(context.minimapState.rects[0].w, 480);
    assertCurrentBounds(context, [{x: -2000, y: -2000, w: 480, h: 360}, {x: 3000, y: 3000, w: 260, h: 160}]);
});

test('120 navigation frames within the same bounds do not measure nodes or rebuild markers', () => {
    const nodes = Array.from({length: 200}, (_, i) => ({id: `n${i}`, x: (i % 20) * 500 - 2000, y: Math.floor(i / 20) * 600 - 2000}));
    const {context, calls, tick} = setup(nodes);
    context.renderMinimap();
    const element = context.minimapViewport;
    for (let i = 0; i < 120; i++) {
        context.viewport = {x: -i, y: -i, scale: 1 + i / 200};
        context.scheduleMinimapRender({viewportOnly: true});
        tick();
    }
    assert.equal(calls.measurements, 200); // Initial render only; previously 400 per frame.
    assert.equal(calls.rebuilds, 1);
    assert.equal(context.minimapViewport, element);
    assert.notEqual(element.style.width, '');
});

test('navigating outside cached bounds updates projection without remeasuring nodes', () => {
    const {context, calls} = setup();
    context.renderMinimap();
    context.viewport = {x: 20000, y: -30000, scale: 0.5};
    context.renderMinimap({viewportOnly: true});
    assert.equal(calls.rebuilds, 2);
    assert.equal(calls.measurements, 2);
    assertCurrentBounds(context, context.minimapState.rects);
    const {bounds, scale, ox, oy} = context.minimapState;
    const actual = context.minimapEventToWorld({clientX: 10 + ox + 42 * scale, clientY: 20 + oy + 84 * scale});
    assert.ok(Math.abs(actual.x - (bounds.x + 42)) < 1e-8);
    assert.ok(Math.abs(actual.y - (bounds.y + 84)) < 1e-8);
});

for (const layoutFirst of [true, false]) {
    test(`layout invalidation survives mixed requests (layout first: ${layoutFirst})`, () => {
        const {context, calls, frames, tick, elements, content} = setup();
        context.renderMinimap();
        context.nodes[0].x = -5000;
        elements.set('a', {offsetWidth: 800, offsetHeight: 500});
        context.selected.add('a');
        if (layoutFirst) context.scheduleMinimapRender();
        context.scheduleMinimapRender({viewportOnly: true});
        if (!layoutFirst) context.scheduleMinimapRender();
        assert.equal(frames.length, 1);
        tick();
        assert.equal(calls.measurements, 4);
        assert.equal(context.minimapState.rects[0].x, -5000);
        assert.equal(context.minimapState.rects[0].w, 800);
        assert.match(content.innerHTML, /minimap-node selected/);
        assertCurrentBounds(context, context.minimapState.rects);
    });
}

test('canvas switches, replacement arrays, and node-count changes reject stale layout', () => {
    const {context, calls} = setup();
    context.renderMinimap();
    context.canvas = {id: 'canvas-b'};
    context.nodes = [{id: 'new', x: 50, y: 90}];
    context.renderMinimap({viewportOnly: true});
    assert.equal(context.minimapState.rects[0].id, 'new');
    context.nodes = [{id: 'replacement', x: -50, y: -90}];
    context.renderMinimap({viewportOnly: true});
    assert.equal(context.minimapState.rects[0].id, 'replacement');
    context.nodes.push({id: 'added', x: 600, y: 800});
    context.renderMinimap({viewportOnly: true});
    assert.equal(context.minimapState.rects.length, 2);
    context.nodes.splice(0, 1);
    context.renderMinimap({viewportOnly: true});
    assert.equal(context.minimapState.rects[0].id, 'added');
    assert.equal(calls.rebuilds, 5);
});

test('empty canvases still have finite bounds and a functioning viewport', () => {
    const {context, content} = setup([]);
    context.renderMinimap();
    assertCurrentBounds(context, []);
    assert.match(content.innerHTML, /minimap-empty/);
    context.viewport = {x: -4000, y: 7000, scale: 0.2};
    context.renderMinimap({viewportOnly: true});
    assertCurrentBounds(context, []);
    assert.ok(Number.isFinite(parseFloat(context.minimapViewport.style.left)));
});

test('resizing the minimap updates projection even if node and view bounds are unchanged', () => {
    const {context, content, calls} = setup();
    context.renderMinimap();
    content.clientWidth = 240;
    content.clientHeight = 160;
    context.renderMinimap({viewportOnly: true});
    assert.equal(context.minimapState.cw, 240);
    assert.equal(context.minimapState.ch, 160);
    assert.equal(calls.rebuilds, 2);
    assert.equal(calls.measurements, 2);
});

test('post-layout notifications invalidate the minimap without swallowing geometry correction', () => {
    const {context, calls, tick} = setup();
    context.renderMinimap();
    const passes = [];
    context.scheduleGeometryRefresh = count => passes.push(count);
    load(context, ['refreshGeometryAfterLayout']);
    context.refreshGeometryAfterLayout();
    tick();
    assert.deepEqual(passes, [2]);
    assert.equal(calls.measurements, 4);
});

test('offscreen placeholders that remain offscreen do not cause spurious layout invalidation', () => {
    const {context, frames} = setup();
    context.nodesEl.querySelectorAll = () => [{dataset: {id: 'a'}}];
    context.isNodeInCanvasViewport = () => false;
    context.refreshIcons = () => assert.fail('no DOM change requires no icon pass');
    context.refreshGeometry = () => assert.fail('no DOM change requires no geometry pass');
    context.refreshGeometryAfterLayout = () => assert.fail('no DOM change requires no layout pass');
    load(context, ['renderOffscreenPlaceholders']);
    context.renderOffscreenPlaceholders();
    assert.equal(frames.length, 0);
});

test('leaving the canvas releases cached node-array references', () => {
    const {context} = setup();
    context.renderMinimap();
    context.shell = {classList: {toggle() {}}};
    context.clearLocalCanvasLock = () => {};
    context.clearConnectionHover = () => {};
    context.linksEl = {};
    context.linkControlsEl = {};
    context.selectionHub = {classList: {remove() {}}};
    context.refreshIcons = () => {};
    load(context, ['setCanvasMode']);
    context.setCanvasMode(false);
    assert.equal(context.minimapState, null);
    assert.equal(context.minimapLayoutDirty, true);
});
