(() => {
 'use strict';
 const sidebar=document.getElementById('studioSidebar');
 const settings=sidebar.querySelector('.settings-fold-toggle');
 const controls=[...sidebar.querySelectorAll('.nav-item,.settings-fold-toggle')];
 window.StudioIcons.createIcons({root:sidebar});
 function syncContextLocation(){
  for(const control of controls){
   if(control.matches('.nav-item.active'))control.setAttribute('aria-current','page');
   else control.removeAttribute('aria-current');
  }
  const bar=document.querySelector('.member-session-bar');if(!bar)return;
  let label=bar.querySelector('.studio-context-location');
  if(!label){label=document.createElement('span');label.className='studio-context-location';bar.insertBefore(label,bar.querySelector('.member-session-account'));}
  label.textContent=sidebar.querySelector('.nav-item.active .nav-text')?.textContent.trim()||'创作工作台';
 }
 new MutationObserver(syncContextLocation).observe(sidebar,{subtree:true,attributes:true,attributeFilter:['class']});
 window.addEventListener('member-session:ready',syncContextLocation);
 window.addEventListener('member-session:profile',syncContextLocation);
 syncContextLocation();
 const tooltip=document.createElement('div');
 tooltip.id='studioRailTooltip';tooltip.className='studio-rail-tooltip';tooltip.role='tooltip';tooltip.hidden=true;
 document.body.append(tooltip);
 let owner=null,hideTimer;
 function hideTooltip(){
  clearTimeout(hideTimer);tooltip.hidden=true;
  owner?.removeAttribute('aria-describedby');owner=null;
 }
 function showTooltip(control){
  if(window.innerWidth<=900 || control.getAttribute('aria-expanded')==='true')return;
  hideTooltip();owner=control;
  tooltip.textContent=control.getAttribute('aria-label')||control.textContent.trim();
  control.setAttribute('aria-describedby',tooltip.id);tooltip.hidden=false;
  const rect=control.getBoundingClientRect();
  tooltip.style.left=`${sidebar.getBoundingClientRect().right+10}px`;
  tooltip.style.top=`${Math.max(8,Math.min(innerHeight-tooltip.offsetHeight-8,rect.top+(rect.height-tooltip.offsetHeight)/2))}px`;
 }
 function deferHide(){clearTimeout(hideTimer);hideTimer=setTimeout(hideTooltip,120);}
 for(const control of controls){
  control.addEventListener('pointerenter',()=>showTooltip(control));
  control.addEventListener('pointerleave',deferHide);
  control.addEventListener('focus',()=>showTooltip(control));
  control.addEventListener('blur',hideTooltip);
  control.addEventListener('click',hideTooltip);
 }
 tooltip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));
 tooltip.addEventListener('pointerleave',deferHide);
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(settings.getAttribute('aria-expanded')==='true'){
   const restoreFocus=settings.parentElement.contains(document.activeElement);
   window.setSidebarSettingsCollapsed(true);
   if(restoreFocus)settings.focus();
  }
  hideTooltip();
 });
 window.addEventListener('resize',hideTooltip);
 window.addEventListener('blur',hideTooltip);
 window.StudioShell={hideTooltip};
})();
