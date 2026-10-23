# fxfix.py: frame-level fixes for leftover slash/sparkle FX, applied to tools/cache/<key>.zip
import sys,io,json,zipfile
from PIL import Image
from detached import comps
ROOT='C:/Users/88697/桌面/TopPath-Blade'
lum=lambda p:0.3*p[0]+0.59*p[1]+0.11*p[2]
def load(key):
    zc=zipfile.ZipFile(f'{ROOT}/tools/cache/{key}.zip'); md=json.loads(zc.read('metadata.json')); files={n:zc.read(n) for n in zc.namelist() if n!='metadata.json'}; zc.close(); return md,files
def save(key,md,files):
    with zipfile.ZipFile(f'{ROOT}/tools/cache/{key}.zip','w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('metadata.json',json.dumps(md,indent=1))
        for p,b in files.items(): z.writestr(p,b)
def png(im): b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue()
def drop_detached(im,maxpx=12):
    im=im.copy(); px=im.load(); cs=comps(im); n=0
    for c in cs[1:]:
        if len(c)<=maxpx:
            for p in c: px[p]=(0,0,0,0)
            n+=len(c)
    return im,n
def sparkle_from(im,ref,thr=190):
    im=im.copy(); px=im.load(); rp=ref.load(); n=0
    for y in range(im.height):
        for x in range(im.width):
            if px[x,y][3] and lum(px[x,y])>thr:
                q=rp[x,y]; px[x,y]=q if (q[3] and lum(q)<=thr) else (0,0,0,0); n+=1
    return im,n
def run(key,an,d,frames,fn):
    md,files=load(key); P=md['states'][0]['frames']['animations'][an][d]
    for f in frames:
        im=Image.open(io.BytesIO(files[P[f]])).convert('RGBA')
        im,n=fn(im,[Image.open(io.BytesIO(files[p])).convert('RGBA') for p in P])
        files[P[f]]=png(im); print(key,an,d,f,'px',n)
    save(key,md,files)
if __name__=='__main__':
    for key in sys.argv[1:]:
        if key=='halberdier': run(key,'Attack','east',[2],lambda im,F:drop_detached(im))
        if key=='swordshield': run(key,'Attack','east',[4,5],lambda im,F:drop_detached(im))
        if key=='greatsword': run(key,'Attack','south-east',[0,1],lambda im,F:drop_detached(im,3))
        if key=='shieldman': run(key,'Attack2','north',[3],lambda im,F:sparkle_from(im,F[4]))
