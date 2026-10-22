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
