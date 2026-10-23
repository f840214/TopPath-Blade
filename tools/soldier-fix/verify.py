# verify.py <key...>: run the importer against tools/cache into a temp dir, compare with assets/units + sprites-meta
import sys,json,re,importlib.util
from pathlib import Path
from PIL import Image, ImageChops
ROOT=Path('C:/Users/88697/桌面/TopPath-Blade')
spec=importlib.util.spec_from_file_location('imp',ROOT/'tools/import_pixellab.py'); imp=importlib.util.module_from_spec(spec); spec.loader.exec_module(imp)
imp.OUT=Path('vout')
cfg=json.loads((ROOT/'tools/pixellab.json').read_text(encoding='utf-8'))
meta=json.loads(re.search(r'G\.SPRITE_META = (\{.*\});',(ROOT/'js/data/sprites-meta.js').read_text(encoding='utf-8'),re.S).group(1))
for k in sys.argv[1:]:
    e=imp.import_sprite(k,cfg[k],False)
    print(k,'meta same' if e==meta[k] else f'META DIFF {e} vs {meta[k]}')
    for p in sorted((ROOT/'assets/units'/k).rglob('*.png')):
        q=Path('vout')/k/p.relative_to(ROOT/'assets/units'/k)
        a=Image.open(p).convert('RGBA'); b=Image.open(q).convert('RGBA')
        same=a.size==b.size and ImageChops.difference(a,b).getbbox() is None
        print('  ',p.relative_to(ROOT/'assets/units'/k),'same' if same else 'DIFF')
