const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'knightly.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_banned INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT UNIQUE NOT NULL,
    white_id INTEGER,
    black_id INTEGER,
    white_name TEXT,
    black_name TEXT,
    status TEXT NOT NULL DEFAULT 'waiting',   -- waiting | active | finished
    result TEXT,                               -- e.g. '1-0', '0-1', '1/2-1/2'
    reason TEXT,                                -- checkmate, resignation, draw, stalemate, timeout...
    fen TEXT,
    pgn TEXT,
    time_control INTEGER NOT NULL DEFAULT 600,  -- seconds per side, 0 = unlimited
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (white_id) REFERENCES users(id),
    FOREIGN KEY (black_id) REFERENCES users(id)
  );
`);

module.exports = db;
