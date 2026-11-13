const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
async function setup(t){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[],calls=[];
 await page.emulateMedia({reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><link rel="stylesheet" href="/static/css/studio-cyber.css"></head><body class="studio-skin"><main></main></body></html>'});
  if(url.pathname.startsWith('/static/'))return route.fulfill({path:path.resolve('.'+url.pathname)});
  calls.push({path:url.pathname,body:route.request().postDataJSON()});
  if(url.pathname==='/api/account/email')return route.fulfill({json:{email:null,delivery_configured:true}});
  if(url.pathname==='/api/account/email/start')return route.fulfill({json:{challenge_id:'challenge'}});
  if(url.pathname==='/api/account/data')return route.fulfill({json:{member:{id:'m',display_name:'本地管理员',username:'admin'},conversations:12,subject_catalogs:2,objects:18,bytes:15309209,retained:['共享画布与素材继续由空间管理。','费用与必要审计记录保留。']}});
  return route.fulfill({json:{}});
 });
 await page.goto('http://account-utilities.test/');
 await page.evaluate(()=>{window.CanvasSession={context:{member:{id:'m',display_name:'本地管理员'}},enabled:true,paused:false};});
 fs.mkdirSync('.local/interface-polish',{recursive:true});return {page,errors,calls};
}
test('email modal keeps verification and invitations with a dark autofill surface',async t=>{
 const {page,errors,calls}=await setup(t);
 await page.evaluate(async()=>{await import('/static/js/account-email.js');await CanvasAccountEmail.show();});
 const modal=page.locator('.account-email-dialog');await page.waitForFunction(()=>getComputedStyle(document.querySelector('.account-email-dialog')).backgroundColor==='rgb(12, 12, 14)');
 assert.equal(await modal.evaluate(n=>getComputedStyle(n).borderRadius),'16px');
 assert.equal(await modal.getByRole('button',{name:'关闭',exact:true}).evaluate(n=>getComputedStyle(n,'::before').maskImage.includes('svg')),true);
 assert.equal(await modal.getByLabel('验证码',{exact:true}).isVisible(),false);
 await modal.getByLabel('新邮箱',{exact:true}).fill('preview@example.com');await modal.getByLabel('当前密码',{exact:true}).fill('preview-password');
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.account-email-dialog input[name=email]'});await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['autofill']});
 const autofill=await modal.getByLabel('新邮箱',{exact:true}).evaluate(n=>{const c=getComputedStyle(n);return [n.matches(':-webkit-autofill'),c.webkitTextFillColor,c.webkitBoxShadow];});
 assert.equal(autofill[0],true);assert.equal(autofill[1],'rgb(244, 244, 245)');assert.match(autofill[2],/rgb\(22, 22, 26\).*1000px.*inset/);
 await page.screenshot({path:'.local/interface-polish/email-autofill.png',fullPage:true});
 await modal.getByRole('button',{name:'发送验证码',exact:true}).click();await modal.getByLabel('验证码',{exact:true}).waitFor();
 assert.equal(calls.find(c=>c.path.endsWith('/start')).body.email,'preview@example.com');
 await modal.getByLabel('验证码',{exact:true}).fill('123456');await modal.getByRole('button',{name:'验证并绑定',exact:true}).click();await modal.getByText('邮箱绑定成功，可使用该邮箱和密码登录。',{exact:true}).waitFor();
 await modal.getByLabel('邮件中的企业邀请凭证',{exact:true}).fill('invite-example');await modal.getByRole('button',{name:'接受企业邀请',exact:true}).click();await modal.getByText(/已加入企业/).waitFor();
 assert.equal(calls.find(c=>c.path.endsWith('/accept')).body.token,'invite-example');assert.deepEqual(errors,[]);
});
test('personal data groups all disclosures and distinguishes irreversible account closure',async t=>{
 const {page,errors}=await setup(t);await page.evaluate(async()=>{await import('/static/js/account-data.js');await CanvasAccountData.show();});
 const modal=page.locator('.account-data-dialog');await page.waitForFunction(()=>getComputedStyle(document.querySelector('.account-data-dialog')).backgroundColor==='rgb(12, 12, 14)');
 assert.equal(await modal.locator(':scope>div>p').count(),5);
 assert.equal(await modal.locator(':scope>div>p').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(18, 18, 21)');
 const danger=modal.getByRole('button',{name:'注销账号并清理本人数据',exact:true});assert.equal(await danger.evaluate(n=>getComputedStyle(n).color),'rgb(248, 113, 113)');assert.equal(await danger.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(239, 68, 68, 0.1)');
 assert.equal(await modal.locator('form[action="/api/account/data/export"] input[name=member_id]').inputValue(),'m');
 assert.equal(await modal.getByLabel('账号密码').getAttribute('autocomplete'),'current-password');
 for(const width of [1280,390]){await page.setViewportSize({width,height:1000});const bounds=await modal.evaluate(n=>({scroll:n.scrollWidth,client:n.clientWidth,width:n.getBoundingClientRect().width}));assert.ok(bounds.width<=width&&bounds.scroll<=bounds.client);await page.screenshot({path:'.local/interface-polish/personal-data-'+width+'.png',fullPage:true});}
 assert.deepEqual(errors,[]);
});
test('preferences retain 36 by 20 switches, rotating disclosures and neutral preview surfaces',async t=>{
 const {page,errors}=await setup(t);await page.evaluate(async()=>{await import('/static/js/canvas-preferences.js');await CanvasPreferences.show();});
 const modal=page.locator('.canvas-preferences');await page.waitForFunction(()=>getComputedStyle(document.querySelector('.canvas-preferences')).backgroundColor==='rgb(12, 12, 14)');
 const switches=modal.getByRole('switch');assert.equal(await switches.count(),2);
 const style=()=>switches.first().evaluate(n=>{const c=getComputedStyle(n),knob=getComputedStyle(n,'::after');return [c.width,c.height,c.backgroundColor,knob.backgroundColor];});
 assert.deepEqual(await style(),['36px','20px','rgb(212, 255, 51)','rgb(9, 9, 11)']);
 await switches.first().uncheck();await page.waitForTimeout(220);assert.deepEqual(await style(),['36px','20px','rgb(39, 39, 42)','rgb(212, 212, 216)']);
 await modal.locator('details>summary').first().click();assert.equal(await modal.locator('summary').first().evaluate(n=>getComputedStyle(n).listStyleType),'none');
 const save=modal.getByRole('button',{name:'保存偏好',exact:true});assert.equal(await save.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(212, 255, 51)');assert.equal(await save.evaluate(n=>getComputedStyle(n).fontWeight),'600');
 assert.equal(await modal.locator('.preference-preview-node').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(18, 18, 21)');
 await page.screenshot({path:'.local/interface-polish/preferences.png',fullPage:true});await save.click();await modal.getByText('偏好已保存',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>CanvasPreferences.get().connections),false);assert.deepEqual(errors,[]);
});
