# detached.py: list connected components (8-conn, alpha>0) not part of the largest one, per frame
import sys,re,json
from PIL import Image
R='C:/Users/88697/桌面/TopPath-Blade/'
def comps(im):
    px=im.load(); W,H=im.size; seen=set(); out=[]
    for y in range(H):
        for x in range(W):
            if (x,y) in seen or not px[x,y][3]: continue
            st=[(x,y)]; seen.add((x,y)); c=[]
            while st:
                cx,cy=st.pop(); c.append((cx,cy))
                for dx in (-1,0,1):
                    for dy in (-1,0,1):
                        n=(cx+dx,cy+dy)
                        if 0<=n[0]<W and 0<=n[1]<H and n not in seen and px[n][3]: seen.add(n); st.append(n)
            out.append(c)
    out.sort(key=len,reverse=True); return out
if __name__=='__main__':
    m=json.loads(re.search(r'G\.SPRITE_META = (\{.*\});',open(R+'js/data/sprites-meta.js',encoding='utf-8').read(),re.S).group(1))
    D=['S','SE','E','NE','N','NW','W','SW']
    for k in sys.argv[1:]:
        a=m[k]['anims']['Attack']; w,h,n=a['w'],a['h'],a['n']; sh=Image.open(R+'assets/units/'+k+'/Attack.png').convert('RGBA')
        res=[]
        for r in range(8):
            for f in range(n):
                cs=comps(sh.crop((f*w,r*h,f*w+w,r*h+h)))
                if len(cs)>1: res.append(f'{D[r]}{f}:'+'/'.join(str(len(c)) for c in cs[1:]))
        print(k,' '.join(res))
