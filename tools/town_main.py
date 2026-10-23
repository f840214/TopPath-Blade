"""產生 js/data/town-main.js：主城（城內場景）的街區配置。棋盤式街道，街區排滿房子，重要建築有名牌（role）。
城內範圍 W×H（比戰場小），城門在下方正中間。"""
import json, sys
from pathlib import Path
from PIL import Image
root = Path(sys.argv[1]); K = 2 / 3
W, H, WALL_Y = 1760, 1080, 960; CX = W // 2
TOP = 240   # 最上面留空，主堡的塔尖才不會被畫面上方的資源列擋住（香波堡式主堡顯示約 680×331）
size = {p.stem: Image.open(p).size for p in (root / 'assets/map/town').glob('*.png')}
def foot(art): w, h = size[art]; return round(w * K * 0.85), round(h * K * 0.45)
B = []
def put(art, x, y, block=True, flip=False, **extra):
    b = {'art': art, 'x': round(x), 'y': round(y)}
    if block: b['fw'], b['fh'] = foot(art)
    if flip: b['flip'] = True
    b.update(extra); B.append(b)
    return b
# 特殊建築（有名牌，走到門口按 Enter）
FRONT = 900   # 最前排（城門內那一排）
special = [
    # 香波堡式主堡：1020×497 的圖（顯示約 680×331），只擋下方約 40%（前排城翼的牆腳，連同兩側後排角樓的腳）
    put('keep_chambord', CX, 270, label='主堡', role='hero', fw=round(size['keep_chambord'][0] * K * 0.97), fh=round(size['keep_chambord'][1] * K * 0.33)),   # 圖高 605（2026-10-23 加了後面的中庭）：擋路範圍維持原本下面那一段
    put('guildhall', 1140, 520, label='會館', role='social'),
    put('chapel', 1560, 260),
    put('inn', 300, FRONT, label='旅店', role='inn'),
    put('recruit', 620, FRONT, label='募兵處', role='recruit'),
    put('smithy', 1140, FRONT, label='鐵匠鋪', role='smith'),
    put('stable', 1460, FRONT, label='車馬行', role='gate'),
    put('barracks', 620, 520, label='兵營', role='drill'),
]
taken = [(b['x'] - size[b['art']][0] * K / 2 - 14, b['x'] + size[b['art']][0] * K / 2 + 14, b['y']) for b in special]
houses = ['house_blue1', 'house_stone1', 'house_red1', 'house_timber1', 'house_blue2', 'house_tall1', 'house_red2', 'house_thatch1',
          'house_red3', 'house_brick1', 'house_blue3', 'house_shop1', 'house_turret1', 'granary']
k = 0
KEEP_HALF = size['keep_chambord'][0] * K / 2
# 中間 CX±60 是城門到主堡的大道；每個街區前後兩排背對背（腳底 y），街區之間是橫街
cols = [(20, 340), (400, CX - 60), (CX + 60, 1360), (1420, W - 20)]
bottoms = [140, 260, 400, 520, 660, 780, FRONT]
for bottom in bottoms:
    for x0, x1 in cols:
        x = x0 + 4
        while True:
            art = houses[k % len(houses)]; w = size[art][0] * K
            if x + w > x1: break
            cx = x + w / 2; k += 1
            plaza = bottom >= 780 and abs(cx - CX) < 230        # 城門內的廣場
            keep = bottom <= 260 and abs(cx - CX) < KEEP_HALF + 66   # 主堡兩側與後面（香波堡式主堡約 680 寬）
            if not any(a < cx < b and abs(sy - bottom) < 100 for a, b, sy in taken) and not plaza and not keep:
                put(art, cx, bottom, flip=k % 3 == 0)
            x += w + 6
# 城門內的廣場：雕像、路燈、攤位；最前排房子門口的水井、木桶、推車
put('statue', CX - 110, 830); put('statue', CX + 110, 830, flip=True)
for x in (CX - 190, CX + 190): put('lamp', x, 900, block=False)
put('stall', CX - 170, 760, label='市集', role='market'); put('stall', CX + 170, 760, flip=True); put('well', 1640, 945)
put('barrels', 120, 940); put('haystack', 1560, 945, block=False); put('cart', 460, 945)
for x in (CX - 150, CX + 150): put('banner', x, 310, block=False)
# 橫街上的路燈
for y in (330, 590): 
    for x in (370, CX - 90, CX + 90, 1390): put('lamp', x, y, block=False)
for b in B: b['y'] += TOP
out = {
    'name': '王都', 'size': {'w': W, 'h': H + TOP}, 'spawn': {'x': CX, 'y': 790 + TOP},
    'wall': {'wallY': WALL_Y + TOP, 'gateX': CX, 'towers': [300, W - 300]},
    'gate': {'x': CX, 'y': WALL_Y + TOP - 30, 'label': '城門', 'role': 'gate'},
    'roads': [{'x': 0, 'y': 0, 'w': W, 'h': WALL_Y + TOP - 20}],
    'buildings': B,
}
def js(o, ind=''):
    if isinstance(o, dict):
        inner = ', '.join(f'{k}: {js(v)}' for k, v in o.items())
        return '{ ' + inner + ' }'
    if isinstance(o, list): return '[' + ', '.join(js(v) for v in o) + ']'
    return json.dumps(o, ensure_ascii=False).replace('"', "'")
body = ',\n'.join('    ' + js(b) for b in B)
text = f'''/* ============ town-main.js — 主城（城內場景）的街區 ============
 * 由 tools/town_main.py 產生（python3 tools/town_main.py .），可以手改。格式同 town.js；另外：
 *   label / role：有名牌的建築，走到門口（圖的腳底中心往下一點）按 Enter 打開對應的面板（G.Menu.openPanel）
 *     role：recruit 募兵處、smith 鐵匠鋪、hero 武將、drill 兵營演習（自選戰場）、social 會館（好友、家族）、market 市集、gate 出城到大地圖
 *   size：城內範圍（比戰場小）；wall：城牆（城門在 gateX），gate：城門口的互動點；spawn：進城時武將站的位置
 */
G.TOWNS.main = {{
  name: '{out['name']}', size: {js(out['size'])}, spawn: {js(out['spawn'])},
  wall: {js(out['wall'])},
  gate: {js(out['gate'])},
  roads: {js(out['roads'])},
  buildings: [
{body},
  ],
}};
'''
(root / 'js/data/town-main.js').write_text(text)
print(len(B), 'objects')
