# deepblue.py: push swordshield's desaturated navy cloth (skirt) to saturated blue so the importer's red-team swap catches it
import sys,io,json,zipfile
from PIL import Image
def recolorable(R,G,B): return B>R+25 and B>G+10 and B-min(R,G)>0.35*B
def deepen(im, ycut=0.45):
    im=im.copy(); px=im.load(); bb=im.getchannel('A').getbbox()
    if not bb: return im,0
    y0=bb[1]+int((bb[3]-bb[1])*ycut); n=0
    for y in range(y0,im.height):
        for x in range(im.width):
            R,G,B,A=px[x,y]
            if A and B>55 and B>R+10 and B>G+4 and (B-min(R,G))/B>0.24 and not recolorable(R,G,B):
                px[x,y]=(round(R*0.6),round(G*0.75),min(255,round(B*1.15)),A); n+=1
    return im,n
if __name__=='__main__':
    cp=sys.argv[1]
    zc=zipfile.ZipFile(cp); md=zc.read('metadata.json'); files={n:zc.read(n) for n in zc.namelist() if n!='metadata.json'}; zc.close()
    tot=0
    for p,b in files.items():
        if not p.endswith('.png'): continue
        im,n=deepen(Image.open(io.BytesIO(b)).convert('RGBA'))
        if n:
            o=io.BytesIO(); im.save(o,'PNG'); files[p]=o.getvalue(); tot+=n
    with zipfile.ZipFile(cp,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('metadata.json',md)
        for p,b in files.items(): z.writestr(p,b)
    print('deepened px',tot)
