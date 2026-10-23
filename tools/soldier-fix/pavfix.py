# pavise east (defb3acf): frames 0-1 lack the shield (frame 1 has a flying shield blob) -> copy frame 2's shield behind the body
import zipfile,json,io
from PIL import Image
z=zipfile.ZipFile('zips/pavise_fresh.zip');A=json.loads(z.read('metadata.json'))['states'][0]['frames']['animations']['Shoot']['east-defb3acf']
fr=[Image.open(io.BytesIO(z.read(p))).convert('RGBA') for p in sorted(A)]
src=fr[2].load()
for i in (0,1):
    im=fr[i]; px=im.load()
    for y in range(60):
        for x in range(19): px[x,y]=(0,0,0,0)
    for y in range(60):
        for x in range(21):
            if src[x,y][3] and not px[x,y][3]: px[x,y]=src[x,y]
import os; os.makedirs('pav_e',exist_ok=True)
for i,f in enumerate(fr): f.save(f'pav_e/frame_{i:03d}.png')
o=Image.new('RGBA',(360,60),(90,110,80,255))
for i,f in enumerate(fr): o.alpha_composite(f,(i*60,0))
o.resize((1440,240),Image.NEAREST).save('pav_e_fixed.png')
