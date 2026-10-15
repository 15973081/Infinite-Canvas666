"""Freeze the supplied Pixmax mirror's editor components without its account bootstrap.

Only the public frontend bundles are read. Cookies and HTTrack caches are never copied.
Re-run with --mirror after changing the supplied reference snapshot.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--mirror', default=r'C:\project\skill-clone\output\pixmax\mirror')
parser.add_argument('--schema-mirror', default=r'C:\project\skill-clone\output\pixmax-canvas-1f1b1a95\browser')
args = parser.parse_args()
source = Path(args.mirror) / 'app.pixmax.cn/assets'
destination = Path(__file__).resolve().parents[1] / 'static/vendor/pixmax'
destination.mkdir(parents=True, exist_ok=True)
bundle = (source / 'index-DKTODaUF.js').read_text(encoding='utf-8')
marker = 'async function $$t(){'
assert bundle.count(marker) == 1, 'Reference bootstrap changed; inspect before importing'
runtime = bundle[:bundle.index(marker)]
# HTTrack mistook this internal CommonJS key for an external script URL.
runtime = runtime.replace('e("https://app.pixmax.cn/assets/mutation.js")', 'e("./mutation.js")')
runtime = runtime.replace('e("https://app.pixmax.cn/assets/core-js/', 'e("core-js/')
runtime = runtime.replace('e("https://app.pixmax.cn/node_modules/is-buffer/index.js")', 'e("../node_modules/is-buffer/index.js")')
runtime = runtime.replace('var NG=f3e(),PG=j$e(NG)', 'var NG="/static/vendor/pixmax/previs",PG=j$e(NG)')
for symbol in ['function $6e(', 'function ujt(', 'function Tf(', 'function Of(', 'II=class', 'separateAudioAndVideo(', 'J1e=class', 'Dc=class', 'Lc=class', 'async function wnt(', 'function Snt(', 'function Ktt(', 'function gMt(', 'function M1(', 'function g$(', 'function Kz(', 'function sst(', 'function cX(', 'var Art=']:
    assert symbol in runtime, f'Missing editor entry: {symbol}'
subject_context='invalidSubjectGroupIds:u(),previewZIndex:t.previewZIndex'
subject_dom='let n=crt(e.groupUuid,e.ownerType,e.name??e.groupUuid,e.coverUrl??``);'
assert runtime.count(subject_context)==runtime.count(subject_dom)==1, 'Subject chip integration changed'
runtime=runtime.replace(subject_context,'invalidSubjectGroupIds:u(),subjectMediaUrl:t.subjectMediaUrl,previewZIndex:t.previewZIndex')
runtime=runtime.replace(subject_dom,'let n=crt(e.groupUuid,e.ownerType,e.name??e.groupUuid,t.subjectMediaUrl&&e.coverUrl?t.subjectMediaUrl(e.coverUrl):e.coverUrl??``);n.dataset.subjectCoverUrl=e.coverUrl??``;')
camera_read='let e=RL.resolveCameraParamsPanel(c.user?.unionId??null);'
camera_write='RL.persistCameraParamsPanel(o.indices,c.user?.unionId??null)'
assert runtime.count(camera_read)==runtime.count(camera_write)==1, 'Camera preference boundary changed'
runtime=runtime.replace(camera_read,'let e=t.readPreferences?t.readPreferences():RL.resolveCameraParamsPanel(c.user?.unionId??null);')
runtime=runtime.replace(camera_write,'(t.writePreferences?t.writePreferences(o.indices):RL.persistCameraParamsPanel(o.indices,c.user?.unionId??null))')
camera_start=runtime.index('function sst(')
camera_end_component=runtime.index('var LX=',camera_start)
camera_segment=runtime[camera_start:camera_end_component]
camera_segment=camera_segment.replace('function sst(e,t){eu(t,!0);','function sst(e,t){eu(t,!0);const cameraProps=t;')
assert camera_segment.count('var t=ost(),r=V(t)')==1
camera_segment=camera_segment.replace('var t=ost(),r=V(t)','var t=ost(),r=(Zf(t,()=>cameraProps.portal?canvasCameraPortal:void 0),V(t))')
camera_escape='e.key===`Escape`&&(e.preventDefault(),a(!1))'
assert camera_segment.count(camera_escape)==1
camera_segment=camera_segment.replace(camera_escape,'e.key===`Escape`&&(t.stopEscapePropagation&&e.stopPropagation(),e.preventDefault(),a(!1))')
runtime=runtime[:camera_start]+camera_segment+runtime[camera_end_component:]
parameters_start=runtime.index('function g$(')
parameters_end=runtime.index('hf([`click`,`input`]);var Xlt=',parameters_start)
parameters_segment=runtime[parameters_start:parameters_end]
parameters_open='pd(()=>{u()&&G(m)&&(N(),B(m,!1))})'
parameters_panel='var n=Jlt(),r=V(n),i=V(r)'
assert parameters_segment.count(parameters_open)==parameters_segment.count(parameters_panel)==1, 'Native parameter portal boundary changed'
parameters_segment=parameters_segment.replace(parameters_open,'pd(()=>{t.onOpenChange?.(G(m));u()&&G(m)&&(N(),B(m,!1))})')
parameters_segment=parameters_segment.replace(parameters_panel,'var n=Jlt(),r=(t.onPanelReady?.(n),V(n)),i=V(r)')
parameters_position='i=e.top-t-4;P({left:Math.round(r),top:Math.round(i)})'
assert parameters_segment.count(parameters_position)==1, 'Native parameter positioning changed'
parameters_segment=parameters_segment.replace(parameters_position,'i=Math.max(8,Math.min(e.top-t-4,window.innerHeight-t-8));P({left:Math.round(r),top:Math.round(i)})')
runtime=runtime[:parameters_start]+parameters_segment+runtime[parameters_end:]
selector_start=runtime.index('function Kz(')
selector_hook='I.disabled=h()'
selector_position=runtime.index(selector_hook,selector_start)
assert selector_position-selector_start<12000
runtime=runtime[:selector_position]+runtime[selector_position:].replace(selector_hook,'I.disabled=h();t.ariaLabel&&Q(I,`aria-label`,t.ariaLabel);Q(I,`aria-expanded`,G(v));Q(I,`aria-haspopup`,`true`)',1)
parameter_trigger='gp(re,e=>B(h,e),()=>G(h))'
assert runtime.count(parameter_trigger)==1
runtime=runtime.replace(parameter_trigger,'gp(re,e=>{B(h,e);e&&t.ariaLabel&&Q(e,`aria-label`,t.ariaLabel)},()=>G(h))')
references_start=runtime.index('function o$(')
references_end=runtime.index('hf([`click`,`mousedown`,`pointerdown`]);',references_start)
references_segment=runtime[references_start:references_end]
reference_hooks={
    'l=V_(),u=DC(),d=hC(),f=XQ()':'l=V_(),u=t.hostGraph??DC(),d=t.previewViewport??hC(),f=XQ()',
    'function C(e,t){B(v,e,!0)':'function C(e,n){if(t.disabled)return;B(v,e,!0)',
    '_[e]=t}function w(e,n){_[e]=n;':'_[e]=n}function w(e,n){if(t.disabled)return;_[e]=n;',
    'function T(e){u.removeIncomingEdge':'function T(e){if(t.disabled)return;u.removeIncomingEdge',
    'function D(e){y||t.onInsertMention?.(e)}':'function D(e){t.disabled||y||t.onInsertMention?.(e)}',
    'c=R(()=>r$.getSourceNodePreviewPayload(G(i),G(r)))':'c=R(()=>t.canPreview?.(G(i))===false?null:r$.getSourceNodePreviewPayload(G(i),G(r)))',
    'W(e=>{Z(l,1,`bg-s-button-secondary-nor':'W(e=>{l.disabled=!!t.disabled;w.disabled=!!t.disabled;Q(l,`aria-label`,t.referenceNames?.[G(i).id]??G(i).data.label);Z(l,1,`bg-s-button-secondary-nor',
    'get previewScale(){return d.current.zoom},estimateSize':'get previewScale(){return d.current.zoom},get viewportVersion(){return t.viewportVersion},zIndex:t.previewZIndex??110,estimateSize',
    'items:_[G(r)],type:G(r),dropTargetStyle:{}':'items:_[G(r)],type:G(r),dragDisabled:!!t.disabled,dropTargetStyle:{}',
    'var r=$ct(),i=V(r);':'var r=$ct(),i=(t.onRootReady?.(r),V(r));',
}
for before,after in reference_hooks.items():
    assert references_segment.count(before)==1, 'Native input reference boundary changed: '+before
    references_segment=references_segment.replace(before,after)
runtime=runtime[:references_start]+references_segment+runtime[references_end:]
preview_start=runtime.index('function wY(')
preview_hook='pd(()=>{if(G(p),!G(C))return;'
preview_end=runtime.index(preview_hook,preview_start)
assert preview_end-preview_start<6000, 'Native floating preview lifecycle changed'
runtime=runtime[:preview_end]+runtime[preview_end:].replace(preview_hook,'pd(()=>{if(t.viewportVersion,G(p),!G(C))return;',1)
form_start=runtime.index('function N1(')
form_end=runtime.index('hf([`click`,`keydown`]);var Pft=',form_start)
form_segment=runtime[form_start:form_end]
form_hooks={
    'function N1(e,t){eu(t,!0);':'const canvasGenerationRules=lk;function N1(e,t){eu(t,!0);const generationFormProps=t,lk=t.ruleEngine??canvasGenerationRules;',
    'c=V_(),l=DC(),u=z_(),d=H_(),f=bq(),p=hq(),m=Iq()':'c=V_(),l=t.hostGraph??DC(),u=z_(),d=H_(),f=t.modelOptions?null:bq(),p=t.modelOptions?null:hq(),m=t.modelDefaultPrompt?null:Iq()',
    'get nodes(){return G(pe)},get nodeId(){return t.nodeId},get leading()':'onRootReady:t.onReferencesRoot,hostGraph:generationFormProps.hostGraph??l,previewViewport:t.previewViewport,get viewportVersion(){return t.viewportVersion},get disabled(){return t.disabled},previewZIndex:t.previewZIndex,get referenceNames(){return t.referenceNames},canPreview:t.canPreview,get nodes(){return G(pe)},get nodeId(){return t.nodeId},get leading()',
    'get atMentionPicker(){return Ae},get placeholder()':'subjectMediaUrl:t.subjectMediaUrl,get readonly(){return t.disabled},get atMentionPicker(){return Ae},get placeholder()',
    'let Ae={getModel:Oe,connect:ke}':'let Ae=t.atMentionPicker??{getModel:Oe,connect:ke}',
    'var i=Mft(),s=V(i),c=V(s)':'var i=Mft(),s=(t.onFormRoot?.(i,r()),V(i)),c=V(s)',
    'K(`click`,i,()=>B(S,!0))':'K(`click`,i,()=>t.onOpenAssets?t.onOpenAssets():B(S,!0))',
    'K(`click`,r,()=>B(C,!0))':'K(`click`,r,()=>t.onOpenSubjects?t.onOpenSubjects():B(C,!0))',
    'y()===`video-gen`&&e(_)':'y()===`video-gen`&&!(t.onOpenAssets&&t.onOpenSubjects)&&e(_)',
    'Rlt(U(r,2),{onClose:()=>B(D,!1),onSelect:Jt':'!generationFormProps.onOpenCamerawork&&Rlt(U(r,2),{onClose:()=>B(D,!1),onSelect:Jt',
    'K(`click`,r,()=>B(D,!0))':'K(`click`,r,()=>generationFormProps.onOpenCamerawork?generationFormProps.onOpenCamerawork():B(D,!0))',
    'sst(U(r,2),{onInsert:qt':'sst(U(r,2),{portal:true,stopEscapePropagation:true,get disabled(){return generationFormProps.disabled},readPreferences:generationFormProps.readCameraPreferences,writePreferences:generationFormProps.writeCameraPreferences,onInsert:qt',
    'y()===`video-gen`&&e(ye)':'y()===`video-gen`&&t.showCamerawork!==false&&e(ye)',
    'Kz(te,{get value(){return t.value.model}':'Kz(te,{ariaLabel:`生成模型`,portal:true,dropdownClass:`pixmax-reshoot-model-options pixmax-native-form-model-options`,get disabled(){return t.disabled},get value(){return t.value.model}',
    'dropdownClass:`w-[min(100vw-2rem,366px)]`':'dropdownClass:`pixmax-reshoot-model-options pixmax-native-form-model-options w-[min(100vw-2rem,366px)]`',
    'g$(e,{separator:`·`,get placeholder()':'g$(e,{ariaLabel:`生成参数`,get disabled(){return t.disabled},fieldLabelOverrides:t.fieldLabelOverrides,separator:`·`,get placeholder()',
    'Kz(i,{get value(){return t.value[G(pt).name]}':'Kz(i,{ariaLabel:`生成数量`,portal:true,dropdownClass:`pixmax-reshoot-model-options`,get disabled(){return t.disabled},get value(){return t.value[G(pt).name]}',
    'be=R(()=>G(ve).length>0)':'be=R(()=>t.validation?t.validation.invalid:G(ve).length>0)',
    'let Se=R(()=>{let e=GX(G(ve))':'let Se=R(()=>{if(generationFormProps.validation)return generationFormProps.validation.sourceDetails;let e=GX(G(ve))',
    'Ce=R(()=>KX(WX(G(ve)),xe)),we=R(()=>qX(G(ve),xe))':'Ce=R(()=>t.validation?t.validation.summary:KX(WX(G(ve)),xe)),we=R(()=>t.validation?t.validation.groups:qX(G(ve),xe))',
    'pd(()=>{let e=t.nodeId,n=G(_e);':'pd(()=>{if(t.validation)return;let e=t.nodeId,n=G(_e);',
    'function Xt(e){':'function Xt(e){if(generationFormProps.fieldLabelOverrides?.[e.name])return generationFormProps.fieldLabelOverrides[e.name];',
    'get disabled(){return G(i)},onChange:e=>Bt(G(n).name':'get ariaLabel(){return Xt(G(n))},get disabled(){return generationFormProps.disabled||G(i)},onChange:e=>Bt(G(n).name',
    'function A(e){G(k)?.openInsertionPanel(e)}':'pd(()=>{if(t.disabled){B(E,false);B(S,false);B(C,false);B(D,false);B(O,null)}});function A(e){G(k)?.openInsertionPanel(e)}',
    'function Fe(e,t=G(Ne)){return lk.validateAndFallbackValue(e,Pe(e,t),G(fe))}':'function Fe(e,n=G(Ne)){return t.resolveValue?t.resolveValue(e):lk.validateAndFallbackValue(e,Pe(e,n),G(fe))}',
    'rt=R(()=>{nL(),ZO();':'rt=R(()=>{if(t.modelOptions)return t.modelOptions;nL(),ZO();',
    'ut=R(()=>G(Me)?.modelCode===`PIXDANCE_2_5`&&t.value.referModel===`videoEdit`)':'ut=R(()=>t.videoEdit??(G(Me)?.modelCode===`PIXDANCE_2_5`&&t.value.referModel===`videoEdit`))',
    'return G(ut)&&e.push(`duration`),G(tt)&&G(mt)?.name&&e.push(G(mt).name),e':'return G(ut)&&e.push(`duration`),G(tt)&&G(mt)?.name&&e.push(G(mt).name),[...new Set([...e,...t.disabledFieldNames??[]])]',
    'pd(()=>{if(!G(rt).find(e=>e.value===t.value.model)?.disabled)return;':'pd(()=>{if(t.preserveUnavailableModels||!G(rt).find(e=>e.value===t.value.model)?.disabled)return;',
    'r.prompt=!i.trim()&&e&&G(M)?jq(m.value.modelDefaultPrompts,G(M),e.modelCode,a):i':'r.prompt=!i.trim()&&e&&G(M)?t.modelDefaultPrompt?t.modelDefaultPrompt(e.modelCode,a):jq(m.value.modelDefaultPrompts,G(M),e.modelCode,a):i',
    'let Rt=R(()=>{if(v()':'let Rt=R(()=>{if(t.generateLabel!==undefined)return null;if(v()',
    'zt=R(()=>{if(v()':'zt=R(()=>{if(t.generateLabel!==undefined)return t.generateLabel;if(v()',
    '[data-combo-selector-panel], [data-rich-editor-insertion-panel], [data-input-file-link-overlay]':'[data-native-camera], [data-combo-selector-panel], [data-rich-editor-insertion-panel], [data-input-file-link-overlay]',
    'var en={insertCameraParamsChip:Yt}':'var en={insertCameraParamsChip:Yt,getRichEditorManager:()=>G(k)?.getRichEditorManager(),getSerializedPrompt:()=>G(k)?.getSerializedPrompt(),insertChipItem:(type,item)=>G(k)?.insertChipItem(type,item,`caret`),setFullscreen:next=>{if(next!==G(wt))Qt();}}',
    'Le.disabled=t.disabled||G(Tt)||G(be)':'Q(Le,`data-native-generation-submit`,``);Le.disabled=t.disabled||G(Tt)||G(be)',
}
for before,after in form_hooks.items():
    assert form_segment.count(before)==1, 'Native generation form boundary changed: '+before
    form_segment=form_segment.replace(before,after)
runtime=runtime[:form_start]+form_segment+runtime[form_end:]
camera_end=bundle.index('AX={camera:EX,lens:DX,focalLength:OX,aperture:kX}')
camera_names=re.findall(r'/assets/([A-Za-z0-9_-]+\.png)',bundle[bundle.rfind('mot=',0,camera_end):camera_end])
assert len(camera_names)==27
for name in camera_names:runtime=runtime.replace('/assets/'+name,'/static/vendor/pixmax/camera/'+name)
catalog={}
for name,symbol in [('camera','EX'),('lens','DX'),('focalLength','OX'),('aperture','kX')]:
    match=re.search(r'\b'+symbol+r'=\[(.*?)\]',bundle[:camera_end])
    assert match, 'Camera catalogue changed'
    catalog[name]=re.findall(r'label:`([^`]+)`',match[1])
assert [len(items) for items in catalog.values()]==[10,10,7,7]
(destination/'prompt-catalog.js').write_text('window.PixmaxPromptCatalog=Object.freeze('+json.dumps(catalog,ensure_ascii=False)+');\n',encoding='utf-8')
marker_hook = 'let n=N,r=jNt(),i=G(_);'
assert runtime.count(marker_hook) == 1, 'Video annotation controller changed; inspect before importing'
runtime = runtime.replace(marker_hook, marker_hook + 't.onMarkerReady?.(r);')
root_hook = 'var t=UNt(),r=H(t),i=V(r),'
assert runtime.count(root_hook) == 1, 'Video annotation portal changed; inspect before importing'
runtime = runtime.replace('function WNt(e,t){eu(t,!0);', 'function WNt(e,t){eu(t,!0);const markerProps=t;')
runtime = runtime.replace(root_hook, 'var t=UNt(),r=H(t),i=(markerProps.onRootReady?.(r),V(r)),')
timeline_start = runtime.index('function gMt(e,t){')
timeline_end = runtime.index('hf([`pointerdown`,`pointermove`,`pointerup`]);var _Mt=', timeline_start)
timeline = runtime[timeline_start:timeline_end]
limit_hook = 'var t=mMt();let r;var i=V(t,!0);L(t),Zf(t,uv)'
assert timeline.count(limit_hook) == 1, 'Reshoot range tooltip changed; inspect before importing'
timeline = timeline.replace(limit_hook, 'var t=mMt();let r;var i=V(t,!0);L(t),Q(t,`data-pixmax-reshoot-range-limit`,``),Zf(t,uv)')
runtime = runtime[:timeline_start] + timeline + runtime[timeline_end:]
runtime += '''
// Local integration exports. The original account/router bootstrap is excluded.
export async function mountEditor(target, kind, props, notify) {
  const container = new f;
  const i18n = await KLe();
  await du(i18n).changeLanguage('zh');
  const logger = {debug(){},info(){},warn:console.warn,error:console.error};
  const toast = {success:notify,error:notify,warning:notify,info:notify,pending:notify,remove(){}};
  container.registerInstance(M_, i18n);
  container.registerInstance(j_, logger);
  container.registerInstance(N_, toast);
  hMe(container);
  const component = kind === 'director' ? Xwt : ujt;
  const resources = z(props.importResources || []);
  const reactiveProps = kind === 'director' ? {...props, open:true, onClose:props.onExit,
    get sourceNodes(){return G(resources).filter(r=>['image','model'].includes(r.kind)).map(r=>({id:r.id,type:r.kind==='model'?'model-3d':'image',data:{url:r.url,label:r.name,thumbnailUrl:r.previewUrl}}));}
  } : {...props, get importResources(){return G(resources);}};
  const instance = Tf(component, {target, props:reactiveProps, context:new Map([[tCe, container]])});
  return {instance, context:new Map([[tCe, container]]), setResources(value){B(resources,value,true);}};
}
export const unmountEditor = handle => Of(handle.instance);
export const mountCanvasMediaPicker = (target, props, handle) => Tf(Cjt, {target,props,context:handle.context});
export const unmountCanvasMediaPicker = instance => Of(instance);
// The canvas player is the original component, including seek and frame capture.
const canvasPlayerCaptureStates = new WeakMap;
export const mountCanvasPlayer = (target, props) => {
  const capture = z(props.showCaptureButton !== false);
  const instance = Tf(aV, {target, props:{...props,get showCaptureButton(){return G(capture);}}});
  canvasPlayerCaptureStates.set(instance,capture);
  return instance;
};
export const setCanvasPlayerCaptureEnabled = (instance, value) => {
  const capture=canvasPlayerCaptureStates.get(instance);if(capture)B(capture,!!value);
};
export const unmountCanvasPlayer = instance => {canvasPlayerCaptureStates.delete(instance);return Of(instance);};
// Reuse the original media processor; canvas persistence stays in the host app.
export const separateCanvasAudio = options => II.separateAudioAndVideo(options);
// Preserve native segment range limits, crop/frame preparation and upload caching.
function canvasCameraPortal(root){
  const anchor=document.createComment('native camera');root.before(anchor);document.body.append(root);root.dataset.nativeCamera='';
  const position=()=>{const source=anchor.parentElement;if(!source)return;const box=source.getBoundingClientRect();root.style.cssText='position:fixed;bottom:auto;right:auto;height:auto;margin:0;z-index:100160;width:'+Math.min(440,innerWidth-16)+'px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto';const bounds=root.getBoundingClientRect();root.style.left=Math.max(8,Math.min(box.left,innerWidth-bounds.width-8))+'px';root.style.top=Math.max(8,Math.min(box.top-bounds.height-4,innerHeight-bounds.height-8))+'px';};
  position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  const wheel=event=>event.stopPropagation();root.addEventListener('wheel',wheel,{passive:true});
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);root.removeEventListener('wheel',wheel);root.remove();anchor.remove();};
}
let canvasModelSelectorSequence=0;
export const canvasSegmentReshoot = {durationStatus:tJ,normalizeRange:Ktt,params:iJ,prepare:wnt,buildFiles:Snt,
  mountPlayer:mountCanvasPlayer, unmountPlayer:unmountCanvasPlayer,
  async mountGenerationForm(target,props) {
    const container=new f,i18n=await KLe();await du(i18n).changeLanguage('zh');container.registerInstance(M_,i18n);
    container.registerInstance(j_,{debug(){},info(){},warn:console.warn,error:console.error});
    const notify=props.onNotice||(()=>{});container.registerInstance(N_,{success:notify,error:notify,warning:notify,info:notify,pending:notify,remove(){}});container.registerInstance(JSe,props.subjectApi);
    const data=z(props.data),disabled=z(!!props.disabled),view=z({...props.viewport}),graph={get nodes(){return G(data).graph.nodes;},get edges(){return G(data).graph.edges;},...props.graphActions};
    const rules=Object.create(lk);Object.defineProperty(rules,'configMap',{get(){return new Map([[props.formVariant==='video-gen'?Bp.GenerateVideo:Bp.GenerateImage,G(data).schema]]);}});
    let instance,disposed=false;
    instance=Tf(N1,{target,context:new Map([[tCe,container],[Bz,{user:null}]]),props:{...props,preserveUnavailableModels:true,ruleEngine:rules,hostGraph:graph,modelDefaultPrompt:(_code,value)=>value,resolveValue:value=>value,previewViewport:{get current(){return {zoom:G(view).scale||1};}},
      videoModeSlot:anchor=>{const mode=R(()=>G(data).schema.find(model=>model.modelCode===G(data).value.model)?.filedConfig.find(field=>field.name==='referModel'));const fragment=Cf();X(H(fragment),target=>{G(mode)&&target((anchor)=>Kz(anchor,{ariaLabel:'视频生成模式',portal:true,placement:'top',dropdownClass:'pixmax-reshoot-model-options',get value(){return G(data).value.referModel;},get options(){return G(mode).options.map(option=>({...option,label:option.name}));},get disabled(){return G(disabled);},onChange:value=>props.onChange({...G(data).value,referModel:value})}));});J(anchor,fragment);},
      onFormRoot(root,fullscreen){root.dataset.nativeGenerationSurface='';root.dataset.fullscreen=String(fullscreen);root.classList.add('pixmax-native-prompt');props.onFormRoot?.(root,fullscreen);void tf().then(()=>{if(disposed||!root.isConnected)return;const submit=root.querySelector('[data-native-generation-submit]'),controls=submit?.parentElement?.parentElement?.parentElement;if(controls){controls.dataset.nativeGenerationControls='';controls.firstElementChild.dataset.nativeGenerationOptions='';}const editor=instance.getRichEditorManager()?.editorEl;if(editor){editor.parentElement.dataset.nativePromptHost='';editor.setAttribute('role','textbox');editor.setAttribute('aria-label',props.promptAriaLabel||'生成提示词');editor.setAttribute('aria-multiline','true');}});},
      onReferencesRoot(root){root.classList.add('pixmax-native-generation-references');root.setAttribute('aria-label','参考素材');},
      get schema(){return G(data).schema;},get value(){return G(data).value;},get modelOptions(){return G(data).modelOptions;},get validation(){return G(data).validation;},get disabledFieldNames(){return G(data).disabledFieldNames;},get referenceNames(){return G(data).referenceNames;},get videoEdit(){return G(data).videoEdit;},get disabled(){return G(disabled);},get generateLabel(){return G(data).generateLabel||'生成';},get viewportVersion(){return G(view);}}});
    const escape=event=>{
      if(event.key!=='Escape'||disposed)return;
      const surface=[...document.querySelectorAll('[data-native-generation-surface]')].find(root=>root.dataset.fullscreen==='true')||target;
      if(document.querySelector('[data-combo-selector-panel]')){event.preventDefault();event.stopPropagation();surface.querySelector('button[aria-label="生成参数"]')?.click();return;}
      const button=surface.querySelector('button[aria-expanded="true"]');if(button){event.preventDefault();event.stopPropagation();button.click();button.focus();return;}
      if(surface.dataset.fullscreen==='true'){event.preventDefault();event.stopPropagation();instance.setFullscreen(false);}
    };
    document.addEventListener('keydown',escape,true);
    await tf();return {instance,setData(next){B(data,next,true);const manager=instance.getRichEditorManager();if(manager&&manager.serialize()!==next.value.prompt)manager.deserialize(next.value.prompt);},setDisabled(next){B(disabled,!!next);if(next)instance.setFullscreen(false);},setViewport(next){B(view,{...next},true);},destroy(){disposed=true;document.removeEventListener('keydown',escape,true);return Of(instance);}};
  },
  async mountReferences(target,props) {
    const container=new f,i18n=await KLe();await du(i18n).changeLanguage('zh');container.registerInstance(M_,i18n);
    const data=z({nodes:props.nodes||[],referenceNames:props.referenceNames||{}}),disabled=z(!!props.disabled),view=z({...props.viewport});
    const instance=Tf(o$,{target,context:new Map([[tCe,container]]),props:{...props,previewZIndex:props.previewZIndex||100150,previewViewport:{get current(){return {zoom:G(view).scale||1};}},
      get nodes(){return G(data).nodes;},get referenceNames(){return G(data).referenceNames;},get disabled(){return G(disabled);},get viewportVersion(){return G(view);}}});
    await tf();
    return {instance,setData(next){B(data,next,true);},setDisabled(next){B(disabled,!!next);},setViewport(next){const old=G(view);if(old.x!==next.x||old.y!==next.y||old.scale!==next.scale)B(view,{x:next.x,y:next.y,scale:next.scale},true);},destroy(){return Of(instance);}};
  },
  async mountCamera(target,props) {
    const container=new f,i18n=await KLe();await du(i18n).changeLanguage('zh');container.registerInstance(M_,i18n);
    const open=z(false),disabled=z(!!props.disabled);
    const instance=Tf(sst,{target,context:new Map([[tCe,container],[Bz,{user:null}]]),props:{...props,stopEscapePropagation:true,readPreferences:props.readPreferences||(()=>null),writePreferences:props.writePreferences||(()=>{}),
      get open(){return G(open);},set open(next){B(open,!!next);},get disabled(){return G(disabled);}}});
    return {instance,setOpen(next){B(open,!!next);},setDisabled(next){B(disabled,!!next);if(next)B(open,false);},destroy(){return Of(instance);}};
  },
  async mountModelSelector(target,props) {
    const data=z({value:props.value,options:props.options}),disabled=z(!!props.disabled),portalClass='pixmax-reshoot-model-portal-'+(++canvasModelSelectorSequence);let disposed=false;
    const preparePortal=()=>{const portal=document.querySelector('.'+portalClass);if(!portal||portal.dataset.modelKeysBound)return;portal.dataset.modelKeysBound='true';
      portal.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
      portal.addEventListener('keydown',event=>{event.stopPropagation();if(disposed)return;
        if(event.key==='Escape'){event.preventDefault();const button=target.querySelector('button');if(button?.getAttribute('aria-expanded')==='true')button.click();button?.focus();return;}
        const buttons=[...portal.querySelectorAll('[data-select-option]:not(:disabled)')],index=buttons.indexOf(document.activeElement);
        if(buttons.length&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}
      });};
    const escape=event=>{if(event.key==='Escape'&&document.querySelector('.'+portalClass)){event.preventDefault();event.stopPropagation();const button=target.querySelector('button');button?.click();button?.focus();}};
    const instance=Tf(Kz,{target,props:{...props,placement:'top',portal:true,subtitleReveal:'hover-selected',
      triggerClass:'w-full',dropdownClass:'pixmax-reshoot-model-options '+portalClass+' w-[min(100vw-2rem,366px)]',
      get value(){return G(data).value;},get options(){return G(data).options;},get disabled(){return G(disabled);},
      onOpenChange(open){const button=target.querySelector('button');button?.setAttribute('aria-expanded',String(open));document.removeEventListener('keydown',escape,true);if(open){document.addEventListener('keydown',escape,true);void tf().then(()=>{if(!disposed&&target.isConnected)preparePortal();});}props.onOpenChange?.(open);}}});
    await tf();const button=target.querySelector('button');button?.setAttribute('aria-label',props.ariaLabel||'重拍模型');button?.setAttribute('aria-haspopup','true');
    return {instance,setData(next){B(data,next,true);},setDisabled(next){B(disabled,!!next);},destroy(){disposed=true;document.removeEventListener('keydown',escape,true);return Of(instance);}};
  },
  async mountParameters(target, props) {
    const container=new f,i18n=await KLe();await du(i18n).changeLanguage('zh');container.registerInstance(M_,i18n);
    const data=z({value:props.value,fields:props.fields,disabledFieldNames:props.disabledFieldNames}),disabled=z(!!props.disabled);let disposed=false,open=false,panel,button;
    const escape=event=>{if(event.key==='Escape'&&open&&!disposed){event.preventDefault();event.stopPropagation();button?.click();button?.focus();}};
    const instance=Tf(g$,{target,context:new Map([[tCe,container]]),props:{...props,separator:'·',
      onOpenChange(next){open=next;document.removeEventListener('keydown',escape,true);if(next&&!disposed)document.addEventListener('keydown',escape,true);props.onOpenChange?.(next);},
      onPanelReady(element){panel=element;panel.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});panel.addEventListener('keydown',event=>event.stopPropagation());props.onPanelReady?.(element);},
      get disabledFieldNames(){return G(data).disabledFieldNames??props.disabledFieldNames??['duration','aspectRatio'];},
      get value(){return G(data).value;},get fields(){return G(data).fields;},get disabled(){return G(disabled);}}});
    await tf();button=target.querySelector('button');button?.setAttribute('aria-label',props.ariaLabel||'重拍生成参数');
    return {instance,setData(next){B(data,next,true);},setDisabled(next){if(next&&open)button?.click();B(disabled,!!next);},destroy(){disposed=true;document.removeEventListener('keydown',escape,true);panel=null;return Of(instance);}};
  },
  async mountPrompt(target, props) {
    const container = new f, i18n = await KLe();
    await du(i18n).changeLanguage('zh');container.registerInstance(M_,i18n);
    const notify=message=>props.onNotice?.(message);
    container.registerInstance(N_,{success:notify,error:notify,warning:notify,info:notify,pending:notify,remove(){}});
    container.registerInstance(JSe,props.subjectApi||{async assetLibraryGroupList(){return {success:false,data:[]};},async assetLibraryGroupAssetsList(){return {success:false,data:[]};}});
    const value=z(props.value||''), references=z(props.references||{mentionItems:[],incomingNodes:[]}), readonly=z(!!props.readonly),invalidSubjects=z(props.invalidSubjectGroupIds||[]);
    const instance=Tf(M1,{target,context:new Map([[tCe,container]]),props:{...props,enabledProtocols:['at-mention','hash-rich','subject-reference'],
      get value(){return G(value);},get mentionItems(){return G(references).mentionItems;},get incomingNodes(){return G(references).incomingNodes;},get readonly(){return G(readonly);},get invalidSubjectGroupIds(){return G(invalidSubjects);}
    }});
    await tf();const editor=instance.getRichEditorManager()?.editorEl;
    if(editor){editor.setAttribute('role','textbox');editor.setAttribute('aria-label',props.ariaLabel||'重拍要求');editor.setAttribute('aria-multiline','true');}
    return {instance,setValue(next){B(value,next,true);const manager=instance.getRichEditorManager();if(manager&&manager.serialize()!==next)manager.deserialize(next);return tf();},setReferences(next){B(references,next,true);},setReadonly(next){B(readonly,!!next);},setInvalidSubjects(next){B(invalidSubjects,next,true);},
      async insertSubject(item){const manager=instance.getRichEditorManager(),before=manager.serialize();instance.insertChipItem('subject-reference',item,'caret');await tf();const value=manager.serialize();if(value===before)throw Error('主体标签插入失败');return value;},
      insertMention(item){return instance.insertChipItem('at-mention',item,'caret');},insertCamera(item){return instance.insertCameraChip(item);},insertCamerawork(item){return instance.insertCameraworkChip(item);},destroy(){return Of(instance);}};
  },
  async mountSubjects(target, props) {
    const container=new f,i18n=await KLe();await du(i18n).changeLanguage('zh');container.registerInstance(M_,i18n);
    const groups=z(props.groups||[]),disabled=z(!!props.disabled);
    const instance=Tf(cX,{target,context:new Map([[tCe,container]]),props:{...props,panel:true,subject:true,
      get groups(){return G(groups);},get disabled(){return G(disabled);}}});await tf();
    return {setGroups(next){B(groups,next,true);},setDisabled(next){B(disabled,!!next);},destroy(){return Of(instance);}};
  },
  async mountTimeline(target, props) {
    const container = new f, i18n = await KLe();
    await du(i18n).changeLanguage('zh');
    container.registerInstance(M_, i18n);
    const range = z({startSec:props.startSec,endSec:props.endSec}), disabled = z(!!props.disabled);
    const instance = Tf(gMt, {target, context:new Map([[tCe,container]]), props:{...props,
      get startSec(){return G(range).startSec;}, get endSec(){return G(range).endSec;},
      get disabled(){return G(disabled);}
    }});
    return {instance, setRange(value){B(range,value,true);}, setDisabled(value){B(disabled,!!value);},
      setPlayheadTime(value){instance.setPlayheadTime(value);}, destroy(){return Of(instance);}};
  }
};
// Preserve the native drawing tools, timeline and timestamped PNG export.
export async function mountCanvasVideoAnnotation(target, props, adapter, notify) {
  const container = new f;
  const i18n = await KLe();
  await du(i18n).changeLanguage('zh');
  container.registerInstance(M_, i18n);
  container.registerInstance(j_, {debug(){},info(){},warn:console.warn,error:console.error});
  container.registerInstance(N_, {success:notify,error:notify,warning:notify,info:notify,pending:notify,remove(){}});
  return Tf(WNt, {target, props:{...props,open:true},
    context:new Map([[tCe,container],[MY,adapter.controller],[EC,adapter.graph]])});
}
export const unmountCanvasVideoAnnotation = instance => Of(instance);
// The preview uses the reference's GLB loader, renderer and orbit controls.
export const canvasModelGraphics = {GLTFLoader:J1e,WebGLRenderer:Dc,Scene:cr,
  PerspectiveCamera:Qo,AmbientLight:rs,DirectionalLight:ns,OrbitControls:Lc,
  Box3:Cr,Vector3:ln};
'''
(destination / 'editors.js').write_text(runtime, encoding='utf-8')
(destination / 'editors.css').write_bytes((source / 'index-Dvu1CoBX.css').read_bytes())
(destination / 'manifest.json').write_text(json.dumps({
    'source': 'User-supplied Pixmax frontend mirror',
    'original_bundle_sha256': hashlib.sha256(bundle.encode()).hexdigest(),
    'components': {'director': '$6e', 'editor': 'ujt', 'media_processor': 'II', 'video_annotation': 'WNt', 'generation_references': 'o$', 'generation_form': 'N1', 'segment_reshoot': ['wnt','Snt','Ktt','gMt','M1','g$','Kz','sst','cX','Art'], 'model_graphics': ['J1e','Dc','Lc']},
    'changes': ['Remove account/router bootstrap', 'Export editor mounts and scoped service context', 'Export native local audio/video separation', 'Expose native video annotation with host graph adapter and marker lifetime hook', 'Export native segment reshoot crop, frame capture, range limits and upload cache', 'Expose native reshoot thumbnail timeline with reactive range and lifecycle controls', 'Scope native reshoot range tooltip above the host modal', 'Expose reactive capture permission for native source preview players', 'Expose native rich prompt editor with scoped reference adapters', 'Expose native reshoot parameter controls and freeze public model fields', 'Expose native model selector with host provider and policy adapters', 'Expose native camera panel with member-scoped preferences and local public artwork', 'Expose ordinary generation controls with native parameter portal lifecycle and viewport limits', 'Expose native N1 reference cards with host graph, readonly and viewport adapters', 'Mount the complete N1 generation form with scoped host schema, fullscreen, fee preview and camera portal'],
    'stage_assets': 'Provision the public character/motion library with tools/fetch_pixmax_stage_assets.py.'
}, indent=2), encoding='utf-8')
print(f'Imported editor runtime into {destination}')

# Freeze only public model fields, excluding account, pricing and identity data.
schema_root=Path(args.schema_mirror).resolve()
manifest=json.loads((schema_root/'manifest.json').read_text(encoding='utf-8'))
record=next(item for item in manifest if item.get('url','').endswith('/canvas/modelConfig'))
response_file=(schema_root/record['file']).resolve()
assert response_file.is_relative_to(schema_root), 'Model schema file escapes the supplied snapshot'
response=response_file.read_bytes()
def find_model(value):
    if isinstance(value,dict):
        if value.get('modelCode')=='PIXDANCE_2_5':return value
        for item in value.values():
            found=find_model(item)
            if found:return found
    elif isinstance(value,list):
        for item in value:
            found=find_model(item)
            if found:return found
model=find_model(json.loads(response))
assert model, 'Reference Seedance 2.5 schema is missing'
fields=[field for field in model['modelConfig']['params'] if field['name'] in ['resolution','aspectRatio','duration','includeAudio','outputFormat']]
assert len(fields)==5, 'Native reshoot parameter fields changed'
for field in fields:
    for key in ['min','max','step']:
        if key in field:field[key]=float(field[key])
(destination/'reshoot-schema.json').write_text(json.dumps({'source':'User-supplied Pixmax modelConfig snapshot','source_response_sha256':hashlib.sha256(response).hexdigest(),'modelCode':model['modelCode'],'fields':fields},ensure_ascii=False,indent=2),encoding='utf-8')

models=[]
def collect_generation_models(value):
    if isinstance(value,dict):
        if value.get('nodeType') in ['GENERATE_IMAGE','GENERATE_VIDEO'] and isinstance(value.get('modelConfig'),dict):
            public_fields=json.loads(json.dumps(value['modelConfig'].get('params',[])))
            for field in public_fields:
                for key in ['min','max','step']:
                    if key in field:field[key]=float(field[key])
            models.append({'nodeType':value['nodeType'],'modelCode':value['modelCode'],'modelName':value['modelName'],'fields':public_fields})
        for item in value.values():collect_generation_models(item)
    elif isinstance(value,list):
        for item in value:collect_generation_models(item)
collect_generation_models(json.loads(response))
assert models and any(item['modelCode']=='PIXDANCE_2_5' for item in models)
(destination/'generation-schema.json').write_text(json.dumps({'source':'User-supplied Pixmax modelConfig snapshot','source_response_sha256':hashlib.sha256(response).hexdigest(),'models':models},ensure_ascii=False,indent=2),encoding='utf-8')
