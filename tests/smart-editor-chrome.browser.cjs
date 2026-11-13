const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/canvas-browser.cjs');

test('smart editor chrome retains commands and mode switching with stable Lucide icons', async t => {
    const {page, errors, writes} = await fixture(t, 'smart', true);
    const icons = '.pixmax-rail button svg,.pixmax-bottom-controls button svg';
    const inspect = () => page.locator(icons).evaluateAll(elements => elements.map(el => ({
        name:el.dataset.canvasChromeIcon, stroke:el.getAttribute('stroke-width'),
        fill:el.getAttribute('fill'), width:getComputedStyle(el).width
    })));
    const before = await inspect();
    assert.ok(before.length >= 16);
    assert.ok(before.every(icon => icon.name && icon.stroke === '1.75' && icon.fill === 'none'));
    assert.ok(before.every(icon => ['16px','18px'].includes(icon.width)));
    await page.evaluate(() => refreshIcons());
    assert.deepEqual(await inspect(),before,'icon refresh must not replace the standard chrome icons');
    const mode = page.locator('[data-pixmax-mode]');
    await mode.click();
    assert.equal(await page.evaluate(() => pixmaxCanvasMode),'preview');
    assert.equal(await mode.locator('svg').getAttribute('data-canvas-chrome-icon'),'eye');
    await mode.click();
    assert.equal(await page.evaluate(() => pixmaxCanvasMode),'normal');
    assert.equal(await mode.locator('svg').getAttribute('data-canvas-chrome-icon'),'mouse-pointer-2');
    assert.equal(await mode.evaluate(el => getComputedStyle(el).backgroundColor),'rgb(39, 39, 42)');
    await page.getByRole('button',{name:'更多工具',exact:true}).click();
    const menu = page.locator('#pixmaxSettingsMenu');
    assert.equal(await menu.locator('button').count(),10);
    assert.equal(await menu.locator('[role="separator"]').count(),3);
    assert.ok((await menu.locator('button').evaluateAll(nodes => nodes.map(el => ({
        height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight
    })))).every(row => row.height === 32 && row.font === '12px' && row.weight === '500'));
    await page.getByRole('button',{name:'全屏画布',exact:true}).click();
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('canvas-focus-mode')),true);
    await page.getByRole('button',{name:'退出全屏',exact:true}).click();
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('canvas-focus-mode')),false);
    assert.equal(writes.filter(item => item.method === 'PUT').length,0);
    assert.deepEqual(errors,[]);
});

test('shortcut overlay covers an open asset panel without losing shortcut entries or narrow-screen access', async t => {
    const {page, errors} = await fixture(t, 'smart', true);
    await page.locator('#assetToggle').click();
    await page.getByRole('button',{name:'更多工具',exact:true}).click();
    await page.getByRole('button',{name:'快捷键',exact:true}).click();
    const modal = page.locator('#smartShortcutModal');
    await modal.waitFor();
    assert.equal(await modal.locator('.shortcut-item').count(),12);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#smartShortcutModal')).opacity === '1');
    const overlap = await page.evaluate(() => {
        const modal = document.querySelector('#smartShortcutModal'), asset = document.querySelector('.asset-panel');
        const m = modal.getBoundingClientRect(), a = asset.getBoundingClientRect();
        const x = Math.max(m.left,a.left) + 20, y = Math.max(m.top,a.top) + 30;
        return {top:modal.contains(document.elementFromPoint(x,y)), bg:getComputedStyle(modal).backgroundColor};
    });
    assert.equal(overlap.top,true);
    assert.equal(overlap.bg,'rgba(12, 12, 14, 0.98)');
    const ordered = await modal.locator('.shortcut-item').first().evaluate(el => {
        const description = el.querySelector('span:not(.shortcut-keys)').getBoundingClientRect();
        const keys = el.querySelector('.shortcut-keys').getBoundingClientRect();
        return description.right <= keys.left;
    });
    assert.equal(ordered,true);
    await page.setViewportSize({width:390,height:844});
    const list = modal.locator('.shortcut-list');
    await list.evaluate(el => {el.scrollTop = el.scrollHeight;});
    assert.equal(await modal.getByText('删除选中节点',{exact:true}).isVisible(),true);
    assert.equal(await list.evaluate(el => getComputedStyle(el).scrollbarWidth),'thin');
    await modal.locator('button[title="关闭"]').click();
    assert.equal(await modal.evaluate(el => el.classList.contains('open')),false);
    assert.deepEqual(errors,[]);
});

test('command menu follows the dock when the directory opens, closes and resizes', async t => {
    const {page, errors} = await fixture(t, 'smart', true, {navigatorOpen:true});
    await page.getByRole('button',{name:'更多工具',exact:true}).click();
    const gap = () => page.evaluate(() => {
        const dock = document.querySelector('.pixmax-rail').getBoundingClientRect();
        const menu = document.querySelector('#pixmaxSettingsMenu').getBoundingClientRect();
        return menu.left - dock.right;
    });
    for (const width of [1440,1024]) {
        await page.setViewportSize({width,height:900});
        assert.equal(await gap(),8);
        await page.getByRole('button',{name:'关闭画布目录',exact:true}).click();
        assert.equal(await gap(),8);
        await page.getByRole('button',{name:'画布目录',exact:true}).click();
        assert.equal(await gap(),8);
    }
    assert.equal(await page.locator('#pixmaxNavigator [role=tab][aria-selected=true]').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(39, 39, 42)');
    assert.equal(await page.locator('[data-directory-close] svg').getAttribute('stroke-width'),'1.75');
    const topColors = await page.locator('.pixmax-topbar>.pixmax-control').evaluateAll(nodes => nodes.map(el => getComputedStyle(el).backgroundColor));
    assert.ok(topColors.every(color => color === 'rgba(18, 18, 21, 0.9)'));
    assert.deepEqual(errors,[]);
});
