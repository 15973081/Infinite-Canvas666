var e=document.getElementById(`assetManagerRoot`),t=document.getElementById(`assetStatus`),n=document.getElementById(`refreshBtn`),r=document.getElementById(`assetUploadInput`);if(!e)throw Error(`Missing #assetManagerRoot`);var i=`assets`,a={libraries:[],categories:[]},o={libraries:[]},s=[],c=``,l=``,u=new Map,d=new Set,f=new Map,ee=new Map,p=[],m=new Set,h=new Set,te=6,ne=0,g=``,_=``,v=``,y=``,b=``,x=`all`,re=`category`,ie=`asset_manager_collapsed_libraries_v1`;function ae(){try{let e=JSON.parse(localStorage.getItem(ie)||`[]`);return new Set(Array.isArray(e)?e.map(String).filter(Boolean):[])}catch{return new Set}}function oe(){try{localStorage.setItem(ie,JSON.stringify([...se]))}catch{}}var se=ae(),S=`category`,C=``,w=``,T=``,E=new Set,D=new Set,O=new Set,ce=``,le=``,ue=``,de=!1,fe=!1,pe=!1,k=null,me=!1,he=!1,ge=!1,A=``,_e=``,j=``,M=null,N=null,P=null,F=``,I=null,ve=!1,ye=[],be=``,xe=``,Se=[],Ce=new Map,we=new Map,Te=``,L=``,R=new Set,Ee=``,De=!1,Oe=null,ke=!1,Ae=``,je=``,Me=`描述图片`,z=[],Ne=null,B=``,V=``,H=new Set,Pe=``,Fe=!1,Ie=null,U={categories:[],canvases:[],items:[]},W=`smart`,Le=``,G=``,K=new Set,Re=``,q=`canvas_asc`,ze=!1,Be=0,Ve=``,He=0,Ue=0,We=0,Ge=/\.(png|jpe?g|webp|gif|bmp|avif|svg|mp4|webm|mov|m4v|mp3|wav|flac|ogg|m4a|aac)(\?|#|$)/i,Ke=80,qe=3;function Je(){window.lucide&&lucide.createIcons()}function J(e=`准备就绪`){t&&(t.textContent=e||`准备就绪`)}function Ye(t=[`.nav-scroll`]){let n=Object.fromEntries(t.map(t=>{let n=e.querySelector(t);return[t,{top:n?.scrollTop||0,left:n?.scrollLeft||0}]}));$();let r=()=>Object.entries(n).forEach(([t,n])=>{let r=e.querySelector(t);r&&(r.scrollTop=n.top,r.scrollLeft=n.left)});requestAnimationFrame(()=>{r(),requestAnimationFrame(r)})}function Xe(e,t){clearTimeout(Be),Be=setTimeout(()=>{let n=document.activeElement?.id===e;$(),n&&requestAnimationFrame(()=>{let n=document.getElementById(e);n?.focus(),n?.setSelectionRange?.(t,t)})},160)}function Y(e=``){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function X(e=``){return Y(e)}async function Ze(e){let t=String(e||``);if(!t)return!1;try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(t),!0}catch{}try{let e=document.createElement(`textarea`);e.value=t,e.setAttribute(`readonly`,``),e.style.position=`fixed`,e.style.left=`-9999px`,e.style.top=`0`,document.body.appendChild(e),e.focus(),e.select();let n=document.execCommand(`copy`);return e.remove(),n}catch{return!1}}async function Z(e,t={}){let n=await fetch(e,t),r=await n.json().catch(()=>({}));if(!n.ok){let e=Error(r.detail||r.message||`操作失败`);throw e.status=n.status,e}return r}function Qe(e){let t=Number(e||0);if(!t)return`未知`;try{return new Date(t).toLocaleString(`zh-CN`,{hour12:!1})}catch{return`未知`}}function $e(e=0){let t=Number(e||0);if(!t)return`0 B`;let n=[`B`,`KB`,`MB`,`GB`,`TB`],r=Math.min(n.length-1,Math.floor(Math.log(t)/Math.log(1024)));return`${(t/1024**r).toFixed(+!!r)} ${n[r]}`}function et(){return Array.isArray(a.libraries)&&a.libraries.length?a.libraries:[{id:`default`,name:`默认资产库`,categories:a.categories||[]}]}function tt(){let e=et();return e.find(e=>e.id===g)||e[0]||null}function nt(){let e=et();return e.find(e=>e.id===v)||e[0]||null}function rt(){return(tt()?.categories||[]).filter(e=>(e.type||`image`)===`image`)}function it(){let e=[];return et().forEach(t=>{(t.categories||[]).filter(e=>(e.type||``)===`workflow`).forEach(n=>{e.push({...n,__libraryId:t.id,__libraryName:t.name||`资产库`})})}),e}function at(){let e=rt();return e.find(e=>e.id===_)||e[0]||null}function ot(){let e=it();return e.find(e=>e.id===y&&e.__libraryId===v)||e.find(e=>e.id===y)||e[0]||null}function st(){return it().reduce((e,t)=>e+(t.items||[]).length,0)}function ct(e){return(e?.categories||[]).filter(e=>(e.type||`image`)===`image`).reduce((e,t)=>e+(t.items||[]).length,0)}function lt(){let e=Array.isArray(o.libraries)?o.libraries.filter(Boolean):[];if(!e.length)return[{id:`system`,name:`系统提示词库`,system:!0,items:[],categories:[]}];let t=e.filter(e=>e.id===`system`),n=e.filter(e=>e.id!==`system`);return[...t,...n]}function ut(e){return!e||e.id===`system`}function dt(){let e=lt();return e.find(e=>e.id===b)||e[0]||null}function ft(e){let t=Array.isArray(e?.categories)?e.categories.filter(e=>e?.id):[];return t.length?t:ut(e)?[{id:`view`,name:`视角`},{id:`storyboard`,name:`分镜`},{id:`character`,name:`角色`},{id:`product`,name:`产品`},{id:`lighting`,name:`光影`},{id:`custom`,name:`我的`}]:[]}function pt(){return ft(dt())}function mt(e=`custom`){let t=pt().find(t=>t.id===e);return t?.name?t.name:{view:`视角`,storyboard:`分镜`,character:`角色`,product:`产品`,lighting:`光影`,mine:`我的`,custom:`我的`}[e]||e||`自定义`}function ht(e,t=dt()){let n=t?.items||[];return e===`all`?n.length:n.filter(t=>(t.category||`custom`)===e).length}function gt(e){let t=String(e?.url||``).toLowerCase(),n=String(e?.kind||e?.type||``).toLowerCase();return n.includes(`video`)||/\.(mp4|webm|mov|m4v)(\?|#|$)/.test(t)?`video`:n.includes(`audio`)||/\.(mp3|wav|flac|ogg|m4a)(\?|#|$)/.test(t)?`audio`:n.includes(`text`)||/\.(txt|json|csv|srt|vtt|md)(\?|#|$)/.test(t)?`text`:`image`}function _t(e){let t=String(e?.format||``).toLowerCase(),n=String(e?.url||``).toLowerCase();return t===`json`||n.endsWith(`.json`)?`JSON 工作流`:`ZIP 工作流包`}function vt(e){let t=gt(e);return t===`video`?`视频`:t===`audio`?`音频`:t===`text`?`文本`:`图片`}function yt(e,t=384){let n=String(e||``);return!n||n.startsWith(`data:`)||n.startsWith(`blob:`)||!n.startsWith(`/output/`)&&!n.startsWith(`/assets/`)||!/\.(png|jpe?g|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v)(\?|#|$)/i.test(n)?n:`/api/media-preview?w=${Math.max(64,Math.min(2048,Math.round(Number(t)||384)))}&url=${encodeURIComponent(n)}`}function bt(e){let t=gt(e),n=String(e?.url||``),r=yt(n,384);return t===`video`&&r!==n?`<img src="${X(r)}" data-original-src="${X(n)}" alt="${X(e.name||`video`)}" loading="lazy" decoding="async" fetchpriority="low">`:t===`video`?`<video src="${X(n)}" muted preload="none" playsinline></video>`:t===`audio`?`<div class="asset-file-icon"><i data-lucide="file-audio"></i><span>音频</span></div>`:t===`text`?`<div class="asset-file-icon"><i data-lucide="file-text"></i><span>文本</span></div>`:`<img src="${X(r)}" data-original-src="${X(n)}" alt="${X(e.name||`asset`)}" loading="lazy" decoding="async" fetchpriority="low">`}function xt(e){return`<div class="asset-file-icon workflow-file-icon"><i data-lucide="workflow"></i><span>${Y(_t(e))}</span></div>`}function St(e){if(!e)return!1;let t=String(e.type||``).toLowerCase();return t.startsWith(`image/`)||t.startsWith(`video/`)||t.startsWith(`audio/`)?!0:Ge.test(e.name||``)}function Ct(e){if(e&&e.kind)return e.kind;let t=String(e?.name||``).toLowerCase();return/\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i.test(t)?`video`:/\.(mp3|wav|flac|ogg|m4a|aac)(\?|#|$)/i.test(t)?`audio`:`image`}function wt(e){return e?.url||``}function Tt(){return Ce.get(Te)||Se[0]||null}function Et(e=Te){let t=Ee.trim().toLowerCase();return((Ce.get(e)||Tt())?.items||[]).filter(e=>!t||[e.name,e.relativePath,vt(e)].join(` `).toLowerCase().includes(t))}function Dt(){return(s||[]).filter(e=>e&&e.enabled!==!1&&Array.isArray(e.chat_models)&&e.chat_models.length)}function Ot(){let e=Dt();if(!e.length){Ae=``,je=``;return}let t=e.find(e=>e.id===Ae)||e[0];Ae=t.id||``;let n=(t.chat_models||[]).filter(Boolean);n.includes(je)||(je=n[0]||``)}function kt(){return Ot(),(Dt().find(e=>e.id===Ae)?.chat_models||[]).filter(Boolean)}function At(e){Ot();let t=Dt(),n=kt(),r=!e||!t.length||!je||ke;return`
        <div class="local-caption-tools">
            <select id="localCaptionProvider" class="manage-select" title="反推平台" ${t.length?``:`disabled`}>
                ${t.length?t.map(e=>`<option value="${X(e.id)}" ${e.id===Ae?`selected`:``}>${Y(e.name||e.id)}</option>`).join(``):`<option value="">暂无聊天平台</option>`}
            </select>
            <select id="localCaptionModel" class="manage-select" title="反推模型" ${n.length?``:`disabled`}>
                ${n.length?n.map(e=>`<option value="${X(e)}" ${e===je?`selected`:``}>${Y(e)}</option>`).join(``):`<option value="">暂无模型</option>`}
            </select>
            <input id="localCaptionPrompt" class="local-caption-prompt-input" type="text" value="${X(Me||`描述图片`)}" placeholder="描述图片">
            <button class="asset-btn primary" type="button" data-local-caption-run ${r?`disabled`:``}><i data-lucide="${ke?`loader-2`:`wand-sparkles`}"></i><span>${ke?`反推中`:`提示词反推`}</span></button>
        </div>
    `}function jt(e){return we.get(e)||null}function Mt(){(!Te||!Ce.has(Te))&&(Te=Se[0]?.id||``);let e=Et();L&&!we.has(L)&&(L=``),!L&&e.length&&(L=e[0].id),R=new Set([...R].filter(e=>we.has(e)))}async function Nt(){try{let e=await Z(`/api/shared-folders`);ye=Array.isArray(e.folders)?e.folders:[]}catch{ye=[]}return ye}async function Pt(){try{let e=await Z(`/api/local-assets`);z=Array.isArray(e.items)?e.items:[],Ne=e.tree||{id:`__root__`,path:``,name:`全部上传`,count:z.length,items:[],children:[]}}catch{z=[],Ne={id:`__root__`,path:``,name:`全部上传`,count:0,items:[],children:[]}}return B&&!Fn(B)&&(B=``),H=new Set([...H].filter(e=>z.some(t=>t.id===e))),z}async function Ft(){let e=window.prompt(`请输入要登记的共享文件夹路径（必须位于项目目录内，例如 assets\\library 或 output）：`,``);if(String(e||``).trim())try{J(`正在登记共享文件夹...`);let t=await Z(`/api/shared-folders`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({path:e})});await Nt();let n=t.folder;n?.id?await Rt(n.id):$(),J(`已登记「${n?.name||`共享文件夹`}」`)}catch(e){J(e.message||`登记共享文件夹失败`)}}async function It(e){if(e)try{await Z(`/api/shared-folders/${encodeURIComponent(e)}`,{method:`DELETE`}),be===e&&(be=``,xe=``,Se=[],Ce=new Map,we=new Map,Te=``,L=``,R.clear(),Oe=null),await Nt(),$(),J(`已移除共享文件夹登记（不会删除磁盘文件）`)}catch(e){J(e.message||`移除共享文件夹失败`)}}function Lt(e){e&&(Ce.set(e.id,e),(e.items||[]).forEach(e=>we.set(e.id,e)),(e.children||[]).forEach(e=>Lt(e)))}async function Rt(e){if(e)try{J(`正在读取共享文件夹...`);let t=await Z(`/api/shared-folders/${encodeURIComponent(e)}/tree`),n=t.tree;Se=n?[n]:[],Ce=new Map,we=new Map,n&&Lt(n),be=e,xe=t.folder?.name||n?.name||`共享文件夹`,Te=n?.id||``,L=``,R.clear(),Oe=null,Mt(),$(),J(`已读取「${xe}」`)}catch(e){J(e.message||`读取共享文件夹失败`)}}function zt(){let e=ce.trim().toLowerCase();return(at()?.items||[]).filter(t=>!e||[t.name,t.url,vt(t)].join(` `).toLowerCase().includes(e))}function Bt(){let e=le.trim().toLowerCase();return(ot()?.items||[]).filter(t=>!e||[t.name,t.url,_t(t)].join(` `).toLowerCase().includes(e))}function Vt(){return Array.isArray(U.categories)&&U.categories.length?U.categories.filter(e=>[`smart`,`classic`].includes(e.id)):[{id:`smart`,name:`智能画布`,count:(U.items||[]).filter(e=>e.canvas_kind===`smart`).length,canvas_count:(U.canvases||[]).filter(e=>e.kind===`smart`).length},{id:`classic`,name:`普通画布`,count:(U.items||[]).filter(e=>e.canvas_kind!==`smart`).length,canvas_count:(U.canvases||[]).filter(e=>e.kind!==`smart`).length}]}function Ht(){return Vt().find(e=>e.id===W)||Vt()[0]||{id:`smart`,name:`智能画布`,count:0,canvas_count:0}}function Ut(){let e=Vt();return e.find(e=>Number(e.count||0)>0)?.id||e[0]?.id||`smart`}function Wt(e){let t=new Set,n=[];return(e||[]).forEach(e=>{let r=`${e.canvas_id||``}::${e.url||``}`;!e?.url||t.has(r)||(t.add(r),n.push(e))}),n}function Gt(e){return Wt(U.items||[]).filter(t=>t.canvas_id===e).length}function Kt(e=W){let t=Array.isArray(U.canvases)?U.canvases.slice():[];return t=t.filter(t=>(t.kind||`classic`)===e),t.sort((e,t)=>String(e.title||``).localeCompare(String(t.title||``),`zh-Hans-CN`,{numeric:!0,sensitivity:`base`}))}function qt(){return Le&&(U.canvases||[]).find(e=>e.id===Le)||null}function Jt(){return qt()?.title||Ht().name||`画布资产`}function Yt(e){let t=qt();if(t)return`${Zt(t.kind)} / ${e.length} 个资产 / ${Y(Qt())}`;let n=Ht();return`${Number(n.canvas_count||0)} 个画布 / ${e.length} 个资产 / ${Y(Qt())}`}function Xt(e){let t=gt(e);return t===`video`?`视频`:t===`audio`?`音频`:String(e?.kind||``).toLowerCase()===`text`?`文本`:`图片`}function Zt(e){return e===`smart`?`智能画布`:`普通画布`}function Qt(){let e={canvas_asc:`画布名称`,updated_desc:`最近更新`,updated_asc:`最早更新`,name_asc:`名称 A-Z`,kind:`类型`};return e[q]||e.canvas_asc}function $t(){let e=String(Re||``).trim().toLowerCase(),t=Wt(U.items||[]).filter(t=>(t.canvas_kind||`classic`)!==W||Le&&t.canvas_id!==Le?!1:!e||[t.name,t.url,t.canvas_title,t.node_title,t.node_type,Xt(t),Zt(t.canvas_kind)].join(` `).toLowerCase().includes(e));t=t.slice();let n=e=>Number(e.canvas_updated_at||e.created_at||0);return q===`canvas_asc`?t.sort((e,t)=>String(e.canvas_title||``).localeCompare(String(t.canvas_title||``),`zh-Hans-CN`,{numeric:!0,sensitivity:`base`})||String(e.canvas_id||``).localeCompare(String(t.canvas_id||``),`zh-Hans-CN`)||n(t)-n(e)):q===`updated_asc`?t.sort((e,t)=>n(e)-n(t)):q===`name_asc`?t.sort((e,t)=>String(e.name||``).localeCompare(String(t.name||``),`zh-Hans-CN`,{numeric:!0,sensitivity:`base`})):q===`kind`?t.sort((e,t)=>Xt(e).localeCompare(Xt(t),`zh-Hans-CN`)||n(t)-n(e)):t.sort((e,t)=>n(t)-n(e)),t}function en(e){if(q!==`canvas_asc`)return[{key:`__all__`,title:``,subtitle:``,items:e}];let t=[],n=new Map;return(e||[]).forEach(e=>{let r=e.canvas_id||e.canvas_title||`__unknown__`;if(!n.has(r)){let i={key:r,title:e.canvas_title||`未命名画布`,subtitle:`${Zt(e.canvas_kind)} / ${Qe(e.canvas_updated_at||e.created_at)}`,items:[]};n.set(r,i),t.push(i)}n.get(r).items.push(e)}),t}function tn(){let e=dt(),t=ue.trim().toLowerCase();return(e?.items||[]).filter(e=>x!==`all`&&(e.category||`custom`)!==x?!1:!t||[e.name,e.scene,e.positive,e.negative,e.category].join(` `).toLowerCase().includes(t))}var nn=[`apimart`,`volcengine`],rn={apimart:`APIMart`,volcengine:`火山引擎`};function an(e){let t=String(e?.protocol||``).toLowerCase(),n=String(e?.base_url||``).toLowerCase();return t===`apimart`||n.includes(`apimart.ai`)?`apimart`:t===`volcengine`?`volcengine`:``}function on(e){return nn.includes(an(e))}function sn(e){return rn[String(e||``)]||String(e||`平台`)}function cn(){return(s||[]).filter(e=>e&&e.enabled!==!1)}function ln(){let e=cn();return e.length?e.find(e=>e.id===c)||e.find(e=>on(e))||e[0]:null}function un(e){let t=e.name||e.id,n=an(e);return n?on(e)?`${t}（${sn(n)}）`:`${t}（${sn(n)}·待接入）`:`${t}（暂不支持，待接入）`}function dn(e,t=``){let n=cn();if(t&&n.some(e=>e.id===t))return t;let r=n.find(t=>an(t)===e);return r?r.id:``}function Q(e){for(let t of et())for(let n of t.categories||[])for(let t of n.items||[])if(t.id===e)return t;return null}function fn(e){for(let t of et())for(let n of t.categories||[])if((n.type||``)===`workflow`){for(let t of n.items||[])if(t.id===e)return t}return null}function pn(e){for(let t of lt())for(let n of t.items||[])if(n.id===e)return n;return null}function mn(e){return(U.items||[]).find(t=>t.id===e)||null}function hn(){let e=zt();return e.find(e=>e.id===C)||e[0]||null}function gn(){let e=Bt();return e.find(e=>e.id===w)||e[0]||null}function _n(){let e=tn();return e.find(e=>e.id===T)||e[0]||null}function vn(){let e=$t();return e.find(e=>e.id===G)||e[0]||null}function yn(){let e=et();(!g||!e.some(e=>e.id===g))&&(g=a.active_library_id||e[0]?.id||``);let t=rt();(!_||!t.some(e=>e.id===_))&&(_=t[0]?.id||``);let n=zt();C&&!n.some(e=>e.id===C)&&(C=``),!C&&n.length&&(C=n[0].id),E=new Set([...E].filter(e=>Q(e)))}function bn(){let e=et();(!v||!e.some(e=>e.id===v))&&(v=a.active_library_id||e[0]?.id||``);let t=it();(!y||!t.some(e=>e.id===y&&e.__libraryId===v))&&(y=t[0]?.id||``,v=t[0]?.__libraryId||v);let n=t.find(e=>e.id===y&&e.__libraryId===v)||null;n?.__libraryId&&(v=n.__libraryId);let r=Bt();w&&!r.some(e=>e.id===w)&&(w=``),!w&&r.length&&(w=r[0].id),D=new Set([...D].filter(e=>fn(e)))}function xn(){let e=lt();(!b||!e.some(e=>e.id===b))&&(b=o.active_library_id||e[0]?.id||``);let t=pt();x!==`all`&&!t.some(e=>e.id===x)&&(x=`all`);let n=tn();T&&!n.some(e=>e.id===T)&&(T=``),!T&&n.length&&(T=n[0].id),O=new Set([...O].filter(e=>pn(e)))}function Sn(){Vt().some(e=>e.id===W)||(W=Ut());let e=qt();Le&&(!e||(e.kind||`classic`)!==W)&&(Le=``);let t=$t();G&&!t.some(e=>e.id===G)&&(G=``),!G&&t.length&&(G=t[0].id),K=new Set([...K].filter(e=>mn(e)))}async function Cn({reset:t=!1}={}){let n=t?null:Object.fromEntries([`.nav-scroll`,`.content-scroll`,`.detail-scroll`].map(t=>{let n=e.querySelector(t);return[t,{top:n?.scrollTop||0,left:n?.scrollLeft||0}]}));J(`加载中...`);let[r,i,c,l]=await Promise.all([Z(`/api/asset-library`),Z(`/api/prompt-libraries`),Z(`/api/providers`).catch(()=>({providers:[]})),Z(`/api/canvas-assets`).catch(()=>({categories:[],canvases:[],items:[]})),Nt(),Pt()]);a=r.library||{libraries:[],categories:[]};let u=new Set(et().map(e=>String(e.id||``)).filter(Boolean)),d=new Set([...se].filter(e=>u.has(e)));if(d.size!==se.size&&(se=d,oe()),o=i.library||{libraries:[]},s=Array.isArray(c.providers)?c.providers:[],U={categories:Array.isArray(l.categories)?l.categories:[],canvases:Array.isArray(l.canvases)?l.canvases:[],items:Array.isArray(l.items)?l.items:[]},t){let e=et();g=(e.find(e=>e.id==="default")||e[0])?.id||``,v=(e.find(e=>e.id==="default")||e[0])?.id||``,_=``,y=``,C=``,w=``,E.clear(),D.clear(),O.clear(),K.clear()}Ve=``,He=0,$(),bi(),n&&Object.entries(n).forEach(([t,n])=>{let r=e.querySelector(t);r&&(r.scrollTop=n.top,r.scrollLeft=n.left)}),J(`准备就绪`)}function $(){document.querySelectorAll(`[data-tab]`).forEach(e=>e.classList.toggle(`active`,e.dataset.tab===i)),i===`prompts`?hr():i===`workflows`?$n():i===`local`?Vn():i===`canvas-assets`?wn():Qn(),Je()}function wn(){Sn();let t=$t(),n=en(t),r=(U.items||[]).length,i=vn();e.innerHTML=`
        <aside class="asset-panel asset-nav">
            <div class="panel-head"><div class="panel-title"><strong>画布分类</strong><span>从所有画布拉取资产</span></div></div>
            <div class="nav-scroll">
                <div class="nav-tree canvas-asset-tree">
                    ${Vt().map(e=>Tn(e)).join(``)}
                </div>
                <div class="nav-hint">共 ${U.canvases?.length||0} 个画布，${r} 个可下载资产。</div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${ze?`manage-on`:``}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${Y(Jt())}</strong>
                    <span>${Yt(t)}</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="canvasAssetSearch" class="asset-search" type="search" value="${X(Re)}" placeholder="搜索画布资产"></label>
                    <select id="canvasAssetSort" class="manage-select canvas-sort-select" title="排序方法">
                        <option value="canvas_asc" ${q===`canvas_asc`?`selected`:``}>画布名称</option>
                        <option value="updated_desc" ${q===`updated_desc`?`selected`:``}>最近更新</option>
                        <option value="updated_asc" ${q===`updated_asc`?`selected`:``}>最早更新</option>
                        <option value="name_asc" ${q===`name_asc`?`selected`:``}>资产名称</option>
                        <option value="kind" ${q===`kind`?`selected`:``}>类型</option>
                    </select>
                    <button class="asset-btn ${ze?`primary`:``}" type="button" data-canvas-asset-manage ${r?``:`disabled`}><i data-lucide="list-checks"></i><span>${ze?`完成管理`:`批量管理`}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${K.size} 个画布资产，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-canvas-asset-select-all ${t.length?``:`disabled`}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-canvas-asset-clear-selection ${K.size?``:`disabled`}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn primary" type="button" data-canvas-asset-download-selected ${K.size?``:`disabled`}><i data-lucide="download"></i><span>下载所选</span></button>
                </div>
            </div>
            <div class="content-scroll">
                <div class="asset-grid">
                    ${n.map(e=>En(e)).join(``)}
                    ${t.length?``:`<div class="empty-state">当前分类没有可下载的画布资产。可以切换分类，或在画布中生成/导入图片、视频、音频后再查看。</div>`}
                </div>
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${kn(i)}
        </aside>
    `}function Tn(e){let t=Kt(e.id),n=e.id===W&&!Le,r=e.id===W&&!!Le;return`<div class="tree-branch ${e.id===W?`expanded`:``}">
        <button class="tree-row tree-parent ${n?`active`:``} ${r?`contains-active`:``}" type="button" data-canvas-asset-cat="${X(e.id)}">
            <span class="tree-row-icon"><i data-lucide="${e.id===`smart`?`sparkles`:e.id===`classic`?`layout-grid`:`layout-dashboard`}"></i></span>
            <span class="tree-row-name">${Y(e.name||`画布`)}</span>
            <span class="tree-row-count">${Number(e.count||0)}</span>
        </button>
        <div class="tree-children">
            ${t.length?t.map(t=>{let n=t.id===Le&&e.id===W,r=Gt(t.id);return`<button class="tree-row tree-child ${n?`active`:``}" type="button" data-canvas-asset-canvas="${X(t.id)}" data-canvas-asset-canvas-cat="${X(e.id)}">
                    <span class="tree-elbow"></span>
                    <span class="tree-row-icon"><i data-lucide="${t.kind===`smart`?`sparkles`:`file-image`}"></i></span>
                    <span class="tree-row-name" title="${X(t.title||`未命名画布`)}">${Y(t.title||`未命名画布`)}</span>
                    <span class="tree-row-count">${r}</span>
                </button>`}).join(``):`<div class="tree-empty">暂无画布</div>`}
        </div>
    </div>`}function En(e){return e?.title?`<section class="canvas-asset-group">
        <div class="canvas-asset-group-head">
            <div>
                <strong title="${X(e.title)}">${Y(e.title)}</strong>
                <span>${Y(e.subtitle||``)}</span>
            </div>
            <small>${(e.items||[]).length} 个资产</small>
        </div>
        <div class="canvas-asset-group-grid">
            ${(e.items||[]).map(e=>Dn(e)).join(``)}
        </div>
    </section>`:(e?.items||[]).map(e=>Dn(e)).join(``)}function Dn(e){return`<article class="asset-card canvas-asset-card ${e.id===G?`active`:``}" data-canvas-asset-card="${X(e.id)}">
        <input class="asset-card-check" type="checkbox" data-canvas-asset-check="${X(e.id)}" ${K.has(e.id)?`checked`:``}>
        <div class="asset-thumb canvas-asset-thumb">${bt(e)}${On(e)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${X(e.name||``)}">${Y(e.name||`canvas asset`)}</div>
            <div class="asset-card-meta">${Y(Xt(e))} · ${Y(e.canvas_title||`未命名画布`)}</div>
        </div>
    </article>`}function On(e){let t=gt(e),n=t===`video`?`play`:t===`audio`?`file-audio`:t===`text`?`file-text`:`image`;return`<span class="asset-kind-badge ${X(t)}" title="${X(Xt(e))}"><i data-lucide="${n}"></i></span>`}function kn(e){if(!e)return`<div class="panel-head"><div class="panel-title"><strong>画布资产详情</strong><span>选择一个画布资产查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="layout-dashboard"></i><span>暂无画布资产</span></div></div>`;let t=gt(e),n=[`image`,`video`].includes(t);return`
        <div class="panel-head">
            <div class="panel-title"><strong>画布资产详情</strong><span>${Y(Xt(e))}</span></div>
            <div class="panel-actions">
                ${n?`<button class="asset-icon-btn" type="button" data-canvas-asset-preview="${X(e.id)}" title="${t===`video`?`预览视频`:`放大预览`}"><i data-lucide="${t===`video`?`play`:`maximize-2`}"></i></button>`:``}
                <button class="asset-icon-btn" type="button" data-canvas-asset-open="${X(e.id)}" title="打开链接"><i data-lucide="external-link"></i></button>
                <button class="asset-icon-btn" type="button" data-canvas-asset-copy="${X(e.id)}" title="复制链接"><i data-lucide="copy"></i></button>
                <button class="asset-btn primary" type="button" data-canvas-asset-download="${X(e.id)}"><i data-lucide="download"></i><span>下载</span></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="detail-media">
                ${n?`<button class="detail-media-frame detail-media-zoomable" type="button" data-canvas-asset-preview="${X(e.id)}" title="${t===`video`?`点击预览视频`:`点击放大预览`}">${bt(e)}</button>`:`<div class="detail-media-frame">${bt(e)}</div>`}
            </div>
            <div class="detail-body">
                <div class="detail-name">${Y(e.name||`画布资产`)}</div>
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${Y(Xt(e))}</strong></div>
                    <div class="detail-meta"><span>画布分类</span><strong>${Y(Zt(e.canvas_kind))}</strong></div>
                    <div class="detail-meta"><span>来源画布</span><strong title="${X(e.canvas_title||``)}">${Y(e.canvas_title||`未命名画布`)}</strong></div>
                    <div class="detail-meta"><span>更新时间</span><strong>${Y(Qe(e.canvas_updated_at||e.created_at))}</strong></div>
                    <div class="detail-meta"><span>来源节点</span><strong title="${X(e.node_title||e.node_type||``)}">${Y(e.node_title||e.node_type||`节点`)}</strong></div>
                    <div class="detail-meta"><span>节点类型</span><strong>${Y(e.node_type||`-`)}</strong></div>
                </div>
                <div class="detail-url">${Y(e.url||``)}</div>
            </div>
        </div>
    `}function An(){document.querySelectorAll(`[data-canvas-asset-card]`).forEach(e=>{e.classList.toggle(`active`,e.dataset.canvasAssetCard===G)}),document.querySelectorAll(`[data-canvas-asset-check]`).forEach(e=>{e.checked=K.has(e.dataset.canvasAssetCheck)});let t=e.querySelector(`.asset-detail`);t&&(t.innerHTML=kn(vn()),Je())}function jn(e,t,n,r){if(!e||e.placement!==`head`)return``;let i=e.label||`名称`;return`<div class="head-inline-edit">
        <input id="${X(t)}" type="text" value="${X(e.value||``)}" placeholder="${X(i)}">
        <button type="button" class="primary" ${n} title="保存"><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" ${r} title="取消"><i data-lucide="x"></i><span>取消</span></button>
    </div>`}function Mn(e){requestAnimationFrame(()=>{let t=document.getElementById(e);t?.focus(),t?.select?.()})}function Nn(){let e=String(Pe||``).trim().toLowerCase(),t=Array.isArray(z)?z.slice():[];return B&&(t=t.filter(e=>String(e.folder||``)===B)),e&&(t=t.filter(t=>[t.name,t.file,vt(t)].join(` `).toLowerCase().includes(e))),t}function Pn(e){return(z||[]).find(t=>t.id===e)||null}function Fn(e=``){let t=String(e||``),n=!t;function r(e){if(!(!e||n)){if(String(e.path||``)===t){n=!0;return}(e.children||[]).forEach(r)}}return r(Ne),n}function In(e=``){let t=String(e||``),n=null;function r(e){if(!(!e||n)){if(String(e.path||``)===t){n=e;return}(e.children||[]).forEach(r)}}return r(Ne),n}function Ln(){return B&&(In(B)?.name||B.split(`/`).pop())||`本地上传`}function Rn(e,t=0){if(!e)return``;let n=e.path||``,r=n===B,i=!r&&(e.children||[]).some(e=>zn(e));return`<div class="tree-branch">
        <button class="tree-row ${t?`tree-child`:`tree-parent`} ${r?`active`:``} ${i?`contains-active`:``}" type="button" data-localup-folder="${X(n)}">
            ${t?`<span class="tree-elbow"></span>`:``}
            <span class="tree-row-icon"><i data-lucide="${r?`folder-open`:t?`folder`:`upload-cloud`}"></i></span>
            <span class="tree-row-name">${Y(e.name||`文件夹`)}</span>
            <span class="tree-row-count">${Number(e.count||0)}</span>
        </button>
        ${(e.children||[]).length?`<div class="tree-children">${e.children.map(e=>Rn(e,t+1)).join(``)}</div>`:``}
    </div>`}function zn(e){return e?String(e.path||``)===B||(e.children||[]).some(e=>zn(e)):!1}function Bn(){return[...H].map(e=>Pn(e)).filter(e=>e&&gt(e)===`image`)}function Vn(){Ot();let t=Nn();V&&!t.some(e=>e.id===V)&&(V=``),!V&&t.length&&(V=t[0].id);let n=Pn(V),r=(z||[]).length,i=Bn().length,a=Ln();e.innerHTML=`
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>本地上传</strong><span>批量上传到 assets/uploads</span></div>
                <div class="panel-actions compact-actions">
                    <button class="asset-icon-btn" type="button" data-localup-folder-new title="新建文件夹"><i data-lucide="folder-plus"></i></button>
                    <button class="asset-icon-btn" type="button" data-localup-folder-rename title="重命名文件夹" ${B?``:`disabled`}><i data-lucide="pencil"></i></button>
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree">
                    ${Rn(Ne||{path:``,name:`全部上传`,count:r,children:[]})}
                </div>
                <div class="nav-hint" style="padding:10px 12px;font-size:12px;opacity:.7;">选择图片/视频/音频文件即可上传，文件保存在项目 assets/uploads 目录。</div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${Fe?`manage-on`:``}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${Y(a)}</strong>
                    <span>${t.length} / ${r} 个素材</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="localUploadSearch" class="asset-search" type="search" value="${X(Pe)}" placeholder="搜索本地上传"></label>
                    <button class="asset-btn primary" type="button" data-localup-upload><i data-lucide="upload"></i><span>上传文件</span></button>
                    <button class="asset-btn ${Fe?`primary`:``}" type="button" data-localup-manage ${r?``:`disabled`}><i data-lucide="list-checks"></i><span>${Fe?`完成管理`:`批量管理`}</span></button>
                </div>
            </div>
            <div class="manage-tools local-manage-tools">
                <span>已选择 ${H.size} 个素材，其中 ${i} 张图片。</span>
                <div class="asset-tools local-manage-actions">
                    <button class="asset-btn" type="button" data-localup-select-all ${t.length?``:`disabled`}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-localup-clear ${H.size?``:`disabled`}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn danger" type="button" data-localup-delete-selected ${H.size?``:`disabled`}><i data-lucide="trash-2"></i><span>删除</span></button>
                    ${At(i)}
                </div>
            </div>
            <div class="content-scroll">
                <div class="asset-grid">
                    ${Hn()}
                    ${t.map(e=>Un(e)).join(``)}
                </div>
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${Wn(n)}
        </aside>
    `}function Hn(){return`<button id="localUploadDrop" class="upload-grid-card" type="button" data-localup-upload>
        <span class="upload-thumb"><i data-lucide="upload-cloud"></i></span>
        <span class="upload-body">
            <strong>上传本地素材</strong>
            <small>拖入文件或点击上传</small>
        </span>
    </button>`}function Un(e){let t=gt(e)===`image`&&String(e.caption||``).trim();return`<article class="asset-card ${e.id===V?`active`:``}" data-localup-card="${X(e.id)}">
        <input class="asset-card-check" type="checkbox" data-localup-check="${X(e.id)}" ${H.has(e.id)?`checked`:``}>
        <div class="asset-thumb">${bt(e)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${X(e.name||``)}">${Y(e.name||`本地素材`)}</div>
            <div class="asset-card-meta">${Y(vt(e))} · ${Y($e(e.size))}${t?` · 有提示词`:``}</div>
        </div>
    </article>`}function Wn(e){if(!e)return`<div class="panel-head"><div class="panel-title"><strong>素材预览</strong><span>选择一个素材查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="image"></i><span>暂无可预览素材</span></div></div>`;let t=gt(e)===`image`;return`
        <div class="panel-head">
            <div class="panel-title"><strong>素材预览</strong><span>${Y(vt(e))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-localup-open="${X(e.id)}" title="新窗口打开"><i data-lucide="external-link"></i></button>
                <button class="asset-icon-btn" type="button" data-localup-copy="${X(e.id)}" title="复制链接"><i data-lucide="link"></i></button>
                <button class="asset-icon-btn danger" type="button" data-localup-delete-one="${X(e.id)}" title="删除"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="detail-media"><button class="detail-media-frame detail-media-zoomable" type="button" data-localup-preview="${X(e.id)}" title="点击放大预览">${bt(e)}</button></div>
            <div class="detail-body">
                <div class="detail-name">${Y(e.name||`本地素材`)}</div>
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${Y(vt(e))}</strong></div>
                    <div class="detail-meta"><span>大小</span><strong>${Y($e(e.size))}</strong></div>
                    <div class="detail-meta"><span>上传时间</span><strong>${Y(Qe((e.created_at||0)*1e3))}</strong></div>
                    <div class="detail-meta"><span>来源</span><strong>本地上传</strong></div>
                </div>
                <div class="detail-url">${Y(e.url||``)}</div>
                ${t?`
                    <div class="detail-caption-card">
                        <div class="detail-caption-head">
                            <strong>反推提示词</strong>
                            <button class="asset-btn primary" type="button" data-localup-caption-save="${X(e.id)}"><i data-lucide="save"></i><span>保存</span></button>
                        </div>
                        <textarea id="localUploadCaptionEdit" class="detail-caption-textarea" placeholder="暂无反推提示词，可以批量反推后自动写入，也可以在这里手动编辑。">${Y(e.caption||``)}</textarea>
                    </div>
                `:``}
            </div>
        </div>
    `}function Gn(){if(!Oe?.items?.length)return``;let e=Oe.mode===`cut`?`剪切`:`复制`,t=at();return`<div class="asset-clipboard-bar">
        <div class="asset-clipboard-info"><i data-lucide="clipboard"></i><span>${Y(e)}了 ${Oe.items.length} 个本地素材，目标：${Y(tt()?.name||`图片资产`)} / ${Y(t?.name||`未选择分组`)}</span></div>
        <div class="asset-tools">
            <button class="asset-btn primary" type="button" data-local-import-clipboard ${t?``:`disabled`}><i data-lucide="clipboard-paste"></i><span>导入到图片资产</span></button>
            <button class="asset-icon-btn" type="button" data-local-clear-clipboard title="清空本地剪贴板"><i data-lucide="x"></i></button>
        </div>
    </div>`}function Kn(){return`${g}\u0000${_}\u0000${ce.trim().toLowerCase()}`}function qn(e){let t=Kn();return t===Ve?!He&&e.length&&(He=Math.min(Ke,e.length)):(Ve=t,He=Math.min(Ke,e.length)),He=Math.min(He,e.length),e.slice(0,He)}function Jn(e){return``}function Yn(){Xn()}function Xn(){i!==`assets`||We||(We=requestAnimationFrame(()=>{We=0,Zn()}))}function Zn(){let t=e.querySelector(`[data-asset-virtual-grid]`),n=e.querySelector(`.asset-content .content-scroll`),r=zt();if(!t||!n||!r.length)return;let i=t.querySelector(`[data-asset-card]`)||t.querySelector(`.upload-grid-card`);if(!i)return;let a=getComputedStyle(t),o=Number.parseFloat(a.rowGap||a.gap)||10,s=i.getBoundingClientRect();if(s.width<=0||s.height<=0)return;let c=Math.max(1,Math.round((t.clientWidth+o)/(s.width+o))),l=s.height+o,u=t.getBoundingClientRect().top-n.getBoundingClientRect().top+n.scrollTop,d=Math.max(0,n.scrollTop-u),f=r.length+1,ee=Math.ceil(f/c),p=Math.ceil(n.clientHeight/l),m=Math.max(0,Math.floor(d/l)-qe),h=Math.min(ee,m+p+6),te=m*c,ne=Math.min(f,h*c),g=m?Math.max(0,m*l-o):0,_=ee-h,v=_?Math.max(0,_*l-o):0,y=[];for(let e=te;e<ne;e++)y.push(e===0?ar(at()):ur(r[e-1]));t.innerHTML=`${g?`<div class="asset-virtual-spacer" style="height:${g}px"></div>`:``}${y.join(``)}${v?`<div class="asset-virtual-spacer" style="height:${v}px"></div>`:``}`,t.querySelector(`[data-lucide]`)&&Je()}function Qn(){yn();let t=et();rt();let n=tt(),r=at(),i=zt(),a=qn(i),o=hn();e.innerHTML=`
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>资产层级</strong><span>先选库，再选分组</span></div>
                <div class="panel-actions compact-actions">
                    ${M?.placement===`head`?``:`<button class="asset-icon-btn" type="button" data-asset-lib-new title="新建资产库"><i data-lucide="plus"></i></button>`}
                    ${jn(M,`assetTreeEditInput`,`data-asset-tree-edit-save`,`data-asset-tree-edit-cancel`)}
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree asset-library-tree">
                    ${t.map(e=>sr(e)).join(``)}
                </div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${de?`manage-on`:``}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${Y(r?.name||`图片资产`)}</strong>
                    <span>${Y(n?.name||`资产库`)} / ${i.length} 个素材</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="assetSearch" class="asset-search" type="search" value="${X(ce)}" placeholder="搜索素材"></label>
                    <button class="asset-btn ${de?`primary`:``}" type="button" data-asset-manage><i data-lucide="list-checks"></i><span>${de?`完成管理`:`批量管理`}</span></button>
                </div>
            </div>
            ${or()}
            ${Gn()}
            <div class="manage-tools">
                <span>已选择 ${E.size} 个素材，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-asset-select-all ${i.length?``:`disabled`}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-asset-clear-selection ${E.size?``:`disabled`}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn" type="button" data-asset-cut-selected ${E.size?``:`disabled`}><i data-lucide="scissors"></i><span>剪切</span></button>
                    <button class="asset-btn" type="button" data-asset-copy-selected ${E.size?``:`disabled`}><i data-lucide="copy"></i><span>复制</span></button>
                    <button class="asset-btn" type="button" data-asset-download-selected ${E.size?``:`disabled`}><i data-lucide="download"></i><span>下载所选</span></button>
                    <button class="asset-btn" type="button" data-asset-copy-to-canvas ${E.size?``:`disabled`}><i data-lucide="clipboard-paste"></i><span>复制到画布</span></button>
                    <button class="asset-btn" type="button" data-avatar-register-selected ${E.size&&!l?``:`disabled`}><i data-lucide="user-round-plus"></i><span>批量认证</span></button>
                    <button class="asset-btn danger" type="button" data-asset-delete-selected ${E.size?``:`disabled`}><i data-lucide="trash-2"></i><span>删除所选</span></button>
                </div>
            </div>
            <div class="content-scroll">
                <div class="asset-grid" data-asset-virtual-grid>
                    ${ar(r)}
                    ${a.map(e=>ur(e)).join(``)}
                    ${Jn(i.length)}
                    ${i.length?``:`<div class="empty-state">当前分组还没有素材，可以上传，或从智能画布输出保存到素材库。</div>`}
                </div>
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${pr(o)}
        </aside>
    `,Xn()}function $n(){bn();let t=it(),n=ot(),r=Bt(),i=gn();e.innerHTML=`
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>工作流层级</strong><span>独立管理工作流分组</span></div>
                <div class="panel-actions compact-actions">
                    ${N?.placement===`head`?``:`<button class="asset-icon-btn" type="button" data-workflow-cat-new title="新建工作流分组"><i data-lucide="folder-plus"></i></button>`}
                    ${jn(N,`workflowTreeEditInput`,`data-workflow-tree-edit-save`,`data-workflow-tree-edit-cancel`)}
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree">
                    <div class="tree-branch expanded">
                        <button class="tree-row tree-parent contains-active" type="button" data-workflow-root>
                            <span class="tree-row-icon"><i data-lucide="folder-open"></i></span>
                            <span class="tree-row-name">工作流库</span>
                            <span class="tree-row-count">${st()}</span>
                        </button>
                        <div class="tree-children">
                            ${t.length?t.map(e=>{let t=e.id===y&&e.__libraryId===v;return`<button class="tree-row tree-child ${t?`active`:``}" type="button" data-workflow-cat="${X(e.id)}" data-workflow-cat-lib="${X(e.__libraryId||``)}">
                                <span class="tree-elbow"></span>
                                <span class="tree-row-icon"><i data-lucide="workflow"></i></span>
                                <span class="tree-row-name">${Y(e.name||`工作流`)}</span>
                                <span class="tree-row-count">${(e.items||[]).length}</span>
                            </button>${t?tr():``}`}).join(``):`<div class="tree-empty">暂无工作流分组</div>`}
                        </div>
                    </div>
                </div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${fe?`manage-on`:``}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${Y(n?.name||`工作流管理`)}</strong>
                    <span>工作流库 / ${r.length} 个工作流</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="workflowSearch" class="asset-search" type="search" value="${X(le)}" placeholder="搜索工作流"></label>
                    <button class="asset-btn ${fe?`primary`:``}" type="button" data-workflow-manage><i data-lucide="list-checks"></i><span>${fe?`完成管理`:`批量管理`}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${D.size} 个工作流。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-workflow-select-all ${r.length?``:`disabled`}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-workflow-clear-selection ${D.size?``:`disabled`}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn" type="button" data-workflow-export-selected ${D.size?``:`disabled`}><i data-lucide="download"></i><span>导出所选</span></button>
                    <button class="asset-btn danger" type="button" data-workflow-delete-selected ${D.size?``:`disabled`}><i data-lucide="trash-2"></i><span>删除所选</span></button>
                </div>
            </div>
            <div class="content-scroll">
                <div class="asset-grid">
                    ${er(n)}
                    ${r.map(e=>rr(e)).join(``)}
                    ${r.length?``:`<div class="empty-state">当前分组还没有工作流，可以上传 JSON / ZIP，或从传统画布导出到资产库。</div>`}
                </div>
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${ir(i)}
        </aside>
    `}function er(e){return`<button id="workflowDrop" class="upload-grid-card" type="button" data-workflow-upload ${e?``:`disabled`}>
        <span class="upload-thumb"><i data-lucide="upload-cloud"></i></span>
        <span class="upload-body">
            <strong>上传工作流</strong>
            <small>支持 JSON / ZIP</small>
        </span>
    </button>`}function tr(){let e=nr();if(e)return e;let t=`workflow-cat:${v}:${y}`;return`<div class="tree-action-bar child-actions">
        <button type="button" data-workflow-cat-rename><i data-lucide="pencil"></i><span>重命名</span></button>
        <button type="button" class="danger ${F===t?`detail-confirm`:``}" data-workflow-cat-delete><i data-lucide="trash-2"></i><span>${F===t?`确认删除`:`删除`}</span></button>
    </div>`}function nr(){if(!N||N.placement===`head`||N.kind!==`category-rename`)return``;let e=N.label||`名称`;return`<div class="tree-inline-edit child-actions">
        <input id="workflowTreeEditInput" type="text" value="${X(N.value||``)}" placeholder="${X(e)}">
        <button type="button" class="primary" data-workflow-tree-edit-save><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" data-workflow-tree-edit-cancel><i data-lucide="x"></i><span>取消</span></button>
    </div>`}function rr(e){return`<article class="asset-card workflow-card ${e.id===w?`active`:``}" data-workflow-card="${X(e.id)}">
        <input class="asset-card-check" type="checkbox" data-workflow-check="${X(e.id)}" ${D.has(e.id)?`checked`:``}>
        <div class="asset-thumb">${xt(e)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${X(e.name||``)}">${Y(e.name||`workflow`)}</div>
            <div class="asset-card-meta">${Y(_t(e))} · ${Y(Qe(e.created_at))}</div>
        </div>
    </article>`}function ir(e){return e?`
        <div class="panel-head">
            <div class="panel-title"><strong>工作流详情</strong><span>${Y(_t(e))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-workflow-download="${X(e.id)}" title="导出工作流"><i data-lucide="download"></i></button>
                <button class="asset-icon-btn" type="button" data-workflow-rename="${X(e.id)}" title="重命名"><i data-lucide="pencil"></i></button>
                <button class="asset-icon-btn danger ${A===e.id?`detail-confirm`:``}" type="button" data-workflow-delete="${X(e.id)}" title="${A===e.id?`再次点击确认删除`:`删除`}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="detail-media"><div class="detail-media-frame">${xt(e)}</div></div>
            <div class="detail-body">
                <input class="detail-name-input" data-workflow-inline-name="${X(e.id)}" type="text" value="${X(e.name||`workflow`)}" title="直接修改名称">
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${Y(_t(e))}</strong></div>
                    <div class="detail-meta"><span>创建时间</span><strong>${Y(Qe(e.created_at))}</strong></div>
                    <div class="detail-meta"><span>位置</span><strong>工作流库</strong></div>
                    <div class="detail-meta"><span>分组</span><strong>${Y(ot()?.name||`工作流`)}</strong></div>
                </div>
                <div class="detail-url">${Y(e.url||``)}</div>
            </div>
        </div>
    `:`<div class="panel-head"><div class="panel-title"><strong>工作流详情</strong><span>选择一个工作流查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="workflow"></i><span>暂无工作流</span></div></div>`}function ar(e){return`<button id="assetDrop" class="upload-grid-card" type="button" data-asset-upload ${e?``:`disabled`}>
        <span class="upload-thumb"><i data-lucide="upload-cloud"></i></span>
        <span class="upload-body">
            <strong>上传到当前分组</strong>
            <small>拖入文件或点击上传</small>
        </span>
    </button>`}function or(){if(!k?.ids?.length)return``;let e=k.mode===`cut`?`剪切`:`复制`,t=k.sourceLibraryId===g&&k.sourceCategoryId===_,n=t&&k.mode===`cut`?`选择其他分组后粘贴`:`粘贴到当前分组`;return`<div class="asset-clipboard-bar">
        <div class="asset-clipboard-info"><i data-lucide="clipboard"></i><span>${Y(e)}了 ${k.ids.length} 个素材</span></div>
        <div class="asset-tools">
            <button class="asset-btn primary" type="button" data-asset-paste-clipboard ${t&&k.mode===`cut`?`disabled`:``}><i data-lucide="clipboard-paste"></i><span>${Y(n)}</span></button>
            <button class="asset-icon-btn" type="button" data-asset-clear-clipboard title="清空剪贴板"><i data-lucide="x"></i></button>
        </div>
    </div>`}function sr(e){let t=e.id===g,n=!se.has(e.id),r=(e.categories||[]).filter(e=>(e.type||`image`)===`image`),i=t&&n&&re===`library`;return`<div class="tree-branch ${n?`expanded`:``}">
        <button class="tree-row tree-parent ${t?`contains-active`:``} ${i?`active`:``}" type="button" data-asset-lib="${X(e.id)}" aria-expanded="${n}">
            <span class="tree-toggle"><i data-lucide="chevron-right"></i></span>
            <span class="tree-row-icon"><i data-lucide="${n?`folder-open`:`folder`}"></i></span>
            <span class="tree-row-name">${Y(e.name||`资产库`)}</span>
            <span class="tree-row-count">${ct(e)}</span>
        </button>
        ${i?cr(`library`):``}
        <div class="tree-children">
            ${r.length?r.map(n=>`<button class="tree-row tree-child ${t&&n.id===_&&re===`category`?`active`:``}" type="button" data-asset-cat="${X(n.id)}" data-asset-cat-lib="${X(e.id)}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="image"></i></span>
                <span class="tree-row-name">${Y(n.name||`分组`)}</span>
                <span class="tree-row-count">${(n.items||[]).length}</span>
            </button>${t&&n.id===_&&re===`category`?cr(`category`):``}`).join(``):`<div class="tree-empty">暂无分组</div>`}
        </div>
    </div>`}function cr(e){let t=lr(e);if(t)return t;let n=e===`library`?`asset-lib:${g}`:`asset-cat:${_}`;return e===`library`?`<div class="tree-action-bar library-actions">
            <button type="button" data-asset-cat-new><i data-lucide="folder-plus"></i><span>新分组</span></button>
            <button type="button" data-asset-lib-rename><i data-lucide="pencil"></i><span>重命名</span></button>
            <button type="button" class="danger ${F===n?`detail-confirm`:``}" data-asset-lib-delete><i data-lucide="trash-2"></i><span>${F===n?`确认删除`:`删除库`}</span></button>
        </div>`:`<div class="tree-action-bar child-actions">
        <button type="button" data-asset-cat-new><i data-lucide="folder-plus"></i><span>新分组</span></button>
        <button type="button" data-asset-cat-rename><i data-lucide="pencil"></i><span>重命名</span></button>
        <button type="button" class="danger ${F===n?`detail-confirm`:``}" data-asset-cat-delete><i data-lucide="trash-2"></i><span>${F===n?`确认删除`:`删除`}</span></button>
    </div>`}function lr(e){if(!M||M.placement===`head`||!(e===`library`?[`library-new`,`library-rename`,`category-new`]:[`category-new`,`category-rename`]).includes(M.kind))return``;let t=M.label||`名称`;return`<div class="tree-inline-edit ${e===`category`?`child-actions`:`library-actions`}">
        <input id="assetTreeEditInput" type="text" value="${X(M.value||``)}" placeholder="${X(t)}">
        <button type="button" class="primary" data-asset-tree-edit-save><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" data-asset-tree-edit-cancel><i data-lucide="x"></i><span>取消</span></button>
    </div>`}function ur(e){return`<article class="asset-card ${e.id===C?`active`:``}" data-asset-card="${X(e.id)}">
        <input class="asset-card-check" type="checkbox" data-asset-check="${X(e.id)}" ${E.has(e.id)?`checked`:``}>
        <div class="asset-thumb">${bt(e)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${X(e.name||``)}">${Y(e.name||`asset`)}</div>
            <div class="asset-card-meta">${Y(vt(e))} · ${Y(Qe(e.created_at))}</div>
        </div>
    </article>`}function dr(e,t,n,r){let i=String(n.status||``),a=`<span class="avatar-platform-tag">${Y(sn(t))}</span>`,o=`data-avatar-prov="${X(dn(t,n.provider_id||``))}"`;if(i===`Active`&&n.asset_uri)return`<div class="avatar-card registered">
            <div class="avatar-head"><i data-lucide="badge-check"></i><span>已认证可用</span>${a}</div>
            <div class="avatar-uri" title="只能在 ${X(sn(t))} 平台的视频生成中通过 @ 调用">${Y(n.asset_uri)}</div>
            <div class="asset-tools">
                <button class="asset-btn" type="button" data-avatar-copy="${X(n.asset_uri)}"><i data-lucide="copy"></i><span>复制 asset:// 地址</span></button>
                <button class="asset-btn" type="button" data-avatar-register="${X(e.id)}" ${o} ${r?`disabled`:``}><i data-lucide="refresh-cw"></i><span>${r?`处理中…`:`重新注册`}</span></button>
            </div>
        </div>`;if([`Queued`,`Uploading`,`Processing`].includes(i)){let t=i===`Queued`?`排队中`:i===`Uploading`?`上传提交中`:`审核中`;return`<div class="avatar-card processing">
            <div class="avatar-head"><i data-lucide="loader"></i><span>${t}</span>${a}</div>
            <div class="avatar-hint">${i===`Processing`?`已提交审核（任务 ${Y(n.task_id||``)}），通过后会自动生成 asset:// 地址。`:Y(n.detail||t)}</div>
            <div class="asset-tools">
                ${i===`Processing`?`<button class="asset-btn primary" type="button" data-avatar-check="${X(e.id)}" ${o} ${r?`disabled`:``}><i data-lucide="refresh-cw"></i><span>${r?`查询中…`:`刷新审核状态`}</span></button>`:``}
                <button class="asset-btn danger" type="button" data-avatar-cancel="${X(e.id)}" ${o}><i data-lucide="x"></i><span>取消认证</span></button>
            </div>
        </div>`}return i===`Cancelled`?`<div class="avatar-card failed"><div class="avatar-head"><i data-lucide="circle-slash"></i><span>已取消</span>${a}</div><div class="avatar-hint">${Y(n.detail||`已停止本地认证和审核跟踪`)}</div></div>`:`<div class="avatar-card failed">
        <div class="avatar-head"><i data-lucide="x-circle"></i><span>审核未通过</span>${a}</div>
        <div class="avatar-hint warn">${Y(n.detail||`审核未通过，请更换素材后重试。`)}</div>
        <div class="asset-tools">
            <button class="asset-btn" type="button" data-avatar-register="${X(e.id)}" ${o} ${r?`disabled`:``}><i data-lucide="refresh-cw"></i><span>${r?`处理中…`:`重新提交`}</span></button>
        </div>
    </div>`}function fr(e){let t=l===e.id||l===`__batch__`,n=e.registrations&&typeof e.registrations==`object`?e.registrations:{},r=Object.keys(n).filter(e=>n[e]&&(n[e].task_id||[`Queued`,`Uploading`,`Cancelled`].includes(n[e].status))).map(r=>dr(e,r,n[r],t)).join(``),i=u.get(e.id),a=i&&!Object.values(n).some(e=>[`Queued`,`Uploading`,`Processing`].includes(e?.status))?`<div class="avatar-card processing"><div class="avatar-head"><i data-lucide="loader"></i><span>排队或提交中</span></div><div class="asset-tools"><button class="asset-btn danger" type="button" data-avatar-cancel="${X(e.id)}" data-avatar-prov="${X(i.providerId)}"><i data-lucide="x"></i><span>取消认证</span></button></div></div>`:``,o=cn();if(!o.length)return`<div class="avatar-section">
            ${r}
            <div class="avatar-head"><i data-lucide="user-round-cog"></i><span>注册为真人/数字人</span></div>
            <div class="avatar-hint">未检测到可用平台。请先在「API 平台管理」中添加并启用 API 平台（如 APIMart）并填写 Key。</div>
        </div>`;let s=ln(),c=an(s),d=on(s),f=s&&s.has_key===!1,ee=d&&n[c]&&n[c].task_id,p=`<select class="avatar-provider-select" data-avatar-provider>${o.map(e=>`<option value="${X(e.id)}" ${e.id===s?.id?`selected`:``}>${Y(un(e))}</option>`).join(``)}</select>`,m;return m=d?`
            <div class="avatar-hint">提交到 ${Y(sn(c))} 私域素材审核，通过后生成 asset:// 地址，可在该平台的视频生成中通过 @ 直接调用（一个素材可注册到多个平台，平台间互相隔离）。</div>
            ${p}
            ${f?`<div class="avatar-hint warn">该平台尚未配置 API Key。</div>`:``}
            ${ee?`<div class="avatar-hint">该平台已注册，再次提交会覆盖该平台的认证。</div>`:``}
            <button class="asset-btn primary" type="button" data-avatar-register="${X(e.id)}" data-avatar-prov="${X(s?.id||``)}" ${t||f?`disabled`:``}><i data-lucide="user-round-plus"></i><span>${t?`注册中，请稍候…`:ee?`重新注册到该平台`:`注册并等待审核`}</span></button>`:`<div class="avatar-hint">认证是跨平台功能，但「${Y(c?sn(c):s?.name||s?.id||`该平台`)}」的资产认证 API 尚未接入（待接入）。请选择已支持的平台，或继续使用官方控制台认证。</div>${p}`,`<div class="avatar-section">
        ${a}${r}
        <div class="avatar-head"><i data-lucide="user-round-cog"></i><span>注册到平台</span></div>
        ${m}
    </div>`}function pr(e){return e?me&&e.id===C?`
            <div class="panel-head">
                <div class="panel-title"><strong>编辑素材</strong><span>当前分组内直接保存</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-asset-edit-save="${X(e.id)}"><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-asset-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                <div class="detail-media"><button class="detail-media-frame detail-media-zoomable" type="button" data-asset-preview="${X(e.id)}" title="点击放大预览">${bt(e)}</button></div>
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>素材名称</span><input id="assetEditName" type="text" value="${X(e.name||``)}" placeholder="素材名称"></label>
                    <div class="detail-meta-grid">
                        <div class="detail-meta"><span>类型</span><strong>${Y(vt(e))}</strong></div>
                        <div class="detail-meta"><span>创建时间</span><strong>${Y(Qe(e.created_at))}</strong></div>
                    </div>
                    <div class="detail-url">${Y(e.url||``)}</div>
                </div>
            </div>
        `:`
        <div class="panel-head">
            <div class="panel-title"><strong>素材预览</strong><span>${Y(vt(e))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-asset-download="${X(e.id)}" title="下载素材"><i data-lucide="download"></i></button>
                <button class="asset-icon-btn" type="button" data-asset-edit-start="${X(e.id)}" title="编辑"><i data-lucide="pencil"></i></button>
                <button class="asset-icon-btn danger ${A===e.id?`detail-confirm`:``}" type="button" data-asset-delete="${X(e.id)}" title="${A===e.id?`再次点击确认删除`:`删除`}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="detail-media"><button class="detail-media-frame detail-media-zoomable" type="button" data-asset-preview="${X(e.id)}" title="点击放大预览">${bt(e)}</button></div>
            <div class="detail-body">
                <input class="detail-name-input" data-asset-inline-name="${X(e.id)}" type="text" value="${X(e.name||`asset`)}" title="直接修改名称">
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${Y(vt(e))}</strong></div>
                    <div class="detail-meta"><span>创建时间</span><strong>${Y(Qe(e.created_at))}</strong></div>
                    <div class="detail-meta"><span>资产库</span><strong>${Y(tt()?.name||`资产库`)}</strong></div>
                    <div class="detail-meta"><span>分组</span><strong>${Y(at()?.name||`分组`)}</strong></div>
                </div>
                <div class="detail-url">${Y(e.url||``)}</div>
                ${fr(e)}
            </div>
        </div>
    `:`<div class="panel-head"><div class="panel-title"><strong>素材预览</strong><span>选择一个素材查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="image"></i><span>暂无可预览素材</span></div></div>`}function mr({detail:t=!0}={}){e.querySelectorAll(`[data-asset-card]`).forEach(e=>{e.classList.toggle(`active`,e.dataset.assetCard===C)}),e.querySelectorAll(`[data-asset-check]`).forEach(e=>{e.checked=E.has(e.dataset.assetCheck)});let n=e.querySelector(`.asset-content .manage-tools`),r=E.size,i=n?.querySelector(`:scope > span`);i&&(i.textContent=`已选择 ${r} 个素材，支持拖拽框选或逐个勾选。`),[`[data-asset-clear-selection]`,`[data-asset-cut-selected]`,`[data-asset-copy-selected]`,`[data-asset-download-selected]`,`[data-asset-copy-to-canvas]`,`[data-asset-delete-selected]`].forEach(e=>{let t=n?.querySelector(e);t&&(t.disabled=!r)});let a=n?.querySelector(`[data-avatar-register-selected]`);if(a&&(a.disabled=!r||!!l),t){let t=e.querySelector(`.asset-detail`);t&&(t.innerHTML=pr(hn()),Je())}}function hr(){xn();let t=lt(),n=dt(),r=!!n?.readonly;pt();let i=tn(),a=ge?null:_n(),o=(n?.items||[]).length?`当前条件下没有提示词。可以切换分类或清空搜索条件。`:`${n?.name||`当前提示词库`} 暂无提示词，点击「新增」添加。`;e.innerHTML=`
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>提示词库</strong><span>可创建多个词库</span></div>
                <div class="panel-actions compact-actions">
                    ${P?.placement===`head`?``:`<button class="asset-icon-btn" type="button" data-prompt-lib-new title="新建提示词库"><i data-lucide="plus"></i></button>`}
                    ${jn(P,`promptTreeEditInput`,`data-prompt-tree-edit-save`,`data-prompt-tree-edit-cancel`)}
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree">
                    ${t.map(e=>gr(e)).join(``)}
                </div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${pe?`manage-on`:``}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${Y(n?.name||`提示词库`)}</strong>
                    <span>共 ${i.length} 条提示词</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="promptSearch" class="asset-search" type="search" value="${X(ue)}" placeholder="搜索名称、说明或正文"></label>
                    <button class="asset-btn primary" type="button" data-prompt-new ${r?`disabled`:``}><i data-lucide="file-plus-2"></i><span>新增</span></button>
                    <button class="asset-btn ${pe?`primary`:``}" type="button" data-prompt-manage><i data-lucide="list-checks"></i><span>${pe?`完成管理`:`批量管理`}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${O.size} 条提示词，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-prompt-select-all ${i.length&&!r?``:`disabled`}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-prompt-clear-selection ${O.size?``:`disabled`}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn danger ${j===`prompt`?`detail-confirm`:``}" type="button" data-prompt-delete-selected ${r||!O.size?`disabled`:``}><i data-lucide="trash-2"></i><span>${j===`prompt`?`确认删除`:`删除所选`}</span></button>
                </div>
            </div>
            <div class="content-scroll">
                ${i.length?`<div class="prompt-list">${i.map(e=>yr(e,r)).join(``)}</div>`:`<div class="empty-state">${Y(o)}</div>`}
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${br(a,r)}
        </aside>
    `}function gr(e){let t=e.id===b,n=ft(e),r=X(e.id);e.readonly;let i=t&&S===`library`;return`<div class="tree-branch ${t?`expanded`:``}">
        <button class="tree-row tree-parent ${t?`contains-active`:``} ${i?`active`:``}" type="button" data-prompt-lib="${r}">
            <span class="tree-row-icon"><i data-lucide="${e.id===`system`?`sparkles`:`book-open`}"></i></span>
            <span class="tree-row-name">${Y(e.name||`提示词库`)}</span>
            <span class="tree-row-count">${(e.items||[]).length}</span>
        </button>
        ${i?_r(`library`):``}
        <div class="tree-children">
            <button class="tree-row tree-child ${t&&x===`all`&&S===`category`?`active`:``}" type="button" data-prompt-cat="all" data-prompt-cat-lib="${r}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="layout-list"></i></span>
                <span class="tree-row-name">全部提示词</span>
                <span class="tree-row-count">${ht(`all`,e)}</span>
            </button>
            ${n.map(n=>{let i=t&&n.id===x&&S===`category`;return`<button class="tree-row tree-child ${i?`active`:``}" type="button" data-prompt-cat="${X(n.id)}" data-prompt-cat-lib="${r}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="tag"></i></span>
                <span class="tree-row-name">${Y(n.name||mt(n.id))}</span>
                <span class="tree-row-count">${ht(n.id,e)}</span>
            </button>${i?_r(`category`):``}`}).join(``)}
        </div>
    </div>`}function _r(e){let t=vr(e);if(t)return t;if(e===`library`){let e=dt(),t=ut(e),n=`prompt-lib:${e?.id||``}`;return`<div class="tree-action-bar library-actions">
            <button type="button" data-prompt-cat-new><i data-lucide="folder-plus"></i><span>新分组</span></button>
            <button type="button" data-prompt-lib-rename><i data-lucide="pencil"></i><span>重命名</span></button>
            ${t?``:`<button type="button" class="danger ${F===n?`detail-confirm`:``}" data-prompt-lib-delete><i data-lucide="trash-2"></i><span>${F===n?`确认删除`:`删除库`}</span></button>`}
        </div>`}if(x===`all`)return`<div class="tree-action-bar child-actions muted-actions"><span><i data-lucide="lock"></i>请选择具体分组后编辑</span></div>`;let n=`prompt-cat:${x}`;return`<div class="tree-action-bar child-actions">
        <button type="button" data-prompt-cat-rename><i data-lucide="pencil"></i><span>重命名</span></button>
        <button type="button" class="danger ${F===n?`detail-confirm`:``}" data-prompt-cat-delete><i data-lucide="trash-2"></i><span>${F===n?`确认删除`:`删除`}</span></button>
    </div>`}function vr(e){if(!P||P.placement===`head`||!(e===`library`?[`library-new`,`library-rename`,`category-new`]:[`category-new`,`category-rename`]).includes(P.kind))return``;let t=P.label||`名称`;return`<div class="tree-inline-edit ${e===`category`?`child-actions`:`library-actions`}">
        <input id="promptTreeEditInput" type="text" value="${X(P.value||``)}" placeholder="${X(t)}">
        <button type="button" class="primary" data-prompt-tree-edit-save><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" data-prompt-tree-edit-cancel><i data-lucide="x"></i><span>取消</span></button>
    </div>`}function yr(e,t){return`<article class="prompt-row ${e.id===T?`active`:``}" data-prompt-row="${X(e.id)}">
        <input class="prompt-row-check" type="checkbox" data-prompt-check="${X(e.id)}" ${O.has(e.id)?`checked`:``} ${t?`disabled`:``}>
        <div class="prompt-row-main">
            <div class="prompt-row-title"><strong>${Y(e.name||`提示词`)}</strong><span class="prompt-tag">${Y(mt(e.category||`custom`))}</span></div>
            <div class="prompt-row-scene">${Y(e.scene||`未填写用途说明`)}</div>
            <div class="prompt-row-text">${Y(e.positive||``)}</div>
        </div>
    </article>`}function br(e,t){if(ge&&!t)return`
            <div class="panel-head">
                <div class="panel-title"><strong>新增提示词</strong><span>保存到当前提示词库</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-prompt-create-save><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-prompt-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>名称</span><input id="promptEditName" type="text" value="" placeholder="提示词名称"></label>
                    <label class="inline-edit-field"><span>用途说明</span><textarea id="promptEditScene" placeholder="用途说明"></textarea></label>
                    <label class="inline-edit-field"><span>正向提示词</span><textarea id="promptEditPositive" placeholder="正向提示词"></textarea></label>
                    <label class="inline-edit-field"><span>负向提示词</span><textarea id="promptEditNegative" placeholder="负向提示词"></textarea></label>
                </div>
            </div>
        `;if(!e)return`<div class="panel-head"><div class="panel-title"><strong>提示词预览</strong><span>选择一条提示词查看全文</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="text-cursor-input"></i><span>暂无可预览提示词</span></div></div>`;if(he&&e.id===T&&!t)return`
            <div class="panel-head">
                <div class="panel-title"><strong>编辑提示词</strong><span>在当前库内保存</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-prompt-edit-save="${X(e.id)}"><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-prompt-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>名称</span><input id="promptEditName" type="text" value="${X(e.name||``)}" placeholder="提示词名称"></label>
                    <label class="inline-edit-field"><span>用途说明</span><textarea id="promptEditScene" placeholder="用途说明">${Y(e.scene||``)}</textarea></label>
                    <label class="inline-edit-field"><span>正向提示词</span><textarea id="promptEditPositive" placeholder="正向提示词">${Y(e.positive||``)}</textarea></label>
                    <label class="inline-edit-field"><span>负向提示词</span><textarea id="promptEditNegative" placeholder="负向提示词">${Y(e.negative||``)}</textarea></label>
                </div>
            </div>
        `;let n=e.params&&typeof e.params==`object`?Object.entries(e.params):[];return`
        <div class="panel-head">
            <div class="panel-title"><strong>提示词预览</strong><span>${Y(mt(e.category||`custom`))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-prompt-edit-start="${X(e.id)}" ${t?`disabled`:``} title="编辑"><i data-lucide="pencil"></i></button>
                <button class="asset-icon-btn danger ${_e===e.id?`detail-confirm`:``}" type="button" data-prompt-delete="${X(e.id)}" ${t?`disabled`:``} title="${_e===e.id?`再次点击确认删除`:`删除`}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="prompt-detail-head">
                <div class="prompt-detail-title">${Y(e.name||`提示词`)}</div>
                <div class="prompt-detail-scene">${Y(e.scene||`未填写用途说明`)}</div>
            </div>
            <section class="prompt-block">
                <div class="prompt-block-head"><span>正向提示词</span><span>${String(e.positive||``).length} 字符</span></div>
                <div class="prompt-block-body">${Y(e.positive||`未填写`)}</div>
            </section>
            <section class="prompt-block">
                <div class="prompt-block-head"><span>负向提示词</span><span>${String(e.negative||``).length} 字符</span></div>
                <div class="prompt-block-body negative">${Y(e.negative||`未填写`)}</div>
            </section>
            ${n.length?`<div class="params-list">${n.map(([e,t])=>`<div class="param-row"><strong>${Y(e)}</strong><span>${Y(t)}</span></div>`).join(``)}</div>`:``}
        </div>
    `}async function xr(e){if(!at())throw Error(`请先创建图片分组`);let t=new FormData;[...e].forEach(e=>t.append(`files`,e));let n=((await Z(`/api/ai/upload`,{method:`POST`,body:t})).files||[]).filter(e=>e?.url).map(e=>({library_id:g,category_id:_,url:e.url,name:e.name||`asset`}));if(!n.length)throw Error(`没有可保存的素材`);let r=await Z(`/api/asset-library/items/batch`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:g,category_id:_,items:n})});return a=r.library||a,E.clear(),C=r.items?.[0]?.id||C,$(),J(`已上传 ${n.length} 个素材`),{count:n.length,items:r.items||[]}}async function Sr(e){if(!ot())throw Error(`请先创建工作流分组`);let t=[...e].filter(e=>/\.(json|zip)$/i.test(e.name||``)||[`application/json`,`application/zip`,`application/x-zip-compressed`].includes(String(e.type||``).toLowerCase()));if(!t.length)throw Error(`没有可上传的工作流文件`);let n=new FormData;n.append(`library_id`,v||``),n.append(`category_id`,y||``),t.forEach(e=>n.append(`files`,e));let r=await Z(`/api/asset-library/workflows/upload`,{method:`POST`,body:n});a=r.library||a,D.clear(),w=r.items?.[0]?.id||w,$(),J(`已上传 ${r.items?.length||0} 个工作流`)}function Cr(e,t=`download`){if(!e)return;let n=document.createElement(`a`);n.href=e,n.download=t||``,n.target=`_blank`,document.body.appendChild(n),n.click(),n.remove()}async function wr(e){let t=(e||[]).map(e=>fn(e)).filter(e=>e?.url);if(!t.length)return;if(t.length===1){let e=t[0],n=String(e.url||``).toLowerCase().split(`?`)[0].endsWith(`.json`)?`.json`:`.zip`;Cr(e.url,`${e.name||`workflow`}${n}`),J(`已导出工作流`);return}let n=await fetch(`/api/canvas-assets/download`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({filename:`workflows.zip`,items:t.map(e=>({url:e.url,name:e.name||`workflow`}))})});if(!n.ok)throw Error((await n.json().catch(()=>({}))).detail||`导出工作流失败`);let r=await n.blob(),i=document.createElement(`a`);i.href=URL.createObjectURL(r),i.download=`workflows.zip`,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(i.href),1200),J(`已导出 ${t.length} 个工作流`)}async function Tr(e){let t=(e||[]).map(e=>mn(e)).filter(e=>e?.url);if(!t.length){J(`没有可下载的画布资产`);return}if(t.length===1){let e=t[0];Cr(e.url,e.name||`canvas-asset`),J(`已下载画布资产`);return}J(t.length===1?`正在下载画布资产...`:`正在打包 ${t.length} 个画布资产...`);let n=await fetch(`/api/canvas-assets/download`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({filename:`canvas-assets.zip`,items:t.map(e=>({url:e.url,name:e.name||`canvas-asset`}))})});if(!n.ok)throw Error((await n.json().catch(()=>({}))).detail||`下载画布资产失败`);let r=await n.blob(),i=document.createElement(`a`);i.href=URL.createObjectURL(r),i.download=t.length===1?t[0].name||`canvas-asset`:`canvas-assets.zip`,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(i.href),1200),J(`已下载 ${t.length} 个画布资产`)}function Er(e){let t=String(e?.name||`asset`),n=String(e?.url||``).split(`?`)[0],r=n.lastIndexOf(`.`),i=r>n.lastIndexOf(`/`)?n.slice(r):``;return i&&!t.toLowerCase().endsWith(i.toLowerCase())&&(t+=i),t}function Dr(e){let t=Q(e);if(!t||!t.url){J(`没有可下载的素材`);return}let n=Er(t);Cr(`/api/download-output?url=${encodeURIComponent(t.url)}&name=${encodeURIComponent(n)}`,n),J(`已开始下载`)}var Or=`smart_canvas_asset_inbox`;function kr(){let e=[...E].map(e=>Q(e)).filter(e=>e?.url).map(e=>({url:e.url,name:e.name||`素材`,kind:e.kind||``}));if(!e.length){J(`没有可复制的素材`);return}try{localStorage.setItem(Or,JSON.stringify({items:e,ts:Date.now()}))}catch(e){J(`复制失败：`+(e?.message||e));return}J(`已复制 ${e.length} 个素材，去智能画布按 Ctrl+V 粘贴`)}async function Ar(){let e=[...E].map(e=>Q(e)).filter(e=>e?.url);if(!e.length){J(`没有可下载的素材`);return}if(e.length===1){Dr(e[0].id);return}J(`正在打包 ${e.length} 个素材...`);try{let t=await fetch(`/api/canvas-assets/download`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({filename:`assets.zip`,items:e.map(e=>({url:e.url,name:Er(e)}))})});if(!t.ok)throw Error((await t.json().catch(()=>({}))).detail||`下载失败`);let n=await t.blob(),r=document.createElement(`a`);r.href=URL.createObjectURL(n),r.download=`assets.zip`,document.body.appendChild(r),r.click(),r.remove(),setTimeout(()=>URL.revokeObjectURL(r.href),1200),J(`已下载 ${e.length} 个素材`)}catch(e){J(e.message||`下载失败`)}}async function jr(e){let t=fn(e),n=window.prompt(`工作流名称`,t?.name||``);!t||!String(n||``).trim()||(a=(await Z(`/api/asset-library/items/${encodeURIComponent(e)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:n})})).library||a,$(),J(`已重命名工作流`))}async function Mr(e){if(fn(e)){if(A!==e){A=e,$(),J(`再次点击确认删除工作流`);return}a=(await Z(`/api/asset-library/items/${encodeURIComponent(e)}`,{method:`DELETE`})).library||a,D.delete(e),w=``,A=``,$(),J(`已删除工作流`)}}async function Nr(){let e=[...D];if(!e.length)return;let t=await Z(`/api/asset-library/items/delete`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:v,ids:e})});a=t.library||a,D.clear(),w=``,$(),J(`已删除 ${t.removed||0} 个工作流`)}async function Pr(e){let t=[...e].filter(e=>St(e));if(!t.length){J(`没有可上传的图片/视频/音频文件`);return}let n=new FormData;n.append(`folder`,B||``),t.forEach(e=>n.append(`files`,e)),J(`正在上传...`);try{let e=await Z(`/api/local-assets/upload`,{method:`POST`,body:n}),t=Array.isArray(e.files)?e.files:[];await Pt(),V=t[0]?.id||V,$(),J(`已上传 ${t.length} 个素材`)}catch(e){J(e.message||`上传失败`)}}async function Fr(e){let t=(e||[]).map(e=>Pn(e)?.file).filter(Boolean);if(t.length){J(`正在删除...`);try{await Z(`/api/local-assets/delete`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({names:t})}),await Pt(),H.clear(),V&&!Pn(V)&&(V=``),$(),J(`已删除 ${t.length} 个素材`)}catch(e){J(e.message||`删除失败`)}}}async function Ir(){let e=window.prompt(`新建文件夹名称`,`新文件夹`);if(String(e||``).trim())try{let t=await Z(`/api/local-assets/folders`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({parent:B||``,name:e})});z=Array.isArray(t.items)?t.items:z,Ne=t.tree||Ne,B=t.folder?.path||B,V=``,H.clear(),$(),J(`已新建本地素材文件夹`)}catch(e){J(e.message||`新建文件夹失败`)}}async function Lr(){if(!B){J(`根目录不能重命名`);return}let e=Ln(),t=window.prompt(`重命名文件夹`,e);if(!(!String(t||``).trim()||t===e))try{let e=await Z(`/api/local-assets/folders`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({path:B,name:t})});z=Array.isArray(e.items)?e.items:z,Ne=e.tree||Ne,B=e.folder?.path||B,V=``,H.clear(),$(),J(`已重命名本地素材文件夹`)}catch(e){J(e.message||`重命名文件夹失败`)}}async function Rr(){let e=Bn();if(!(!e.length||ke)){if(Ot(),!Ae||!je){J(`请先在 API 设置中配置可用的聊天/视觉模型`);return}ke=!0,$(),J(`正在反推 ${e.length} 张本地图片的提示词...`);try{let t=await Z(`/api/local-assets/caption`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({names:e.map(e=>e.file||e.id),provider:Ae,model:je,prompt:(Me||`描述图片`).trim()||`描述图片`})});await Pt(),H.clear(),e[0]?.id&&(V=e[0].id),$();let n=(t.items||[]).filter(e=>!e.ok);J(n.length?`已完成 ${t.count||0} 张，${n.length} 张失败：${n[0].error||`反推失败`}`:`已反推并保存 ${t.count||e.length} 张图片提示词`)}catch(e){J(e.message||`提示词反推失败`)}finally{ke=!1,$()}}}async function zr(e){let t=Pn(e);if(!t||gt(t)!==`image`)return;let n=document.getElementById(`localUploadCaptionEdit`),r=n?n.value:t.caption||``;try{let e=await Z(`/api/local-assets/caption`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:t.file||t.id,caption:r})});t.caption=e.caption||``,t.caption_file=e.caption_file||t.caption_file||``,$(),J(`已保存反推提示词`)}catch(e){J(e.message||`保存提示词失败`)}}async function Br(e){if(ve){ve=!1;return}let t=e.target,n=t.closest?.(`[data-tab]`);if(n){i=n.dataset.tab||`assets`,E.clear(),D.clear(),O.clear(),R.clear(),H.clear(),K.clear(),$();return}if(t.closest?.(`#refreshBtn`)){await Cn();return}let a=t.closest?.(`[data-asset-preview]`);if(a){Ur(`asset`,a.dataset.assetPreview||``);return}let o=t.closest?.(`[data-canvas-asset-preview]`);if(o){Ur(`canvas-asset`,o.dataset.canvasAssetPreview||``);return}let s=t.closest?.(`[data-local-preview]`);if(s){Ur(`local`,s.dataset.localPreview||``);return}let c=t.closest?.(`[data-localup-preview]`);if(c){Ur(`localup`,c.dataset.localupPreview||``);return}if(t.closest?.(`[data-localup-upload]`)){r?.click();return}if(t.closest?.(`[data-localup-folder-new]`)){await Ir();return}if(t.closest?.(`[data-localup-folder-rename]`)){await Lr();return}let l=t.closest?.(`[data-localup-folder]`);if(l){B=l.dataset.localupFolder||``,V=``,H.clear(),j=``,$();return}if(t.closest?.(`[data-localup-manage]`)){Fe=!Fe,Fe||H.clear(),$();return}if(t.closest?.(`[data-localup-select-all]`)){Nn().forEach(e=>H.add(e.id)),$();return}if(t.closest?.(`[data-localup-clear]`)){H.clear(),$();return}if(t.closest?.(`[data-localup-delete-selected]`)){await Fr([...H]);return}if(t.closest?.(`[data-local-caption-run]`)){await Rr();return}let u=t.closest?.(`[data-localup-caption-save]`);if(u){await zr(u.dataset.localupCaptionSave||``);return}let d=t.closest?.(`[data-localup-delete-one]`);if(d){await Fr([d.dataset.localupDeleteOne||``]);return}let f=t.closest?.(`[data-localup-check]`);if(f){let e=f.dataset.localupCheck||``;H.has(e)?H.delete(e):H.add(e),$();return}let ee=t.closest?.(`[data-localup-open]`);if(ee){let e=Pn(ee.dataset.localupOpen||``);e?.url&&window.open(e.url,`_blank`);return}let p=t.closest?.(`[data-localup-copy]`);if(p){J(await Ze(Pn(p.dataset.localupCopy||``)?.url||``)?`已复制链接`:`复制失败`);return}let m=t.closest?.(`[data-localup-card]`);if(m){if(Fe){let e=m.dataset.localupCard||``;H.has(e)?H.delete(e):H.add(e)}else V=m.dataset.localupCard||``;$();return}if(t.closest?.(`[data-local-pick-folder]`)){await Ft();return}let h=t.closest?.(`[data-canvas-asset-cat]`);if(h){W=h.dataset.canvasAssetCat||Ut(),Le=``,G=``,K.clear(),$();return}let te=t.closest?.(`[data-canvas-asset-canvas]`);if(te){W=te.dataset.canvasAssetCanvasCat||W||`all`,Le=te.dataset.canvasAssetCanvas||``,G=``,K.clear(),$();return}if(t.closest?.(`[data-canvas-asset-manage]`)){ze=!ze,ze||K.clear(),$();return}if(t.closest?.(`[data-canvas-asset-select-all]`)){$t().forEach(e=>K.add(e.id)),$();return}if(t.closest?.(`[data-canvas-asset-clear-selection]`)){K.clear(),$();return}if(t.closest?.(`[data-canvas-asset-download-selected]`)){await Tr([...K]);return}let ne=t.closest?.(`[data-canvas-asset-download]`);if(ne){await Tr([ne.dataset.canvasAssetDownload||``]);return}let ie=t.closest?.(`[data-canvas-asset-open]`);if(ie){let e=mn(ie.dataset.canvasAssetOpen||``);e?.url&&window.open(e.url,`_blank`,`noopener`);return}let ae=t.closest?.(`[data-canvas-asset-copy]`);if(ae){J(await Ze(mn(ae.dataset.canvasAssetCopy||``)?.url||``)?`已复制画布资产链接`:`复制失败`);return}if(t.closest?.(`[data-canvas-asset-check]`))return;let ce=t.closest?.(`[data-canvas-asset-card]`);if(ce){let e=ce.dataset.canvasAssetCard||``;G=e,ze&&(K.has(e)?K.delete(e):K.add(e)),An();return}let le=t.closest?.(`[data-shared-remove]`);if(le){e.stopPropagation(),await It(le.dataset.sharedRemove||``);return}let ue=t.closest?.(`[data-shared-open]`);if(ue){await Rt(ue.dataset.sharedOpen||``);return}if(t.closest?.(`[data-local-manage]`)){De=!De,j=``,De||R.clear(),$();return}if(t.closest?.(`[data-local-select-all]`)){Et().forEach(e=>R.add(e.id)),j=``,$();return}if(t.closest?.(`[data-local-clear-selection]`)){R.clear(),j=``,$();return}if(t.closest?.(`[data-local-copy-selected]`)){Ti(`copy`);return}if(t.closest?.(`[data-local-import-clipboard]`)){await Ei();return}if(t.closest?.(`[data-local-clear-clipboard]`)){Oe=null,$();return}let I=t.closest?.(`[data-local-import-one]`);if(I){Ti(`copy`,[I.dataset.localImportOne||``]),await Ei();return}let ye=t.closest?.(`[data-local-open]`);if(ye){Di(ye.dataset.localOpen||``);return}let be=t.closest?.(`[data-local-folder]`);if(be){Te=be.dataset.localFolder||``,L=``,R.clear(),j=``,$();return}if(t.closest?.(`[data-local-check]`))return;let xe=t.closest?.(`[data-local-card]`);if(xe){let e=xe.dataset.localCard||``;L=e,De&&(R.has(e)?R.delete(e):R.add(e)),$();return}if(t.closest?.(`[data-workflow-manage]`)){fe=!fe,fe||D.clear(),A=``,$();return}if(t.closest?.(`[data-workflow-select-all]`)){Bt().forEach(e=>D.add(e.id)),$();return}if(t.closest?.(`[data-workflow-clear-selection]`)){D.clear(),$();return}if(t.closest?.(`[data-workflow-export-selected]`)){await wr([...D]);return}if(t.closest?.(`[data-workflow-delete-selected]`)){await Nr();return}if(t.closest?.(`[data-workflow-upload]`)){r&&(r.accept=`.json,.zip,application/json,application/zip,application/x-zip-compressed`),r?.click();return}let Se=t.closest?.(`[data-workflow-download]`);if(Se){await wr([Se.dataset.workflowDownload||``]);return}let Ce=t.closest?.(`[data-workflow-rename]`);if(Ce){await jr(Ce.dataset.workflowRename||``);return}let we=t.closest?.(`[data-workflow-delete]`);if(we){await Mr(we.dataset.workflowDelete||``);return}if(t.closest?.(`[data-workflow-cat-new]`)){N={kind:`category-new`,placement:`head`,value:`新工作流分组`,label:`工作流分组名称`},F=``,$(),Mn(`workflowTreeEditInput`);return}if(t.closest?.(`[data-workflow-cat-rename]`)){let e=ot();if(!e)return;N={kind:`category-rename`,value:e.name||``,label:`工作流分组名称`,categoryId:e.id},F=``,$(),Mn(`workflowTreeEditInput`);return}if(t.closest?.(`[data-workflow-cat-delete]`)){await ii();return}let Ee=t.closest?.(`[data-workflow-lib]`);if(Ee){v=Ee.dataset.workflowLib||``,y=``,w=``,D.clear(),$();return}let ke=t.closest?.(`[data-workflow-cat]`);if(ke){v=ke.dataset.workflowCatLib||v,y=ke.dataset.workflowCat||``,w=``,D.clear(),$();return}let Ae=t.closest?.(`[data-workflow-card]`);if(Ae){let e=Ae.dataset.workflowCard||``;w=e,fe&&(D.has(e)?D.delete(e):D.add(e)),A=``,$();return}if(t.closest?.(`[data-asset-tree-edit-save]`)){await ni();return}if(t.closest?.(`[data-asset-tree-edit-cancel]`)){M=null,$();return}if(t.closest?.(`[data-workflow-tree-edit-save]`)){await ri();return}if(t.closest?.(`[data-workflow-tree-edit-cancel]`)){N=null,$();return}if(t.closest?.(`[data-prompt-tree-edit-save]`)){await Oi();return}if(t.closest?.(`[data-prompt-tree-edit-cancel]`)){P=null,$();return}let je=t.closest?.(`[data-asset-edit-save]`);if(je){await ci(je.dataset.assetEditSave||``);return}if(t.closest?.(`[data-asset-edit-cancel]`)){me=!1,$();return}let Me=t.closest?.(`[data-asset-edit-start]`);if(Me){C=Me.dataset.assetEditStart||C,me=!0,A=``,$();return}if(t.closest?.(`[data-asset-manage]`)){de=!de,j=``,de||E.clear(),$();return}if(t.closest?.(`[data-asset-select-all]`)){zt().forEach(e=>E.add(e.id)),j=``,mr({detail:!1});return}if(t.closest?.(`[data-asset-clear-selection]`)){E.clear(),j=``,mr({detail:!1});return}if(t.closest?.(`[data-asset-cut-selected]`)){Ci(`cut`);return}if(t.closest?.(`[data-asset-copy-selected]`)){Ci(`copy`);return}if(t.closest?.(`[data-asset-paste-clipboard]`)){await wi();return}if(t.closest?.(`[data-asset-clear-clipboard]`)){k=null,$();return}let z=t.closest?.(`[data-asset-rename]`);if(z){await si(z.dataset.assetRename||``);return}let Ne=t.closest?.(`[data-asset-delete]`);if(Ne){await xi(Ne.dataset.assetDelete||``);return}let Pe=t.closest?.(`[data-asset-download]`);if(Pe){Dr(Pe.dataset.assetDownload||``);return}let Ie=t.closest?.(`[data-asset-open]`);if(Ie){Hr(Ie.dataset.assetOpen||``);return}let U=t.closest?.(`[data-avatar-copy]`);if(U){let e=U.dataset.avatarCopy||``;J(await Ze(e)?`已复制 asset:// 地址`:`复制失败，请手动复制：${e}`);return}if(t.closest?.(`[data-avatar-register-selected]`)){await ui();return}let Re=t.closest?.(`[data-avatar-cancel]`);if(Re){await pi(Re.dataset.avatarCancel||``,Re.dataset.avatarProv||``);return}let q=t.closest?.(`[data-avatar-register]`);if(q){await fi(q.dataset.avatarRegister||``,q.dataset.avatarProv||``);return}let Be=t.closest?.(`[data-avatar-check]`);if(Be){await hi(Be.dataset.avatarCheck||``,!1,Be.dataset.avatarProv||``);return}if(t.closest?.(`[data-asset-download-selected]`)){await Ar();return}if(t.closest?.(`[data-asset-copy-to-canvas]`)){kr();return}if(t.closest?.(`[data-asset-delete-selected]`)){await Si();return}if(t.closest?.(`[data-asset-upload]`)){r&&(r.accept=`image/*,video/*,audio/*`),r?.click();return}if(t.closest?.(`[data-asset-lib-new]`)){re=`library`,M={kind:`library-new`,placement:`head`,value:`新资产库`,label:`资产库名称`},$(),Mn(`assetTreeEditInput`);return}if(t.closest?.(`[data-asset-lib-rename]`)){let e=t.closest(`[data-asset-lib]`);e&&(g=e.dataset.assetLib||g),re=`library`,M={kind:`library-rename`,value:tt()?.name||``,label:`资产库名称`},F=``,$();return}if(t.closest?.(`[data-asset-lib-delete]`)){let e=t.closest(`[data-asset-lib]`);e&&(g=e.dataset.assetLib||g),await ai();return}if(t.closest?.(`[data-asset-cat-new]`)){let e=t.closest(`[data-asset-lib]`),n=t.closest(`[data-asset-cat]`);e&&(g=e.dataset.assetLib||g),n&&(g=n.dataset.assetCatLib||g),M={kind:`category-new`,value:`新分组`,label:`分组名称`},F=``,$();return}if(t.closest?.(`[data-asset-cat-rename]`)){let e=t.closest(`[data-asset-cat]`);e&&(g=e.dataset.assetCatLib||g,_=e.dataset.assetCat||_),re=`category`,M={kind:`category-rename`,value:at()?.name||``,label:`分组名称`},F=``,$();return}if(t.closest?.(`[data-asset-cat-delete]`)){let e=t.closest(`[data-asset-cat]`);e&&(g=e.dataset.assetCatLib||g,_=e.dataset.assetCat||_),await oi();return}let Ve=t.closest?.(`[data-asset-lib]`);if(Ve){let e=Ve.dataset.assetLib||``;e===g?se.has(e)?se.delete(e):se.add(e):(g=e,se.delete(e),_=rt()[0]?.id||``,C=``,E.clear()),oe(),re=`library`,Ye();return}let He=t.closest?.(`[data-asset-cat]`);if(He){g=He.dataset.assetCatLib||g,se.delete(g),oe(),_=He.dataset.assetCat||``,re=`category`,C=``,E.clear(),Ye();return}if(t.closest?.(`[data-asset-load-more]`)){Yn();return}let Ue=t.closest?.(`[data-asset-card]`);if(Ue&&!t.closest?.(`[data-asset-check]`)){let e=Ue.dataset.assetCard||``;C=e,me=!1,A=``,de&&(E.has(e)?E.delete(e):E.add(e),j=``),mr();return}let We=t.closest?.(`[data-prompt-edit-save]`);if(We){await Ni(We.dataset.promptEditSave||``);return}if(t.closest?.(`[data-prompt-create-save]`)){await ji();return}if(t.closest?.(`[data-prompt-edit-cancel]`)){he=!1,ge=!1,$();return}let Ge=t.closest?.(`[data-prompt-edit-start]`);if(Ge){T=Ge.dataset.promptEditStart||T,he=!0,ge=!1,_e=``,$();return}if(t.closest?.(`[data-prompt-manage]`)){pe=!pe,j=``,pe||O.clear(),$();return}if(t.closest?.(`[data-prompt-select-all]`)){tn().forEach(e=>O.add(e.id)),j=``,$();return}if(t.closest?.(`[data-prompt-clear-selection]`)){O.clear(),j=``,$();return}let Ke=t.closest?.(`[data-prompt-edit]`);if(Ke){await Mi(Ke.dataset.promptEdit||``);return}let qe=t.closest?.(`[data-prompt-delete]`);if(qe){await Pi(qe.dataset.promptDelete||``);return}if(t.closest?.(`[data-prompt-delete-selected]`)){await Fi();return}let Je=t.closest?.(`[data-prompt-new]`);if(Je){let e=Je.dataset.libId||t.closest(`[data-prompt-lib]`)?.dataset.promptLib,n=t.closest(`[data-prompt-cat]`);e&&(b=e,x=`all`),n&&(b=n.dataset.promptCatLib||b,x=n.dataset.promptCat||x),ge=!0,he=!1,_e=``,$();return}if(t.closest?.(`[data-prompt-lib-new]`)){S=`library`,P={kind:`library-new`,placement:`head`,value:`新提示词库`,label:`提示词库名称`},$(),Mn(`promptTreeEditInput`);return}if(t.closest?.(`[data-prompt-cat-new]`)){let e=t.closest(`[data-prompt-lib]`);e&&(b=e.dataset.promptLib||b),S=`library`,P={kind:`category-new`,value:`新分组`,label:`分组名称`},F=``,$();return}if(t.closest?.(`[data-prompt-cat-rename]`)){S=`category`,P={kind:`category-rename`,value:pt().find(e=>e.id===x)?.name||``,label:`分组名称`},F=``,$();return}if(t.closest?.(`[data-prompt-cat-delete]`)){await ki();return}let Xe=t.closest?.(`[data-prompt-lib-rename]`);if(Xe){let e=t.closest(`[data-prompt-lib]`);Xe.dataset.libId&&(b=Xe.dataset.libId),e&&(b=e.dataset.promptLib||b),S=`library`,P={kind:`library-rename`,value:dt()?.name||``,label:`提示词库名称`},$();return}let Y=t.closest?.(`[data-prompt-lib-delete]`);if(Y){Y.dataset.libId&&(b=Y.dataset.libId),await Ai();return}let X=t.closest?.(`[data-prompt-lib]`);if(X){b=X.dataset.promptLib||``,x=`all`,S=`library`,T=``,ge=!1,he=!1,O.clear(),$();return}let Z=t.closest?.(`[data-prompt-cat]`);if(Z){b=Z.dataset.promptCatLib||b,x=Z.dataset.promptCat||`all`,S=`category`,T=``,ge=!1,he=!1,O.clear(),$();return}let Qe=t.closest?.(`[data-prompt-row]`);if(Qe){let e=Qe.dataset.promptRow||``;T=e,he=!1,ge=!1,_e=``,pe&&(O.has(e)?O.delete(e):O.add(e),j=``),$();return}}function Vr(e){let t=e?.id?Q(e.id):null;t&&Object.assign(t,e)}function Hr(e){let t=Q(e);t?.url&&window.open(t.url,`_blank`,`noopener`)}function Ur(e,t){let n=e===`local`?jt(t):e===`localup`?Pn(t):e===`canvas-asset`?mn(t):Q(t);if(!n)return;let r=e===`local`?n.kind||Ct(n):gt(n);if(![`image`,`video`].includes(r)){J(`仅图片和视频支持预览`);return}let i=e===`local`?wt(n):n.url;if(!i)return;document.querySelector(`.asset-lightbox`)?.remove();let a=document.createElement(`div`);a.className=`asset-lightbox`,a.dataset.scale=`1`,a.dataset.x=`0`,a.dataset.y=`0`,a.innerHTML=`
        <div class="asset-lightbox-inner" role="dialog" aria-modal="true" aria-label="${r===`video`?`视频预览`:`图片预览`}">
            ${r===`video`?`<video class="asset-lightbox-video" src="${X(i)}" controls autoplay playsinline preload="metadata"></video>`:`<img class="asset-lightbox-image" src="${X(i)}" alt="${X(n.name||`preview`)}" draggable="false">`}
        </div>
    `,document.body.appendChild(a),document.body.classList.add(`asset-lightbox-open`)}function Wr(){document.querySelector(`.asset-lightbox`)?.remove(),document.body.classList.remove(`asset-lightbox-open`),Ie=null}function Gr(e){let t=e?.querySelector?.(`.asset-lightbox-image`);if(!t)return;let n=Number(e.dataset.scale||1),r=Number(e.dataset.x||0),i=Number(e.dataset.y||0);t.style.transform=`translate(${r}px, ${i}px) scale(${n})`,e.classList.toggle(`zoomed`,n>1.01)}function Kr(e){let t=e.target.closest?.(`.asset-lightbox`),n=e.target.closest?.(`.asset-lightbox-image`);if(!t||!n)return;e.preventDefault();let r=Number(t.dataset.scale||1),i=Math.max(.25,Math.min(8,r*(e.deltaY<0?1.15:.87))),a=t.getBoundingClientRect(),o=e.clientX-(a.left+a.width/2),s=e.clientY-(a.top+a.height/2),c=Number(t.dataset.x||0),l=Number(t.dataset.y||0),u=i/r;t.dataset.scale=String(i),i<=1.01?(t.dataset.x=`0`,t.dataset.y=`0`):(t.dataset.x=String(o-u*(o-c)),t.dataset.y=String(s-u*(s-l))),Gr(t)}function qr(e){let t=e.target.closest?.(`.asset-lightbox-image`),n=e.target.closest?.(`.asset-lightbox`);!t||!n||Number(n.dataset.scale||1)<=1.01||(e.preventDefault(),Ie={overlay:n,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,originX:Number(n.dataset.x||0),originY:Number(n.dataset.y||0)},t.setPointerCapture?.(e.pointerId),n.classList.add(`dragging`))}function Jr(e){if(!Ie||e.pointerId!==Ie.pointerId)return;let{overlay:t,startX:n,startY:r,originX:i,originY:a}=Ie;t.dataset.x=String(i+e.clientX-n),t.dataset.y=String(a+e.clientY-r),Gr(t)}function Yr(e){!Ie||e.pointerId!==Ie.pointerId||(Ie.overlay?.classList.remove(`dragging`),Ie=null)}function Xr(e,t){return e.left<t.right&&e.right>t.left&&e.top<t.bottom&&e.bottom>t.top}function Zr(){return i===`assets`&&de?`[data-asset-card]`:i===`prompts`&&pe?`[data-prompt-row]`:i===`local`&&De?`[data-local-card]`:i===`canvas-assets`&&ze?`[data-canvas-asset-card]`:``}function Qr(e){let t=Zr();if(!t||e.button!==0||e.target.closest?.(`button,input,textarea,select,.side-upload-card,.upload-grid-card,.asset-search-wrap`))return;let n=e.target.closest?.(`.content-scroll`);if(!n)return;e.preventDefault();let r=document.createElement(`div`);r.className=`selection-marquee`,n.appendChild(r),I={startX:e.clientX,startY:e.clientY,area:n,box:r,active:!1,selector:t,baseAsset:new Set(E),basePrompt:new Set(O),baseLocal:new Set(R),baseCanvasAsset:new Set(K)}}function $r(e){I&&(I.pointer={clientX:e.clientX,clientY:e.clientY},!Ue&&(Ue=requestAnimationFrame(()=>{Ue=0;let e=I?.pointer;e&&ei(e.clientX,e.clientY)})))}function ei(e,t){if(!I)return;if(!I.active){let n=Math.abs(e-I.startX),r=Math.abs(t-I.startY);if(Math.max(n,r)<4)return;I.active=!0,I.targets=[...document.querySelectorAll(I.selector)].map(e=>({el:e,rect:e.getBoundingClientRect()}))}let n=Math.min(I.startX,e),r=Math.min(I.startY,t),a=Math.max(I.startX,e),o=Math.max(I.startY,t),s=I.area.getBoundingClientRect(),c=n-s.left+I.area.scrollLeft,l=r-s.top+I.area.scrollTop;Object.assign(I.box.style,{left:`${c}px`,top:`${l}px`,width:`${Math.max(1,a-n)}px`,height:`${Math.max(1,o-r)}px`});let u={left:n,top:r,right:a,bottom:o};i===`assets`?(E=new Set(I.baseAsset),I.targets.forEach(({el:e,rect:t})=>{Xr(u,t)&&E.add(e.dataset.assetCard)})):i===`prompts`?(O=new Set(I.basePrompt),I.targets.forEach(({el:e,rect:t})=>{Xr(u,t)&&O.add(e.dataset.promptRow)})):i===`local`?(R=new Set(I.baseLocal),I.targets.forEach(({el:e,rect:t})=>{Xr(u,t)&&R.add(e.dataset.localCard)})):i===`canvas-assets`&&(K=new Set(I.baseCanvasAsset),I.targets.forEach(({el:e,rect:t})=>{Xr(u,t)&&K.add(e.dataset.canvasAssetCard)})),document.querySelectorAll(`[data-asset-check]`).forEach(e=>{e.checked=E.has(e.dataset.assetCheck)}),document.querySelectorAll(`[data-prompt-check]`).forEach(e=>{e.checked=O.has(e.dataset.promptCheck)}),document.querySelectorAll(`[data-local-check]`).forEach(e=>{e.checked=R.has(e.dataset.localCheck)}),document.querySelectorAll(`[data-canvas-asset-check]`).forEach(e=>{e.checked=K.has(e.dataset.canvasAssetCheck)})}function ti(){if(!I)return;if(Ue){cancelAnimationFrame(Ue),Ue=0;let e=I.pointer;e&&ei(e.clientX,e.clientY)}let e=I.active,t=i;I.box.remove(),I=null,j=``,e&&(ve=!0,t===`assets`?mr({detail:!1}):$())}async function ni(){if(!M)return;let e=document.getElementById(`assetTreeEditInput`)?.value||``;if(!String(e||``).trim()){J(`名称不能为空`);return}let t=null;if(M.kind===`library-new`)t=await Z(`/api/asset-library/libraries`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})}),a=t.library||a,g=t.asset_library?.id||g,re=`library`;else if(M.kind===`library-rename`){let n=tt();if(!n)return;t=await Z(`/api/asset-library/libraries/${encodeURIComponent(n.id)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})}),a=t.library||a,re=`library`}else if(M.kind===`category-new`)t=await Z(`/api/asset-library/categories`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:g,name:e,type:`image`})}),a=t.library||a,_=t.category?.id||_,re=`category`;else if(M.kind===`category-rename`){let n=at();if(!n)return;t=await Z(`/api/asset-library/categories/${encodeURIComponent(n.id)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})}),a=t.library||a,re=`category`}M=null,F=``,$(),J(`已保存`)}async function ri(){if(!N)return;let e=document.getElementById(`workflowTreeEditInput`)?.value||``;if(!String(e||``).trim()){J(`名称不能为空`);return}if(N.kind===`category-new`){let t=nt();if(!t){J(`请先选择资产库`);return}v=t.id||v;let n=await Z(`/api/asset-library/categories`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:v,name:e,type:`workflow`})});a=n.library||a,y=n.category?.id||y}else if(N.kind===`category-rename`){let t=ot(),n=N.categoryId||t?.id||y;if(!n)return;a=(await Z(`/api/asset-library/categories/${encodeURIComponent(n)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e,library_id:v})})).library||a,y=n}N=null,F=``,$(),J(`已保存`)}async function ii(){let e=ot();if(!e)return;let t=e.__libraryId||v,n=`workflow-cat:${t}:${e.id}`;if(F!==n){F=n,N=null,$(),J(`再次点击确认删除工作流分组`);return}a=(await Z(`/api/asset-library/categories/${encodeURIComponent(e.id)}?library_id=${encodeURIComponent(t)}`,{method:`DELETE`})).library||a,y=``,w=``,D.clear(),F=``,$(),J(`工作流分组已删除`)}async function ai(){let e=tt();if(!e)return;let t=`asset-lib:${e.id}`;if(F!==t){F=t,M=null,$(),J(`再次点击确认删除资产库`);return}a=(await Z(`/api/asset-library/libraries/${encodeURIComponent(e.id)}`,{method:`DELETE`})).library||a,g=a.active_library_id||et()[0]?.id||``,_=``,C=``,E.clear(),F=``,$()}async function oi(){let e=at();if(!e)return;let t=`asset-cat:${e.id}`;if(F!==t){F=t,M=null,$(),J(`再次点击确认删除分组`);return}a=(await Z(`/api/asset-library/categories/${encodeURIComponent(e.id)}`,{method:`DELETE`})).library||a,_=``,C=``,E.clear(),F=``,$()}async function si(e){let t=Q(e),n=window.prompt(`素材名称`,t?.name||``);!t||!String(n||``).trim()||(a=(await Z(`/api/asset-library/items/${encodeURIComponent(e)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:n})})).library||a,C=e,$())}async function ci(e){let t=Q(e),n=document.getElementById(`assetEditName`)?.value||``;if(!t||!String(n||``).trim()){J(`素材名称不能为空`);return}a=(await Z(`/api/asset-library/items/${encodeURIComponent(e)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:n})})).library||a,C=e,me=!1,$(),J(`素材已保存`)}async function li(e,t){let n=Q(e);!n||!String(t||``).trim()||String(n.name||``)!==String(t||``)&&(a=(await Z(`/api/asset-library/items/${encodeURIComponent(e)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:t})})).library||a,C=e,$(),J(`素材名称已保存`))}async function ui(e=``){let t=[...E].map(e=>Q(e)).filter(Boolean),n=t.filter(e=>[`image`,`video`,`audio`].includes(gt(e))).map(e=>e.id),r=t.length-n.length;if(!n.length){J(`所选素材中没有可认证的图片、视频或音频`);return}let i=e&&(s||[]).find(t=>t.id===e)||ln();if(!i){J(`请先在 API 平台管理中添加并启用 API 平台`);return}if(!on(i)){J(`「${sn(an(i))}」的资产认证 API 尚未接入`);return}if(l)return;let a=g;n.forEach(e=>u.set(e,{providerId:i.id,libraryId:a})),l=`__batch__`,$(),J(`正在批量提交 ${n.length} 个素材到 ${sn(an(i))} 审核…`);try{let e=0,t=0,o=0,s=0,c=0,l=r,f=0,ee=0,p=async(r,ee)=>{let p=`${i.id}:${r}`;try{if(d.has(p)){c+=1,d.delete(p);return}let n=await Z(`/api/asset-library/items/${encodeURIComponent(r)}/register-avatar`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:a,provider_id:i.id})});if(d.has(p)){c+=1,d.delete(p);return}if(n.item&&Vr(n.item),n.cancelled||n.status===`Cancelled`){c+=1;return}n.skipped?t+=1:e+=1,n.status!==`Active`&&yi(r,i.id,!0,a,ee*100)}catch(e){d.has(p)?(c+=1,d.delete(p)):await di([r],i,a)?o+=1:Number(e?.status)>=400&&Number(e?.status)<500?l+=1:s+=1}finally{u.delete(r),f+=1,J(`姝ｅ湪鎵归噺鎻愪氦 ${f}/${n.length}锛堝苟鍙?8锛夆€?`)}},m=async()=>{for(;ee<n.length;){let e=ee++;await p(n[e],e)}};await Promise.all(Array.from({length:Math.min(8,n.length)},()=>m()));let h=[`已提交 ${e} 个`];t&&h.push(`跳过 ${t} 个`),o&&h.push(`恢复确认 ${o} 个`),s&&h.push(`${s} 个状态待确认`),c&&h.push(`取消 ${c} 个`),l&&h.push(`${l} 个失败`),J(`${h.join(`，`)}${e||o?`，正在等待审核…`:``}`)}catch(e){J(e.message||`批量认证提交失败`)}finally{n.forEach(e=>u.delete(e)),l=``,$()}}async function di(e,t,n){let r=an(t),i=new Set;for(let o of[500,1500,3e3])try{if(await new Promise(e=>setTimeout(e,o)),a=(await Z(`/api/asset-library`)).library||a,e.forEach((e,a)=>{let o=mi(Q(e),r);!o||![`Processing`,`Active`].includes(o.status)||(!i.has(e)&&o.status===`Processing`&&o.task_id&&yi(e,t.id,!0,n,a*250),i.add(e))}),i.size===e.length)break}catch{}return i.size}async function fi(e,t=``){if(!Q(e))return;let n=t&&(s||[]).find(e=>e.id===t)||ln();if(!n){J(`请先在 API 平台管理中添加并启用 API 平台`);return}if(!on(n)){J(`「${sn(an(n))}」的资产认证 API 尚未接入`);return}if(l)return;let r=`${n.id}:${e}`;u.set(e,{providerId:n.id,libraryId:g}),l=e,C=e,$(),J(`正在上传素材并提交 ${sn(an(n))} 审核…`);try{let t=await Z(`/api/asset-library/items/${encodeURIComponent(e)}/register-avatar`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:g,provider_id:n.id})});if(d.has(r)){d.delete(r),J(`认证已取消`);return}if(a=t.library||a,t.cancelled||t.status===`Cancelled`){J(`认证已取消`);return}t.skipped?J(t.status===`Active`?`该素材已经审核通过，无需重复提交`:`该素材已在审核中，无需重复提交`):J(`已提交审核，正在等待 ${sn(an(n))} 通过…`),t.status!==`Active`&&yi(e,n.id,!0)}catch(e){J(d.has(r)?`认证已取消`:e.message||`数字人提交失败`),d.delete(r)}finally{u.delete(e),l=``,$()}}async function pi(e,t=``){let n=Q(e),r=u.get(e),i=t&&(s||[]).find(e=>e.id===t)||r?.providerId&&(s||[]).find(e=>e.id===r.providerId)||ln();if(!n||!i)return;let a=r?.libraryId||g;d.add(`${i.id}:${e}`),gi(e,i.id),J(`正在取消认证…`);try{let t=await Z(`/api/asset-library/items/${encodeURIComponent(e)}/cancel-avatar`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:a,provider_id:i.id})});t.item&&Vr(t.item),J(t.cancelled?`认证已取消，队列将继续处理其他素材`:`已认证完成，无法取消`)}catch(e){J(e.message||`取消认证失败`)}finally{u.has(e)||d.delete(`${i.id}:${e}`),$()}}function mi(e,t){return(e&&e.registrations&&typeof e.registrations==`object`?e.registrations:{})[t]||null}async function hi(e,t=!1,n=``,r=``){let i=Q(e);if(!i)return;let a=n&&(s||[]).find(e=>e.id===n)||ln();if(!a)return;let o=an(a),c=mi(i,o);if(!(!c||!c.task_id)){t||(l=e,$(),J(`正在查询审核状态…`));try{let n=await Z(`/api/asset-library/items/${encodeURIComponent(e)}/avatar-status`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:r||g,provider_id:a.id})});Vr(n.item);let i=n.item?.registrations&&n.item.registrations[o]||{},s=i.status||``;s===`Active`?(gi(e,a.id),t||J(`审核通过，已生成 asset:// 地址，可在视频生成中通过 @ 调用`)):s===`Failed`?(gi(e,a.id),t||J(i.detail||`审核未通过`)):(t||J(`仍在审核中，稍后会自动刷新…`),yi(e,a.id,!1,r))}catch(n){t||J(n.message||`查询审核状态失败，稍后自动重试`),yi(e,a.id,!1,r)}finally{t||(l=``),$()}}}function gi(e,t){let n=`${t}:${e}`;clearTimeout(f.get(n)),f.delete(n),ee.delete(n),m.delete(n);for(let e=p.length-1;e>=0;e--)p[e].key===n&&p.splice(e,1)}function _i(){for(;ne<te&&p.length;){let e=p.shift();m.delete(e.key);let t=Q(e.id),n=(s||[]).find(t=>t.id===e.providerId),r=n?mi(t,an(n)):null;!t||!n||!r?.task_id||r.status!==`Processing`||(ne+=1,h.add(e.key),Promise.resolve(hi(e.id,!0,e.providerId,e.libraryId)).finally(()=>{ne=Math.max(0,ne-1),h.delete(e.key),_i()}))}}function vi(e,t,n=``){let r=`${t}:${e}`;m.has(r)||h.has(r)||(m.add(r),p.push({key:r,id:e,providerId:t,libraryId:n}),_i())}function yi(e,t,n=!1,r=``,i=6e3){let a=`${t}:${e}`;n&&gi(e,t);let o=(ee.get(a)||0)+1;if(o>100){gi(e,t);return}ee.set(a,o),clearTimeout(f.get(a)),f.set(a,setTimeout(()=>{f.delete(a),vi(e,t,r)},Math.max(250,Number.isFinite(Number(i))?Number(i):6e3)))}function bi(){let e=500;et().forEach(t=>(t.categories||[]).forEach(n=>(n.items||[]).forEach(n=>{let r=n?.registrations&&typeof n.registrations==`object`?n.registrations:{};Object.entries(r).forEach(([r,i])=>{if(!i||i.status!==`Processing`||!i.task_id)return;let a=dn(r,i.provider_id||``);a&&(yi(n.id,a,!0,t.id||``,e),e+=250)})})))}async function xi(e){Q(e)&&(a=(await Z(`/api/asset-library/items/${encodeURIComponent(e)}`,{method:`DELETE`})).library||a,E.delete(e),C===e&&(C=``),A=``,$(),J(`素材已删除`))}async function Si(){if(!E.size)return;let e=[...E],t=await Z(`/api/asset-library/items/delete`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:g,ids:e})});a=t.library||a,e.includes(C)&&(C=``),E.clear(),j=``,$(),J(`已删除 ${t.removed||e.length} 个素材`)}function Ci(e){E.size&&(k={mode:e,ids:[...E],sourceLibraryId:g,sourceCategoryId:_,items:[...E].map(e=>Q(e)).filter(Boolean)},E.clear(),j=``,$(),J(`${e===`cut`?`剪切`:`复制`}了 ${k.ids.length} 个素材，切换分组后粘贴`))}async function wi(){if(k?.ids?.length){if(k.mode===`cut`){if(k.sourceLibraryId===g&&k.sourceCategoryId===_)return;let e=await Z(`/api/asset-library/items/move`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:k.sourceLibraryId,target_library_id:g,target_category_id:_,ids:k.ids})});a=e.library||a,J(`已移动 ${e.moved||0} 个素材`)}else{let e=(k.items||[]).map(e=>({url:e.url,name:e.name||`asset`})).filter(e=>e.url),t=await Z(`/api/asset-library/items/batch`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:g,category_id:_,items:e})});a=t.library||a,J(`已复制 ${t.items?.length||0} 个素材`)}k=null,E.clear(),C=``,$()}}function Ti(e,t=null){let n=Array.isArray(t)?t.filter(Boolean):[...R];if(!n.length)return;let r=n.map(e=>jt(e)).filter(Boolean);r.length&&(Oe={mode:`copy`,ids:r.map(e=>e.id),items:r,sourceRootName:xe||`共享文件夹`},R.clear(),j=``,$(),J(`复制了 ${r.length} 个共享素材，导入后会拷贝到图片资产分组（共享文件夹原文件保留）`))}async function Ei(){if(!Oe?.items?.length)return;if(!at()){J(`请先在图片资产中创建或选择分组`);return}let e=Oe,t=new Map;if(e.items.forEach(e=>{!e||!e.folderId||!e.relativePath||(t.has(e.folderId)||t.set(e.folderId,[]),t.get(e.folderId).push(e.relativePath))}),!t.size)return;J(`正在导入共享素材...`);let n=0;try{for(let[e,r]of t){let t=await Z(`/api/shared-folders/import`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:g,category_id:_,folder_id:e,paths:r})});a=t.library||a,n+=t.items?.length||0}}catch(e){J(e.message||`导入共享素材失败`);return}Oe=null,R.clear(),L=``,$(),J(`已导入 ${n} 个素材到图片资产`)}function Di(e){let t=jt(e);if(!t)return;let n=wt(t);n&&window.open(n,`_blank`,`noopener`)}async function Oi(){if(!P)return;let e=document.getElementById(`promptTreeEditInput`)?.value||``;if(!String(e||``).trim()){J(`名称不能为空`);return}let t=null;if(P.kind===`library-new`)t=await Z(`/api/prompt-libraries`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})}),o=t.library||o,b=t.prompt_library?.id||b,x=`all`,S=`library`;else if(P.kind===`library-rename`){let n=dt();if(!n)return;t=await Z(`/api/prompt-libraries/${encodeURIComponent(n.id)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})}),o=t.library||o,S=`library`}else if(P.kind===`category-new`){let n=dt();t=await Z(`/api/prompt-libraries/categories`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:n?.id||`system`,name:e})}),o=t.library||o,x=t.category?.id||x,S=`category`}else P.kind===`category-rename`&&(t=await Z(`/api/prompt-libraries/categories/${encodeURIComponent(x)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:e})}),o=t.library||o,S=`category`);P=null,F=``,$(),J(`已保存`)}async function ki(){if(x===`all`){J(`请选择具体分组后删除`);return}let e=`prompt-cat:${x}`;if(F!==e){F=e,P=null,$(),J(`再次点击确认删除分组`);return}o=(await Z(`/api/prompt-libraries/categories/${encodeURIComponent(x)}`,{method:`DELETE`})).library||o,x=`all`,F=``,$(),J(`分组已删除`)}async function Ai(){let e=dt();if(!e)return;if(ut(e)){J(`系统提示词库不能删除`);return}let t=`prompt-lib:${e.id}`;if(F!==t){F=t,P=null,$(),J(`再次点击确认删除提示词库`);return}o=(await Z(`/api/prompt-libraries/${encodeURIComponent(e.id)}`,{method:`DELETE`})).library||o,b=o.active_library_id||lt()[0]?.id||`system`,x=`all`,T=``,O.clear(),F=``,$(),J(`提示词库已删除`)}async function ji(){let e=dt(),t=document.getElementById(`promptEditName`)?.value||``,n=document.getElementById(`promptEditScene`)?.value||``,r=document.getElementById(`promptEditPositive`)?.value||``,i=document.getElementById(`promptEditNegative`)?.value||``;if(!e)return;if(!String(t||``).trim()||!String(r||``).trim()){J(`名称和正向提示词不能为空`);return}let a=x===`all`?`custom`:x,s=await Z(`/api/prompt-libraries/items`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:e.id,name:t,positive:r,negative:i,category:a,scene:n})});o=s.library||o,T=s.item?.id||T,ge=!1,$(),J(`提示词已新增`)}async function Mi(e){let t=pn(e),n=dt();if(!t||!n)return;let r=window.prompt(`提示词名称`,t.name||``);if(!String(r||``).trim())return;let i=window.prompt(`用途说明`,t.scene||``)||``,a=window.prompt(`正向提示词内容`,t.positive||``);if(!String(a||``).trim())return;let s=window.prompt(`负向提示词内容`,t.negative||``)||``;o=(await Z(`/api/prompt-libraries/items/${encodeURIComponent(e)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:n.id,name:r,positive:a,negative:s,category:t.category||`custom`,scene:i})})).library||o,T=e,$()}async function Ni(e){let t=pn(e),n=dt(),r=document.getElementById(`promptEditName`)?.value||``,i=document.getElementById(`promptEditScene`)?.value||``,a=document.getElementById(`promptEditPositive`)?.value||``,s=document.getElementById(`promptEditNegative`)?.value||``;if(!(!t||!n)){if(!String(r||``).trim()||!String(a||``).trim()){J(`名称和正向提示词不能为空`);return}o=(await Z(`/api/prompt-libraries/items/${encodeURIComponent(e)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({library_id:n.id,name:r,positive:a,negative:s,category:t.category||`custom`,scene:i})})).library||o,T=e,he=!1,$(),J(`提示词已保存`)}}async function Pi(e){pn(e)&&(o=(await Z(`/api/prompt-libraries/items/${encodeURIComponent(e)}`,{method:`DELETE`})).library||o,O.delete(e),T===e&&(T=``),_e=``,$(),J(`提示词已删除`))}async function Fi(){if(!O.size)return;if(j!==`prompt`){j=`prompt`,$(),J(`再次点击确认删除所选提示词`);return}let e=[...O];o=(await Z(`/api/prompt-libraries/items/delete`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({ids:e})})).library||o,e.includes(T)&&(T=``),O.clear(),j=``,$()}e.addEventListener(`click`,e=>{Br(e).catch(e=>J(e.message||`操作失败`))}),document.addEventListener(`click`,e=>{e.target.closest?.(`.asset-lightbox`)&&!e.target.closest?.(`.asset-lightbox-image,.asset-lightbox-video`)&&Wr()}),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&Wr(),e.target?.id===`assetTreeEditInput`&&(e.key===`Enter`&&(e.preventDefault(),ni().catch(e=>J(e.message||`保存失败`))),e.key===`Escape`&&(e.preventDefault(),M=null,$())),e.target?.id===`workflowTreeEditInput`&&(e.key===`Enter`&&(e.preventDefault(),ri().catch(e=>J(e.message||`保存失败`))),e.key===`Escape`&&(e.preventDefault(),N=null,$())),e.target?.id===`promptTreeEditInput`&&(e.key===`Enter`&&(e.preventDefault(),Oi().catch(e=>J(e.message||`保存失败`))),e.key===`Escape`&&(e.preventDefault(),P=null,$()))}),document.addEventListener(`wheel`,Kr,{passive:!1}),document.addEventListener(`pointerdown`,qr),document.addEventListener(`pointermove`,Jr),document.addEventListener(`pointerup`,Yr),document.addEventListener(`pointercancel`,Yr),e.addEventListener(`pointerdown`,Qr),document.addEventListener(`pointermove`,e=>$r(e)),document.addEventListener(`pointerup`,ti),e.addEventListener(`scroll`,e=>{i!==`assets`||!e.target?.classList?.contains(`content-scroll`)||Xn()},!0),window.addEventListener(`resize`,Xn),e.addEventListener(`error`,e=>{let t=e.target;if(!(t instanceof HTMLImageElement))return;let n=t.dataset.originalSrc||``;!n||t.src.endsWith(n)||(delete t.dataset.originalSrc,t.src=n)},!0),e.addEventListener(`input`,e=>{if(e.target?.id===`assetSearch`){let t=e.target.selectionStart||0;ce=e.target.value||``,C=``,Xe(`assetSearch`,t)}if(e.target?.id===`workflowSearch`){let t=e.target.selectionStart||0;le=e.target.value||``,w=``,Xe(`workflowSearch`,t)}if(e.target?.id===`promptSearch`){let t=e.target.selectionStart||0;ue=e.target.value||``,T=``,Xe(`promptSearch`,t)}if(e.target?.id===`localSearch`){let t=e.target.selectionStart||0;Ee=e.target.value||``,L=``,Xe(`localSearch`,t)}if(e.target?.id===`localUploadSearch`){let t=e.target.selectionStart||0;Pe=e.target.value||``,V=``,Xe(`localUploadSearch`,t)}if(e.target?.id===`canvasAssetSearch`){let t=e.target.selectionStart||0;Re=e.target.value||``,G=``,Xe(`canvasAssetSearch`,t)}e.target?.id===`localCaptionPrompt`&&(Me=e.target.value||``)}),e.addEventListener(`change`,e=>{let t=e.target.closest?.(`[data-asset-inline-name]`);if(t){li(t.dataset.assetInlineName||``,t.value||``).catch(e=>J(e.message||`保存失败`));return}let n=e.target.closest?.(`[data-workflow-inline-name]`);if(n){Z(`/api/asset-library/items/${encodeURIComponent(n.dataset.workflowInlineName||``)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({name:n.value||``})}).then(e=>{a=e.library||a,$(),J(`已保存工作流名称`)}).catch(e=>J(e.message||`保存失败`));return}let r=e.target.closest?.(`[data-asset-check]`);if(r){if(!de)return;r.checked?(E.add(r.dataset.assetCheck),C=r.dataset.assetCheck):E.delete(r.dataset.assetCheck),mr();return}let i=e.target.closest?.(`[data-workflow-check]`);if(i){if(!fe)return;i.checked?(D.add(i.dataset.workflowCheck),w=i.dataset.workflowCheck):D.delete(i.dataset.workflowCheck),$()}let o=e.target.closest?.(`[data-prompt-check]`);if(o){if(!pe)return;o.checked?(O.add(o.dataset.promptCheck),T=o.dataset.promptCheck):O.delete(o.dataset.promptCheck),$()}let s=e.target.closest?.(`[data-local-check]`);if(s){if(!De)return;s.checked?(R.add(s.dataset.localCheck),L=s.dataset.localCheck):R.delete(s.dataset.localCheck),$()}let l=e.target.closest?.(`[data-canvas-asset-check]`);if(l){if(!ze)return;l.checked?(K.add(l.dataset.canvasAssetCheck),G=l.dataset.canvasAssetCheck):K.delete(l.dataset.canvasAssetCheck),An()}e.target?.id===`canvasAssetSort`&&(q=e.target.value||`canvas_asc`,G=``,$()),e.target?.id===`assetMoveTarget`&&(e.target.value,j=``,$()),e.target?.id===`localCaptionProvider`&&(Ae=e.target.value||``,je=``,$()),e.target?.id===`localCaptionModel`&&(je=e.target.value||``,$());let u=e.target.closest?.(`[data-avatar-provider]`);u&&(c=u.value||``,$())}),e.addEventListener(`dragover`,e=>{let t=e.target.closest?.(`#assetDrop, #localUploadDrop, #workflowDrop`);t&&(e.preventDefault(),t.classList.add(`drag-over`))}),e.addEventListener(`dragleave`,e=>{e.target.closest?.(`#assetDrop, #localUploadDrop, #workflowDrop`)?.classList.remove(`drag-over`)}),e.addEventListener(`drop`,e=>{let t=e.target.closest?.(`#assetDrop, #localUploadDrop, #workflowDrop`);t&&(e.preventDefault(),t.classList.remove(`drag-over`),t.id===`localUploadDrop`?Pr(e.dataTransfer.files):t.id===`workflowDrop`?Sr(e.dataTransfer.files).catch(e=>J(e.message||`上传失败`)):xr(e.dataTransfer.files).catch(e=>J(e.message||`上传失败`)))}),r?.addEventListener(`change`,e=>{let t=e.target.files;t?.length&&(i===`local`?Pr(t):i===`workflows`?Sr(t).catch(e=>J(e.message||`上传失败`)):xr(t).catch(e=>J(e.message||`上传失败`))),e.target.value=``}),document.querySelectorAll(`[data-tab]`).forEach(e=>{e.addEventListener(`click`,()=>{i=e.dataset.tab||`assets`,E.clear(),D.clear(),O.clear(),R.clear(),H.clear(),K.clear(),$()})}),n?.addEventListener(`click`,()=>Cn().catch(e=>J(e.message||`加载失败`))),window.addEventListener(`message`,e=>{e.data?.type===`studio-theme`&&window.StudioTheme?.apply?.(e.data.theme)});var Ii=!1;function Li(){Ii||(Ii=!0,Cn({reset:!0}).catch(e=>J(e.message||`加载失败`)))}export{Li as mountLegacyAssetManager};