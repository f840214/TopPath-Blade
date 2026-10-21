#!/usr/bin/env python3
"""下載 PixelLab 俯視 Wang 地磚，存成 assets/tiles/ground.png 與 js/data/tiles.js。

用法：python3 tools/import_tiles.py <tileset_id>
tiles.js 每塊磚：c = 四個角的地形 [NW, NE, SW, SE]（lower 泥土／upper 草地），b = 在圖上的位置 [x, y, w, h]
"""
import json, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def main():
    tid = sys.argv[1]
    base = f'https://api.pixellab.ai/mcp/tilesets/{tid}'
    (ROOT / 'assets' / 'tiles').mkdir(parents=True, exist_ok=True)
    (ROOT / 'assets' / 'tiles' / 'ground.png').write_bytes(get(base + '/image?inline=true'))
    m = json.loads(get(base + '/metadata'))
    tiles = m.get('tileset_data', m)['tiles']
    out = [{'c': [t['corners'][k] for k in ('NW', 'NE', 'SW', 'SE')],
            'b': [t['bounding_box'][k] for k in ('x', 'y', 'width', 'height')]} for t in tiles]
    (ROOT / 'js' / 'data' / 'tiles.js').write_text(
        f'/* 由 tools/import_tiles.py 產生（tileset {tid}），不要手改 */\nG.TILES = ' + json.dumps(out) + ';\n')
    print(f'{len(out)} 塊地磚')


if __name__ == '__main__':
    main()
