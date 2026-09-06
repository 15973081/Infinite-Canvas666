const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../static/js/canvas.js'), 'utf8').replace(/\r\n/g, '\n');
function load(names, globals) {
    const context = vm.createContext(globals);
    for (const name of names) {
        const start = source.indexOf(`function ${name}(`);
        assert.ok(start >= 0, `${name} exists`);
        const end = source.indexOf('\n}', start) + 2;
        vm.runInContext(source.slice(start, end), context);
    }
    return context;
}

for (const output of [false, true]) {
    test(`${output ? 'output' : 'asset'} poster failures stay lightweight and open the lightbox`, () => {
        const owner = {id: 'video-node', type: output ? 'output' : 'image', mediaKind: 'video'};
        const opened = [];
        const created = [];
        const button = () => ({tagName: 'BUTTON', dataset: {}, closest: () => ({dataset: {id: owner.id}})});
        const document = {
            createElement(tag) {
                created.push(tag);
                if (tag !== 'template') return button();
                return {
                    content: {},
                    set innerHTML(html) {
                        assert.doesNotMatch(html, /<(?:video|audio)\b/i);
                        assert.match(html, /^<button\b/);
                        this.content.firstElementChild = button();
                    },
                };
            },
        };
        const images = Array.from({length: 30}, (_, index) => ({
            dataset: {originalSrc: `/video-${index}.mp4`, previewKind: 'video'},
            addEventListener(event, handler) { if (event === 'error') this.fail = handler; },
            closest() { return output ? {closest: () => ({dataset: {id: owner.id}})} : null; },
            replaceWith(element) { this.replacement = element; },
        }));
        const context = load(['canvasVideoFallbackHtml', 'bindCanvasPreviewImageFallbacks'], {
            document, nodes: [owner], escapeAttr: value => value,
            refreshIcons() {}, openOutputLightbox: (...args) => opened.push(args),
        });
        context.bindCanvasPreviewImageFallbacks({querySelectorAll: () => images});
        for (const image of images) {
            image.fail();
            assert.equal(image.replacement.tagName, 'BUTTON');
            image.replacement.onclick({preventDefault() {}, stopPropagation() {}});
            assert.deepEqual(opened.at(-1), [image.dataset.originalSrc, owner]);
        }
        assert.ok(created.every(tag => tag === 'button' || tag === 'template'));
        assert.equal(opened.length, 30);
    });
}

test('releasing the shared video stops playback and unloads its source every time', () => {
    const calls = [];
    const video = {
        onloadedmetadata() {},
        pause() { calls.push('pause'); },
        removeAttribute(name) { calls.push(`remove:${name}`); delete this[name]; },
        load() { calls.push('load'); },
    };
    const context = load(['releaseOutputLightboxVideo'], {outputLightboxVideo: video});
    for (let index = 0; index < 10; index++) {
        video.src = `/video-${index}.mp4`;
        context.releaseOutputLightboxVideo();
        assert.equal(video.src, undefined);
        assert.equal(video.onloadedmetadata, null);
        assert.deepEqual(calls.slice(-3), ['pause', 'remove:src', 'load']);
    }
});

test('normal poster and play-button clicks use the preview route, not an inline player', () => {
    assert.match(source, /loadedImg\.addEventListener\('click', openPreview, true\)/);
    assert.match(source, /videoPlayBtn\.addEventListener\('click', openPreview, true\)/);
    assert.doesNotMatch(source, /canvasActivateVideoPreview|canvasVideoPlayerHtml/);
    assert.doesNotMatch(source, /<video\b/);
});
