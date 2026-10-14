const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),context=vm.createContext({window:{},TextDecoder,Uint8Array,atob});
vm.runInContext(fs.readFileSync(path.join(root,'static/vendor/pixmax/prompt-catalog.js'),'utf8'),context);context.PixmaxPromptCatalog=context.window.PixmaxPromptCatalog;
context.escapeHtml=context.escapeAttr=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
vm.runInContext(fs.readFileSync(path.join(root,'static/js/pixmax-prompt-tokens.js'),'utf8'),context);const tokens=context.window.PixmaxPromptTokens;
const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value),'utf8').toString('base64');
const hash=(type,payload,body)=>`%%#[${type}][${encode(payload)}](${encode(body)})%%`;
const camera={chipIndex:1,indices:{c:0,l:0,f:0,a:0}};
test('native camera and camerawork chips compile Unicode bodies without sending encoded identifiers',()=>{
    const first=hash('camera',camera,'使用相机，24mm 焦距，ƒ/2 光圈'),second=hash('camerawork',{v:1,u:'motion-private-id',n:'弧形运镜'},'镜头缓慢绕人物弧形运动');assert.equal(tokens.compile('画面 '+first+'\n'+second),'画面 使用相机，24mm 焦距，ƒ/2 光圈\n镜头缓慢绕人物弧形运动');assert.equal(tokens.text(first+' '+second),'镜头参数1 弧形运镜');assert.equal(tokens.compile(first+second).includes('motion-private-id'),false);
});
test('malformed UTF8 payloads unsupported types and impossible indices fail before supplier use',()=>{
    for(const value of ['%%#[camera][@@](bad)%%',hash('camera',{},'描述'),hash('camera',{...camera,indices:{c:999,l:0,f:0,a:0}},'描述'),hash('camera',{...camera,indices:{c:.5,l:0,f:0,a:0}},'描述'),hash('panorama',{},'不支持'),hash('camerawork',{v:1,u:'id',n:''},'描述'),'%%#[camera][/w==](aGVsbG8=)%%'])assert.throws(()=>tokens.compile(value),/镜头标记/);
});
test('draft HTML retains canonical tokens and escapes imported camerawork names',()=>{
    const value=hash('camerawork',{v:1,u:'id',n:'<img onerror="x">'},'人物转身');const html=tokens.html(value);assert.ok(html.includes('data-pixmax-prompt-token='));assert.ok(html.includes('&lt;img'));assert.equal(html.includes('<img '),false);assert.equal(tokens.compile(value),'人物转身');
});
test('unresolved native subjects are blocked instead of becoming literal supplier instructions',()=>{
    assert.throws(()=>tokens.compile('%%subject-ref(missing|PERSONAL|人物|)%%'),/主体引用尚未解析/);
});
