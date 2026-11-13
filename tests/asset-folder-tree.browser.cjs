const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, origin} = require('./helpers/canvas-browser.cjs');

async function setup(t) {
    const library = {libraries:[
        {id:'default', name:'默认资产库', categories:[
            {id:'images', name:'11', type:'image', items:[]},
            {id:'second', name:'222', type:'image', items:[]},
            {id:'workflow', name:'工作流', type:'workflow', items:[]}
        ]},
        {id:'other', name:'其他资产库', categories:[
            {id:'other-image', name:'未选中的分组', type:'image', items:[]},
            {id:'other-workflow', name:'其他工作流', type:'workflow', items:[]}
        ]}
    ]};
    const f = await fixture(t, 'classic', false, {apiHandler(request) {
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/asset-library')) return;
        const method = request.method();
        const body = method === 'POST' || method === 'PATCH' ? request.postDataJSON() : null;
        let category, asset_library;
        if (method === 'POST' && url.pathname.endsWith('/libraries')) {
            asset_library = {id:'created-library',name:body.name,categories:[]};
            library.libraries.push(asset_library);
        } else if (method === 'POST' && url.pathname.endsWith('/categories')) {
            category = {id:'created-category',name:body.name,type:body.type,items:[]};
            library.libraries.find(lib => lib.id === body.library_id).categories.push(category);
        } else if (method === 'PATCH') {
            const id = url.pathname.split('/').at(-1);
            const item = url.pathname.includes('/libraries/') ? library.libraries.find(lib => lib.id === id)
                : library.libraries.flatMap(lib => lib.categories).find(cat => cat.id === id);
            item.name = body.name;
        } else if (method === 'DELETE') {
            const id = url.pathname.split('/').at(-1);
            library.libraries.forEach(lib => {lib.categories = lib.categories.filter(cat => cat.id !== id);});
        }
        return {status:200,body:{library,category,asset_library}};
    }});
    await f.page.goto(origin + '/static/asset-manager.html');
    await f.page.locator('[data-asset-cat="images"]').waitFor();
    return f;
}

function row(page, id) {
    return page.locator('.folder-tree-row').filter({has:page.locator(`[data-asset-cat="${id}"]`)});
}

test('folder hover and inline editors preserve page structure, row geometry and native keyboard editing', async t => {
    const {page,errors,writes} = await setup(t);
    assert.equal(await page.locator('.asset-tabs button').count(),3);
    assert.equal(await page.locator('#assetManagerRoot>.asset-panel').count(),3);
    await page.locator('#assetSearch').waitFor();
    await page.locator('[data-asset-upload]').waitFor();
    const first = row(page,'images');
    for (const width of [1440,1024]) {
        await page.setViewportSize({width,height:960});
        await page.mouse.move(0,0);
        assert.equal(await first.locator('.tree-row-count').isVisible(),true);
        assert.equal(await first.locator('.folder-tree-actions').isVisible(),false);
        await first.hover();
        assert.equal(await first.locator('.tree-row-count').isVisible(),false);
        assert.equal(await first.locator('.folder-tree-actions button:visible').count(),3);
        assert.equal((await first.boundingBox()).height,32);
        assert.equal(await first.locator('.tree-row').evaluate(el => getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
        const bounds = await first.evaluate(el => {
            const name = el.querySelector('.tree-row-name').getBoundingClientRect();
            const actions = el.querySelector('.folder-tree-actions').getBoundingClientRect();
            return {nameRight:name.right,actionsLeft:actions.left,right:el.getBoundingClientRect().right,actionsRight:actions.right};
        });
        assert.ok(bounds.nameRight <= bounds.actionsLeft && bounds.actionsRight <= bounds.right);
    }
    await first.locator('[data-asset-cat-new]').click();
    const editor = page.locator('.folder-tree-editor');
    assert.equal((await editor.boundingBox()).height,32);
    assert.equal(await editor.locator('button').allTextContents().then(values => values.join('').trim()),'');
    assert.equal(await page.locator('.panel-head input').count(),0);
    await page.locator('#assetTreeEditInput').press('Escape');
    assert.equal(await editor.count(),0);
    await page.locator('[data-asset-lib-new]').click();
    assert.equal(await page.locator('.asset-library-tree>.folder-tree-editor').count(),1);
    assert.equal(await page.locator('.asset-directory .panel-title strong').innerText(),'文件夹');
    assert.equal(await page.locator('.panel-head input').count(),0);
    await page.locator('#assetTreeEditInput').press('Escape');
    assert.deepEqual(writes.filter(request => request.path.startsWith('/api/asset-library')),[]);
    assert.deepEqual(errors,[]);
});

test('unselected folder actions retain library/category API targets and two-step deletion', async t => {
    const {page,errors,writes} = await setup(t);
    const other = row(page,'other-image');
    await other.hover();
    await other.locator('[data-asset-cat-rename]').click();
    await page.locator('#assetTreeEditInput').fill('已重命名');
    await page.locator('#assetTreeEditInput').press('Enter');
    await page.locator('[data-asset-cat="other-image"] .tree-row-name').filter({hasText:'已重命名'}).waitFor();
    assert.deepEqual(writes.at(-1),{path:'/api/asset-library/categories/other-image',method:'PATCH',body:{name:'已重命名'}});
    await other.hover();
    await other.locator('[data-asset-cat-new]').click();
    await page.locator('#assetTreeEditInput').fill('新分组');
    await page.locator('[data-asset-tree-edit-save]').click();
    await page.locator('[data-asset-cat="created-category"]').waitFor();
    assert.deepEqual(writes.at(-1),{path:'/api/asset-library/categories',method:'POST',body:{library_id:'other',name:'新分组',type:'image'}});
    const count = writes.length;
    await other.hover();
    await other.locator('[data-asset-cat-delete]').click();
    assert.equal(writes.length,count);
    await other.locator('[data-asset-cat-delete].detail-confirm').click();
    await page.locator('[data-asset-cat="other-image"]').waitFor({state:'detached'});
    assert.equal(writes.at(-1).path,'/api/asset-library/categories/other-image');
    assert.equal(writes.at(-1).method,'DELETE');
    await page.locator('[data-asset-lib-new]').click();
    await page.locator('#assetTreeEditInput').fill('新资产库');
    await page.locator('#assetTreeEditInput').press('Enter');
    await page.locator('[data-asset-lib="created-library"]').waitFor();
    assert.deepEqual(writes.at(-1),{path:'/api/asset-library/libraries',method:'POST',body:{name:'新资产库'}});
    assert.deepEqual(errors,[]);
});

test('workflow tree uses compact editing and keeps cross-library rename and create contracts', async t => {
    const {page,errors,writes} = await setup(t);
    await page.locator('#assetTabWorkflows').click();
    const other = page.locator('.folder-tree-row').filter({has:page.locator('[data-workflow-cat="other-workflow"]')});
    await other.hover();
    await other.locator('[data-workflow-cat-rename]').click();
    assert.equal((await page.locator('.folder-tree-editor').boundingBox()).height,32);
    await page.locator('#workflowTreeEditInput').fill('新流程名称');
    await page.locator('#workflowTreeEditInput').press('Enter');
    await page.locator('[data-workflow-cat="other-workflow"] .tree-row-name').filter({hasText:'新流程名称'}).waitFor();
    assert.deepEqual(writes.at(-1),{path:'/api/asset-library/categories/other-workflow',method:'PATCH',body:{name:'新流程名称',library_id:'other'}});
    await page.locator('.panel-head [data-workflow-cat-new]').click();
    assert.equal(await page.locator('.folder-tree>.folder-tree-editor').count(),1);
    assert.equal(await page.locator('.panel-head input').count(),0);
    await page.locator('#workflowTreeEditInput').fill('新流程');
    await page.locator('[data-workflow-tree-edit-save]').click();
    await page.locator('[data-workflow-cat="created-category"]').waitFor();
    assert.deepEqual(writes.at(-1),{path:'/api/asset-library/categories',method:'POST',body:{library_id:'other',name:'新流程',type:'workflow'}});
    assert.deepEqual(errors,[]);
});
