import { createReadStream, promises as fs } from 'node:fs'
import { join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { DatabaseSync } from 'node:sqlite'
import * as tar from 'tar'
import { getImageIndexRow } from '../image-index'
import { getActiveBackend } from '../storage/resolver'
import { contentTypeFromKey } from '../content-type'
import { replaceDatabaseFromSnapshot } from './db-snapshot'
import { markJobDone, markJobFailed, restoreBackupJobsAfterReplace, snapshotBackupJobs, updateBackupJob } from './jobs'
import {
  BACKUP_FORMAT_VERSION,
  type BackupManifest,
  type BackupRestorePreview
} from './manifest'
import { getBackupStagingDir } from './paths'
import { ensureDefaultBackends } from '../storage-backends'

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(full))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

async function extractArchive(archivePath: string, targetDir: string): Promise<void> {
  await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(targetDir, { recursive: true })
  await tar.x({
    file: archivePath,
    cwd: targetDir,
    gzip: true
  })
}

async function readManifest(stagingRoot: string): Promise<BackupManifest> {
  const raw = await fs.readFile(join(stagingRoot, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(raw) as BackupManifest
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`不支持的备份格式版本：${manifest.formatVersion}`)
  }
  return manifest
}

interface RestoreImageRow {
  key: string
  thumb_key: string | null
  hls_key: string | null
  source_deleted: number
}

function readRestoreImageRows(stagingRoot: string): RestoreImageRow[] {
  const db = new DatabaseSync(
    join(stagingRoot, 'database', 'pichost.sqlite'),
    { readOnly: true }
  )
  try {
    return db.prepare(`
      SELECT key, thumb_key, hls_key, source_deleted
      FROM images
    `).all() as unknown as RestoreImageRow[]
  } finally {
    db.close()
  }
}

export async function previewFullRestore(archivePath: string): Promise<BackupRestorePreview> {
  const stagingRoot = getBackupStagingDir(`preview-${Date.now()}`)
  try {
    await extractArchive(archivePath, stagingRoot)
    const manifest = await readManifest(stagingRoot)
    const backend = await getActiveBackend()
    const imageRows = readRestoreImageRows(stagingRoot)
    let conflictingImages = 0
    for (const row of imageRows) {
      const keys = [
        ...(Number(row.source_deleted) === 1 ? [] : [row.key]),
        ...(row.thumb_key ? [row.thumb_key] : []),
        ...(row.hls_key ? [row.hls_key] : [])
      ]
      for (const key of keys) {
        if (!await backend.head(key)) continue
        conflictingImages += 1
        break
      }
    }

    return {
      imageCount: imageRows.length,
      imageBytes: manifest.imageBytes,
      newImages: imageRows.length - conflictingImages,
      conflictingImages,
      formatVersion: manifest.formatVersion,
      appVersion: manifest.appVersion,
      createdAt: manifest.createdAt
    }
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => {})
  }
}

export async function runFullRestoreJob(
  jobId: string,
  archivePath: string,
  options: { conflictMode: 'skip' | 'overwrite' }
): Promise<void> {
  const stagingRoot = getBackupStagingDir(jobId)
  const preservedJobs = snapshotBackupJobs(50)

  try {
    updateBackupJob(jobId, { message: '正在解压备份包…', total: 0, progress: 0 })
    await extractArchive(archivePath, stagingRoot)
    const manifest = await readManifest(stagingRoot)

    const dbPath = join(stagingRoot, 'database', 'pichost.sqlite')
    await fs.access(dbPath)

    updateBackupJob(jobId, { message: '正在恢复数据库…' })
    await replaceDatabaseFromSnapshot(dbPath)
    ensureDefaultBackends()
    restoreBackupJobsAfterReplace(preservedJobs)
    updateBackupJob(jobId, {
      status: 'running',
      message: '正在恢复文件…',
      progress: 0,
      total: 0
    })

    const blobsRoot = join(stagingRoot, 'blobs')
    const blobFiles = await walkFiles(blobsRoot)
    const total = blobFiles.length + 1
    updateBackupJob(jobId, { total, progress: 1, message: '正在恢复文件…' })

    const backend = await getActiveBackend()
    let processed = 1

    for (const file of blobFiles) {
      const key = relative(blobsRoot, file).replace(/\\/g, '/')
      const indexed = getImageIndexRow(key)
      const exists = Boolean(await backend.head(key))

      if (exists && options.conflictMode === 'skip') {
        processed += 1
        continue
      }

      const bytes = await fs.readFile(file)
      const meta = indexed
        ? {
            originalName: indexed.original_name,
            uploadedAt: indexed.uploaded_at,
            contentType: indexed.content_type,
            size: indexed.size,
            userId: indexed.user_id
          }
        : {
            originalName: key.split('/').pop() ?? key,
            uploadedAt: new Date().toISOString(),
            contentType: contentTypeFromKey(key),
            size: bytes.length,
            userId: null
          }

      if (options.conflictMode === 'overwrite' || !exists) {
        await backend.put(key, bytes, meta)
      }

      processed += 1
      updateBackupJob(jobId, {
        progress: processed,
        message: `正在恢复文件 ${processed}/${total}…`
      })
    }

    await fs.rm(stagingRoot, { recursive: true, force: true })

    markJobDone(jobId, {
      message: '恢复完成，请重新登录并在存储页检查对象存储密钥',
      payload: {
        restoredFiles: blobFiles.length,
        manifest
      }
    })
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => {})
    const message = error instanceof Error ? error.message : '恢复失败'
    markJobFailed(jobId, message)
    throw error
  }
}

export async function streamBlobToFile(
  archivePath: string,
  targetPath: string
): Promise<void> {
  await fs.mkdir(join(targetPath, '..'), { recursive: true })
  const readStream = createReadStream(archivePath)
  const writeStream = (await import('node:fs')).createWriteStream(targetPath)
  await pipeline(readStream, writeStream)
}
