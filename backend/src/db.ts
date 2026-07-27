import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH ?? "./lifeos.db";
export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS journals (
  day TEXT PRIMARY KEY, content TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('expense','income'))
);
CREATE TABLE IF NOT EXISTS moods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  note TEXT
);
CREATE TABLE IF NOT EXISTS time_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  category TEXT DEFAULT 'work',
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  done_at TEXT
);
CREATE TABLE IF NOT EXISTS sleep (
  day TEXT PRIMARY KEY,
  bedtime TEXT,       -- HH:MM (previous evening)
  waketime TEXT,      -- HH:MM (this morning)
  hours REAL,
  quality INTEGER CHECK(quality BETWEEN 1 AND 10),
  note TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL, ts TEXT NOT NULL, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gratitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL, ts TEXT NOT NULL, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'daily',   -- daily | weekly
  target_per_week INTEGER DEFAULT 7,
  color TEXT DEFAULT '#60a5fa',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  note TEXT,
  UNIQUE(habit_id, day)
);
CREATE TABLE IF NOT EXISTS mood2d (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  energy INTEGER NOT NULL CHECK(energy BETWEEN 1 AND 10),
  valence INTEGER NOT NULL CHECK(valence BETWEEN 1 AND 10),
  tag TEXT,        -- e.g. "anxious", "focused", "calm"
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_ts   ON transactions(ts);
CREATE INDEX IF NOT EXISTS idx_mood_ts ON moods(ts);
CREATE INDEX IF NOT EXISTS idx_sess_st ON time_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due  ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
CREATE INDEX IF NOT EXISTS idx_hlog_day ON habit_logs(day);
CREATE INDEX IF NOT EXISTS idx_wins_day ON wins(day);
CREATE INDEX IF NOT EXISTS idx_grat_day ON gratitudes(day);
CREATE INDEX IF NOT EXISTS idx_mood2d_ts ON mood2d(ts);

CREATE TABLE IF NOT EXISTS weight (
  day TEXT PRIMARY KEY,
  kg REAL NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  name TEXT NOT NULL,
  kcal INTEGER NOT NULL,
  protein_g REAL, carbs_g REAL, fat_g REAL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_meals_ts ON meals(ts);
CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,          -- e.g. AAPL, RELIANCE.NS, BTC-USD
  kind TEXT NOT NULL DEFAULT 'stock',  -- stock | etf | crypto | mf
  shares REAL NOT NULL,
  cost_basis REAL NOT NULL,      -- per unit
  currency TEXT DEFAULT 'USD',
  note TEXT,
  manual_price REAL,             -- fallback price when no live ticker available
  imported_from TEXT,             -- e.g. 'groww_stocks' | 'groww_mf'
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  dob TEXT,                              -- YYYY-MM-DD
  pronouns TEXT,
  timezone TEXT,
  currency TEXT DEFAULT 'USD',
  sleep_target_hours REAL DEFAULT 8,
  values_json TEXT,                      -- comma-separated freeform (renamed: 'values' is a SQLite keyword)
  goal TEXT,                             -- current one-line focus
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL,
  api_key TEXT,
  model TEXT NOT NULL,
  base_url TEXT,
  auth_type TEXT NOT NULL DEFAULT 'api_key',   -- 'api_key' | 'oauth'
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider TEXT PRIMARY KEY,           -- 'github_copilot' | 'anthropic'
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,                  -- ms since epoch
  meta TEXT,                           -- JSON: enterpriseUrl, etc
  updated_at TEXT NOT NULL
);
`);

// Additive migrations: add columns to holdings if the DB was created earlier without them.
const holdingCols = (db.query("PRAGMA table_info(holdings)").all() as any[]).map(c => c.name);
if (!holdingCols.includes("manual_price"))  db.exec("ALTER TABLE holdings ADD COLUMN manual_price REAL");
if (!holdingCols.includes("imported_from")) db.exec("ALTER TABLE holdings ADD COLUMN imported_from TEXT");
if (!holdingCols.includes("monthly_contribution"))     db.exec("ALTER TABLE holdings ADD COLUMN monthly_contribution REAL DEFAULT 0");
if (!holdingCols.includes("contribution_last_applied")) db.exec("ALTER TABLE holdings ADD COLUMN contribution_last_applied TEXT");

// Convenience wrappers
export const q  = <T = any>(sql: string, ...args: any[]) => db.query(sql).all(...args) as T[];
export const q1 = <T = any>(sql: string, ...args: any[]) => db.query(sql).get(...args) as T | null;
export const run = (sql: string, ...args: any[]) => db.query(sql).run(...args);
