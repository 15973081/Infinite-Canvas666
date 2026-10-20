(() => {
'use strict';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
window.CanvasAccountEmail={async show(memberId){
 const member=memberId || window.CanvasSession?.context?.member.id;
 const api=async(path,body)=>{const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(member?{'X-Member-ID':member}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(({email_not_configured:'邮件服务尚未配置。',email_delivery_failed:'邮件发送失败，请稍后重试。',email_rate_limited:'操作过于频繁，请稍后重试。',invalid_credentials:'当前密码不正确。',invalid_email:'邮箱格式不正确。',email_unavailable:'邮箱不可绑定。',invalid_email_code:'验证码无效、已过期或尝试次数已达上限。',invitation_email_mismatch:'请先验证受邀邮箱。',invalid_invitation:'邀请已失效。',member_identity_changed:'登录账号已改变，请重新打开。'})[d.detail?.code]||'操作失败，请刷新后重试。');return d;};
 const state=await api('/api/account/email');
 if(!document.getElementById('account-email-style')){const css=el('link');css.id='account-email-style';css.rel='stylesheet';css.href='/static/css/account-email.css';document.head.append(css);}
 const dialog=el('dialog'),head=el('header'),close=el('button','关闭');dialog.className='account-email-dialog';dialog.setAttribute('aria-label','邮箱与企业邀请');close.onclick=()=>dialog.close();head.append(el('h2','邮箱与企业邀请'),close);dialog.append(head,el('p',state.email?'已验证邮箱：'+state.email:'尚未绑定邮箱'));
 const field=(title,name,type='text')=>{const label=el('label',title),input=el('input');input.name=name;input.type=type;input.required=true;input.maxLength=256;label.append(input);return label;};
 const message=el('p');message.setAttribute('role','status');
 if(state.delivery_configured){const form=el('form'),email=field('新邮箱','email','email'),password=field('当前密码','password','password'),code=field('验证码','code'),submit=el('button','发送验证码');code.hidden=true;code.querySelector('input').required=false;let challenge;
 form.append(email,password,code,submit);dialog.append(form);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const f=Object.fromEntries(new FormData(form));if(!challenge){const r=await api('/api/account/email/start',{email:f.email,password:f.password});challenge=r.challenge_id;email.querySelector('input').disabled=password.querySelector('input').disabled=true;code.hidden=false;code.querySelector('input').required=true;submit.textContent='验证并绑定';message.textContent='验证码已发送，10 分钟内有效。';}else{await api('/api/account/email/confirm',{challenge_id:challenge,code:f.code});form.hidden=true;message.textContent='邮箱绑定成功，可使用该邮箱和密码登录。';}}catch(error){message.textContent=error.message;}finally{submit.disabled=false;}};
 }else dialog.append(el('p','邮件服务尚未配置，暂不能绑定邮箱。'));
 const invite=el('form'),token=field('邮件中的企业邀请凭证','token'),join=el('button','接受企业邀请');invite.append(el('h3','加入企业'),token,join);invite.onsubmit=async e=>{e.preventDefault();join.disabled=true;try{await api('/api/account/invitations/accept',{token:new FormData(invite).get('token')});message.textContent='已加入企业。请等待管理员分配空间，保存当前工作后刷新空间列表。';invite.hidden=true;}catch(error){message.textContent=error.message;}finally{join.disabled=false;}};dialog.append(invite,message);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}};
})();
