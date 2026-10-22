/* ============ create.js — 創角：選角色外觀與頭像 ============
 * 新帳號（設定裡還沒有 look）登入後先到這裡（創建武將）；之後在鐵匠鋪按「更換外觀」再打開（edit 模式：標題、按鈕不同，可以取消）。
 * 外觀清單在 js/data/looks.js（G.LOOKS：key 是 assets/units/<key>/ 的精靈圖，portrait 是頭像圖）。
 * 選好的存在設定（存檔的 settings.look / settings.portrait），由 G.Menu.setLook 寫入。
 */
G.Create = (() => {
  const $ = id => document.getElementById(id);
  let look = null, portrait = null, done = null, edit = false, orig = null;

  /** 外觀預覽：精靈圖 Idle 朝南（第 0 列第 0 格），放大 2 倍 */
  function preview(key) {
    const c = document.createElement('canvas'), a = G.SPRITE_META[key] && G.SPRITE_META[key].anims.Idle;
    if (!a) return c;
    c.width = a.w * 2; c.height = a.h * 2;
    const g = c.getContext('2d'), im = new Image();
    im.onload = () => { g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, a.w, a.h, 0, 0, a.w * 2, a.h * 2); };
    im.src = `assets/units/${key}/Idle.png`;
    return c;
  }

  function render() {
    const L = G.LOOKS || [];
    $('crLooks').innerHTML = ''; $('crPortraits').innerHTML = '';
    for (const l of L) {
      const b = document.createElement('button');
      b.className = 'crCard' + (l.key === look ? ' on' : ''); b.type = 'button';
      b.append(preview(l.key));
      b.insertAdjacentHTML('beforeend', `<b>${l.name}</b><small>${l.region}${l.weapon && G.WEAPONS[l.weapon] ? '・' + G.WEAPONS[l.weapon].name : ''}</small>`);
      b.onclick = () => { look = l.key; if (!portrait) portrait = l.portrait; render(); };
      $('crLooks').append(b);
    }
    for (const l of L) {
      const b = document.createElement('button');
      b.className = 'crFace' + (l.portrait === portrait ? ' on' : ''); b.type = 'button'; b.title = l.name;
      b.innerHTML = `<img src="${l.portrait}" alt="">`;
      b.onclick = () => { portrait = l.portrait; render(); };
      $('crPortraits').append(b);
    }
    const cur = L.find(l => l.key === look);
    const wp = cur && cur.weapon && G.WEAPONS[cur.weapon];
    $('crPick').textContent = !cur ? '尚未選擇外觀' : `${cur.region}・${cur.name}${wp ? `・職業：${wp.name}` : ''}${edit && wp && orig && G.WEAPONS[orig] && orig !== cur.weapon ? `（會從${G.WEAPONS[orig].name}換成${wp.name}）` : ''}`;
    $('crOk').disabled = !look || !portrait;
  }

  /** 打開創角畫面；cur：目前的 { look, portrait, weapon }，onDone(look, portrait)；o.edit：已經有武將，只是更換外觀 */
  function open(cur, onDone, o = {}) {
    look = cur.look || null; portrait = cur.portrait || null; done = onDone; edit = !!o.edit; orig = cur.weapon;
    $('crTitle').textContent = edit ? '更換外觀' : '創建武將';
    $('crOk').textContent = edit ? '更換' : '建立武將';
    $('crCancel').style.display = edit ? '' : 'none';
    $('create').style.display = 'flex';
    render();
  }
  function bind() {
    $('crCancel').onclick = () => { $('create').style.display = 'none'; done && done(null); };
    $('crOk').onclick = () => { if (!look || !portrait) return; $('create').style.display = 'none'; done && done(look, portrait); };
  }
  const isOpen = () => $('create').style.display === 'flex';

  return { open, bind, isOpen };
})();
