# usage: view.py <cid> <tag> [anim ...]  -> tag_rot.png, tag_<anim>.png (rows=dirs)
import sys,urllib.request,io,zipfile,json
from PIL import Image
cid,tag=sys.argv[1],sys.argv[2]; anims=sys.argv[3:]
D=['south','south-east','east','north-east','north','north-west','west','south-west']
data=urllib.request.urlopen(urllib.request.Request(f'https://api.pixellab.ai/mcp/characters/{cid}/download',headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read()
open(f'zips/{tag}.zip','wb').write(data)
z=zipfile.ZipFile(io.BytesIO(data)); st=json.loads(z.read('metadata.json'))['states'][0]['frames']
L=lambda p:Image.open(io.BytesIO(z.read(p))).convert('RGBA')
def grid(rows,out,s=3):
    w=max(f.width for r in rows for f in r);h=max(f.height for r in rows for f in r);n=max(len(r) for r in rows)
    o=Image.new('RGBA',(w*n,h*len(rows)),(90,110,80,255))
    for ri,r in enumerate(rows):
        for fi,f in enumerate(r):o.alpha_composite(f,(fi*w+(w-f.width)//2,ri*h+(h-f.height)//2))
    o.resize((o.width*s,o.height*s),Image.NEAREST).save(out); print(out,w,h,n,len(rows))
grid([[L(st['rotations'][d]) for d in D]],f'{tag}_rot.png')
A=st.get('animations',{}); print('anims:',{k:list(v) for k,v in A.items()})
for a in anims:
    if a not in A: print('missing',a); continue
    rows=[[L(p) for p in sorted(A[a][d])] for d in D if d in A[a]]
    grid(rows,f'{tag}_{a}.png',2)
