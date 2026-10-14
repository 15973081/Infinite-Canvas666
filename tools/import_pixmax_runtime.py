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
camera_escape='e.key===`Escape`&&(e.preventDefault(),a(!1))'
assert camera_segment.count(camera_escape)==1
camera_segment=camera_segment.replace(camera_escape,'e.key===`Escape`&&(t.stopEscapePropagation&&e.stopPropagation(),e.preventDefault(),a(!1))')
runtime=runtime[:camera_start]+camera_segment+runtime[camera_end_component:]
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
let canvasModelSelectorSequence=0;
export const canvasSegmentReshoot = {durationStatus:tJ,normalizeRange:Ktt,params:iJ,prepare:wnt,buildFiles:Snt,
  mountPlayer:mountCanvasPlayer, unmountPlayer:unmountCanvasPlayer,
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
    const instance=Tf(Kz,{target,props:{...props,placement:'top',portal:true,subtitleReveal:'hover-selected',
      triggerClass:'w-full',dropdownClass:'pixmax-reshoot-model-options '+portalClass+' w-[min(100vw-2rem,366px)]',
      get value(){return G(data).value;},get options(){return G(data).options;},get disabled(){return G(disabled);},
      onOpenChange(open){const button=target.querySelector('button');button?.setAttribute('aria-expanded',String(open));if(open)void tf().then(()=>{if(!disposed&&target.isConnected)preparePortal();});props.onOpenChange?.(open);}}});
    await tf();const button=target.querySelector('button');button?.setAttribute('aria-label','重拍模型');button?.setAttribute('aria-haspopup','true');
    return {instance,setData(next){B(data,next,true);},setDisabled(next){B(disabled,!!next);},destroy(){disposed=true;return Of(instance);}};
  },
  async mountParameters(target, props) {
    const container=new f,i18n=await KLe();await du(i18n).changeLanguage('zh');container.registerInstance(M_,i18n);
    const data=z({value:props.value,fields:props.fields}),disabled=z(!!props.disabled);
    const instance=Tf(g$,{target,context:new Map([[tCe,container]]),props:{...props,separator:'·',disabledFieldNames:['duration','aspectRatio'],
      get value(){return G(data).value;},get fields(){return G(data).fields;},get disabled(){return G(disabled);}}});
    await tf();target.querySelector('button')?.setAttribute('aria-label','重拍生成参数');
    return {instance,setData(next){B(data,next,true);},setDisabled(next){B(disabled,!!next);},destroy(){return Of(instance);}};
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
    'components': {'director': '$6e', 'editor': 'ujt', 'media_processor': 'II', 'video_annotation': 'WNt', 'segment_reshoot': ['wnt','Snt','Ktt','gMt','M1','g$','Kz','sst','cX','Art'], 'model_graphics': ['J1e','Dc','Lc']},
    'changes': ['Remove account/router bootstrap', 'Export editor mounts and scoped service context', 'Export native local audio/video separation', 'Expose native video annotation with host graph adapter and marker lifetime hook', 'Export native segment reshoot crop, frame capture, range limits and upload cache', 'Expose native reshoot thumbnail timeline with reactive range and lifecycle controls', 'Scope native reshoot range tooltip above the host modal', 'Expose reactive capture permission for native source preview players', 'Expose native rich prompt editor with scoped reference adapters', 'Expose native reshoot parameter controls and freeze public model fields', 'Expose native model selector with host provider and policy adapters', 'Expose native camera panel with member-scoped preferences and local public artwork'],
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
