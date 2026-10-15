const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture, origin} = require('./helpers/canvas-browser.cjs');

async function legacyLightPreference(page) {
    await page.addInitScript(() => {
        localStorage.setItem('studio_theme', 'light');
        localStorage.setItem('canvas_theme', 'light');
    });
    await page.emulateMedia({colorScheme:'light'});
}

async function appearance(frame) {
    return frame.evaluate(() => ({
        dark: document.documentElement.classList.contains('theme-dark') && document.body.classList.contains('studio-theme-dark'),
        scheme: getComputedStyle(document.documentElement).colorScheme,
        palette: getComputedStyle(document.body).getPropertyValue('--studio-page').trim(),
        themeApi: typeof window.StudioTheme,
        scale: getComputedStyle(document.documentElement).getPropertyValue('--studio-ui-scale').trim()
    }));
}

test('home, settings and lazy pages remain dark with old light preferences and incoming theme messages', async t => {
    const {page, errors, writes} = await fixture(t, 'classic', false, {home:true, startPath:'/static/index.html'});
    await legacyLightPreference(page);
    await page.reload();
    await page.frameLocator('#frame-canvas').locator('.canvas-open').first().waitFor();
    const initialWrites = writes.length;
    assert.equal(await page.locator('#theme-toggle-btn,[onclick*="toggleTheme"]').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.toggleTheme), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.StudioThemeTransition), 'undefined');
    await page.getByRole('button', {name:'更多设置', exact:true}).click();
    assert.equal(await page.locator('#settings-fold-toggle').getAttribute('aria-expanded'), 'true');
    assert.doesNotMatch(await page.locator('.side-actions').innerText(), /黑夜模式|白天模式|浅色模式|深色模式/);
    await page.getByRole('button', {name:'更多设置', exact:true}).click();
    fs.mkdirSync(path.resolve('output'), {recursive:true});
    await page.screenshot({path:path.resolve('output/dark-only-workbench.png')});

    for (const id of ['online', 'gpt-chat', 'asset-manager', 'skill-library', 'canvas']) {
        await page.locator(`.nav-item[data-page="${id}"]`).click();
        const child = await page.locator(`#frame-${id}`).elementHandle().then(handle => handle.contentFrame());
        await child.waitForFunction(() => window.StudioScale && document.body.classList.contains('studio-theme-dark'));
        assert.equal(await page.evaluate(id => StudioFrameMessages.send(document.getElementById('frame-'+id), {type:'studio-theme', theme:'light'}), id), false);
        await page.evaluate(id => document.getElementById('frame-'+id).contentWindow.postMessage({type:'studio-theme', theme:'light'}, location.origin), id);
        await child.evaluate(() => {
            window.dispatchEvent(new StorageEvent('storage', {key:'studio_theme', newValue:'light'}));
            window.dispatchEvent(new CustomEvent('studio-theme-change', {detail:{theme:'light'}}));
        });
        const state = await appearance(child);
        assert.equal(state.dark, true, id);
        assert.equal(state.scheme, 'dark', id);
        assert.equal(state.palette, '#090b09', id);
        assert.equal(state.themeApi, 'undefined', id);
    }
    assert.equal((await appearance(page)).dark, true);
    assert.equal(writes.length, initialWrites, 'appearance and navigation do not write canvas data');
    assert.deepEqual(errors, []);
});

for (const kind of ['classic', 'smart']) test(`${kind} canvas stays dark after reload and still supports UI scaling policy and node creation`, async t => {
    const {page, errors} = await fixture(t, kind, true);
    await legacyLightPreference(page);
    await page.reload();
    await page.waitForFunction(() => typeof canvas !== 'undefined' && canvas?.id === 'canvas-test');
    assert.equal((await appearance(page)).dark, true);
    await page.evaluate(() => {
        StudioScale.set('125', false);
        window.dispatchEvent(new CustomEvent('studio-theme-change', {detail:{theme:'light'}}));
    });
    const state = await appearance(page);
    assert.equal(state.themeApi, 'undefined');
    assert.equal(state.dark, true);
    assert.equal(state.scale, '1.000', 'both canvas pages keep their own viewport scaling');
    if (kind === 'smart') {
        await page.getByRole('button', {name:'添加节点', exact:true}).click();
        await page.getByRole('menuitem', {name:'图像节点', exact:true}).click();
        assert.equal(await page.locator('.image-node .node-body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(20, 20, 22)');
    } else {
        await page.evaluate(() => addPromptNode({x:100, y:100}));
        assert.equal(await page.evaluate(() => nodes.length), 1);
    }
    await page.evaluate(() => StudioScale.set('100', false));
    assert.equal((await appearance(page)).scale, '1.000');
    assert.deepEqual(errors, []);
});

test('retired display scaling cannot resize the workbench or embedded pages', async t => {
    const {page, errors} = await fixture(t, 'classic', false, {home:true, startPath:'/static/index.html'});
    await page.addInitScript(() => {
        localStorage.setItem('studio_ui_scale_mode','140');
        Object.defineProperty(window,'screen',{value:{width:3840,height:2160}});
        Object.defineProperty(window,'devicePixelRatio',{value:1});
    });
    await page.reload();
    await page.frameLocator('#frame-canvas').locator('.canvas-open').first().waitFor();
    await page.evaluate(() => StudioScale.set('125'));
    const child = await page.locator('#frame-canvas').elementHandle().then(handle => handle.contentFrame());
    await child.waitForFunction(() => StudioScale.getMode() === '100');
    assert.equal((await appearance(child)).scale, '1.000');
    assert.equal(await page.evaluate(() => document.body.classList.contains('studio-scale-host')), false);
    await page.reload();
    await page.frameLocator('#frame-canvas').locator('.canvas-open').first().waitFor();
    assert.equal(await page.evaluate(() => StudioScale.getMode()), '100');
    assert.equal(await page.evaluate(() => localStorage.getItem('studio_ui_scale_mode')), null);
    for(const width of [390,1920,3840]) {
        await page.setViewportSize({width,height:900});
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).zoom),'1');
        assert.equal((await appearance(page)).scale,'1.000');
    }
    assert.equal((await appearance(page)).dark, true);
    assert.deepEqual(errors, []);
});

test('workspace HTML declares dark appearance before JavaScript initialization', () => {
    for (const page of ['index','canvas-home','canvas','smart-canvas','online','gpt-chat','asset-manager','skill-library']) {
        const html = fs.readFileSync(path.resolve('static', page+'.html'), 'utf8');
        assert.match(html, /<html\b[^>]*class="[^"]*studio-theme-dark theme-dark/);
        assert.doesNotMatch(html, /studio_theme|canvas_theme|theme-transition\.js|\/theme\.js/);
    }
});
