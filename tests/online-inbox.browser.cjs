const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function main(){
 const config=JSON.parse(process.argv[2]),out=path.resolve('.local/online-inbox');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const login=await context.request.post(config.base+'/api/auth/login',{data:{username:config.username,password:config.password},headers:{Origin:config.base}});assert.equal(login.status(),200);
  await page.goto(config.base+'/static/online.html?workspace='+config.workspace);
  const inbox=page.locator('#onlineInbox');await inbox.getByRole('heading',{name:'作品收件箱'}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===2);
  await inbox.getByLabel('作品引用状态').selectOption('unreferenced');
  await page.waitForFunction(()=>document.querySelector('#inboxGrid').getAttribute('aria-busy')==='false'&&document.querySelectorAll('.inbox-card').length===2);
  await inbox.getByLabel('作品引用状态').selectOption('referenced');await inbox.getByText('没有匹配的作品',{exact:true}).waitFor();
  await inbox.getByLabel('作品引用状态').selectOption('all');await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===2);
  await inbox.getByLabel('搜索作品').fill('无匹配词');await inbox.getByText('没有匹配的作品',{exact:true}).waitFor();
  await inbox.getByLabel('搜索作品').fill('海边');await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===2);
  await inbox.getByLabel('搜索作品').fill('');
  await inbox.getByRole('button',{name:'整理',exact:true}).first().click();
  await page.getByLabel('作品名称').fill('保留画面');await page.getByLabel('文件夹',{exact:true}).fill('品牌');await page.getByLabel('标签（用逗号分隔）').fill('海边,角色');
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await inbox.getByRole('heading',{name:'保留画面'}).waitFor();
  await inbox.getByLabel('选择 保留画面').check();await inbox.getByRole('button',{name:'保留作品',exact:true}).click();await inbox.getByText('整理已保存',{exact:true}).waitFor();
  await inbox.getByRole('tab',{name:'已保留',exact:true}).click();await inbox.getByRole('heading',{name:'保留画面'}).waitFor();
  await inbox.getByLabel('选择 保留画面').check();await inbox.getByRole('button',{name:'移入回收站',exact:true}).click();await inbox.getByText('已移入回收站，可以恢复',{exact:true}).waitFor();
  await inbox.getByRole('tab',{name:'回收站',exact:true}).click();await inbox.getByRole('button',{name:'恢复',exact:true}).click();await inbox.getByText('作品已恢复',{exact:true}).waitFor();
  await inbox.getByRole('tab',{name:'已保留',exact:true}).click();await inbox.getByRole('heading',{name:'保留画面'}).waitFor();

  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.inbox-card-actions button')).backgroundColor==='rgb(18, 22, 17)');
  await inbox.scrollIntoViewIfNeeded();await inbox.screenshot({path:path.join(out,'inbox-desktop-dark.png'),animations:'disabled',style:'.member-session-bar{visibility:hidden}'});
  await inbox.getByRole('tab',{name:'未整理',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===1);
  // Real material-library import reuses the original and archives this work.
  await inbox.getByRole('button',{name:'素材库',exact:true}).click();
  const transfer=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'保存到素材库',exact:true})});
  await transfer.getByRole('button',{name:'导入',exact:true}).click();await transfer.getByText(/已保存 1 张图片/).waitFor();await transfer.getByRole('button',{name:'关闭',exact:true}).click();
  await inbox.getByText('收件箱为空，生成的作品会出现在这里',{exact:true}).waitFor();
  await inbox.getByRole('tab',{name:'已保留',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===2);
  await inbox.getByLabel('作品引用状态').selectOption('unreferenced');await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===1);
  await inbox.getByRole('heading',{name:'保留画面',exact:true}).waitFor();
  await inbox.getByLabel('作品引用状态').selectOption('referenced');await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===1);
  assert.equal(await inbox.getByRole('heading',{name:'保留画面',exact:true}).count(),0,'library image remains referenced');
  await inbox.getByLabel('作品引用状态').selectOption('all');await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===2);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.inbox-card-actions button')).backgroundColor==='rgb(255, 255, 255)');
  await inbox.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
  assert.ok(await inbox.getByLabel('作品引用状态').evaluate(el=>el.getBoundingClientRect().width>=140),'reference filter label has room on mobile');
  await inbox.getByLabel('作品引用状态').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.equal(await inbox.getByLabel('作品引用状态').inputValue(),'unreferenced');
  await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===1);
  await inbox.getByLabel('作品引用状态').selectOption('all');await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===2);
  await inbox.screenshot({path:path.join(out,'inbox-mobile-light.png'),animations:'disabled',style:'.member-session-bar{visibility:hidden}'});
  await inbox.getByRole('button',{name:'回收',exact:true}).first().click();await inbox.getByText('已移入回收站，可以恢复',{exact:true}).waitFor();
  await inbox.getByRole('tab',{name:'回收站',exact:true}).click();await inbox.getByRole('button',{name:'彻底删除',exact:true}).last().click();
  await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).focus();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await page.route('**/api/online-works?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'收件箱暂时不可用'})}));
  await inbox.getByRole('button',{name:'刷新',exact:true}).click();await inbox.getByText('收件箱暂时不可用，点击刷新重试',{exact:true}).waitFor();
  await page.unroute('**/api/online-works?*');await inbox.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.inbox-card').length===1);
  assert.deepEqual(errors,[]);console.log('real-browser inbox reference filters, CRUD, import, themes, mobile and keyboard passed');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
