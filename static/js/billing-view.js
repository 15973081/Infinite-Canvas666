/* Shared expense view: safe text rendering and integer-micro currency formatting. */
(() => {
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const money=(value,currency='CNY')=>{const n=BigInt(value||0),sign=n<0n?'-':'',v=n<0n?-n:n;const fraction=(v%1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(2,'0');return (currency==='CNY'?'¥':currency+' ')+sign+(v/1000000n)+'.'+fraction;};
  function style(){if(document.getElementById('billing-view-style'))return;const s=el('link');s.id='billing-view-style';s.rel='stylesheet';s.href='/static/css/billing-view.css?v=2026.09.16.1';document.head.append(s);}
  async function create({fetchReport,personal=false,assignmentApi=null}){
    style();const root=el('section',undefined,'billing-view'),toolbar=el('form',undefined,'billing-toolbar'),body=el('div',undefined,'billing-results'),overview=el('div',undefined,'billing-overview'),message=el('p','','billing-note billing-message');message.setAttribute('role','status');
    root.classList.toggle('billing-personal',personal); toolbar.setAttribute('aria-label','费用筛选');
    let page=1,member='',request=0,params={};
    function field(title,type='text'){const label=el('label',title),input=el('input');input.type=type;input.setAttribute('aria-label',title);label.append(input);toolbar.append(label);return input;}
    const from=field('开始时间','datetime-local'),to=field('结束时间（不含）','datetime-local'),canvas=field('画布名称或 ID');
    let account,space;
    if(!personal)account=field('账号或昵称');
    else {const label=el('label','空间');space=el('select');space.setAttribute('aria-label','费用空间');space.append(new Option('全部历史空间',''));label.append(space);toolbar.append(label);}
    canvas.placeholder='搜索画布名称或 ID';
    const submit=el('button','查询','billing-primary');submit.type='submit';toolbar.append(submit);
    const clear=el('button','重置','billing-reset');clear.type='button';clear.onclick=()=>{from.value=to.value=canvas.value='';if(account)account.value='';if(space)space.value='';member='';page=1;params={};void load();};toolbar.append(clear);
    const scopeNote=el('p',personal?'仅统计当前账号 · 包含补录及已删除画布的历史费用':'按费用归属账号统计；停用账号与已删除画布的记录仍保留。','billing-note billing-scope');
    const filterHead=el('div',undefined,'billing-section-head');filterHead.append(el('h2','筛选记录'),el('span',personal?'按时间、画布或空间查找':'按时间、画布或账号查找','billing-note'));
    const filters=el('section',undefined,'billing-filters');filters.append(filterHead,toolbar,el('p','按任务创建时间筛选 · 浏览器本地时区 · 结束时间不含','billing-note'));
    root.append(scopeNote,overview,filters,message,body);
    function table(heads,rows){const wrap=el('div',undefined,'billing-scroll'),t=el('table'),head=el('tr');heads.forEach(h=>{const th=el('th',h);th.scope='col';head.append(th);});const thead=el('thead');thead.append(head);t.append(thead);const tb=el('tbody');rows.forEach(cells=>{const tr=el('tr');cells.forEach((v,index)=>{const td=el('td');td.dataset.label=heads[index];td.append(v instanceof Node?v:document.createTextNode(String(v??'')));tr.append(td);});tb.append(tr);});t.append(tb);wrap.append(t);return wrap;}
    function action(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
    toolbar.onsubmit=e=>{e.preventDefault();params={canvas_query:canvas.value.trim()};if(account)params.account_query=account.value.trim();if(space&&space.value)params.workspace=space.value;if(from.value)params.from_ms=new Date(from.value).getTime();if(to.value){params.to_ms=new Date(to.value).getTime();}member='';page=1;void load();};
    async function load(){const stamp=++request;submit.disabled=true;submit.textContent='查询中…';root.setAttribute('aria-busy','true');message.textContent='正在读取费用…';message.className='billing-note billing-message';try{
      const data=await fetchReport({...params,page,...(member?{member_id:member}:{})});if(stamp!==request)return;page=data.page;body.replaceChildren();
      if(space){const selected=space.value;space.replaceChildren(new Option('全部历史空间',''));(data.workspaces||[]).forEach(w=>space.append(new Option(w.name,w.id)));space.value=selected;}
      message.textContent='';
      overview.replaceChildren();
      const totals=el('div',undefined,'billing-totals');
      data.totals.forEach(t=>{
        const card=el('div',undefined,'billing-total'),label=el('div',undefined,'billing-total-label');
        label.append(el('span','计费金额（折后）'),el('span',t.currency,'billing-currency'));
        card.append(label,el('strong',money(t.amount_micros,t.currency)),el('small','待核算金额未计入'));
        card.append(el('div','有明细的基础金额 '+money(t.base_amount_micros,t.currency)+' · 折扣减免 '+money(t.discount_amount_micros,t.currency),'billing-note'));if(t.missing_breakdown)card.append(el('div',t.missing_breakdown+' 条历史流水缺少折扣依据，保留原记录金额。','billing-note'));if(BigInt(t.estimated_micros||0))card.append(el('div','含估算 '+money(t.estimated_micros,t.currency),'billing-estimate'));
        totals.append(card);
      });
      const stats=el('div',undefined,'billing-stats');
      const metric=(label,value,note,cls='')=>{const item=el('div',undefined,'billing-stat '+cls);item.append(el('span',label),el('strong',String(value)),el('small',note));return item;};
      const unknown=data.totals.reduce((sum,t)=>sum+Number(t.unknown||0),0);
      stats.append(metric('费用记录',data.records,'当前筛选范围'),metric('待核算',unknown,unknown?'金额确认后计入费用':'暂无待核算记录',unknown?'billing-stat-pending':''));
      if(!personal){const unassigned=data.totals.reduce((sum,t)=>sum+Number(t.unassigned||0),0);stats.append(metric('待归属',unassigned,'尚未确认归属账号'));}
      if(data.totals.length)overview.append(totals);
      overview.append(stats);
      if(data.totals.length>1)overview.append(el('p','不同币种分别汇总，不合并换算。','billing-note billing-currency-note'));
      if(assignmentApi)body.append(action('按画布补录归属',()=>void assignmentDialog(assignmentApi,load)));
      if(!personal){body.append(el('h2','账号汇总'));if(member)body.append(action('返回全部账号',()=>{member='';page=1;void load();}));body.append(table(['账号','昵称','状态','费用','流水 / 待核算','操作'],data.accounts.map(a=>[a.username||'待归属',a.display_name,a.member_status==='disabled'?'已停用':a.member_status==='unknown'?'—':'有效',money(a.amount_micros,a.currency),a.records+' / '+a.unknown,action('查看明细',()=>{member=a.member_id||'unassigned';page=1;void load();})])));if(data.accounts_truncated)body.append(el('p','账号较多，请输入账号或昵称缩小范围。','billing-note'));}
      const detailHead=el('div',undefined,'billing-section-head');detailHead.append(el('h2','费用明细'),el('span',data.records+' 条记录','billing-record-count'));body.append(detailHead);
      if(!data.entries.length){const empty=el('div',undefined,'billing-empty');empty.append(el('span','暂无费用记录'),el('p','试试调整筛选条件，或在生成任务后回来查看。'));body.append(empty);}
      else body.append(table(personal?['时间','画布 / 空间','模型 / 类型','费用','状态','溯源']:['时间','账号','画布 / 空间','模型 / 类型','费用','状态','溯源'],data.entries.map(e=>{const origin=el('details',undefined,'billing-origin');origin.append(el('summary','查看详情'));const originList=el('dl');origin.append(originList);[['基础单价',e.unit_price||'未知'],['计费数量',e.quantity||'未知'],['计费规格',e.resolution||'未记录'],['价格生效时间',e.price_effective_from?new Date(Number(e.price_effective_from)).toLocaleString():'未记录'],['基础金额',e.base_amount_micros!=null?money(e.base_amount_micros,e.currency):'未记录'],['支付比例',e.discount_rate!=null?String(Number(e.discount_rate)*100)+'%':'未记录'],['折扣开始',e.discount_snapshot?.effective_from?new Date(e.discount_snapshot.effective_from).toLocaleString():'—'],['折扣结束（不含）',e.discount_snapshot?.effective_to?new Date(e.discount_snapshot.effective_to).toLocaleString():'—'],['折扣适用分辨率',e.discount_snapshot?.resolution?.toUpperCase()||'全部'],['折扣视频输入',typeof e.discount_snapshot?.has_video_input==='boolean'?(e.discount_snapshot.has_video_input?'有视频输入':'无视频输入'):'全部'],['折扣说明',e.discount_snapshot?.label||'—'],['流水 ID',e.id],['任务 ID',e.task_id||'未可靠关联'],['账号 ID',e.member_id||'待归属'],['任务账号快照',e.account_at_creation||'—'],['任务昵称快照',e.name_at_creation||'—'],['画布 ID',e.canvas_id||'独立任务'],['供应商',e.provider||'—'],['归属依据',e.attribution==='manual'?'管理员人工分配':e.attribution==='unassigned'?'缺少可靠任务关联':'服务端任务发起人'],['原任务发起人 ID',e.original_member_id||'未知'],['调整原因',e.assignment_reason||'—'],['调整管理员 ID',e.assigned_by||'—']].forEach(([k,v])=>originList.append(el('dt',k),el('dd',v)));
        const pair=(main,sub,cls='')=>{const cell=el('div',undefined,'billing-cell '+cls),title=el('span',main,'billing-cell-main');title.title=main;cell.append(title,el('small',sub));return cell;};
        const date=new Date(e.created_at),time=pair(date.toLocaleDateString(),date.toLocaleTimeString(),'billing-time');
        const location=pair(e.canvas_title||'独立生成任务',e.workspace_name||'历史空间');
        const model=pair(e.model||'—',({image:'图片生成',video:'视频生成',chat:'对话',audio:'音频生成'})[e.kind]||e.kind||'—');
        const cost=e.cost_status==='priced'?pair(money(e.amount_micros,e.currency),(e.estimated?'估算 · ':'')+(e.base_amount_micros!=null?'基础 '+money(e.base_amount_micros,e.currency)+' × '+String(Number(e.discount_rate||1)*100)+'%':'历史折扣未记录'),'billing-amount'):el('span',e.cost_status==='unknown'?'待核算':'不计费','billing-badge '+(e.cost_status==='unknown'?'billing-pending':'billing-neutral'));
        const status=el('span',e.status==='failed'?'失败':e.status==='success'?'成功':e.status,'billing-badge '+(e.status==='success'?'billing-success':e.status==='failed'?'billing-failed':'billing-neutral'));
        return personal?[time,location,model,cost,status,origin]:[time,e.username||'待归属',location,model,cost,status,origin];})));
      const pager=el('div',undefined,'billing-pager'),prev=action('上一页',()=>{page--;void load();}),next=action('下一页',()=>{page++;void load();});prev.disabled=page<=1;next.disabled=page>=data.pages;pager.append(el('span','共 '+data.records+' 条','billing-page-total'),prev,el('span',page+' / '+data.pages,'billing-page-number'),next);body.append(pager);
    }catch(error){if(stamp===request){message.textContent=error.message;message.className='billing-error billing-message';body.replaceChildren();overview.replaceChildren();}}finally{if(stamp===request){submit.disabled=false;submit.textContent='查询';root.setAttribute('aria-busy','false');}}}
    await load();return root;
  }
  async function assignmentDialog(api,refresh){
    const dialog=el('dialog',undefined,'billing-dialog billing-assignment'),form=el('form',undefined,'billing-view'),head=el('header'),close=el('button','关闭');close.type='button';close.onclick=()=>dialog.close();head.append(el('h2','按画布补录归属'),close);form.append(head,el('p','先选择画布和目标账号，预览后确认。仅调整账单归属，不改变金额或原始任务发起人。','billing-note'));
    const controls=el('div',undefined,'billing-toolbar'),searchLabel=el('label','查找画布'),search=el('input');search.setAttribute('aria-label','查找画布');searchLabel.append(search);controls.append(searchLabel);
    const searchButton=el('button','查找');searchButton.type='button';controls.append(searchButton);
    const canvasLabel=el('label','来源画布'),canvas=el('select');canvas.setAttribute('aria-label','来源画布');canvasLabel.append(canvas);controls.append(canvasLabel);
    const memberLabel=el('label','费用归属账号'),member=el('select');member.setAttribute('aria-label','费用归属账号');memberLabel.append(member);controls.append(memberLabel);
    const reasonLabel=el('label','补录原因'),reason=el('input');reason.setAttribute('aria-label','补录原因');reason.required=true;reason.maxLength=1000;reasonLabel.append(reason);controls.append(reasonLabel);
    const includeLabel=el('label','同时调整已有归属的流水'),include=el('input');include.type='checkbox';includeLabel.append(include);controls.append(includeLabel);
    const note=el('p','默认只补录待归属流水。','billing-note'),preview=el('button','预览归属'),apply=el('button','确认归属');preview.type='submit';apply.type='button';apply.disabled=true;const actions=el('div',undefined,'billing-toolbar');actions.append(preview,apply);form.append(controls,note,actions);dialog.append(form);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();let token=null,payload=null,version=0,busy=false;
    function invalidate(){token=null;payload=null;apply.disabled=true;version++;note.textContent='条件已改变，请重新预览。';}
    form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
    async function choices(){invalidate();const stamp=version;note.textContent='正在读取画布和账号…';try{const data=await api('assignment/choices&query='+encodeURIComponent(search.value));if(stamp!==version)return;canvas.replaceChildren(new Option('请选择画布',''));data.canvases.forEach(c=>canvas.append(new Option(c.title+' · '+c.records+' 条',c.canvas_id)));member.replaceChildren(new Option('请选择账号',''));data.members.forEach(m=>member.append(new Option(m.display_name+' · '+m.username,m.id)));note.textContent=data.truncated?'结果较多，请输入画布名称缩小范围。':'默认只补录待归属流水；目标账号须为本空间的有效成员。';}catch(e){note.textContent=e.message;}}
    searchButton.onclick=()=>void choices();
    form.onsubmit=async event=>{event.preventDefault();if(busy)return;if(!canvas.value||!member.value){note.textContent='请选择画布和账号。';return;}busy=true;preview.disabled=true;const stamp=version;try{const value={canvas_id:canvas.value,member_id:member.value,reason:reason.value.trim(),include_assigned:include.checked};const result=await api('assignment/preview',{method:'POST',body:JSON.stringify(value)});if(stamp!==version)return;token=result.preview_token;payload=value;note.textContent='将归属给 '+result.target.display_name+'（'+result.target.username+'）：'+result.records+' 条，'+(result.totals.map(t=>money(t.amount_micros,t.currency)).join(' / ')||'已知金额为 0')+'；待核算 '+result.unknown+' 条，跳过 '+result.skipped+' 条。'+(include.checked?' 已启用覆盖原归属，请核对。':'');apply.disabled=!result.records;}catch(e){note.textContent=e.message;}finally{busy=false;preview.disabled=false;}};
    apply.onclick=async()=>{if(!token||!payload||busy)return;busy=true;apply.disabled=true;try{await api('assignment/apply',{method:'POST',body:JSON.stringify({...payload,preview_token:token})});dialog.close();await refresh();}catch(e){note.textContent=e.message;token=null;payload=null;}finally{busy=false;}};
    await choices();
  }
  async function showPersonal(){style();const boundMember=window.CanvasSession?.context?.member.id;const dialog=el('dialog',undefined,'billing-dialog billing-personal-dialog'),head=el('header'),close=el('button','×','billing-close');close.type='button';close.setAttribute('aria-label','关闭我的费用');close.title='关闭';close.onclick=()=>dialog.close();const heading=el('div',undefined,'billing-heading');heading.append(el('h1','我的费用'));head.append(heading,close);dialog.append(head,el('p','正在读取…'));dialog.setAttribute('aria-label','我的费用');document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();const body=await create({personal:true,fetchReport:async params=>{const response=await fetch('/api/account/billing?'+new URLSearchParams(params),{cache:'no-store',headers:boundMember?{'X-Member-ID':boundMember}:{}});const data=await response.json();if(!response.ok)throw new Error(response.status===400?'请检查日期范围。':'费用读取失败，请检查登录状态后重试。');return data;}});dialog.lastChild.replaceWith(body);}
  window.CanvasBillingUI={create,showPersonal,money};
})();
