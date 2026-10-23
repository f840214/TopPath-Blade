# urlview.py <out> <url-template-with-{i}> [n=6]  : strip of frames scaled x4 on green
import sys,urllib.request,io
from PIL import Image
out,t=sys.argv[1],sys.argv[2]; n=int(sys.argv[3]) if len(sys.argv)>3 else 6
fr=[Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(t.replace('{i}',str(i)),headers={'User-Agent':'Mozilla/5.0'})).read())).convert('RGBA') for i in range(n)]
w=max(f.width for f in fr);h=max(f.height for f in fr)
o=Image.new('RGBA',(w*n,h),(90,110,80,255))
for i,f in enumerate(fr): o.alpha_composite(f,(i*w,0))
o.resize((o.width*4,o.height*4),Image.NEAREST).save(out); print(out,w,h)
