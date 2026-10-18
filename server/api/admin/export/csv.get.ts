import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as tar from 'tar'
import { requireAdminAuth } from '../../../utils/access'
import { getDb } from '../../../utils/db'
import { logInfo } from '../../../utils/logger'

/** CSV 字段转义 */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 敏感字段脱敏：密码哈希、会话令牌、API Token、存储密钥 */
function maskValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return value
  const text = String(value)
  if (!text) return value
  if (column === 'password_hash' || column === 'token_hash' || column === 'api_token') {
    return `${text.slice(0, 6)}…(${text.length})`
  }
  if (column === 'secret_json') return '{"hidden":true}'
  return value
}

export default defineEventHandler(async (event) => {
  await requireAdminAuth(event)

  const db = getDb()
  const workDir = join(tmpdir(), `pichost-csv-${Date.now()}`)
  const outDir = join(workDir, 'csv')
  const archiveName = `pichost-db-${new Date().toISOString().slice(0, 10)}.tar.gz`

  await fs.mkdir(outDir, { recursive: true })

  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>

    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM "${table.name}"`).all() as Array<Record<string, unknown>>
      const columns = rows.length
        ? Object.keys(rows[0]!)
        : (db.prepare(`PRAGMA table_info("${table.name}")`).all() as Array<{ name: string }>)
            .map(column => column.name)

      const lines = [
        columns.map(column => escapeCsv(column)).join(','),
        ...rows.map(row => columns
          .map(column => escapeCsv(maskValue(column, row[column])))
          .join(','))
      ]

      // 加 BOM，Excel 打开中文不乱码
      await fs.writeFile(
        join(outDir, `${table.name}.csv`),
        `\uFEFF${lines.join('\r\n')}`,
        'utf8'
      )
    }

    await tar.c(
      { gzip: true, file: join(workDir, archiveName), cwd: outDir, portable: true },
      ['.']
    )

    const buffer = await fs.readFile(join(workDir, archiveName))
    logInfo('database csv exported', { tables: tables.length, bytes: buffer.byteLength })

    setHeader(event, 'Content-Type', 'application/gzip')
    setHeader(event, 'Content-Disposition', `attachment; filename="${archiveName}"`)
    return buffer
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
})
