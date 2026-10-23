# bluemask.py <key> <dr> <dg> : show pixels with b>r+dr and b>g+dg (not already recolorable) in magenta, per direction; Idle + Walk frame0 + Attack frame 3
import sys
from PIL import Image
P='C:/Users/88697/桌面/TopPath-Blade/assets/units/'
k=sys.argv[1]; dr,dg=int(sys.argv[2]),int(sys.argv[3])
im=Image.open(P+k+'/Idle.png').convert('RGBA'); w=48
o=Image.new('RGBA',(w*8,w*2),(90,110,80,255))
from collections import Counter; C=Counter()
for r in range(8):
    c=im.crop((0,r*w,w,r*w+w)); o.alpha_composite(c,(r*w,0)); m=c.copy(); px=m.load()
    for y in range(w):
        for x in range(w):
            R,G,B,A=px[x,y]
            if A and B>R+dr and B>G+dg and (B-min(R,G))/B>float(sys.argv[4]) and B>int(sys.argv[5]) and not (B>R+25 and B>G+10 and B-min(R,G)>0.35*B): px[x,y]=(255,0,255,255); C[(R,G,B)]+=1
    o.alpha_composite(m,(r*w,w))
o.resize((o.width*3,o.height*3),Image.NEAREST).save(f'mask_{k}.png')
print(C.most_common(25))
