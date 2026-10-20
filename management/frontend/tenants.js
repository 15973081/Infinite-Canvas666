(() => {
'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const field=(title,name,type='text')=>{const l=el('label',title),i=el('input');i.name=name;i.type=type;i.required=true;i.maxLength=type==='email'?254:256;l.append(i);return l;};
const select=(title,name,rows)=>{const l=el('label',title),s=el('select');s.name=name;for(const [value,label] of rows)s.append(new Option(label,value));l.append(s);return l;};
let selected='';
async function create({api,dialog,table,button,refresh}){
 const root=el('div',undefined,'tenant-console'),data=await api('/api/tenants');
 const post=(path,body,method='POST')=>api(path,{method,body:JSON.stringify(body)});
 const bar=el('div',undefined,'toolbar');bar.append(button('刷新企业',refresh));
 bar.append(button('接受企业邀请',()=>invitation(api,refresh,true)));
 if(data.can_create)bar.prepend(button('创建企业',()=>dialog('创建企业',[field('企业名称','name'),field('管理员登录账号','administrator')],f=>post('/api/tenants',Object.fromEntries(f))),'primary'));
 root.append(bar);
 const tenant=data.tenants.find(t=>t.id===selected);
 if(!tenant){
  root.append(el('p','企业是数据与权限边界，空间用于分配协作成员和资源。企业费用按空间归集，暂不启用积分扣费。','muted'));
  root.append(table(['企业','状态','成员','空间','角色','操作'],data.tenants.map(t=>[t.name,t.status==='active'?'已启用':'已停用',t.members,t.spaces,data.can_create?'平台管理':t.role==='admin'?'企业管理员':'成员',data.can_create||t.role==='admin'?button('管理企业',()=>{selected=t.id;return refresh();}):'请由企业管理员分配空间'])));
  if(!data.tenants.length)root.append(el('p','尚未加入企业。请接受邮箱邀请，或由平台管理员创建企业。','empty'));
  return root;
 }
 bar.prepend(button('返回企业列表',()=>{selected='';return refresh();}));
 const detail=await api('/api/tenants/'+selected),tid=selected,base='/api/tenants/'+encodeURIComponent(tid),company=detail.tenant;
 const heading=el('section',undefined,'card overview-banner');heading.append(el('h2',company.name),el('p','企业状态：'+(company.status==='active'?'已启用':'已停用')+' · '+detail.members.length+' 位成员 · '+detail.spaces.length+' 个空间'));root.append(heading);
 const nameField=field('企业名称','name');nameField.querySelector('input').value=company.name;
 bar.append(button('企业设置',()=>dialog('企业设置',[nameField,select('状态','status',detail.can_suspend?[['active','启用'],['disabled','停用']]:[[company.status,company.status==='active'?'启用':'停用']])],f=>post(base,{name:f.get('name'),status:f.get('status'),version:company.version},'PUT'))));
 const tabs=el('div',undefined,'management-tabs');tabs.setAttribute('role','tablist');const panels=[];
 const activate=index=>{panels.forEach((p,i)=>p.hidden=i!==index);Array.from(tabs.children).forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));};
 root.append(tabs);for(const title of ['企业成员','空间分配','模型授权','企业费用']){const index=panels.length,panel=el('section');panel.setAttribute('role','tabpanel');panels.push(panel);const b=button(title,()=>activate(index));b.setAttribute('role','tab');tabs.append(b);root.append(panel);}activate(0);
 const people=panels[0],inviteBar=el('div',undefined,'toolbar');
 const invite=button('邀请成员',()=>dialog('发送企业邀请',[field('受邀邮箱','email','email'),select('企业角色','role',[['member','普通成员'],['admin','企业管理员']])],f=>post(base+'/invitations',Object.fromEntries(f))),'primary');invite.disabled=!data.delivery_configured;inviteBar.append(invite);people.append(inviteBar);
 if(!data.delivery_configured)people.append(el('p','邮件发送服务尚未配置，暂不能发送邀请。请配置 SMTP 后使用。','muted'));
 people.append(table(['成员','已验证邮箱','账号状态','企业角色','操作'],detail.members.map(m=>[m.display_name+' / '+m.username,m.email||'未绑定',m.status,m.role==='admin'?'企业管理员':'普通成员',button('调整角色',()=>dialog('调整企业成员',[el('p',m.display_name+'（'+m.username+'）'),select('角色','role',[['member','普通成员'],['admin','企业管理员'],['remove','移出企业']])],f=>post(base+'/members/'+encodeURIComponent(m.id),{role:f.get('role')},'PUT')))])));
 if(detail.invitations.length){people.append(el('h2','最近邀请'));people.append(table(['邮箱','角色','有效期','状态'],detail.invitations.map(i=>[i.email,i.role==='admin'?'管理员':'成员',new Date(i.expires_at).toLocaleString(),i.consumed_at?'已处理 / 已撤销':new Date(i.expires_at)>new Date()?'待接受':'已过期'])));}
 const memberChoices=detail.members.filter(m=>m.status==='active').map(m=>[m.id,m.display_name+' / '+m.username]);
 panels[1].append(button('创建空间',()=>dialog('创建企业空间',[field('空间名称','name'),select('空间管理员','administrator',memberChoices)],f=>post(base+'/spaces',Object.fromEntries(f))),'primary'));
 panels[1].append(el('p','成员加入企业后，还需分配空间权限。移出空间不会删除企业资源。','muted'));
 panels[1].append(table(['空间','状态','操作'],detail.spaces.map(w=>[w.name,w.status==='active'?'启用':'归档',button('分配成员',()=>dialog('分配空间 · '+w.name,[select('企业成员','member_id',memberChoices),select('空间权限','role',[['viewer','查看者'],['editor','编辑者'],['admin','空间管理员'],['remove','移出此空间']])],f=>post(base+'/spaces/'+encodeURIComponent(w.id)+'/members',Object.fromEntries(f),'PUT')))])));
 const models=await api(base+'/models');
 if(models.legacy)panels[2].append(el('p','默认企业保留现有供应商分配。新建企业使用“平台授权给企业 → 企业分配给空间”的模型权限。','muted'));
 else {
  const key=m=>JSON.stringify([m.provider_id,m.kind,m.model]);
  const editor=(workspace=null)=>{
   const selectedModels=workspace?models.space_grants.filter(g=>g.workspace_id===workspace):models.grants;
   const choices=workspace?models.catalog.filter(m=>models.grants.some(g=>key(g)===key(m))):models.catalog;
   const box=el('div',undefined,'permissions');choices.forEach(m=>{const l=el('label',undefined,'check'),i=el('input');i.type='checkbox';i.name='model';i.value=key(m);i.checked=selectedModels.some(g=>key(g)===key(m));l.append(i,el('span',m.provider_name+' / '+m.kind+' / '+m.model));box.append(l);});
   if(!choices.length)box.append(el('p','暂无可分配模型，请先由平台管理员授权。'));
   dialog(workspace?'分配空间模型':'企业模型授权',[box],f=>post(base+'/models',{workspace,models:f.getAll('model').map(v=>{const [provider_id,kind,model]=JSON.parse(v);return {provider_id,kind,model};})},'PUT'),'保存模型授权',true);
  };
  if(models.can_grant)panels[2].append(button('配置企业模型',()=>editor(), 'primary'));
  panels[2].append(table(['供应商','类型','已授权模型'],models.grants.map(m=>[models.catalog.find(c=>key(c)===key(m))?.provider_name||m.provider_id,m.kind,m.model])));
  panels[2].append(table(['空间','模型分配'],detail.spaces.map(w=>[w.name,button('选择模型',()=>editor(w.id))])));
 }
 panels[3].append(el('p','仅统计本企业所属空间。个人积分与历史个人资产不转入企业，不启用积分扣费。','muted'));
 panels[3].append(await window.CanvasBillingUI.create({management:true,fetchReport:p=>api(base+'/billing?'+new URLSearchParams(p))}));
 return root;
}
async function account({api}){
 const root=el('section',undefined,'card account-email'),state=await api('/api/account/email');
 root.append(el('h2','邮箱与登录'),el('p',state.email?'已验证邮箱：'+state.email:'尚未绑定邮箱'),el('p','验证后的邮箱可用于密码登录和找回密码。更换邮箱需校验当前密码。','muted'));
 if(!state.delivery_configured){root.append(el('p','邮件服务尚未配置，请联系平台管理员配置 SMTP。','empty'));return root;}
 const form=el('form'),email=field('新邮箱','email','email'),password=field('当前密码','password','password'),code=field('邮箱验证码','code');code.hidden=true;code.querySelector('input').required=false;code.querySelector('input').maxLength=6;
 const status=el('p'),send=el('button','发送验证码','primary');send.type='submit';let challenge=null;
 form.append(email,password,code,send,status);root.append(form);
 form.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{const values=Object.fromEntries(new FormData(form));if(!challenge){const result=await api('/api/account/email/start',{method:'POST',body:JSON.stringify({email:values.email,password:values.password})});challenge=result.challenge_id;email.querySelector('input').disabled=password.querySelector('input').disabled=true;code.hidden=false;code.querySelector('input').required=true;send.textContent='验证并绑定';status.textContent='验证码已发送，10 分钟内有效。';}else{await api('/api/account/email/confirm',{method:'POST',body:JSON.stringify({challenge_id:challenge,code:values.code})});root.replaceChildren(el('h2','邮箱绑定成功'),el('p','现在可以使用该邮箱和密码登录。'));}}catch(error){status.textContent=error.message;}finally{send.disabled=false;}};
 return root;
}
function authPanel(title){const d=el('dialog',undefined,'account-auth-dialog'),form=el('form'),message=el('p'),close=el('button','关闭');close.type='button';close.onclick=()=>d.close();d.append(el('h2',title),form,message,close);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();return {d,form,message};}
function reset(api){const {form,message}=authPanel('通过邮箱找回密码');const email=field('已验证邮箱','email','email'),code=field('验证码','code'),password=field('新密码（至少 12 位）','password','password'),send=el('button','发送验证码','primary');code.hidden=password.hidden=true;code.querySelector('input').required=password.querySelector('input').required=false;form.append(email,code,password,send);let challenge;
 form.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{const f=Object.fromEntries(new FormData(form));if(!challenge){const r=await api('/api/auth/password/start',{method:'POST',body:JSON.stringify({email:f.email})});challenge=r.challenge_id;email.querySelector('input').disabled=true;code.hidden=password.hidden=false;code.querySelector('input').required=password.querySelector('input').required=true;send.textContent='重置密码';message.textContent='若邮箱已绑定有效账号，将收到验证码。有效期 10 分钟。';}else{await api('/api/auth/password/confirm',{method:'POST',body:JSON.stringify({challenge_id:challenge,code:f.code,password:f.password})});form.hidden=true;message.textContent='密码已重置，请使用新密码登录。';}}catch(error){message.textContent=error.message;}finally{send.disabled=false;}};
}
function invitation(api,refresh,logged=false){const {form,message}=authPanel('接受企业邀请');form.append(field('邮件中的邀请凭证','token'));if(!logged)form.append(el('p','已有账号请先登录工作台，在账号菜单“邮箱与企业邀请”中绑定受邀邮箱并接受邀请。以下信息仅用于创建新账号。','muted'),field('新账号','username'),field('显示名称','display_name'),field('设置密码（至少 12 位）','password','password'));const send=el('button','确认加入企业','primary');form.append(send);form.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{await api('/api/auth/invitations/accept',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.hidden=true;message.textContent='已加入企业。'+(logged?'刷新页面查看企业和空间。':'请使用新账号或邮箱登录。');if(logged)await refresh();}catch(error){message.textContent=error.message;}finally{send.disabled=false;}};}
window.ManagementTenants={create,account,reset,invitation};
})();
