# zview.py <key> <cid> <anim> <dirprefix> : download fresh zip to zips/<key>_fresh.zip, render all variants of that dir (one row each)
import sys,json,io,zipfile,urllib.request
from PIL import Image
key,cid,an,dp=sys.argv[1:5]
data=urllib.request.urlopen(urllib.request.Request(f'https://api.pixellab.ai/mcp/characters/{cid}/download',headers={'User-Agent':'Mozilla/5.0'}),timeout=90).read()
open(f'zips/{key}_fresh.zip','wb').write(data)
z=zipfile.ZipFile(io.BytesIO(data)); A=json.loads(z.read('metadata.json'))['states'][0]['frames']['animations'][an]
vs=[v for v in sorted(A) if v==dp or v.startswith(dp+'-')]
rows=[[Image.open(io.BytesIO(z.read(p))).convert('RGBA') for p in sorted(A[v])] for v in vs]
w=max(f.width for r in rows for f in r);h=max(f.height for r in rows for f in r);n=max(len(r) for r in rows)
o=Image.new('RGBA',(w*n,h*len(rows)),(90,110,80,255))
for ri,r in enumerate(rows):
    for fi,f in enumerate(r): o.alpha_composite(f,(fi*w+(w-f.width)//2,ri*h+(h-f.height)//2))
o.resize((o.width*3,o.height*3),Image.NEAREST).save(f'{key}_{an}_{dp}.png'); print(vs)
