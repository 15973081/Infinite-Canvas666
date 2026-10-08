(() => {
  'use strict';
  const node = (tag, text) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
  let frameCounter=0;
  window.CanvasAccountData = {
    async show() {
      if (document.querySelector('.account-data-dialog')) return;
      if (!document.getElementById('account-data-style')) {
        const style=node('style'); style.id='account-data-style';
        style.textContent='.account-data-dialog{width:min(640px,calc(100vw - 32px));box-sizing:border-box;max-height:85vh;overflow:auto;padding:20px;background:var(--studio-panel,#fff);color:var(--studio-text,#222);border:1px solid var(--studio-border,#ddd);font:14px var(--studio-font,sans-serif)}.account-data-dialog::backdrop{background:#0008}.account-data-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.account-data-dialog h2{font-size:18px;margin:0}.account-data-dialog p{line-height:1.7;overflow-wrap:anywhere}.account-data-dialog button{padding:8px 12px;margin:8px 8px 0 0;color:inherit;background:var(--studio-page,#eee);border:1px solid var(--studio-border,#ddd);font:inherit;cursor:pointer}.account-data-dialog form{margin-top:16px}.account-data-dialog label{display:block;margin:12px 0}.account-data-dialog input:not([type=hidden]){display:block;width:100%;box-sizing:border-box;min-height:40px;padding:8px;margin-top:6px;font:inherit;color:inherit;background:var(--studio-page,#eee);border:1px solid var(--studio-border,#ddd)}.account-data-dialog button{max-width:100%;white-space:normal}.account-data-dialog :focus-visible{outline:2px solid var(--studio-focus,#779366);outline-offset:2px}';
        document.head.append(style);
      }
      const returnFocus=document.activeElement, boundMember=window.CanvasSession?.context?.member?.id;
      const dialog=node('dialog'); dialog.className='account-data-dialog'; dialog.setAttribute('aria-label','个人数据');
      const head=node('header'), close=node('button','关闭'); close.type='button'; close.onclick=()=>dialog.close();
      head.append(node('h2','个人数据'),close); const body=node('div'), status=node('p'); status.setAttribute('role','status');
      dialog.append(head,body,status); document.body.append(dialog); dialog.showModal();
      dialog.addEventListener('close',()=>{dialog.remove();if(returnFocus?.isConnected)returnFocus.focus();},{once:true});
      const refresh=node('button','重试读取'); refresh.type='button'; refresh.hidden=true;
      dialog.append(refresh);
      async function load(){
        refresh.disabled=true;status.textContent='读取本人跨空间数据…';
        try {
          const response=await fetch('/api/account/data',{headers:boundMember?{'X-Member-ID':boundMember}:{},cache:'no-store'}), data=await response.json();
          if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'个人数据读取失败，请检查登录状态后重试。');
          if(!dialog.isConnected)return;
          if(boundMember&&data.member.id!==boundMember)throw Error('登录账号已变化，请重新打开个人数据。');
          const size=data.bytes>=1024**2?(data.bytes/1024**2).toFixed(1)+' MB':Math.ceil(data.bytes/1024)+' KB';
          body.replaceChildren(node('p',data.member.display_name+' · '+data.member.username),
            node('p','本人对话 '+data.conversations+' 个，附件及预览 '+data.objects+' 个，约 '+size+'。'),
            node('p','对话保存在服务器数据库，附件保存在服务器私有对象存储。统计与导出包含各空间本人数据，包括已归档或已退出空间中的本人记录。'));
          for(const item of data.retained)body.append(node('p',item));
          const form=node('form'), frame=node('iframe'), member=node('input'), submit=node('button','导出本人数据（ZIP）');
          frame.name='personal-export-'+(++frameCounter);frame.hidden=true;frame.title='个人数据导出结果';
          form.action='/api/account/data/export';form.method='POST';form.target=frame.name;
          member.type='hidden';member.name='member_id';member.value=data.member.id;submit.type='submit';
          form.append(member,submit);body.append(form,frame);
          form.onsubmit=()=>{submit.disabled=true;status.textContent='导出请求已提交，完成后浏览器会下载 ZIP；请保持页面打开。对话或附件变化时需重新导出。';};
          frame.onload=()=>{
            try{const text=frame.contentDocument?.body?.innerText;if(!text)return;
              const error=JSON.parse(text);status.textContent=typeof error.detail==='string'?error.detail:'导出失败，请检查登录状态后重试。';submit.disabled=false;
            }catch{status.textContent='导出失败，请重试。';submit.disabled=false;}
          };
          const closure=node('form'), password=node('input'), confirmation=node('input'), closeAccount=node('button','注销账号并清理本人数据');
          const passwordLabel=node('label','账号密码'), confirmLabel=node('label','输入“注销并删除本人数据”');
          password.type='password';password.autocomplete='current-password';password.required=true;password.minLength=12;password.maxLength=256;
          confirmation.type='text';confirmation.required=true;confirmation.maxLength=40;
          passwordLabel.append(password);confirmLabel.append(confirmation);closeAccount.type='submit';
          closure.append(node('h3','注销账号'),node('p','注销后无法登录，清理本人对话、Skill 快照及未被他人引用的附件。共享画布、已发布 Skill、费用和必要审计保留；最后管理员、进行中的任务或他人引用会阻止注销。请先导出需要保留的数据。'),passwordLabel,confirmLabel,closeAccount);
          closure.onsubmit=async event=>{
            event.preventDefault();
            if(confirmation.value!=='注销并删除本人数据'){status.textContent='请完整输入确认文字。';return;}
            closeAccount.disabled=true;status.textContent='正在核对注销条件…';
            try{
              if(window.FrontendVersion?.flushPages && !await window.FrontendVersion.flushPages())throw Error('画布保存尚未完成，请先保存再注销。');
              const response=await fetch('/api/account/data/close',{method:'POST',headers:{'Content-Type':'application/json','X-Member-ID':data.member.id},body:JSON.stringify({password:password.value,confirmation:confirmation.value})});
              const result=await response.json();password.value='';
              if(!response.ok){const code=result.detail?.code;throw Error(typeof result.detail==='string'?result.detail:code==='last_platform_administrator'||code==='last_workspace_administrator'?'你是最后一位管理员，请先完成管理员交接。':'注销失败，请核对登录状态和注销条件后重试。');}
              if(!result.closed)throw Error('注销尚未完成，请重试。');
              closure.replaceChildren(node('p',result.message));submit.disabled=true;refresh.hidden=true;
              status.textContent='本人账号已注销。待清理附件 '+result.pending_attachments+' 个，后台会继续重试。';
              const login=node('a','返回登录页');login.href='/login';closure.append(login);
            }catch(error){password.value='';status.textContent=error.message;closeAccount.disabled=false;}
          };
          body.append(closure);
          status.textContent='ZIP 包含本人对话、其中的 Skill 快照、附件原文件及预览、个人启用偏好；不会导出他人的原文件。';refresh.hidden=true;
        }catch(error){status.textContent=error.message;refresh.hidden=false;}
        finally{refresh.disabled=false;}
      }
      refresh.onclick=load;await load();
    }
  };
})();
