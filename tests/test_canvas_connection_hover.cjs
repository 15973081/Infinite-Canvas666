const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/js/canvas.js'), 'utf8').replace(/\r\n/g, '\n');
function load(context, names) {
    for (const name of names) {
        const start = source.indexOf(`function ${name}(`);
        assert.ok(start >= 0, name);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
    }
}
function setup() {
    const frames = new Map(), points = new Map(), calls = {ports: 0, segments: 0};
    let id = 0, hovered = '', hit = null;
    const context = vm.createContext({
        canvas: {id: 'qa'}, connections: [], nodes: [], viewport: {scale: 1},
        tempLink: null, dragNode: null, dragBoard: null, resizeNode: null, knifeActive: false,
        connectionHoverFrame: null, pendingConnectionHover: null,
        requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
        cancelAnimationFrame(key) { frames.delete(key); },
        document: {elementFromPoint: () => hit},
        setHoveredConnection: value => { hovered = value; },
        screenToWorld: (x, y) => ({x, y}),
        portPoint(nodeId, kind) { calls.ports++; return points.get(`${nodeId}:${kind}`); },
    });
    load(context, ['cubicPoint', 'pointSegmentDistance', 'connectionDistanceToPoint',
        'clearConnectionHover', 'scheduleConnectionHover', 'updateConnectionHoverFromMouse']);
    const distance = context.pointSegmentDistance;
    context.pointSegmentDistance = (...args) => { calls.segments++; return distance(...args); };
    return {context, calls, frames, points, hovered: () => hovered, hit: value => { hit = value; },
        tick() { const current = [...frames]; frames.clear(); current.forEach(([, callback]) => callback()); }};
}
function referenceDistance(context, from, to, point) {
    let distance = Infinity, previous = context.cubicPoint(from, to, 0);
    for (let i = 1; i <= 28; i++) {
        const next = context.cubicPoint(from, to, i / 28);
        distance = Math.min(distance, context.pointSegmentDistance(point, previous, next));
        previous = next;
    }
    return distance;
}
function addLink(env, id, from, to, fromId = `${id}-from`, toId = `${id}-to`) {
    env.context.connections.push({id, from: fromId, to: toId});
    env.points.set(`${fromId}:out`, from);
    env.points.set(`${toId}:in`, to);
    env.context.nodes = [...new Set(env.context.connections.flatMap(c => [c.from, c.to]))].map(id => ({id}));
}

test('120 mouse moves before a frame inspect only the latest position', () => {
    const env = setup();
    addLink(env, 'line', {x: 0, y: 0}, {x: 1000, y: 0});
    for (let i = 0; i < 119; i++) env.context.scheduleConnectionHover({clientX: 500, clientY: 1000});
    env.context.scheduleConnectionHover({clientX: 500, clientY: 0});
    assert.equal(env.frames.size, 1);
    assert.equal(env.calls.ports, 0);
    env.tick();
    assert.equal(env.hovered(), 'line');
    assert.equal(env.calls.ports, 2);
    assert.equal(env.calls.segments, 28);
});

test('shared endpoints are measured once per pass and never retained across passes', () => {
    const env = setup();
    for (let i = 0; i < 100; i++) addLink(env, `c${i}`, {x: 0, y: 0}, {x: 1000, y: i * 100}, 'shared');
    env.context.updateConnectionHoverFromMouse({clientX: 500, clientY: 0});
    assert.equal(env.calls.ports, 101);
    assert.equal(env.hovered(), 'c0');
    env.points.set('shared:out', {x: 0, y: -1000});
    env.context.updateConnectionHoverFromMouse({clientX: 500, clientY: -500});
    assert.equal(env.calls.ports, 202);
    assert.equal(env.hovered(), 'c0');
});

test('distant curves skip all segment-distance calculations', () => {
    const env = setup();
    for (let i = 0; i < 100; i++) addLink(env, `far${i}`, {x: i * 500, y: 3000}, {x: i * 500 + 300, y: 3200});
    env.context.updateConnectionHoverFromMouse({clientX: 200, clientY: 100});
    assert.equal(env.hovered(), '');
    assert.equal(env.calls.segments, 0);
});

test('short, reversed, vertical and degenerate curves preserve hits outside endpoint bounds', () => {
    const {context} = setup();
    for (const [from, to] of [
        [{x: 0, y: 0}, {x: 0, y: 100}],
        [{x: 0, y: 0}, {x: 10, y: 100}],
        [{x: 400, y: 50}, {x: -100, y: 80}],
        [{x: 10, y: 10}, {x: 10, y: 10}],
    ]) {
        for (let i = 0; i <= 28; i++) {
            const point = context.cubicPoint(from, to, i / 28);
            const expected = referenceDistance(context, from, to, point);
            assert.equal(context.connectionDistanceToPoint({}, point, from, to, 12), expected);
        }
    }
});

test('optimized nearest-link selection matches the original sampler over 1000 seeded cases', () => {
    let seed = 42;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const env = setup();
    for (let i = 0; i < 30; i++) addLink(env, `c${i}`,
        {x: random() * 2000 - 1000, y: random() * 1600 - 800},
        {x: random() * 2000 - 1000, y: random() * 1600 - 800});
    for (let i = 0; i < 1000; i++) {
        const point = {x: random() * 2400 - 1200, y: random() * 2000 - 1000};
        env.context.viewport.scale = [0.12, 0.5, 1, 2, 8][i % 5];
        const threshold = Math.max(12, 16 / env.context.viewport.scale);
        let best = Infinity, expected = '';
        for (const c of env.context.connections) {
            const distance = referenceDistance(env.context, env.points.get(`${c.from}:out`), env.points.get(`${c.to}:in`), point);
            if (distance < best) { best = distance; expected = c.id; }
        }
        env.context.updateConnectionHoverFromMouse({clientX: point.x, clientY: point.y});
        assert.equal(env.hovered(), best <= threshold ? expected : '', `case ${i}`);
    }
});

test('ties still choose the first connection, and the scaled hit threshold is unchanged', () => {
    const env = setup();
    addLink(env, 'first', {x: 0, y: 0}, {x: 1000, y: 0});
    addLink(env, 'second', {x: 0, y: 0}, {x: 1000, y: 0});
    for (const [scale, y, expected] of [[1, 16, 'first'], [1, 16.01, ''], [0.5, 32, 'first'], [8, 12, 'first']]) {
        env.context.viewport.scale = scale;
        env.context.updateConnectionHoverFromMouse({clientX: 500, clientY: y});
        assert.equal(env.hovered(), expected);
    }
});

test('a visible delete button remains hoverable without any curve calculation', () => {
    const env = setup();
    env.hit({closest: () => ({dataset: {connectionId: 'button'}})});
    env.context.scheduleConnectionHover({clientX: 100, clientY: 100});
    env.tick();
    assert.equal(env.hovered(), 'button');
    assert.equal(env.calls.ports, 0);
});

test('mouseleave cancels pending work so an old event cannot restore a hover', () => {
    const env = setup();
    addLink(env, 'line', {x: 0, y: 0}, {x: 1000, y: 0});
    env.context.scheduleConnectionHover({clientX: 500, clientY: 0});
    env.context.clearConnectionHover();
    env.tick();
    assert.equal(env.hovered(), '');
    assert.equal(env.calls.ports, 0);
    assert.equal(env.frames.size, 0);
    assert.equal(env.context.pendingConnectionHover, null);
});

test('starting an interaction or switching canvases before the frame prevents stale hover work', () => {
    for (const field of ['tempLink', 'dragNode', 'dragBoard', 'resizeNode', 'knifeActive', 'canvas']) {
        const env = setup();
        env.context.scheduleConnectionHover({clientX: 500, clientY: 0});
        env.context[field] = field === 'canvas' ? {id: 'different'} : true;
        env.tick();
        assert.equal(env.calls.ports, 0, field);
        assert.equal(env.hovered(), '', field);
    }
});

test('connection edits between scheduling and drawing use the current graph', () => {
    const env = setup();
    addLink(env, 'deleted', {x: 0, y: 0}, {x: 1000, y: 0});
    env.context.scheduleConnectionHover({clientX: 500, clientY: 0});
    env.context.connections = [];
    env.tick();
    assert.equal(env.hovered(), '');
});

test('canvases without connections do not scan their nodes', () => {
    const env = setup();
    env.context.nodes = {map() { assert.fail('no node index is needed without connections'); }};
    env.context.updateConnectionHoverFromMouse({clientX: 100, clientY: 100});
    assert.equal(env.calls.ports, 0);
    assert.equal(env.hovered(), '');
});
