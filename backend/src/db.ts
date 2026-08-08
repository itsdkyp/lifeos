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
  kind TEXT NOT NULL CHECK(kind IN ('expense','income','transfer')),
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'bank', -- bank, cash, credit_card, receivable, payable
  currency TEXT DEFAULT 'USD',
  initial_balance REAL DEFAULT 0,
  created_at TEXT NOT NULL
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
  done_at TEXT,
  duration_minutes INTEGER DEFAULT 15,
  google_event_id TEXT
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
CREATE INDEX IF NOT EXISTS idx_tx_kind_ts ON transactions(kind, ts);
CREATE INDEX IF NOT EXISTS idx_tx_acc  ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_to_acc ON transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_mood_ts ON moods(ts);
CREATE INDEX IF NOT EXISTS idx_sess_st ON time_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sess_active ON time_sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due  ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
CREATE INDEX IF NOT EXISTS idx_tasks_done_at ON tasks(done_at);
CREATE INDEX IF NOT EXISTS idx_tasks_gcal ON tasks(google_event_id);
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
CREATE TABLE IF NOT EXISTS water (
  day TEXT PRIMARY KEY,
  ml INTEGER NOT NULL DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_hold_symbol ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_hold_imported_from ON holdings(imported_from);

-- Idempotency ledger for trade-delta imports (Groww Order History, etc). Each row
-- is one broker order ID we've already applied to holdings. Re-importing the same
-- file (or an overlapping-date re-export) checks this before touching a position,
-- so uploading a file twice can never double-count shares.
CREATE TABLE IF NOT EXISTS imported_order_ids (
  order_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  applied_at TEXT NOT NULL
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
  context_days INTEGER DEFAULT 30,
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
const taskCols = (db.query("PRAGMA table_info(tasks)").all() as any[]).map(c => c.name);
if (!taskCols.includes("is_important")) db.exec("ALTER TABLE tasks ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0");
if (!taskCols.includes("is_urgent"))    db.exec("ALTER TABLE tasks ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0");
if (!taskCols.includes("duration_minutes")) db.exec("ALTER TABLE tasks ADD COLUMN duration_minutes INTEGER DEFAULT 15");
if (!taskCols.includes("google_event_id"))  db.exec("ALTER TABLE tasks ADD COLUMN google_event_id TEXT");
if (!taskCols.includes("due_time"))         db.exec("ALTER TABLE tasks ADD COLUMN due_time TEXT");

const mealCols = (db.query("PRAGMA table_info(meals)").all() as any[]).map(c => c.name);
if (!mealCols.includes("meal_type")) db.exec("ALTER TABLE meals ADD COLUMN meal_type TEXT DEFAULT 'snack'");
const holdingCols = (db.query("PRAGMA table_info(holdings)").all() as any[]).map(c => c.name);
if (!holdingCols.includes("manual_price"))  db.exec("ALTER TABLE holdings ADD COLUMN manual_price REAL");
if (!holdingCols.includes("imported_from")) db.exec("ALTER TABLE holdings ADD COLUMN imported_from TEXT");
if (!holdingCols.includes("monthly_contribution"))     db.exec("ALTER TABLE holdings ADD COLUMN monthly_contribution REAL DEFAULT 0");
if (!holdingCols.includes("contribution_last_applied")) db.exec("ALTER TABLE holdings ADD COLUMN contribution_last_applied TEXT");

const txnCols = (db.query("PRAGMA table_info(transactions)").all() as any[]).map(c => c.name);
if (!txnCols.includes("account_id")) db.exec("ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL");
if (!txnCols.includes("to_account_id")) db.exec("ALTER TABLE transactions ADD COLUMN to_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL");

const llmCols = (db.query("PRAGMA table_info(llm_config)").all() as any[]).map(c => c.name);
if (!llmCols.includes("context_days")) db.exec("ALTER TABLE llm_config ADD COLUMN context_days INTEGER DEFAULT 30");


const profileCols = (db.query("PRAGMA table_info(profile)").all() as any[]).map(c => c.name);
if (!profileCols.includes("vault_path"))     db.exec("ALTER TABLE profile ADD COLUMN vault_path TEXT");
if (!profileCols.includes("journal_subdir")) db.exec("ALTER TABLE profile ADD COLUMN journal_subdir TEXT");
if (!profileCols.includes("alias"))          db.exec("ALTER TABLE profile ADD COLUMN alias TEXT");
if (!profileCols.includes("google_client_id")) db.exec("ALTER TABLE profile ADD COLUMN google_client_id TEXT");
if (!profileCols.includes("google_client_secret")) db.exec("ALTER TABLE profile ADD COLUMN google_client_secret TEXT");
if (!profileCols.includes("monthly_budget")) db.exec("ALTER TABLE profile ADD COLUMN monthly_budget REAL");
if (!profileCols.includes("fixed_categories")) db.exec("ALTER TABLE profile ADD COLUMN fixed_categories TEXT DEFAULT '[]'");
if (!profileCols.includes("username"))      db.exec("ALTER TABLE profile ADD COLUMN username TEXT");
if (!profileCols.includes("password_hash")) db.exec("ALTER TABLE profile ADD COLUMN password_hash TEXT");

// Password-login sessions. No expiry column by design — a session is valid until its
// row is deleted by an explicit /auth/logout. token_hash (not the raw cookie value) is
// stored so a leaked DB backup can't be replayed as a live session.
db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

-- User-generated tokens for MCP/API/script access (replaces the old static LIFEOS_TOKEN
-- env var). Same token_hash-not-raw-value principle as sessions. The raw token is shown
-- to the user exactly once, at creation time, in the API response — never again.
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

-- Login attempt log, for brute-force rate limiting on /auth/login.
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempted_at TEXT NOT NULL,
  success INTEGER NOT NULL
);
`);

// Convenience wrappers
export const q  = <T = any>(sql: string, ...args: any[]) => db.query(sql).all(...args) as T[];
export const q1 = <T = any>(sql: string, ...args: any[]) => db.query(sql).get(...args) as T | null;
export const run = (sql: string, ...args: any[]) => db.query(sql).run(...args);
