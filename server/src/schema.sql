-- 帳號：帳號名稱不分大小寫唯一；密碼只存 scrypt 雜湊
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   TEXT NOT NULL,
  pass_hash  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

-- 登入工作階段：cookie 裡放隨機 token，資料庫只存它的 SHA-256
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- 玩家存檔：軍團名冊、金幣、武將等級、選單設定（data 是 JSON，第一次登入時是 NULL，由遊戲建立新存檔）
CREATE TABLE IF NOT EXISTS profiles (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 大地圖上被玩家佔領的城池（所有玩家共用）；沒有資料的城池是空城
CREATE TABLE IF NOT EXISTS world_cities (
  city_id    TEXT PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_name  TEXT NOT NULL,
  art        TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 城池收入：上次領收入的時間（world-sim.js）
ALTER TABLE world_cities ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 好友（social.js）：a 邀請 b 是 (a, b, false)；b 接受後兩個方向都是 true
CREATE TABLE IF NOT EXISTS friends (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

-- 家族：名稱、簡稱不分大小寫唯一；成員一個人只能在一個家族（role：leader / officer / member）
CREATE TABLE IF NOT EXISTS guilds (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  tag        TEXT NOT NULL,
  leader_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_name_lower ON guilds (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS guilds_tag_lower ON guilds (lower(tag));
CREATE TABLE IF NOT EXISTS guild_members (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  guild_id   INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS guild_invites (
  guild_id   INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

-- 市集：上架的東西（kind：mat 材料 { mat, n } / item 裝備 { id, dur } / doc 戰術書 { doc }）
CREATE TABLE IF NOT EXISTS market (
  id         SERIAL PRIMARY KEY,
  seller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  item       JSONB NOT NULL,
  price      INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 攻城時段：剛被佔下的城保護到這個時間（social.js 的 siegeBlock）
ALTER TABLE world_cities ADD COLUMN IF NOT EXISTS shield_until TIMESTAMPTZ;

-- 家族聯盟（social.js）：a 邀請 b 是 (a, b, false)，b 接受後變 true；結盟的家族之間算自己人（不能互打、可以回防）
CREATE TABLE IF NOT EXISTS guild_allies (
  a_id       INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  b_id       INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  accepted   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (a_id, b_id)
);
