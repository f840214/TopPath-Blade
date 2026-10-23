# splice.py <key> <source anim> <dst dir> <cid> <variant-key-in-fresh-zip | mirror:<dir-in-cache>> [clean]
#   replaces one direction of tools/cache/<key>.zip with frames from the fresh PixelLab zip (or a mirror of another cached dir)
import sys,json,io,zipfile,urllib.request,os
from PIL import Image, ImageOps
sys.path.insert(0,'C:/Users/88697/桌面/TopPath-Blade/tools/hero-anims')
from fxclean import clean
ROOT='C:/Users/88697/桌面/TopPath-Blade'
key,an,dst,cid,var=sys.argv[1:6]; doclean='clean' in sys.argv[6:]
cp=f'{ROOT}/tools/cache/{key}.zip'
zc=zipfile.ZipFile(cp); md=json.loads(zc.read('metadata.json')); files={n:zc.read(n) for n in zc.namelist() if n!='metadata.json'}; zc.close()
A=md['states'][0]['frames']['animations']
def png(im): b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue()
if var.startswith('dir:'):
    import glob
    frames=[Image.open(p).convert('RGBA') for p in sorted(glob.glob(var[4:]+'/frame_*.png'))]
elif var.startswith('mirror:'):
    frames=[ImageOps.mirror(Image.open(io.BytesIO(files[p])).convert('RGBA')) for p in A[an][var[7:]]]
else:
    fz=f'zips/{key}_fresh.zip'
    if not os.path.exists(fz) or 'dl' in sys.argv[6:]:
        open(fz,'wb').write(urllib.request.urlopen(urllib.request.Request(f'https://api.pixellab.ai/mcp/characters/{cid}/download',headers={'User-Agent':'Mozilla/5.0'}),timeout=90).read())
    z=zipfile.ZipFile(fz); FA=json.loads(z.read('metadata.json'))['states'][0]['frames']['animations']
    print('fresh variants',sorted(FA[an]))
    frames=[Image.open(io.BytesIO(z.read(p))).convert('RGBA') for p in sorted(FA[an][var])]
if doclean:
    tot=0; out=[]
    for f in frames: f,r=clean(f); tot+=r; out.append(f)
    frames=out; print('fx px removed',tot)
for p in A[an].get(dst,[]): files.pop(p,None)
A[an][dst]=[]
for i,f in enumerate(frames):
    p=f'Idle/animations/{an}/{dst}/frame_{i:03d}.png'; files[p]=png(f); A[an][dst].append(p)
with zipfile.ZipFile(cp,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('metadata.json',json.dumps(md,indent=1))
    for p,b in files.items(): z.writestr(p,b)
print(key,an,dst,'<-',var,len(frames),'frames',frames[0].size)
