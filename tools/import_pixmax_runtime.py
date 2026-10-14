"""Freeze the supplied Pixmax mirror's editor components without its account bootstrap.

Only the public frontend bundles are read. Cookies and HTTrack caches are never copied.
Re-run with --mirror after changing the supplied reference snapshot.
"""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--mirror', default=r'C:\project\skill-clone\output\pixmax\mirror')
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
for symbol in ['function $6e(', 'function ujt(', 'function Tf(', 'function Of(', 'II=class', 'separateAudioAndVideo(', 'J1e=class', 'Dc=class', 'Lc=class', 'async function wnt(', 'function Snt(', 'function Ktt(', 'function gMt(']:
    assert symbol in runtime, f'Missing editor entry: {symbol}'
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
export const canvasSegmentReshoot = {durationStatus:tJ,normalizeRange:Ktt,params:iJ,prepare:wnt,buildFiles:Snt,
  mountPlayer:mountCanvasPlayer, unmountPlayer:unmountCanvasPlayer,
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
    'components': {'director': '$6e', 'editor': 'ujt', 'media_processor': 'II', 'video_annotation': 'WNt', 'segment_reshoot': ['wnt','Snt','Ktt','gMt'], 'model_graphics': ['J1e','Dc','Lc']},
    'changes': ['Remove account/router bootstrap', 'Export editor mounts and scoped service context', 'Export native local audio/video separation', 'Expose native video annotation with host graph adapter and marker lifetime hook', 'Export native segment reshoot crop, frame capture, range limits and upload cache', 'Expose native reshoot thumbnail timeline with reactive range and lifecycle controls', 'Scope native reshoot range tooltip above the host modal', 'Expose reactive capture permission for native source preview players'],
    'stage_assets': 'Provision the public character/motion library with tools/fetch_pixmax_stage_assets.py.'
}, indent=2), encoding='utf-8')
print(f'Imported editor runtime into {destination}')
