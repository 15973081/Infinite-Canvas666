const {installWorkspaceView}=require('./helpers/workspace-view.cjs');
const {functionSource}=require('./helpers/canvas-source.cjs');
const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = readCanvasSource(path.join(__dirname, '../static/js/canvas.js'), 'utf8').replace(/\r\n/g, '\n');
function load(context, names) {
    installWorkspaceView(context,'classic');
    for (const name of names) {
        const start = source.indexOf(`function ${name}(`);
        assert.ok(start >= 0, name);
        vm.runInContext(functionSource(source,name), context);
    }
}
class Element {
    constructor() { this.children = []; this.parts = new Map(); this.dataset = {}; this.writes = 0;
        this.classList = {add() {}, remove() {}, contains: () => false}; }
    set innerHTML(value) { this.html = value; this.children = []; this.parts.clear(); this.writes++; }
    get innerHTML() { return this.html || ''; }
    appendChild(child) { this.children.push(child); }
    contains(child) { return this.children.includes(child) || this.children.some(item => item.contains(child)) || [...this.parts.values()].some(item => item.contains(child)); }
    closest() { return this; }
    setAttribute(key, value) { this[key] = value; }
    querySelector(selector) {
        if (!this.parts.has(selector)) this.parts.set(selector, new Element());
        return this.parts.get(selector);
    }
}
function setup() {
    const missing = new Set(), opened = [], reordered = [], events = new Map();
    const context = vm.createContext({
        window: {addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name)},
        isCanvasLockedByOther: () => false,
        document: {createElement: () => new Element()},
        escapeHtml: String, escapeAttr: String, tr: key => key,
        isMissingAssetUrl: url => missing.has(url),
        mediaKindForRef: ref => ref?.kind || 'image',
        nodeTitleForMedia: node => node.mediaKind,
        manualVideoUrlForNode: node => node.manualVideoUrls?.[0] || '',
        canvasVideoPreviewHtml: url => `<img video="${url}">`,
        canvasPreviewImgHtml: url => `<img src="${url}">`,
        missingAssetHtml: url => `<span missing="${url}"></span>`,
        refreshIcons() {}, internalDrag: false, setStatus() {},
        copyTextToClipboard: async () => true,
        openOutputLightbox: (...args) => opened.push(args),
        reorderInput: (...args) => reordered.push(args),
    });
    load(context, ['bindCanvasInputReorder', 'isCanvasInputViewCurrent', 'rememberCanvasInputView', 'renderPromptPreview',
        'renderImageInputList', 'renderVideoImageInputs', 'videoInputMediaGroups', 'renderComfyImages']);
    const node = {id: 'gen', type: 'video'};
    const sources = [
        {id: 'image', label: '人物', preview: '/a.png', refs: [{url: '/a.png', kind: 'image', name: '人物'}]},
        {id: 'audio', label: '声音', preview: '/a.mp3', refs: [{url: '/a.mp3', kind: 'audio', name: '声音'}]},
        {id: 'video', label: '动作', preview: '/a.mp4', refs: [{url: '/a.mp4', kind: 'video', name: '动作'}]},
    ];
    return {context, node, sources, missing, opened, reordered, events};
}
function entries(list) {
    return list.children.filter(child => child.dataset.mediaKind)
        .flatMap(section => section.querySelector('.media-input-items').children);
}
for (const renderer of ['renderImageInputList', 'renderComfyImages', 'renderVideoImageInputs']) {
    test(`${renderer}: equivalent sources preserve list DOM through 100 text updates`, () => {
        const {context, node, sources} = setup(), list = new Element();
        context[renderer](list, node, sources);
        const first = list.children[0], writes = list.writes;
        list.scrollTop = 120;
        for (let i = 0; i < 100; i++) context[renderer](list, node, sources.map(src => ({...src, prompt: `文字${i}`})));
        assert.equal(list.children[0], first);
        assert.equal(list.writes, writes);
        assert.equal(list.scrollTop, 120);
        sources[0].preview = sources[0].refs[0].url = '/changed.png';
        context[renderer](list, node, sources);
        assert.notEqual(list.children[0], first);
    });
}

test('prompt preview only writes when its visible text or source count changes', () => {
    const {context} = setup(), list = new Element();
    context.renderPromptPreview(list, [{label: '原提示词'}]);
    for (let i = 0; i < 50; i++) context.renderPromptPreview(list, [{label: '原提示词', prompt: `完整内容${i}`}]);
    assert.equal(list.writes, 1);
    context.renderPromptPreview(list, [{label: '修改提示词'}]);
    assert.equal(list.writes, 2);
    context.renderPromptPreview(list, []);
    assert.equal(list.innerHTML, '');
});

test('mixed video references renumber on reorder/removal and preserve preview callbacks', () => {
    const {context, node, sources, opened} = setup(), list = new Element();
    sources.push({id: 'audio2', label: '配乐', refs: [{url: '/b.mp3', kind: 'audio'}]});
    context.renderVideoImageInputs(list, node, sources);
    const original = entries(list).find(item => item.dataset.sourceId === 'audio');
    context.renderVideoImageInputs(list, node, sources.map(src => ({...src})));
    assert.equal(entries(list).find(item => item.dataset.sourceId === 'audio'), original);
    original.querySelector('.media-reference-preview').onclick({stopPropagation() {}});
    assert.equal(opened.at(-1)[0], '/a.mp3');
    context.renderVideoImageInputs(list, node, [sources[0], sources[3], sources[2], sources[1]]);
    assert.deepEqual(entries(list).map(item => item.dataset.referenceLabel), ['图片1', '音频1', '音频2', '视频1']);
    assert.equal(entries(list)[1].dataset.sourceId, 'audio2');
    context.renderVideoImageInputs(list, node, sources.slice(0, 3));
    assert.deepEqual(entries(list).map(item => item.dataset.referenceLabel), ['图片1', '音频1', '视频1']);
});

test('manual video override, names, frame roles, kind and missing-file status invalidate video views', () => {
    const {context, node, sources, missing} = setup(), list = new Element();
    context.renderVideoImageInputs(list, node, sources);
    for (const change of [
        () => { node.manualVideoUrls = ['/manual.mp4']; },
        () => { sources[0].refs[0].name = '新名字'; },
        () => { node.useFrameRoles = true; },
        () => { sources[1].refs[0].kind = 'video'; },
        () => { missing.add('/a.png'); },
        () => { missing.delete('/a.png'); },
    ]) {
        const first = list.children[0];
        change();
        context.renderVideoImageInputs(list, node, sources);
        assert.notEqual(list.children[0], first);
    }
});

test('a replacement node object rebinds drag handlers even with identical id and media', () => {
    const {context, node, sources, reordered, events} = setup(), list = new Element();
    context.renderImageInputList(list, node, sources);
    const replacement = {...node};
    context.renderImageInputList(list, replacement, sources);
    context.document.elementFromPoint = () => list.children[0];
    list.children[1].onmousedown({button:0, clientX:0, clientY:0, target:{closest:()=>null}, preventDefault() {}, stopPropagation() {}});
    events.get('mousemove')({clientX:20, clientY:0});
    events.get('mouseup')({clientX:20, clientY:0});
    assert.equal(events.size, 0);
    assert.equal(context.internalDrag, false);
    assert.equal(reordered.at(-1)[0], replacement);
    assert.deepEqual(reordered.at(-1).slice(1), ['audio', 'image']);
});

test('empty views are reusable, but changed empty labels and fresh DOM containers render', () => {
    const {context, node} = setup(), list = new Element(), fresh = new Element();
    context.renderImageInputList(list, node, [], '没有素材');
    context.renderImageInputList(list, node, [], '没有素材');
    assert.equal(list.writes, 1);
    context.renderImageInputList(list, node, [], '请连接素材');
    assert.equal(list.writes, 2);
    context.renderImageInputList(fresh, node, [], '请连接素材');
    assert.equal(fresh.writes, 1);
    for (const name of ['renderComfyImages', 'renderVideoImageInputs']) {
        const empty = new Element();
        context[name](empty, node, []);
        const writes = empty.writes;
        context[name](empty, node, []);
        assert.equal(empty.writes, writes);
    }
});

test('failed rendering is not cached and can be retried', () => {
    const {context, node, sources} = setup(), list = new Element();
    context.refreshIcons = () => { throw new Error('render failure'); };
    assert.throws(() => context.renderImageInputList(list, node, sources), /render failure/);
    const first = list.children[0];
    context.refreshIcons = () => {};
    context.renderImageInputList(list, node, sources);
    assert.notEqual(list.children[0], first);
});

test('local refresh preserves custom Comfy audio/video and skips offscreen placeholders', () => {
    const {context, sources} = setup();
    const custom = {id: 'custom', type: 'comfy', mode: 'custom'};
    const standard = {id: 'standard', type: 'comfy', mode: 'edit'};
    const offscreen = {id: 'offscreen', type: 'comfy'};
    const elements = new Map([custom, standard, offscreen].map(node => [node.id, new Element()]));
    elements.get('offscreen').classList.contains = () => true;
    context.nodes = [custom, standard, offscreen];
    context.CANVAS_GENERATOR_TYPES = ['comfy'];
    context.nodesEl = {querySelector: selector => elements.get(selector.match(/data-id="([^"]+)"/)[1])};
    context.generatorSources = node => { assert.notEqual(node, offscreen); return sources; };
    context.orderedSources = (_node, inputs) => inputs;
    context.imageRefsOnly = refs => refs.filter(ref => ref.kind === 'image');
    load(context, ['refreshGeneratorInputViews']);
    context.refreshGeneratorInputViews();
    const customList = elements.get('custom').querySelector('.input-list');
    assert.equal(customList.children.length, 3);
    assert.equal(elements.get('standard').querySelector('.input-list').children.length, 1);
    const first = customList.children[0];
    context.refreshGeneratorInputViews();
    assert.equal(customList.children[0], first);
});

for (const cancelBy of ['blur', 'Escape', 'outside', 'other-kind']) {
    test('video sorting cleans up without reordering on ' + cancelBy, () => {
        const {context, node, sources, reordered, events} = setup(), list = new Element();
        context.renderVideoImageInputs(list, node, sources);
        const item = entries(list)[0];
        assert.equal(item.draggable, false);
        context.document.elementFromPoint = () => cancelBy === 'other-kind' ? entries(list)[1] : null;
        item.onmousedown({button:0, clientX:0, clientY:0, target:{closest:()=>null}, preventDefault() {}, stopPropagation() {}});
        events.get('mousemove')({clientX:20, clientY:0});
        assert.equal(context.internalDrag, true);
        if(cancelBy === 'blur') events.get('blur')();
        else if(cancelBy === 'Escape') events.get('keydown')({key:'Escape'});
        else events.get('mouseup')({clientX:20, clientY:0});
        assert.equal(context.internalDrag, false);
        assert.equal(events.size, 0);
        assert.equal(reordered.length, 0);
    });
}

test('video sorting commits only on release over another same-kind source', () => {
    const {context, node, sources, reordered, events} = setup(), list = new Element();
    sources.push({id:'image2', refs:[{url:'/b.png', kind:'image'}]});
    context.renderVideoImageInputs(list, node, sources);
    const [item, destination] = entries(list);
    context.document.elementFromPoint = () => destination;
    item.onmousedown({button:0, clientX:0, clientY:0, target:{closest:()=>null}, preventDefault() {}, stopPropagation() {}});
    events.get('mousemove')({clientX:20, clientY:0});
    assert.equal(reordered.length, 0);
    events.get('mouseup')({clientX:20, clientY:0});
    assert.deepEqual(reordered[0], [node, 'image', 'image2']);
    assert.equal(events.size, 0);
    assert.equal(context.internalDrag, false);
});
