/* Account UI uses the bound member session; reference pricing is preview-only. */
(() => {
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
  const points=n=>BigInt(n).toLocaleString('zh-CN');
  // Lucide 0.468.0 (ISC); see static/vendor/licenses/lucide-0.468.0-LICENSE.
  const iconMarkup={
    "user": `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
  <circle cx="12" cy="7" r="4" />`,
    "coins": `<circle cx="8" cy="8" r="6" />
  <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
  <path d="M7 6h1v4" />
  <path d="m16.71 13.88.7.71-2.82 2.82" />`,
    "receipt-text": `<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
  <path d="M14 8H8" />
  <path d="M16 12H8" />
  <path d="M13 16H8" />`,
    "arrow-left-right": `<path d="M8 3 4 7l4 4" />
  <path d="M4 7h16" />
  <path d="m16 21 4-4-4-4" />
  <path d="M20 17H4" />`,
    "list-checks": `<path d="m3 17 2 2 4-4" />
  <path d="m3 7 2 2 4-4" />
  <path d="M13 6h8" />
  <path d="M13 12h8" />
  <path d="M13 18h8" />`,
    "building-2": `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
  <path d="M10 6h4" />
  <path d="M10 10h4" />
  <path d="M10 14h4" />
  <path d="M10 18h4" />`,
    "zap": `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />`,
    "lock": `<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
  <path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
    "file-text": `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  <path d="M10 9H8" />
  <path d="M16 13H8" />
  <path d="M16 17H8" />`,
    "x": `<path d="M18 6 6 18" />
  <path d="m6 6 12 12" />`,
    "chevron-right": `<path d="m9 18 6-6-6-6" />`
  };
  const iconNames={profile:'user',topup:'coins',invoice:'receipt-text',credits:'arrow-left-right',tasks:'list-checks',enterprise:'building-2'};
  function icon(kind){
    const name=iconNames[kind]||kind;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    const attrs={xmlns:'http://www.w3.org/2000/svg',width:'24',height:'24',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.75','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false','data-account-icon':name};
    for(const [key,value] of Object.entries(attrs))svg.setAttribute(key,value);
    svg.innerHTML=iconMarkup[name];
    return svg;
  }
  const tabs=[['profile','个人资料'],['topup','积分充值'],['invoice','账单发票'],['credits','积分明细'],['tasks','任务明细'],['enterprise','企业认证']];
  function style(){for(const [id,href] of [['account-panel-style','/static/css/account-panel.css'],['billing-view-style','/static/css/billing-view.css']])if(!document.getElementById(id)){const s=el('link');s.id=id;s.rel='stylesheet';s.href=href;document.head.append(s);}}
  function lockDocumentScroll(){
    const root=document.documentElement,body=document.body;
    const properties=[[root,'overflow'],[root,'scrollbar-gutter'],[body,'overflow']];
    const saved=properties.map(([node,key])=>[node,key,node.style.getPropertyValue(key),node.style.getPropertyPriority(key)]);
    if(innerWidth>root.clientWidth&&getComputedStyle(root).scrollbarGutter==='auto')root.style.setProperty('scrollbar-gutter','stable');
    root.style.setProperty('overflow','hidden');body.style.setProperty('overflow','hidden');
    return ()=>{for(const [node,key,value,priority]of saved){if(value)node.style.setProperty(key,value,priority);else node.style.removeProperty(key);}};
  }
  let current;
  async function show(initial='profile'){
    await import('/static/js/credit-balance-store.js');
    await import('/static/js/studio-select.js');
    if(current?.dialog.open){await current.select(initial);current.dialog.focus();return;}
    const session=window.CanvasSession, member=session?.context?.member;
    if(!member?.id||session.paused)throw Error('请重新登录后打开账户管理。');
    style();
    const walletStore=window.CanvasCreditBalance;
    const previous=document.activeElement, dialog=el('dialog',undefined,'account-panel');dialog.setAttribute('aria-label','账户管理');
    const head=el('header'), close=button('',()=>attemptClose(),'account-close');close.append(icon('x'));close.setAttribute('aria-label','关闭账户管理');
    head.append(el('h2','账户管理'),close);
    const layout=el('div',undefined,'account-layout'),nav=el('nav',undefined,'account-nav'),main=el('main',undefined,'account-main');nav.setAttribute('aria-label','账户管理栏目');
    const identity=el('div',undefined,'account-identity'),avatar=el('span',undefined,'account-avatar'),identityText=el('div'),name=el('strong',member.display_name),login=el('small',member.username||member.id),balance=el('div','积分余额：—','account-balance');
    avatar.append(icon('user'));avatar.dataset.color=member.avatar||'';
    identityText.append(name,login);identity.append(avatar,identityText,balance);
    const body=el('div',undefined,'account-content');main.append(identity,body);layout.append(nav,main);dialog.append(head,layout);
    let selected='',version=0,controller,dispose=()=>{},dirty=false,saving=false,stopped=false;
    const active=()=>!stopped&&!session.paused&&session.context?.member?.id===member.id;
    const assertActive=()=>{if(!active())throw Error('登录状态已变化，请重新打开账户管理。');};
    async function request(path,options={}){
      assertActive();const response=await fetch(path,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...options.headers,'X-Member-ID':member.id}});
      assertActive();if(!response.ok){const error=Error(response.status===400?'请检查筛选条件。':'读取失败，请稍后重试。');error.status=response.status;throw error;}return response.json();
    }
    const unsubscribeBalance=walletStore.subscribe(wallet=>{if(active()&&wallet)balance.textContent='积分余额： '+points(wallet.total_balance);});
    const pause=()=>{unsubscribeBalance();stopped=true;version++;controller?.abort();dispose();identity.replaceChildren();body.replaceChildren(el('p','登录状态已变化，请关闭后重新确认登录。','account-empty'));nav.querySelectorAll('button').forEach(b=>b.disabled=true);dirty=false;saving=false;close.disabled=false;};
    const profileChanged=()=>{if(active()){name.textContent=session.context.member.display_name;login.textContent=session.context.member.username||member.id;avatar.dataset.color=session.context.member.avatar||'';}};
    function attemptClose(){if(saving)return;if(dirty&&!window.confirm('资料尚未保存，确定关闭？'))return;dialog.close();}
    dialog.addEventListener('cancel',e=>{e.preventDefault();attemptClose();});
    for(const type of ['keydown','mousedown','wheel','dblclick'])dialog.addEventListener(type,e=>e.stopPropagation());
    dialog.addEventListener('close',()=>{restoreScroll();unsubscribeBalance();stopped=true;version++;controller?.abort();dispose();window.removeEventListener('member-session:paused',pause);window.removeEventListener('member-session:profile',profileChanged);dialog.remove();if(current?.dialog===dialog){current=null;if(previous?.isConnected)previous.focus();else document.querySelector('.member-session-account > summary')?.focus();}},{once:true});
    window.addEventListener('member-session:paused',pause);window.addEventListener('member-session:profile',profileChanged);
    async function refreshBalance(){try{await walletStore.refresh();}catch(_){if(active())balance.replaceChildren(button('余额读取失败 · 重试',refreshBalance));}}
    function profile(){
      const form=el('form',undefined,'account-profile'),title=el('h3','个人资料'),label=el('label','昵称'),input=el('input');input.value=session.context.member.display_name;input.required=true;input.maxLength=80;label.append(input);
      const colors=el('label','头像颜色'),color=el('select');for(const [value,text] of [['','默认'],['blue','蓝色'],['green','绿色'],['purple','紫色'],['orange','橙色'],['pink','粉色']])color.append(new Option(text,value));color.value=session.context.member.avatar||'';colors.append(color);
      const message=el('p','','account-status');message.setAttribute('role','status');const save=el('button','保存资料','account-primary');save.type='submit';
      form.append(title,label,colors,el('p','登录账号：'+(session.context.member.username||member.id),'account-muted'),el('p','账号 ID：'+member.id,'account-muted'),message,save,
        button('导出个人数据 / 注销账号',async()=>{if(dirty&&!window.confirm('资料尚未保存，确定离开？'))return;dialog.close();await import('/static/js/account-data.js');await window.CanvasAccountData.show();},'account-data-link'));
      form.oninput=()=>dirty=true;
      form.onsubmit=async e=>{e.preventDefault();if(saving)return;input.setCustomValidity(input.value.trim()?'':'请输入昵称');if(!form.reportValidity())return;
        saving=true;[save,input,color,close].forEach(n=>n.disabled=true);message.textContent='正在保存…';
        try{assertActive();await session.updateProfile({display_name:input.value.trim(),avatar:color.value});assertActive();dirty=false;message.textContent='资料已保存';}
        catch(error){message.textContent=error.message;}finally{saving=false;[save,input,color,close].forEach(n=>n.disabled=false);}};
      input.addEventListener('input',()=>input.setCustomValidity(''));body.append(form);
    }
    function topup(){
      const block=el('div'),note=el('p','充值方案预览 · 支付暂未开放，选择金额不会创建订单或增加余额。','account-muted'),grid=el('div',undefined,'account-topup-grid'),left=el('div'),cards=el('div',undefined,'account-plans'),right=el('aside',undefined,'account-topup-summary');
      const plans=[[69,15],[399,30],[2499,50],[4999,70]];
      const amountLabel=el('label','其他金额'),amount=el('input');amount.type='number';amount.min='1';amount.max='1000000';amount.step='1';amount.value='69';amount.setAttribute('aria-label','其他金额');amountLabel.append(amount);
      function render(){
        const value=Number(amount.value);right.replaceChildren();
        cards.querySelectorAll('button').forEach((b,i)=>{const on=value===plans[i][0];b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
        if(!Number.isInteger(value)||value<1||value>1000000){right.append(el('p','请输入 1 至 1,000,000 元的整数进行预览。'));return;}
        const rate=[...plans].reverse().find(p=>value>=p[0])?.[1]||0,base=BigInt(value)*15n,gift=base*BigInt(rate)/100n;
        for(const [label,text] of [['充值积分',points(base)],['赠送积分',points(gift)],['首充加赠','资格未接入，暂不计入'],['预计到账积分',points(base+gift)],['预览金额','¥'+value]]){const item=el('div');item.append(el('span',label),el('strong',text));right.append(item);}
        const unavailable=el('div',undefined,'account-payment-unavailable');const paymentIcon=el('span');paymentIcon.append(icon('lock'));unavailable.append(paymentIcon,el('strong','支付暂未开放'),el('small','开放后可在此查看支付方式。'));right.append(unavailable);
      }
      for(const [price,rate] of plans){const total=BigInt(price)*15n*(100n+BigInt(rate))/100n,b=button('',()=>{amount.value=String(price);render();},'account-plan');const credits=el('span',undefined,'account-plan-credits');credits.append(icon('zap'),document.createTextNode(points(total)+' 积分'));b.append(el('span','加赠 '+rate+'%','account-bonus'),credits,el('strong','¥'+price));b.setAttribute('aria-label',price+' 元充值方案');cards.append(b);}
      amount.oninput=render;const other=el('div',undefined,'account-topup-other'),coupon=button('优惠码 ',null);coupon.append(icon('chevron-right'));coupon.disabled=true;coupon.title='优惠码暂未开放';other.append(amountLabel,coupon);
      left.append(cards,other,el('p','¥1＝15 积分\n当前方案充值积分永久有效','account-muted'));grid.append(left,right);block.append(note,grid);body.append(block);render();
    }
    async function credits(stamp){
      const switches=el('div',undefined,'account-tabs'),content=el('div');body.append(switches,content);let tabVersion=0;
      async function choose(id){const generation=++tabVersion;dispose();dispose=()=>{};content.replaceChildren();switches.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===id);b.setAttribute('aria-selected',String(b.dataset.tab===id));});
        if(id!=='grants'){content.append(el('div',id==='usage'?'积分消费结算尚未接入，暂无可查询的扣分流水。':'创作助手积分结算尚未接入。已有调用费用可在任务明细中查看。','account-empty'));return;}
        await import('/static/js/credit-wallet.js');if(!active()||version!==stamp||generation!==tabVersion)return;
        const view=window.CanvasCreditWallet.create({isActive:active,fetchReport:(params,signal)=>request('/api/account/credits?'+new URLSearchParams(params),{signal})});dispose=view.dispose;content.append(view.element);
      }
      for(const [id,label] of [['usage','消耗明细'],['assistant','创作助手'],['grants','充值明细']]){const b=button(label,()=>void choose(id));b.dataset.tab=id;b.setAttribute('role','tab');switches.append(b);}switches.setAttribute('role','tablist');await choose('grants');
    }
    function tasks(stamp){
      const toolbar=el('div',undefined,'account-tabs'),status=el('select');status.setAttribute('aria-label','任务状态');
      const states={'':'全部状态',queued:'排队中',running:'执行中',submitting:'提交中',polling:'等待结果',finalizing:'保存结果',succeeded:'完成',failed:'失败',cancelled:'已取消',needs_review:'待核对'};
      for(const [v,l]of Object.entries(states))status.append(new Option(l,v));
      const results=el('div'),message=el('p','','account-status'),pager=el('div',undefined,'account-pager');message.setAttribute('role','status');let page=1,pages=1,seq=0;
      const prev=button('上一页',()=>load(page-1)),next=button('下一页',()=>load(page+1)),position=el('span');pager.append(prev,position,next);
      const refresh=button('刷新',()=>load(1));toolbar.append(status,refresh,button('查看使用费用',()=>void billing(stamp)));body.append(toolbar,message,results,pager);
      async function load(target=1){const n=++seq;prev.disabled=next.disabled=true;message.textContent='正在读取任务…';results.replaceChildren();
        try{const data=await request('/api/account/tasks?'+new URLSearchParams({status:status.value,page:target,page_size:25}),{signal:controller.signal});if(!active()||stamp!==version||n!==seq)return;
          page=data.page;pages=data.pages;position.textContent=page+' / '+pages;const table=el('table'),tr=el('tr'),thead=el('thead'),tbody=el('tbody');for(const t of ['任务 ID','模型 / 类型','创建时间','状态','积分消耗'])tr.append(el('th',t));thead.append(tr);table.append(thead,tbody);
          for(const row of data.entries){const line=el('tr');for(const value of [row.id,(row.model||'—')+' / '+row.kind,new Date(row.created_at).toLocaleString('zh-CN'),states[row.status]||row.status,'未接入积分结算'])line.append(el('td',value));tbody.append(line);}const scroll=el('div',undefined,'account-table-scroll');scroll.append(table);results.append(data.entries.length?scroll:el('div','暂无任务记录','account-empty'));message.textContent='共 '+data.records+' 个本人发起的任务';
        }catch(error){if(active()&&stamp===version&&n===seq)message.textContent=error.message+' 请点击刷新重试。';}finally{if(n===seq){prev.disabled=page<=1;next.disabled=page>=pages;}}}
      status.onchange=()=>load(1);void load();
    }
    async function billing(stamp){
      body.replaceChildren(el('p','正在读取使用费用…'));await import('/static/js/billing-view.js');
      const view=await window.CanvasBillingUI.create({personal:true,fetchReport:params=>request('/api/account/billing?'+new URLSearchParams(params),{signal:controller.signal})});
      if(active()&&version===stamp)body.replaceChildren(el('h3','使用费用'),el('p','此处为既有费用记录，未换算为积分，也不是支付订单或发票。','account-muted'),view);
    }
    async function select(id){
      if(!active()||saving)return;if(dirty&&!window.confirm('资料尚未保存，确定切换栏目？'))return;dirty=false;
      selected=tabs.some(t=>t[0]===id)?id:'profile';const stamp=++version;controller?.abort();controller=new AbortController();dispose();dispose=()=>{};body.replaceChildren();
      nav.querySelectorAll('button').forEach(b=>{const on=b.dataset.tab===selected;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
      if(selected==='profile')profile();else if(selected==='topup')topup();else if(selected==='credits')await credits(stamp);else if(selected==='tasks')tasks(stamp);
      else {const title=selected==='invoice'?'账单发票':'企业认证';const empty=el('div',selected==='invoice'?'真实支付和开票服务尚未开放，暂无可申请的充值发票。':'企业认证服务尚未开放，暂不收集营业执照或认证材料。','account-empty'),mark=el('span',undefined,'account-empty-icon');mark.append(icon(selected==='invoice'?'file-text':'building-2'));empty.prepend(mark);body.append(el('h3',title),empty);if(selected==='invoice')body.append(button('查看使用费用',()=>void billing(stamp)));}
    }
    for(const [id,label] of tabs){const b=button('',()=>void select(id));b.dataset.tab=id;b.append(icon(id),el('span',label));nav.append(b);}
    document.body.append(dialog);current={dialog,select};dialog.showModal();
    const restoreScroll=lockDocumentScroll();
    void refreshBalance();await select(initial);window.StudioSelect.observe(dialog);
  }
  window.CanvasAccountPanel={show};
})();
