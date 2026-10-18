import { getDb } from '../db'

function backupJobsTableSql(): string {
  const row = getDb().prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'backup_jobs'
  `).get() as { sql?: string } | undefined
  return row?.sql ?? ''
}

function migrateBackupJobTypes(): void {
  if (backupJobsTableSql().includes('\'site_sync\'')) return

  const db = getDb()
  db.exec(`
    CREATE TABLE backup_jobs_new (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('full_export', 'full_restore', 'backend_sync', 'site_sync')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'done', 'failed')),
      progress INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      output_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      finished_at TEXT
    );
    INSERT INTO backup_jobs_new
      (id, user_id, type, status, progress, total, message, payload_json, output_path, error, created_at, updated_at, hidden, finished_at)
    SELECT id, user_id, type, status, progress, total, message, payload_json, output_path, error, created_at, COALESCE(updated_at, created_at), hidden, finished_at
    FROM backup_jobs;
    DROP TABLE backup_jobs;
    ALTER TABLE backup_jobs_new RENAME TO backup_jobs;
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_created_at
      ON backup_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_user_created
      ON backup_jobs(user_id, created_at DESC);
  `)
}

export function ensureBackupSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS backup_jobs (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('full_export', 'full_restore', 'backend_sync', 'site_sync')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'done', 'failed')),
      progress INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      output_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_created_at
      ON backup_jobs(created_at DESC);
  `)

  const columns = getDb().prepare('PRAGMA table_info(backup_jobs)').all() as Array<{
    name: string
  }>
  if (!columns.some(column => column.name === 'user_id')) {
    getDb().exec('ALTER TABLE backup_jobs ADD COLUMN user_id INTEGER')
  }
  if (!columns.some(column => column.name === 'updated_at')) {
    getDb().exec('ALTER TABLE backup_jobs ADD COLUMN updated_at TEXT')
  }
  if (!columns.some(column => column.name === 'hidden')) {
    getDb().exec('ALTER TABLE backup_jobs ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0')
  }
  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_user_created
      ON backup_jobs(user_id, created_at DESC);
    UPDATE backup_jobs
    SET user_id = (
      SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1
    )
    WHERE user_id IS NULL
      AND EXISTS (SELECT 1 FROM users WHERE role = 'admin');
    UPDATE backup_jobs
    SET updated_at = COALESCE(finished_at, created_at)
    WHERE updated_at IS NULL;
    UPDATE backup_jobs
    SET updated_at = finished_at
    WHERE finished_at IS NOT NULL
      AND updated_at = created_at;
  `)
  migrateBackupJobTypes()
}
