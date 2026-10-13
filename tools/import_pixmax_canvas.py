"""Extract original canvas SVGs and geometry from the user-supplied frontend bundle."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'static/vendor/pixmax/editors.js'
bundle = source.read_text(encoding='utf-8')
templates = dict(re.findall(r'([\w$]+)=xf\(`(<svg>.*?)`\)', bundle, re.S))

def icon(symbol):
    start = bundle.index('function '+symbol+'(')
    body = bundle[start:start+800]
    template_id = re.search(r'var \w+=([\w$]+)\(\)', body)[1]
    viewbox = re.search(r'viewBox:`([^`]+)`', body)[1]
    return templates[template_id].replace('<svg>', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+viewbox+'" fill="none" aria-hidden="true">')

def template_symbol(template_id):
    pattern = r'function ([\w$]+)\(e,t\)\{.{0,130}var \w+='+re.escape(template_id)+r'\(\)'
    return re.search(pattern,bundle)[1]

icons = {key:icon(symbol) for key,symbol in {'text':'_g','image':'Eh','video':'Cg','audio':'Mm','model':'p_','storyboard':'rg'}.items()}
for key,marker in {'image-fill':'M16.8 4.19994','video-fill':'M7.9125 3.74999','text-fill':'M14.8333 1.5','audio-fill':'M14.3394 1.20011'}.items():
    template_id = next(key for key,value in templates.items() if marker in value)
    icons[key] = icon(template_symbol(template_id))
# Original canvas handles use a filled plus in a circle, not a port dot.
template_id = next(key for key,value in templates.items() if 'M13.0909 10.9091H17.4545' in value)
icons['connect'] = icon(template_symbol(template_id))
icons['director'] = icons['model']
icons['editor'] = icons['video']
for key,symbol in {'text':'n_e','image':'Dh','video':'wg','audio':'Vce','model':'f_','director':'Kg','editor':'qg','storyboard':'uye'}.items():
    # Menu symbols are original components, independently from node title SVGs.
    icons['menu-'+key]=icon(symbol)
icons['director-fill']=icons['menu-director']
icons['editor-fill']=icons['menu-editor']
icons['tool-preview']=icon('Cde')
for key,marker in {
    'cloud':'M13.2105 13.2857', 'external':'M6.75 5.25H5.25',
    'share':'M12.0312 1.02539', 'bell':'M11.9999 11.5556',
    'add':'M9.88341 1.5835', 'upload':'M3.09961 8.90039',
    'assets':'M16.1084 12.1261', 'history':'M9 0.450195',
    'more':'M13.7958 1.00001', 'pointer':'M0.281766 0.146531',
    'map':'M1.5836e-07 2.4', 'magnet':'M11.3333 8.33325',
    'fit':'M2.55556 4.88889', 'minus':'M14.988 9.01408',
    'plus':'M7.99996 16C7.73138', 'undo':'M3.4891 3.45809',
    'redo':'M12.5109 3.45809'
}.items():
    matches=[key for key,value in templates.items() if marker in value]
    template_id=min(matches,key=lambda key:len(templates[key])) if matches else None
    if template_id is None:
        # The cloud and external-link SVGs are inline button templates.
        icons['tool-'+key]=next(svg for svg in re.findall(r'<svg\b[^>]*>.*?</svg>',bundle,re.S) if marker in svg)
        if key=='cloud':icons['tool-cloud']=icons['tool-cloud'].replace('<circle cx="14" cy="12" r="3">','<circle cx="14" cy="12" r="3" fill="#229c66">')
        continue
    icons['tool-'+key]=icon(template_symbol(template_id))
connection_rules={}
rule_source=bundle[bundle.index('KSe={'):bundle.index(';function qSe')]
for symbol,output,inputs in re.findall(r'\[Bp\.(\w+)\]:\{source:\[(.*?)\],target:\[(.*?)\]\}',rule_source):
    connection_rules[symbol]={'source':re.findall(r'Bp\.(\w+)',output),'target':re.findall(r'Bp\.(\w+)',inputs)}
manifest = {'source':'Pixmax index-DKTODaUF.js','icons':icons,'connectionRules':connection_rules,'sizes':{'image':[200,200],'video':[300,200],'text':[240,240],'director':[240,240],'editor':[300,200],'storyboard':[240,240],'audio':[280,120],'model':[240,240]}}
(root/'static/vendor/pixmax/canvas-reference.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
caret=bundle[bundle.index('function JY('):bundle.index('var Cit=')]
(root/'static/js/pixmax-canvas-assets.js').write_text('/* Verbatim SVG paths and sizes extracted by tools/import_pixmax_canvas.py. */\nwindow.PixmaxCanvasAssets='+json.dumps(manifest,ensure_ascii=False)+';\nwindow.PixmaxTextCaret=(()=>{'+caret+'return JY;})();\n',encoding='utf-8')
# Preserve the original layout algorithm; canvas adapters supply their rendered sizes.
start=bundle.index('static grid(t,n={})')
end=bundle.index('static cascade(',start)
layout='class e{static getLayoutNodeSize(n){return {w:n.width,h:n.height};}'+bundle[start:end]+'}'
(root/'static/js/pixmax-canvas-layout.js').write_text('/* Original Pixmax grid and flow algorithms. */\nwindow.PixmaxCanvasLayout='+layout+';\n',encoding='utf-8')
print('Extracted original canvas icons and node dimensions')
