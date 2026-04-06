import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const db = new Database(path.join(__dirname, 'rukabet.db'))

// Enable foreign keys
db.pragma('foreign_keys = ON')

// ─────────────────────────────────────────────────────────────────────────
// DATABASE SCHEMA
// ─────────────────────────────────────────────────────────────────────────

db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    balance REAL DEFAULT 0,
    freebet REAL DEFAULT 150,
    freebet_locked INTEGER DEFAULT 1,
    has_played_with_money INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Global settings table (for admin-configured payment gateway)
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    intasend_public_key TEXT,
    intasend_secret_key TEXT,
    company_name TEXT DEFAULT 'RUKA TECH SOLUTIONS',
    whatsapp_support TEXT DEFAULT '254712345678',
    min_deposit REAL DEFAULT 10,
    min_withdrawal REAL DEFAULT 50,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Deposits table
  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    amount REAL NOT NULL,
    api_ref TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    intasend_invoice_id TEXT,
    intasend_tracking_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Withdrawals table
  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Bet history table
  CREATE TABLE IF NOT EXISTS bet_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    multiplier REAL,
    won REAL,
    is_freebet INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Admin users table
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Initialize default settings if not exists
  INSERT OR IGNORE INTO settings (id, company_name) VALUES (1, 'RUKA TECH SOLUTIONS');
`)

console.log('✅ Database initialized')

export default db
