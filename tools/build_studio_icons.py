"""Build the small, pinned Tabler subset used by the studio. No runtime CDN.

Run with the project's Python. Existing data-lucide names remain presentation
aliases, so business modules do not need to know which icon library is used.
"""
from pathlib import Path
import concurrent.futures
import json
import urllib.request
import xml.etree.ElementTree as ET
import time

ROOT = Path(__file__).resolve().parents[1]
COMMIT = 'a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d'
BASE = f'https://raw.githubusercontent.com/tabler/tabler-icons/{COMMIT}/'
# Explicit semantic aliases, including dynamic menu/node choices.
ALIASES = {
 'archive':'archive','arrow-left':'arrow-left','arrow-up':'arrow-up','arrow-up-right':'arrow-up-right',
 'audio-lines':'wave-sine','badge-check':'rosette-discount-check','ban':'ban','book-open':'book',
 'bookmark':'bookmark','bookmark-plus':'bookmark-plus','boxes':'packages','brush':'brush',
 'check':'check','check-square':'checkbox','chevron-down':'chevron-down','chevron-left':'chevron-left',
 'chevron-right':'chevron-right','chevron-up':'chevron-up','circle':'circle','circle-dollar-sign':'coin',
 'circle-dot':'circle-dot','circle-slash':'circle-off','clapperboard':'movie','clipboard':'clipboard',
 'clipboard-paste':'clipboard-text','cloud':'cloud','columns-2':'columns-2','compass':'compass',
 'copy':'copy','copy-plus':'copy-plus','corner-down-left':'corner-down-left','crop':'crop','crown':'crown',
 'delete':'backspace','dice-5':'dice-5','dot':'point','download':'download','edit':'pencil',
 'ellipse':'oval','ellipsis':'dots','eraser':'eraser','expand':'arrows-maximize','external-link':'external-link','eye':'eye',
 'file':'file','file-audio':'file-music','file-image':'file-type-jpg','file-json':'file-type-js',
 'file-plus-2':'file-plus','file-text':'file-text','file-up':'file-upload','file-video':'video',
 'files':'files','film':'movie','flag':'flag','flame':'flame','focus':'focus-2','folder':'folder',
 'folder-input':'folder-symlink','folder-open':'folder-open','folder-pen':'folder-cog','folder-plus':'folder-plus',
 'form':'forms','gem':'diamond','globe':'world','globe-2':'world','grid':'grid-3x3','grid-3x3':'grid-3x3',
 'group':'box-multiple','hard-drive':'database','heart':'heart','history':'history',
 'image':'photo','image-down':'photo-down','image-off':'photo-off','image-plus':'photo-plus','images':'photo',
 'inbox':'inbox','info':'info-circle','key':'key','keyboard':'keyboard','layers':'stack-2',
 'layout':'layout','layout-dashboard':'layout-dashboard','layout-grid':'layout-grid','layout-list':'list',
 'leaf':'leaf','library':'archive','library-big':'archive','link':'link','list-checks':'list-check',
 'list-ordered':'list-numbers','list-todo':'list-check','loader':'loader','loader-2':'loader-2',
 'lock':'lock','logs':'list-details','maximize-2':'arrows-diagonal','message-square':'message',
 'message-square-text':'message','messages-square':'messages','monitor':'device-desktop',
 'moon':'moon','move':'arrows-move','move-horizontal':'arrows-horizontal','navigation':'navigation',
 'option':'command','package':'package','package-open':'package-export','paintbrush':'paint',
 'palette':'palette','panels-top-left':'layout-dashboard','paperclip':'paperclip','pause':'player-pause',
 'pencil':'pencil','pen-line':'pencil','pin':'pin','play':'player-play','play-circle':'player-play',
 'plug-zap':'plug-connected','plus':'plus','ratio':'aspect-ratio','rectangle-horizontal':'rectangle',
 'rectangle-vertical':'rectangle-vertical','redo':'arrow-forward-up','redo-2':'arrow-forward-up',
 'refresh-cw':'refresh','repeat-2':'repeat','replace':'replace','rocket':'rocket','rotate-ccw':'rotate-2',
 'route':'route','ruler':'ruler-2','save':'device-floppy','scale':'scale','scan':'scan','scissors':'scissors',
 'scroll':'file-text','search':'search','search-x':'search-off','section':'section','send':'send','server':'server',
 'settings':'settings','settings-2':'adjustments','shell':'terminal','shield-check':'shield-check',
 'skip-back':'player-skip-back','skip-forward':'player-skip-forward','sliders-horizontal':'adjustments-horizontal',
 'smartphone':'device-mobile','sparkles':'sparkles','split':'arrows-split','square':'square','star':'star',
 'sun':'sun','table':'table','tag':'tag','tags':'tags','target':'target','terminal':'terminal-2',
 'text':'typography','text-cursor-input':'braces','timer':'stopwatch','toggle-left':'toggle-left',
 'toggle-right':'toggle-right','trash':'trash','trash-2':'trash','triangle-alert':'alert-triangle',
 'type':'typography','undo':'arrow-back-up','undo-2':'arrow-back-up','upload':'upload','upload-cloud':'cloud-upload',
 'user':'user','user-round':'user','user-round-cog':'user-cog','user-round-plus':'user-plus',
 'video':'video','view':'eye','wand-sparkles':'wand','workflow':'git-branch','x':'x','x-circle':'circle-x',
 'zap':'bolt','zoom-in':'zoom-in',
 # Shell-only direct names from the approved preview.
 'menu-2':'menu-2','layout-sidebar-left-collapse':'layout-sidebar-left-collapse',
}

def read(url):
 request = urllib.request.Request(url, headers={'User-Agent':'shadox-tabler-subset'})
 for attempt in range(3):
  try:
   with urllib.request.urlopen(request, timeout=30) as response:
    return response.read().decode('utf-8')
  except Exception:
   if attempt==2:raise
   time.sleep(.3)

def download(name):
 cache=ROOT/'.local/tabler-icons'/COMMIT/(name+'.svg')
 if cache.exists():source=cache.read_text(encoding='utf-8')
 else:
  source=read(BASE+'icons/outline/'+name+'.svg')
  cache.parent.mkdir(parents=True,exist_ok=True)
  cache.write_text(source,encoding='utf-8')
 svg=ET.fromstring(source)
 nodes=[]
 for element in svg:
  tag=element.tag.rsplit('}',1)[-1]
  if tag not in {'path','rect','circle','ellipse','line','polyline','polygon'}:
   raise ValueError(f'Unexpected element {tag} in {name}')
  if element.attrib.get('stroke')=='none' and element.attrib.get('fill')=='none': continue
  nodes.append([tag,element.attrib])
 return name,nodes

def main():
 definitions={};errors=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
  futures={pool.submit(download,name):name for name in sorted(set(ALIASES.values()))}
  for future in concurrent.futures.as_completed(futures):
   try:
    name,nodes=future.result();definitions[name]=nodes
   except Exception as error:errors.append(f'{futures[future]}: {error}')
 if errors:raise SystemExit('\n'.join(sorted(errors)))
 license_text=read(BASE+'LICENSE')
 destination=ROOT/'static/vendor/js/tabler-icons.js'
 destination.write_text('/* Tabler Icons — MIT. Pinned subset; generated by tools/build_studio_icons.py.\n'+license_text+'\n*/\nwindow.StudioTabler = '+json.dumps({'commit':COMMIT,'aliases':ALIASES,'icons':dict(sorted(definitions.items()))},ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
 (ROOT/'static/vendor/tabler-icons-LICENSE.txt').write_text(license_text,encoding='utf-8')
 print(json.dumps({'aliases':len(ALIASES),'icons':len(definitions),'bytes':destination.stat().st_size,'commit':COMMIT}))

if __name__=='__main__':main()
