# remove un-outlined light "slash/glow" blobs: connected light components (lum>165) whose neighbour ring is mostly transparent
from PIL import Image
def clean(im, minsize=4, frac=0.45):
    im=im.copy(); px=im.load(); W,H=im.size
    def light(x,y):
        r,g,b,a=px[x,y]
        return a>0 and (0.3*r+0.59*g+0.11*b)>165
    seen=set(); removed=0
    for y in range(H):
        for x in range(W):
            if (x,y) in seen or not light(x,y): continue
            comp=[]; st=[(x,y)]; seen.add((x,y))
            while st:
                cx,cy=st.pop(); comp.append((cx,cy))
                for dx in(-1,0,1):
                    for dy in(-1,0,1):
                        nx,ny=cx+dx,cy+dy
                        if 0<=nx<W and 0<=ny<H and (nx,ny) not in seen and light(nx,ny):
                            seen.add((nx,ny)); st.append((nx,ny))
            cs=set(comp); ring=set()
            for cx,cy in comp:
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                    n=(cx+dx,cy+dy)
                    if n not in cs: ring.add(n)
            tr=sum(1 for (nx,ny) in ring if not(0<=nx<W and 0<=ny<H) or px[nx,ny][3]==0)
            if len(comp)>=minsize and ring and tr/len(ring)>frac:
                for p in comp: px[p]=(0,0,0,0)
                removed+=len(comp)
    return im, removed
