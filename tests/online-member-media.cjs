const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const mediaUrl = require('../static/js/member-media.js');
const page = fs.readFileSync(require('node:path').join(__dirname,'../static/online.html'),'utf8');
const helper = page.slice(page.indexOf('        function onlineMediaUrl('),page.indexOf('        const historyPager'));
for (const paused of [false,true]) test('online thumbnail and original fallback respect member context, paused=' + paused, () => {
    const session={enabled:true,paused,context:{member:{id:'member1'},workspace:{id:'space1'}}};
    let fallback; const image={dataset:{},addEventListener:(_,fn)=>fallback=fn};
    const card={dataset:{},querySelector:()=>image};
    const masonry={appendChild(){}};
    const context=vm.createContext({window:{MemberMediaUrl:url=>mediaUrl(url,session,'http://localhost:8768/')},URLSearchParams,HISTORY_THUMB_WIDTH:320,
        document:{getElementById:id=>id==='masonry'?masonry:null,createElement:()=>card},lucide:{createIcons(){}},tr:()=>'',openLightbox(){}});
    vm.runInContext(helper,context);
    context.renderImageCard({timestamp:123,images:['/assets/output/test.png'],prompt:'test'});
    const preview=image.src;
    fallback();
    if(paused){assert.equal(preview,'');assert.equal(image.src,'');}
    else {
        const url=new URL(preview,'http://localhost:8768');
        assert.equal(url.searchParams.get('workspace'),'space1');assert.equal(url.searchParams.get('member'),'member1');
        assert.equal(url.searchParams.get('url'),'/assets/output/test.png');
        assert.equal(image.src,'/assets/output/test.png?workspace=space1&member=member1');
    }
    assert.equal(card.innerHTML.includes('<img src='),false);
});
test('online inline scripts parse',()=>{
    for(const match of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
