# build_cache.py <key>: rebuild tools/cache/<key>.zip from the CURRENT assets/units/<key>/*.png sheets
# (the hand-fixed Mac caches aren't on this machine; the sheets are the ground truth)
import sys,json,re,io,zipfile
from PIL import Image
ROOT='C:/Users/88697/桌面/TopPath-Blade'
D=['south','south-east','east','north-east','north','north-west','west','south-west']
key=sys.argv[1]
cfg=json.load(open(ROOT+'/tools/pixellab.json',encoding='utf-8'))[key]
meta=json.loads(re.search(r'G\.SPRITE_META = (\{.*\});',open(ROOT+'/js/data/sprites-meta.js',encoding='utf-8').read(),re.S).group(1))[key]
assert not cfg.get('upperBody')
files={}; rot={}; anims={}
def png(im): b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue()
idle=Image.open(f'{ROOT}/assets/units/{key}/Idle.png').convert('RGBA'); w,h=meta['anims']['Idle']['w'],meta['anims']['Idle']['h']
for i,d in enumerate(D):
    p=f'Idle/rotations/{d}.png'; files[p]=png(idle.crop((0,i*h,w,i*h+h))); rot[d]=p
for an,a in cfg['anims'].items():
    m=meta['anims'][an]; w,h,n=m['w'],m['h'],m['n']
    sh=Image.open(f'{ROOT}/assets/units/{key}/{an}.png').convert('RGBA')
    src=anims.setdefault(a['source'],{})
    for i,d in enumerate(D):
        src[d]=[]
        for f in range(n):
            p=f'Idle/animations/{a["source"]}/{d}/frame_{f:03d}.png'; files[p]=png(sh.crop((f*w,i*h,f*w+w,i*h+h))); src[d].append(p)
md={'rebuilt_from_sheets':True,'states':[{'frames':{'rotations':rot,'animations':anims}}]}
out=f'{ROOT}/tools/cache/{key}.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('metadata.json',json.dumps(md,indent=1))
    for p,b in files.items(): z.writestr(p,b)
print('wrote',out)
