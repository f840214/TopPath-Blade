# cmp.py <key> : download fresh zip, compare each sheet row with zip frames (same dir, or mirror of another dir)
import sys,json,re,io,zipfile,urllib.request,os
from PIL import Image, ImageOps, ImageChops
ROOT='C:/Users/88697/桌面/TopPath-Blade'
D=['south','south-east','east','north-east','north','north-west','west','south-west']
key=sys.argv[1]
cfg=json.load(open(ROOT+'/tools/pixellab.json',encoding='utf-8'))[key]
meta=json.loads(re.search(r'G\.SPRITE_META = (\{.*\});',open(ROOT+'/js/data/sprites-meta.js',encoding='utf-8').read(),re.S).group(1))[key]
zp=f'zips/{key}.zip'
if not os.path.exists(zp) or '--dl' in sys.argv:
    data=urllib.request.urlopen(urllib.request.Request(f'https://api.pixellab.ai/mcp/characters/{cfg["id"]}/download',headers={'User-Agent':'Mozilla/5.0'}),timeout=90).read()
    open(zp,'wb').write(data)
z=zipfile.ZipFile(zp); st=json.loads(z.read('metadata.json'))['states'][0]['frames']
A=st.get('animations',{})
print('zip anims',{k:sorted(v) for k,v in A.items()})
def pad(im,w,h):
    o=Image.new('RGBA',(w,h)); o.paste(im,((w-im.width)//2,(h-im.height)//2)); return o
def diff(a,b):
    d=ImageChops.difference(a,b); return sum(1 for p in d.getdata() if any(p))
for an,a in cfg['anims'].items():
    m=meta['anims'][an]; w,h,n=m['w'],m['h'],m['n']
    sheet=Image.open(f'{ROOT}/assets/units/{key}/{an}.png').convert('RGBA')
    src=A.get(a['source'],{})
    for ri,d in enumerate(D):
        row=[sheet.crop((i*w,ri*h,i*w+w,ri*h+h)) for i in range(n)]
        best=None
        for sd,ps in src.items():
            fr=[pad(Image.open(io.BytesIO(z.read(p))).convert('RGBA'),w,h) for p in sorted(ps)]
            if len(fr)!=n: continue
            for mir in (0,1):
                f2=[ImageOps.mirror(f) if mir else f for f in fr]
                s=sum(diff(x,y) for x,y in zip(row,f2))
                if best is None or s<best[0]: best=(s,sd,mir)
        print(an,d,'->',best)
