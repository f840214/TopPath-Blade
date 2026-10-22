# mkzip.py <key> <cid> [clean_json]  clean_json: {"Attack":["north-east",...]} or {"Attack":"all"}
# downloads fresh character zip, removes floating light FX blobs from chosen anims/dirs, writes tools/cache/<key>.zip
import sys,json,zipfile,io,urllib.request
from PIL import Image
from fxclean import clean
key,cid=sys.argv[1],sys.argv[2]; C=json.loads(sys.argv[3]) if len(sys.argv)>3 else {}
data=urllib.request.urlopen(urllib.request.Request(f'https://api.pixellab.ai/mcp/characters/{cid}/download',headers={'User-Agent':'Mozilla/5.0'}),timeout=90).read()
zin=zipfile.ZipFile(io.BytesIO(data)); A=json.loads(zin.read('metadata.json'))['states'][0]['frames'].get('animations',{})
repl={}
for an,dirs in C.items():
    for d,paths in A.get(an,{}).items():
        if dirs!='all' and d not in dirs: continue
        tot=0
        for p in paths:
            im,r=clean(Image.open(io.BytesIO(zin.read(p))).convert('RGBA')); tot+=r
            if r: b=io.BytesIO(); im.save(b,'PNG'); repl[p]=b.getvalue()
        print(key,an,d,'fx px removed',tot)
out=f'/Users/benji/Desktop/TopPath-Blade/tools/cache/{key}.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as zo:
    for it in zin.infolist(): zo.writestr(it, repl.get(it.filename) or zin.read(it.filename))
print('wrote',out,{k:sorted(v) for k,v in A.items()})
