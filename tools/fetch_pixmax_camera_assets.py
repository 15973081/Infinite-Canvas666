"""Freeze only the public PNG artwork named by the supplied camera widget."""
import hashlib
import json
import re
import urllib.request
from pathlib import Path

root=Path(__file__).resolve().parents[1]
bundle=Path(r'C:/project/skill-clone/output/pixmax/mirror/app.pixmax.cn/assets/index-DKTODaUF.js').read_text(encoding='utf-8')
end=bundle.index('AX={camera:EX,lens:DX,focalLength:OX,aperture:kX}')
start=bundle.rfind('mot=',0,end)
names=re.findall(r'/assets/([A-Za-z0-9_-]+\.png)',bundle[start:end])
assert len(names)==27 and len(set(names))==27
destination=root/'static/vendor/pixmax/camera'
destination.mkdir(parents=True,exist_ok=True)
records=[]
for name in names:
    target=destination/name
    url='https://app.pixmax.cn/assets/'+name
    if target.exists():data=target.read_bytes()
    else:
        with urllib.request.urlopen(url,timeout=20) as response:
            assert response.headers.get_content_type()=='image/png', 'Unexpected public asset response'
            data=response.read(4*1024*1024+1)
        assert len(data)<=4*1024*1024 and data.startswith(b'\x89PNG\r\n\x1a\n')
        target.write_bytes(data)
    assert data.startswith(b'\x89PNG\r\n\x1a\n')
    records.append({'name':name,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
(destination/'manifest.json').write_text(json.dumps({'source':'Unauthenticated public camera widget artwork','files':records},indent=2),encoding='utf-8')
print(f'Frozen {len(records)} public PNGs, {sum(item["bytes"] for item in records)} bytes')
