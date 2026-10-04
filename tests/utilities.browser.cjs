const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://utilities.test';

for(const name of ['index', 'canvas', 'online', 'gpt-chat']) {
    test(`${name}: static utilities cover initial and dynamic markup at both breakpoints and themes`, async t => {
        const html = fs.readFileSync(path.join(root, 'static', name + '.html'), 'utf8');
        assert.doesNotMatch(html, /tailwindcss-cdn|cdn\.tailwindcss|text\/tailwindcss/);
        assert.equal((html.match(/href="\/static\/css\/utilities\.css"/g) || []).length, 1);
        assert.ok(html.indexOf('href="/static/css/utilities.css"') > html.lastIndexOf('</style>'), 'utilities retain their cascade order');
        const browser = await chromium.launch({channel:'chrome', headless:true});
        t.after(() => browser.close());
        for(const width of [390,1280]) for(const dark of [false,true]) {
            const page = await browser.newPage({viewport:{width,height:900}});
            const failures = [];
            page.on('pageerror', error => failures.push(error.message));
            await page.route('**/*', async route => {
                const url = new URL(route.request().url());
                if(url.origin !== origin) return route.abort();
                const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
                if(!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) {
                    failures.push(url.pathname);
                    return route.fulfill({status:404,body:''});
                }
                if(filename.endsWith('.html')) {
                    // CSS-only page fixture: API state and iframe navigation have separate tests.
                    const body = fs.readFileSync(filename,'utf8')
                        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, tag => /src="[^"]*\/lucide\.js/.test(tag) ? tag : '')
                        .replace(/<iframe\b[\s\S]*?<\/iframe>/g, '');
                    return route.fulfill({contentType:'text/html',body});
                }
                return route.fulfill({path:filename});
            });
            await page.goto(`${origin}/static/${name}.html`);
            await page.evaluate(dark => {
                document.documentElement.classList.toggle('theme-dark',dark);
                document.documentElement.classList.toggle('studio-theme-dark',dark);
                document.body.classList.toggle('theme-dark',dark);
                document.getElementById('canvasGate')?.classList.replace('gate-loading','gate-ready');
                window.lucide?.createIcons();
            }, dark);
            const actual = await page.evaluate(async () => {
                // Inject after load, as innerHTML renderers do; there is no style compiler.
                const host = document.createElement('div');
                const shadow = host.attachShadow({mode:'open'});
                shadow.innerHTML = `<link rel="stylesheet" href="/static/css/utilities.css">
                    <div id="row" class="flex items-center gap-3">
                        <svg id="small" class="w-3.5 h-3.5 flex-shrink-0"></svg>
                        <svg id="normal" class="w-4 h-4"></svg>
                        <svg id="large" class="w-5 h-5"></svg>
                        <span id="label" class="text-[11px] rounded-full">动态文案</span>
                    </div>
                    <div id="grid" class="grid grid-cols-1 lg:grid-cols-12"></div>
                    <div id="responsive" class="hidden md:flex"></div>
                    <div id="overlay" class="bg-black/50"></div>
                    <div id="hidden" hidden>隐藏</div>`;
                document.body.append(host);
                await new Promise((resolve,reject) => {
                    const link = shadow.querySelector('link');
                    link.onload = resolve;
                    link.onerror = reject;
                });
                const style = id => getComputedStyle(shadow.getElementById(id));
                const result = {
                    sizes:['small','normal','large'].map(id => [style(id).width,style(id).height]),
                    shrink:style('small').flexShrink,
                    display:style('row').display, gap:style('row').gap,
                    font:style('label').fontSize,radius:style('label').borderRadius,
                    columns:style('grid').gridTemplateColumns.split(' ').length,
                    responsive:style('responsive').display,
                    overlay:style('overlay').backgroundColor,
                    hidden:style('hidden').display,
                    compiler:typeof window.tailwind
                };
                host.remove();
                return result;
            });
            assert.deepEqual(actual, {
                sizes:[['14px','14px'],['16px','16px'],['20px','20px']],shrink:'0',
                display:'flex',gap:'12px',font:'11px',radius:'9999px',
                columns:width >= 1024 ? 12 : 1,responsive:width >= 768 ? 'flex' : 'none',
                overlay:'rgba(0, 0, 0, 0.5)',hidden:'none',compiler:'undefined'
            }, `${width}px, dark=${dark}`);
            assert.deepEqual(failures, []);
            await page.close();
        }
    });
}

test('dynamic hover and group states keep their colors and transforms without a compiler', async t => {
    const browser = await chromium.launch({channel:'chrome',headless:true});
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.setContent('<div class="group" style="width:100px;height:100px"><span class="group-hover:opacity-100 opacity-0">内容</span></div><button class="hover:scale-105 hover:text-red-500">按钮</button>');
    await page.addStyleTag({path:path.join(root,'static/css/utilities.css')});
    const opacity = () => page.locator('.group span').evaluate(el => getComputedStyle(el).opacity);
    assert.equal(await opacity(),'0');
    await page.locator('.group').hover();
    assert.equal(await opacity(),'1');
    await page.locator('button').hover();
    assert.deepEqual(await page.locator('button').evaluate(el => ({color:getComputedStyle(el).color,transform:getComputedStyle(el).transform})),
        {color:'rgb(239, 68, 68)',transform:'matrix(1.05, 0, 0, 1.05, 0, 0)'});
});
