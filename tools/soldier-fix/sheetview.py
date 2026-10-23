# sheetview.py <png> <cellw> <out> [rows...] : scale 3, green bg
import sys
from PIL import Image
p,w,out=sys.argv[1],int(sys.argv[2]),sys.argv[3]; rows=[int(r) for r in sys.argv[4:]]
im=Image.open(p).convert('RGBA'); h=w; n=im.width//w; R=im.height//h
rows=rows or list(range(R))
o=Image.new('RGBA',(n*w,len(rows)*h),(90,110,80,255))
for i,r in enumerate(rows):
    o.alpha_composite(im.crop((0,r*h,n*w,r*h+h)),(0,i*h))
o.resize((o.width*3,o.height*3),Image.NEAREST).save(out); print(out,n,R)
