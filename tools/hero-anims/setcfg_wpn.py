# re-reads tools/pixellab.json and sets ONLY look_* keys (ids + anims). run right before import.
import json
P='/Users/benji/Desktop/TopPath-Blade/tools/pixellab.json'
d=json.load(open(P))
W=lambda: {"source":"Walk","fps":10,"loop":True}
def A(h): return {"source":"Attack","fps":14,"loop":False,"hit":h}
upd={
 'look_samurai':        {'id':'2cdea3b7-c6f2-4f3a-bdbe-20ea0e8054e9','anims':{'Walk':W(),'Attack':A(4),
                          'Spin':{"source":"Spin","fps":16,"loop":False,"hit":4},'Shout':{"source":"Shout","fps":8,"loop":False,"hit":3}}},
 'look_mongol':         {'id':'69d08ed4-8b84-4dde-a6bf-8bb5b333e67b','anims':{'Walk':W(),'Attack':A(3)}},
 'look_ming_officer':   {'id':'f1e35739-c903-46fb-a68c-7a5f9d4468b4','anims':{'Walk':W(),'Attack':A(3)}},
 'look_jarl':           {'id':'a5757b55-0a9e-4e80-9936-3c61d6f9ebeb','anims':{'Walk':W(),'Attack':A(3),
                          'Whirl':{"source":"Whirl","fps":16,"loop":True},'Smash':{"source":"Smash","fps":14,"loop":False,"hit":4}}},
}
add={
 'look_templar':{'Spin':{"source":"Spin","fps":16,"loop":False,"hit":4},'Shout':{"source":"Shout","fps":8,"loop":False,"hit":3}},
 'look_landsknecht':{'Spin':{"source":"Spin","fps":16,"loop":False,"hit":4},'Shout':{"source":"Shout","fps":8,"loop":False,"hit":3}},
 'look_ashigaru_taisho':{'Spin':{"source":"Spin","fps":16,"loop":False,"hit":4}},
 'look_knight':{'Shout':{"source":"Shout","fps":8,"loop":False,"hit":3}},
 'look_viking':{'Shout':{"source":"Shout","fps":8,"loop":False,"hit":3}},
 'look_han_general':{'Whirl':{"source":"Whirl","fps":16,"loop":True}},
}
for k,v in upd.items(): d[k]=v
for k,v in add.items(): d[k]['anims'].update(v)
open(P,'w').write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print('ok')
