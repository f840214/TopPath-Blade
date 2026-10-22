# mkzip.py <key> <cid> [clean_json] [mirror_json]
#   clean_json: {"Attack":["north-east",...]} or {"Attack":"all"}
#   mirror_json: {"Attack":{"south-west":"south-east"}}  replace a direction's frames with another direction's frames flipped left-right
# downloads fresh character zip, removes floating light FX blobs from chosen anims/dirs, writes tools/cache/<key>.zip
import sys,json,zipfile,io,os,urllib.request
from PIL import Image, ImageOps
from fxclean import clean
key,cid=sys.argv[1],sys.argv[2]; C=json.loads(sys.argv[3]) if len(sys.argv)>3 else {}
M=json.loads(sys.argv[4]) if len(sys.argv)>4 else {}
data=urllib.request.urlopen(urllib.request.Request(f'https://api.pixellab.ai/mcp/characters/{cid}/download',headers={'User-Agent':'Mozilla/5.0'}),timeout=90).read()
zin=zipfile.ZipFile(io.BytesIO(data)); A=json.loads(zin.read('metadata.json'))['states'][0]['frames'].get('animations',{})
repl={}
def png(im): b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue()
for an,dirs in C.items():
    for d,paths in A.get(an,{}).items():
        if dirs!='all' and d not in dirs: continue
        tot=0
        for p in paths:
            im,r=clean(Image.open(io.BytesIO(zin.read(p))).convert('RGBA')); tot+=r
            if r: repl[p]=png(im)
        print(key,an,d,'fx px removed',tot)
for an,pairs in M.items():
    for dst,src in pairs.items():
        dp,sp=A[an][dst],A[an][src]
        assert len(dp)==len(sp),(an,dst,src,len(dp),len(sp))
        for a,b in zip(dp,sp):
            im=Image.open(io.BytesIO(repl.get(b) or zin.read(b))).convert('RGBA')
            repl[a]=png(ImageOps.mirror(im))
        print(key,an,dst,'<- mirrored',src)
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','cache',f'{key}.zip')
os.makedirs(os.path.dirname(out),exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as zo:
    for it in zin.infolist(): zo.writestr(it, repl.get(it.filename) or zin.read(it.filename))
print('wrote',out,{k:sorted(v) for k,v in A.items()})
