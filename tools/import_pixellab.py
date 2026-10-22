#!/usr/bin/env python3
"""把 PixelLab 角色轉成遊戲用的精靈圖。

讀 tools/pixellab.json，對每個角色：
  1. 下載 PixelLab 匯出的 zip（快取在 tools/cache/<sprite>.zip；還在生成時會沿用舊快取）
  2. 每個動畫拼成一張表：每列一個方向（南、東南、東、東北、北、西北、西、西南），每欄一格
     - 靜態的 8 方向圖另外做成 Idle（1 格）
     - 只有一個方向的動畫（技能）只輸出一列，dirs = 1
     - 缺方向時用最接近的方向補（不鏡射，避免左右手對調）
  3. red: true → 另外輸出 red/<Anim>.png，把藍色罩袍換成紅色（敵軍）
  4. saddle: true → 算出每個方向的馬鞍位置（騎士要疊在哪）
  5. upperBody: 0.58 → 只保留上半身（騎士疊在馬上用）
  6. 產生 js/data/sprites-meta.js

用法：python3 tools/import_pixellab.py [sprite ...] [--refresh]
"""
import io, json, re, sys, time, urllib.request, zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / 'cache'
OUT = ROOT / 'assets' / 'units'
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']


def fetch_zip(sprite, cid, refresh):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f'{sprite}.zip'
    if path.exists() and not refresh:
        return zipfile.ZipFile(path)
    url = f'https://api.pixellab.ai/mcp/characters/{cid}/download'
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        path.write_bytes(data)
    except urllib.error.HTTPError as e:
        if e.code == 423 and path.exists():
            print(f'  {sprite}: 還有動畫在生成，先用舊的快取')
        else:
            raise
    return zipfile.ZipFile(path)


def load(z, name):
    return Image.open(io.BytesIO(z.read(name))).convert('RGBA')


def recolor_red(im):
    im = im.copy(); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            # 只換飽和的藍色（布料）；偏藍的灰色鋼甲（飽和度低）保留，不然盔甲會變粉紅
            if a and b > r + 25 and b > g + 10 and b - min(r, g) > 0.35 * b:
                px[x, y] = (b, round(g * 0.5), r, a)
    return im


def pad_to(im, w, h):
    if im.size == (w, h):
        return im
    out = Image.new('RGBA', (w, h))
    out.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return out


def nearest_dir(want, have):
    i = DIRS.index(want)
    for step in (0, 1, -1, 2, -2, 3, -3, 4):
        d = DIRS[(i + step) % 8]
        if d in have:
            return d
    return None


def build_sheet(frames_by_dir, single):
    """frames_by_dir: {dir: [Image...]} → (sheet, w, h, n, dirs)"""
    have = {d: f for d, f in frames_by_dir.items() if f}
    rows = [have.get('south') or next(iter(have.values()))] if single else [have[nearest_dir(d, have)] for d in DIRS]
    # 不同方向的畫布可能大小不同（PixelLab 會依動作幅度放大），一律置中補成最大的尺寸
    w = max(f.width for r in rows for f in r); h = max(f.height for r in rows for f in r)
    rows = [[pad_to(f, w, h) for f in r] for r in rows]
    n = max(len(r) for r in rows)
    sheet = Image.new('RGBA', (w * n, h * len(rows)))
    for ri, frames in enumerate(rows):
        for fi in range(n):
            sheet.paste(frames[min(fi, len(frames) - 1)], (fi * w, ri * h))
    return sheet, w, h, n, len(rows)


def saddle_points(rot, ax, ay):
    """馬身上藍色馬衣的位置 → 騎士要疊上去的點（相對腳底錨點）"""
    pts = []
    for d in DIRS:
        im = rot[d]; px = im.load(); xs = []; ys = []
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a and b > r + 40 and b > g + 20:
                    xs.append(x); ys.append(y)
        if xs:
            pts.append([round(sum(xs) / len(xs) - ax), min(ys) + 3 - ay])
        else:
            bb = im.getchannel('A').getbbox()
            pts.append([round((bb[0] + bb[2]) / 2 - ax), bb[1] + (bb[3] - bb[1]) // 3 - ay])
    return pts


def import_sprite(sprite, cfg, refresh):
    z = fetch_zip(sprite, cfg['id'], refresh)
    meta = json.loads(z.read('metadata.json'))
    st = meta['states'][0]['frames']
    rot = {d: load(z, p) for d, p in st['rotations'].items()}
    w0, h0 = rot['south'].size
    ay = max(rot[d].getchannel('A').getbbox()[3] for d in DIRS)
    ax = w0 // 2
    out = OUT / sprite
    (out / 'red').mkdir(parents=True, exist_ok=True)
    anims = {}

    def save(name, sheet, info):
        sheet.save(out / f'{name}.png')
        if cfg.get('red'):
            recolor_red(sheet).save(out / 'red' / f'{name}.png')
        anims[name] = info

    # Idle：靜態 8 方向（或騎士上半身）
    idle = {d: [rot[d]] for d in DIRS}
    if cfg.get('upperBody'):
        cut = {}
        for d in DIRS:
            bb = rot[d].getchannel('A').getbbox()
            cy = bb[1] + int((bb[3] - bb[1]) * cfg['upperBody'])
            cut[d] = [rot[d].crop((0, 0, w0, cy)).resize((w0, cy))]
        hmax = max(c[0].height for c in cut.values())
        for d in DIRS:   # 底部對齊（腰部是錨點）
            pad = Image.new('RGBA', (w0, hmax)); pad.paste(cut[d][0], (0, hmax - cut[d][0].height)); cut[d] = [pad]
        sheet, w, h, n, dirs = build_sheet(cut, False)
        save('Idle', sheet, dict(w=w, h=h, n=1, fps=1, loop=True, ax=ax, ay=h, dirs=8))
    else:
        sheet, w, h, n, dirs = build_sheet(idle, False)
        save('Idle', sheet, dict(w=w, h=h, n=1, fps=1, loop=True, ax=ax, ay=ay, dirs=8))

    src_anims = st.get('animations', {})
    for name, a in cfg.get('anims', {}).items():
        src = src_anims.get(a['source'])
        if not src:
            print(f'  {sprite}: 還沒有 {a["source"]} 動畫，略過')
            continue
        frames = {d: [load(z, p) for p in sorted(ps)] for d, ps in src.items()}
        single = len(frames) == 1
        sheet, w, h, n, dirs = build_sheet(frames, single)
        info = dict(w=w, h=h, n=n, fps=a['fps'], loop=a['loop'], ax=w // 2, ay=ay + (h - h0) // 2, dirs=dirs)
        if 'hit' in a:
            info['hit'] = a['hit']
        missing = [d for d in DIRS if d not in frames]
        if missing and not single:
            print(f'  {sprite}/{name}: 缺 {", ".join(missing)}，暫用相近方向補')
        save(name, sheet, info)

    entry = {'anims': anims}
    if cfg.get('red'):
        entry['red'] = True
    if cfg.get('saddle'):
        entry['saddle'] = saddle_points(rot, ax, ay)
    print(f'  {sprite}: {", ".join(f"{k}×{v["n"]}{"" if v["dirs"] == 8 else "（單方向）"}" for k, v in anims.items())}')
    return entry


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    refresh = '--refresh' in sys.argv
    cfg = json.loads((ROOT / 'tools' / 'pixellab.json').read_text(encoding='utf-8'))
    meta_path = ROOT / 'js' / 'data' / 'sprites-meta.js'
    old = {}
    if meta_path.exists():
        m = re.search(r'G\.SPRITE_META = (\{.*\});', meta_path.read_text(encoding='utf-8'), re.S)
        if m:
            old = json.loads(m.group(1))
    for sprite, c in cfg.items():
        if sprite.startswith('_') or (args and sprite not in args):
            continue
        old[sprite] = import_sprite(sprite, c, refresh)
    meta_path.write_text('/* 由 tools/import_pixellab.py 產生，不要手改 */\nG.SPRITE_META = '
                         + json.dumps(old, ensure_ascii=False) + ';\n', encoding='utf-8', newline='\n')
    print('已更新 js/data/sprites-meta.js')


if __name__ == '__main__':
    main()
