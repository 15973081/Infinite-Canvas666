(() => {
 'use strict';
 const sidebar=document.getElementById('studioSidebar'),backdrop=document.getElementById('studioSidebarBackdrop'),toggle=document.getElementById('studioMobileMenu'),stage=document.querySelector('.stage'),mobile=window.matchMedia('(max-width:760px)');
 function syncContextLocation(){
  const bar=document.querySelector('.member-session-bar');if(!bar)return;
  let label=bar.querySelector('.studio-context-location');
  if(!label){label=document.createElement('span');label.className='studio-context-location';bar.insertBefore(label,bar.querySelector('.member-session-account'));}
  label.textContent=sidebar.querySelector('.nav-item.active .nav-text')?.textContent.trim()||'创作工作台';
 }
 new MutationObserver(syncContextLocation).observe(sidebar,{subtree:true,attributes:true,attributeFilter:['class']});
 window.addEventListener('member-session:ready',syncContextLocation);
 window.addEventListener('member-session:profile',syncContextLocation);
 syncContextLocation();
 function closeMobile(restore=false){sidebar.classList.remove('mobile-open');backdrop.hidden=true;toggle.setAttribute('aria-expanded','false');stage.inert=false;if(restore)toggle.focus();}
 toggle.addEventListener('click',()=>{if(sidebar.classList.contains('mobile-open'))return closeMobile(true);sidebar.classList.add('mobile-open');backdrop.hidden=false;toggle.setAttribute('aria-expanded','true');stage.inert=true;sidebar.querySelector('#studioNewCanvas').focus();});
 backdrop.addEventListener('click',()=>closeMobile(true));
 document.addEventListener('keydown',e=>{if(!mobile.matches||!sidebar.classList.contains('mobile-open'))return;if(e.key==='Escape'){e.preventDefault();closeMobile(true);}if(e.key==='Tab'){const controls=Array.from(sidebar.querySelectorAll('button,a[href]')).filter(el=>el.getClientRects().length&&!el.hidden&&!el.disabled),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 mobile.addEventListener('change',()=>closeMobile());window.StudioShell={closeMobile};
 document.getElementById('studioNewCanvas').addEventListener('click',async()=>{
  const button=document.getElementById('studioNewCanvas');button.disabled=true;
  try{switchUI(document.querySelector('[data-page="canvas"]'),'canvas');const frame=document.getElementById('frame-canvas');if(!frame.contentWindow?.CanvasHome)await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));await frame.contentWindow?.CanvasHome?.beginCreate();}finally{button.disabled=false;}
 });
})();
