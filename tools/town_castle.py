"""產生 js/data/town.js 的 castle 城內配置：依圖的大小算出每棟建築腳下的範圍，排成街區。"""
import json, sys
from pathlib import Path
from PIL import Image
root = Path(sys.argv[1]); K = 2 / 3
size = {p.stem: Image.open(p).size for p in (root / 'assets/map/town').glob('*.png')}
def foot(art):   # 腳下範圍：圖寬的 85%、圖高的 45%（屋頂後半部可以讓人走到後面被蓋住）
    w, h = size[art]; return round(w * K * 0.85), round(h * K * 0.45)
B = []
def put(art, x, y, block=True, flip=False):
    b = {'art': art, 'x': x, 'y': y}
    if block: b['fw'], b['fh'] = foot(art)
    if flip: b['flip'] = True
    B.append(b)
houses = ['house_blue1', 'house_stone1', 'house_red1', 'house_timber1', 'house_blue2', 'house_tall1', 'house_red2', 'house_thatch1',
          'house_red3', 'house_brick1', 'house_blue3', 'house_shop1', 'house_turret1', 'granary']
k = 0
def row(x0, x1, y, step=None, skip=()):
    global k
    x = x0
    while x <= x1:
        art = houses[k % len(houses)]; k += 1
        w = size[art][0] * K
        if not any(a <= x <= b for a, b in skip): put(art, round(x), y, flip=k % 3 == 0)
        x += (step or w + 10)
# 西區（外城廣場 660～860 以西）
row(70, 600, 130); row(70, 600, 262); row(70, 560, 392); row(70, 560, 525)
# 中西區（外城與主堡之間）
row(900, 1110, 130); row(900, 1110, 262); put('inn', 990, 392)
# 主堡與廣場
put('keep', 1280, 200)
for x in (1170, 1390): put('banner', x, 236, block=False)
put('statue', 1150, 300); put('statue', 1410, 300, flip=True)
# 中東區（主堡與內城之間）
row(1470, 1660, 130); put('barracks', 1560, 300)
# 東區（內城廣場 1700～1900 以東）
row(1960, 2500, 130); row(1960, 2500, 262); put('smithy', 2040, 392); put('stable', 2230, 392); put('house_red2', 2420, 392)
row(1960, 2500, 525, skip=((1840, 1960),))
# 街上的小東西（不擋路）
for x, y in ((640, 560), (900, 560), (1180, 560), (1380, 560), (1660, 560), (1960, 560)): put('lamp', x, y, block=False)
put('well', 760, 380); put('stall', 1000, 520); put('stall', 1560, 520, flip=True); put('cart', 1660, 470)
put('barrels', 1450, 470); put('haystack', 2330, 470, block=False); put('barrels', 600, 470)
roads = [{'x': 0, 'y': 0, 'w': 2560, 'h': 610}]   # 城內整片鋪石板
out = {'roads': roads, 'buildings': B}
head = '''/* ============ town.js — 城內的建築與道路 ============
 * 攻城戰的城裡（G.Map.setupCastle 的 town）和之後的城內場景共用。由 tools/town_castle.py 產生（python3 tools/town_castle.py .），可以手改。
 * buildings：art 是 assets/map/town/<art>.png（正面俯視）；(x, y) 是圖的腳底中心（遊戲座標）。
 *   fw / fh 是腳下不能站的範圍（寬、往上的深度，約圖寬 85%、圖高 45%）；沒有 fw 的是不擋路的小裝飾。
 * roads：石板路範圍 [{ x, y, w, h }]；城內整片鋪石板。
 * 街道：城門 → 主堡的大道、往西到外城（760,480）、往東到內城（1800,420）都留空，兩段可破壞城牆後面也是街，
 *   城牆內側留一圈巷子給守軍站。尋路用流場（js/world/nav.js），所以房子可以排得很密。
 */
'''
lines = ',\n'.join('      ' + json.dumps(b, ensure_ascii=False).replace('"', "'").replace("'art'", 'art').replace("'x'", 'x').replace("'y'", 'y').replace("'fw'", 'fw').replace("'fh'", 'fh').replace("'flip'", 'flip').replace(':', ': ').replace(',', ', ') for b in B)
js = head + "G.TOWNS = {\n  castle: {\n    roads: [{ x: 0, y: 0, w: 2560, h: 610 }],\n    buildings: [\n" + lines + ",\n    ],\n  },\n};\n"
(root / 'js/data/town.js').write_text(js)
print(len(B), 'objects')
