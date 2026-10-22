# zfeet.py zip anim : feet-band metric + height check per dir from PixelLab zip
import sys,zipfile,json,io
import numpy as np
from PIL import Image
z=zipfile.ZipFile(sys.argv[1]);a=sys.argv[2]
st=json.loads(z.read('metadata.json'))['states'][0]['frames']
L=lambda p:Image.open(io.BytesIO(z.read(p))).convert('RGBA')
rot={d:L(p) for d,p in st['rotations'].items()}
w0,h0=rot['south'].size; ay0=max(r.getchannel('A').getbbox()[3] for r in rot.values())
for d in ['south','south-east','east','north-east','north','north-west','west','south-west']:
    ps=st['animations'].get(a,{}).get(d)
    if not ps: continue
    fr=[L(p) for p in sorted(ps)]; w,h=fr[0].size; ax=w//2; ay=ay0+(h-h0)//2
    g=[]
    for f in fr:
        c=f.crop((ax-12,ay-10,ax+12,ay+2)); bg=Image.new('RGBA',c.size,(90,110,80,255)); bg.alpha_composite(c); g.append(np.asarray(bg.convert('L')).astype(float))
    m=np.mean([np.abs(g[i]-g[(i+1)%len(g)]).mean() for i in range(len(g))])
    bh=lambda im:(lambda b:b[3]-b[1])(im.getchannel('A').getbbox())
    print(f'{d:11s} feet={m:6.2f} idleH={bh(rot[d])} H={[bh(f) for f in fr]} n={len(fr)} canvas={w}')
