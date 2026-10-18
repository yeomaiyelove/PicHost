import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/
const MIN_PASSWORD_LENGTH = 8
const SETTINGS_ALLOW_REGISTRATION = 'allow_registration'

const dataDir = process.env.DATA_DIR || '/data'
const configPath = join(dataDir, '.fnos-setup.json')
const donePath = join(dataDir, '.fnos-setup.done')

function log(message) {
  console.log(`[PicHost fnos-bootstrap] ${message}`)
}

function fail(message) {
  console.error(`[PicHost fnos-bootstrap] ${message}`)
  process.exit(1)
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`
}

// 与 server/utils/db.ts 初始建表一致；完整迁移由应用启动后的 getDb() 负责。
function initDb(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      content_type TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
      ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_action_created
      ON activity_logs(action, created_at DESC);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `)

  const columns = database.prepare('PRAGMA table_info(users)').all()
  if (!columns.some(column => column.name === 'api_token')) {
    database.exec('ALTER TABLE users ADD COLUMN api_token TEXT')
    database.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_token ON users(api_token) WHERE api_token IS NOT NULL'
    )
  }
  if (!columns.some(column => column.name === 'auto_delete_days')) {
    database.exec('ALTER TABLE users ADD COLUMN auto_delete_days INTEGER NOT NULL DEFAULT 0')
  }
  const userColumns = database.prepare('PRAGMA table_info(users)').all()
  if (!userColumns.some(column => column.name === 'auto_delete_enabled_at')) {
    database.exec('ALTER TABLE users ADD COLUMN auto_delete_enabled_at TEXT')
  }
}

function countUsers(database) {
  const row = database.prepare('SELECT COUNT(*) AS count FROM users').get()
  return Number(row?.count ?? 0)
}

function setSetting(database, key, value) {
  const updatedAt = new Date().toISOString()
  database.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value, updatedAt)
}

mkdirSync(dataDir, { recursive: true })
const dbPath = join(dataDir, 'pichost.db')
const db = new DatabaseSync(dbPath)
initDb(db)

if (countUsers(db) > 0) {
  if (existsSync(configPath)) {
    renameSync(configPath, donePath)
  }
  log('already initialized')
  process.exit(0)
}

if (!existsSync(configPath)) {
  log('no setup file, waiting for install wizard')
  process.exit(0)
}

let setup
try {
  setup = JSON.parse(readFileSync(configPath, 'utf8'))
} catch {
  fail('invalid .fnos-setup.json')
}

const username = String(setup.username ?? '').trim()
const password = String(setup.password ?? '')
const allowRegistration = Boolean(setup.allowRegistration)

if (!USERNAME_PATTERN.test(username)) {
  fail('invalid admin username in setup file')
}
if (password.length < MIN_PASSWORD_LENGTH) {
  fail('invalid admin password in setup file')
}

const createdAt = new Date().toISOString()
db.prepare(`
  INSERT INTO users (username, password_hash, role, created_at)
  VALUES (?, ?, 'admin', ?)
`).run(username, hashPassword(password), createdAt)

setSetting(db, SETTINGS_ALLOW_REGISTRATION, allowRegistration ? 'true' : 'false')
db.close()

renameSync(configPath, donePath)
log(`admin "${username}" created`)
