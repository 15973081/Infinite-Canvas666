const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const catalog={invite_members:'邀请普通成员',manage_members:'移除普通成员',manage_admins:'任命管理员与设置权限',edit_profile:'修改企业资料',create_spaces:'创建协作空间',archive_spaces:'归档与恢复空间',assign_spaces:'分配空间成员与角色',manage_roles:'管理空间角色',assign_models:'分配空间模型与默认模型',billing_read:'查看企业费用',audit_read:'查看操作记录',manage_rules:'调整企业权限规则'};

async function fixture(t,permissions,{platform=false}={}){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),requests=[],errors=[];
 const rules=Object.fromEntries(Object.keys(catalog).map(k=>[k,true]));
 const people=[{id:'owner',username:'lin',display_name:'林舟',email:'lin@example.test',status:'active',role:'admin',admin_permissions:permissions,effective_permissions:permissions,version:1,can_manage_admin:platform},
  {id:'finance',username:'chen',display_name:'陈悦',email:'chen@example.test',status:'active',role:'admin',admin_permissions:['billing_read'],effective_permissions:['billing_read'],version:1,can_manage_admin:permissions.includes('manage_admins')||platform},
  {id:'designer',username:'zhou',display_name:'周宁',email:'zhou@example.test',status:'active',role:'member',admin_permissions:[],effective_permissions:[],version:1,can_manage_admin:permissions.includes('manage_admins')||platform}];
 const company={id:'studio',name:'映川设计',status:'active',role:'admin',members:3,spaces:1,version:1,platform_rules:rules,enterprise_rules:rules};
 const spaceRoles=[{id:'viewer',name:'查看者',active:true,delegatable:true},{id:'assets',name:'素材审核',active:true,delegatable:true}];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  if(p==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync('management/frontend/index.html','utf8')});
  if(p.startsWith('/static/')){
   const name=p.split('/').pop(),file=name.startsWith('billing-view.')?'static/'+(name.endsWith('.css')?'css/':'js/')+name:'management/frontend/'+name;
   if(!fs.existsSync(file))return route.fulfill({status:404});
   return route.fulfill({contentType:name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',body:fs.readFileSync(file,'utf8')});
  }
  requests.push({path:p,method:req.method(),body:req.postDataJSON()});
  const json=value=>route.fulfill({json:value});
  if(p==='/api/me')return json({member:{id:platform?'platform':'owner',display_name:platform?'平台管理员':'林舟'},permissions:platform?['tenant.manage']:[],workspaces:[],tenants:[{...company,permissions}],console_mode:platform?'platform':'enterprise'});
  if(p==='/api/tenants')return json({tenants:[company],can_create:platform,delivery_configured:true});
  if(p==='/api/tenants/studio')return json({tenant:company,members:people,spaces:[{id:'design',name:'品牌设计',status:'active'}],invitations:[],can_suspend:platform,rules,permissions,permission_catalog:catalog,delegatable_permissions:permissions,actor_id:platform?'platform':'owner'});
  if(p==='/api/tenants/studio/models')return json({catalog:[],grants:[],space_grants:[],defaults:[],default_choices:[],default_versions:[],can_grant:platform});
  if(p==='/api/tenants/studio/rules')return json({platform_rules:rules,enterprise_rules:rules,effective:rules,version:0,can_set_limits:platform});
  if(p==='/api/tenants/studio/events')return json({events:[],next:null});
  if(p==='/api/tenants/studio/billing')return json({totals:[],accounts:[],entries:[],page:1,pages:1,page_size:50,records:0});
  if(p==='/api/tenants/studio/spaces/design/members')return json(req.method()==='GET'?{members:[{member_id:'designer',role_ids:['viewer','assets']}],roles:spaceRoles}:{ok:true});
  if(p.startsWith('/api/tenants/studio/members/')&&req.method()==='PUT'){
   const member=people.find(m=>m.id===p.split('/').pop()),body=req.postDataJSON();
   Object.assign(member,{role:body.role,admin_permissions:body.permissions,effective_permissions:body.permissions,version:member.version+1});return json({ok:true});
  }
  if(p==='/api/tenants/studio/invitations')return json({ok:true});
  if(p==='/api/overview')return json({manageable_spaces:0,members:{total:0},tasks:{total:0},services:[],maintenance:{mode:'normal'}});
  return route.fulfill({status:404,json:{detail:{code:'not_found'}}});
 });
 await page.goto('http://localhost:8770/');
 if(platform){await page.getByRole('button',{name:'企业租户',exact:true}).click();await page.getByRole('button',{name:'管理企业',exact:true}).click();}
 else await page.getByRole('button',{name:'成员管理',exact:true}).click();
 return {page,requests,errors};
}

test('limited enterprise admin has no billing access or administrator invitation',async t=>{
 const {page,requests,errors}=await fixture(t,['invite_members','manage_members','assign_spaces']);
 assert.equal(await page.locator('#enterprise-navigation [data-view=enterpriseCosts]').isVisible(),false);
 assert.equal(await page.locator('#enterprise-navigation [data-view=enterpriseEvents]').isVisible(),false);
 assert.ok(requests.every(r=>!r.path.endsWith('/billing')&&!r.path.endsWith('/events')));
 assert.equal(await page.getByRole('button',{name:'设置管理员权限'}).first().isDisabled(),true);
 await page.getByRole('button',{name:'邀请成员',exact:true}).click();
 assert.equal(await page.getByLabel('企业角色',{exact:true}).locator('option[value=admin]').count(),0);
 await page.getByLabel('受邀邮箱',{exact:true}).fill('invite@example.test');
 await page.getByLabel('加入协作空间',{exact:true}).selectOption('design');
 await page.getByLabel('空间角色',{exact:true}).selectOption('assets');
 await page.locator('#confirm-dialog').click();
 await page.waitForFunction(()=>!document.querySelector('#dialog').open);
 assert.deepEqual(requests.find(r=>r.path.endsWith('/invitations')).body,{email:'invite@example.test',role:'member',permissions:[],spaces:[{workspace_id:'design',role_ids:['assets']}]});
 assert.deepEqual(errors,[]);
});

test('platform can configure each administrator in the desktop permission form',async t=>{
 const {page,requests,errors}=await fixture(t,Object.keys(catalog),{platform:true});
 await page.getByRole('row').filter({hasText:'陈悦 / chen'}).getByRole('button',{name:'设置管理员权限'}).click();
 await page.getByRole('button',{name:'人员管理',exact:true}).click();
 assert.equal(await page.locator('input[value=manage_admins]').isChecked(),false);
 assert.equal(await page.locator('input[value=billing_read]').isChecked(),false);
 const out=path.resolve('.local/cloud/acceptance/tenant-permissions');fs.mkdirSync(out,{recursive:true});
 for(const width of [1440]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.locator('#confirm-dialog').isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,`permissions-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 const form=await page.locator('#dialog-body').evaluate(node=>{
  const clone=node.cloneNode(true);node.querySelectorAll('input').forEach((input,i)=>clone.querySelectorAll('input')[i].toggleAttribute('checked',input.checked));
  node.querySelectorAll('select').forEach((select,i)=>Array.from(clone.querySelectorAll('select')[i].options).forEach(option=>option.toggleAttribute('selected',option.value===select.value)));
  return clone.outerHTML;
 });
 fs.writeFileSync(path.join(out,'permissions.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>'+fs.readFileSync('management/frontend/management.css','utf8')+'body{padding:24px;background:#fff}main#dialog{padding:24px;max-width:760px;margin:auto;box-shadow:none}h1{font-size:24px}</style><main id="dialog"><h1>企业管理员权限</h1>'+form+'</main></html>');
 await page.locator('#confirm-dialog').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
 const update=requests.find(r=>r.method==='PUT'&&r.path.endsWith('/members/finance'));
 assert.deepEqual(update.body,{role:'admin',permissions:['invite_members','manage_members','assign_spaces'],version:1});
 assert.deepEqual(errors,[]);
});

test('space member editing preserves all custom role selections',async t=>{
 const {page,requests,errors}=await fixture(t,Object.keys(catalog));
 await page.getByRole('button',{name:'空间管理',exact:true}).click();
 await page.getByRole('button',{name:'分配成员',exact:true}).click();
 await page.getByLabel('企业成员',{exact:true}).selectOption('designer');
 assert.equal(await page.getByLabel('素材审核',{exact:true}).isChecked(),true);
 assert.equal(await page.getByLabel('查看者',{exact:true}).isChecked(),true);
 await page.locator('#confirm-dialog').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
 assert.deepEqual(requests.find(r=>r.method==='PUT'&&r.path.endsWith('/spaces/design/members')).body,{member_id:'designer',role_ids:['viewer','assets']});
 assert.deepEqual(errors,[]);
});
