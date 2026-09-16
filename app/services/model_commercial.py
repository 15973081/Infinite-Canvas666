"""Model availability and independent, time-bounded provider discounts."""
from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
from fastapi import HTTPException

RESOLUTIONS = {'1k', '2k', '4k', '480p', '720p', '1080p'}


def image_resolution(request):
    # Same tier boundaries used by APIMART/Gemini adapters; never trust a cheaper client label.
    size = str(request.get('size') or '').strip().lower()
    if size in {'1k', '2k', '4k'}:
        return size
    match = re.fullmatch(r'(\d+)\s*[x×]\s*(\d+)', size)
    if match:
        w, h = map(int, match.groups())
        if min(w, h) <= 0: return ''
        return '4k' if max(w,h)>=3000 or w*h>4500000 else '2k' if max(w,h)>=1800 or w*h>1800000 else '1k'
    if size == 'auto' or re.fullmatch(r'\d+\s*:\s*\d+', size): return '1k'
    return ''


def specification(kind, request):
    return image_resolution(request) if kind == 'image' else str(request.get('resolution') or '').lower()


def policies(value):
    if not isinstance(value, dict) or len(value)>1500: raise ValueError('invalid model policies')
    out = {}
    for key, rule in value.items():
        if not isinstance(key,str) or not re.fullmatch(r'(image|video|chat):.{1,180}',key) or not isinstance(rule,dict): raise ValueError('invalid model policy')
        if set(rule)-{'visible','enabled','resolutions'}: raise ValueError('invalid model policy field')
        if any(k in rule and not isinstance(rule[k],bool) for k in ('visible','enabled')): raise ValueError('invalid model switch')
        sizes=rule.get('resolutions')
        allowed={'1k','2k','4k'} if key.startswith('image:') else RESOLUTIONS
        if sizes is not None and (not isinstance(sizes,list) or not sizes or any(s not in allowed for s in sizes) or key.startswith('chat:')): raise ValueError('invalid resolutions')
        out[key]={'visible':rule.get('visible',True),'enabled':rule.get('enabled',True),**({'resolutions':sorted(set(sizes))} if sizes is not None else {})}
    return out


def _discount_scope(row):
    return {key: row[key] for key in ('resolution', 'has_video_input')
            if key in row and row[key] is not None and row[key] != ''}


def _more_specific(a, b):
    a, b = _discount_scope(a), _discount_scope(b)
    return len(a) > len(b) and all(a.get(k) == v for k, v in b.items())


def discounts(value):
    if not isinstance(value,list) or len(value)>1000: raise ValueError('invalid discounts')
    result=[]
    for row in value:
        if not isinstance(row,dict) or set(row)-{'kind','model','rate','effective_from','effective_to','label','resolution','has_video_input'}: raise ValueError('invalid discount')
        kind,model=row.get('kind'),row.get('model')
        if kind not in {'image','video'} or not isinstance(model,str) or not model.strip() or len(model)>180: raise ValueError('invalid discount model')
        try:
            rate=Decimal(str(row.get('rate')))
            start,end=int(row.get('effective_from') or 0),int(row.get('effective_to') or 0)
        except (InvalidOperation,TypeError,ValueError): raise ValueError('invalid discount value')
        if not rate.is_finite() or not 0<=rate<=1 or rate.as_tuple().exponent < -6 or start<0 or end<0 or (end and end<=start): raise ValueError('invalid discount range')
        item={'kind':kind,'model':model.strip(),'rate':format(rate,'f'),'effective_from':start,'effective_to':end,'label':str(row.get('label') or '')[:120]}
        resolution = row.get('resolution')
        allowed = {'1k', '2k', '4k'} if kind == 'image' else {'480p', '720p', '1080p', '4k'}
        if resolution not in (None, ''):
            if not isinstance(resolution, str) or resolution.lower() not in allowed:
                raise ValueError('invalid discount resolution')
            item['resolution'] = resolution.lower()
        if row.get('has_video_input') is not None:
            if kind != 'video' or not isinstance(row['has_video_input'], bool):
                raise ValueError('invalid discount video input')
            item['has_video_input'] = row['has_video_input']
        for old in result:
            if (old['kind'],old['model']) != (kind,model.strip()): continue
            if start >= (old['effective_to'] or float('inf')) or old['effective_from'] >= (end or float('inf')): continue
            a, b = _discount_scope(old), _discount_scope(item)
            if any(k in b and b[k] != v for k, v in a.items()): continue
            if not (_more_specific(old, item) or _more_specific(item, old)):
                raise ValueError('overlapping discount scopes')
        result.append(item)
    return result


def attach_discount(price, provider, kind, model, at, specification=None):
    if not price: return price
    result=deepcopy(price)
    matches=[r for r in provider.get('model_discounts',[]) if r['kind']==kind and r['model']==model and r['effective_from']<=at and (not r['effective_to'] or at<r['effective_to'])]
    spec = specification if specification is not None else price
    matches = [r for r in matches if all(spec.get(k) == v for k, v in _discount_scope(r).items())]
    winners = [r for r in matches if all(r is other or _more_specific(r, other) for other in matches)]
    if matches and len(winners) != 1: raise ValueError('overlapping discount scopes')
    matches = winners
    # Independent discount is applied on the existing base billing rate, once.
    if matches: result['commercial_discount']=deepcopy(matches[0])
    return result


def amounts(base_micros, price):
    base=Decimal(base_micros)
    rate=Decimal(str((price.get('commercial_discount') or {}).get('rate','1')))
    gross=int(base.quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    net=int((Decimal(gross)*rate).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    return {'base_amount_micros':gross,'discount_rate':str(rate),'discount_amount_micros':gross-net,'amount_micros':net,
            'discount_snapshot':deepcopy(price.get('commercial_discount'))}


def enforce(provider, kind, request):
    model=str(request.get('model') or '').strip()
    if kind+'_models' in provider and model not in provider[kind+'_models']:
        raise HTTPException(403,'该模型未在管理员开放的模型列表中。')
    rule=provider.get('model_policies',{}).get(kind+':'+model,{})
    if rule.get('enabled') is False or rule.get('visible') is False:
        raise HTTPException(403,'该模型已隐藏或停用，不能提交新任务；历史记录保留。')
    if 'resolutions' in rule and specification(kind,request) not in rule['resolutions']:
        raise HTTPException(403,'该模型未开放所选规格，请选择：'+', '.join(rule['resolutions']))


def public_models(provider):
    value=deepcopy(provider)
    for kind in ('image','video','chat'):
        value[kind+'_models']=[m for m in value.get(kind+'_models',[]) if all(value.get('model_policies',{}).get(kind+':'+m,{}).get(k,True) for k in ('visible','enabled'))]
    return value
