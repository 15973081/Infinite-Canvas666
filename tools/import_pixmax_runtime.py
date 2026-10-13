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
for symbol in ['function $6e(', 'function ujt(', 'function Tf(', 'function Of(']:
    assert symbol in runtime, f'Missing editor entry: {symbol}'
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
export const mountCanvasPlayer = (target, props) => Tf(aV, {target, props});
export const unmountCanvasPlayer = instance => Of(instance);
'''
(destination / 'editors.js').write_text(runtime, encoding='utf-8')
(destination / 'editors.css').write_bytes((source / 'index-Dvu1CoBX.css').read_bytes())
(destination / 'manifest.json').write_text(json.dumps({
    'source': 'User-supplied Pixmax frontend mirror',
    'original_bundle_sha256': hashlib.sha256(bundle.encode()).hexdigest(),
    'components': {'director': '$6e', 'editor': 'ujt'},
    'changes': ['Remove account/router bootstrap', 'Export editor mounts and scoped service context'],
    'stage_assets': 'Provision the public character/motion library with tools/fetch_pixmax_stage_assets.py.'
}, indent=2), encoding='utf-8')
print(f'Imported editor runtime into {destination}')
