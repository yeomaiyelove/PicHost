import { getDb } from '../db'
import { getImageIndexRow } from '../image-index'
import { getBackendById } from '../storage/resolver'
import { hlsSegmentNames } from '../transcode'

interface ArtifactRow {
  job_id: string
  media_key: string
  key: string
  backend_id: string
  created: number
  updated_at: string
}

function ensureArtifactSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS site_sync_artifacts (
      job_id TEXT NOT NULL,
      media_key TEXT NOT NULL,
      key TEXT NOT NULL,
      backend_id TEXT NOT NULL,
      created INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(job_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_site_sync_artifacts_updated
      ON site_sync_artifacts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_site_sync_artifacts_media
      ON site_sync_artifacts(job_id, media_key);
  `)
}

export function recordSiteSyncArtifact(input: {
  jobId: string
  mediaKey: string
  key: string
  backendId: string
  created: boolean
}): void {
  ensureArtifactSchema()
  getDb().prepare(`
    INSERT INTO site_sync_artifacts
      (job_id, media_key, key, backend_id, created, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id, key) DO UPDATE SET
      media_key = excluded.media_key,
      backend_id = excluded.backend_id,
      created = MAX(site_sync_artifacts.created, excluded.created),
      updated_at = excluded.updated_at
  `).run(
    input.jobId,
    input.mediaKey,
    input.key,
    input.backendId,
    input.created ? 1 : 0,
    new Date().toISOString()
  )
}

export function completeSiteSyncMediaArtifacts(
  jobId: string,
  mediaKey: string
): void {
  ensureArtifactSchema()
  getDb().prepare(`
    DELETE FROM site_sync_artifacts
    WHERE job_id = ? AND media_key = ?
  `).run(jobId, mediaKey)
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function isReferencedByCommittedMedia(
  mediaKey: string,
  key: string
): Promise<boolean> {
  const row = getImageIndexRow(mediaKey)
  if (!row) return false
  if (key === row.key || key === row.thumb_key || key === row.hls_key) {
    return true
  }
  if (!row.hls_key) return false

  const slash = row.hls_key.lastIndexOf('/')
  if (slash < 0 || !key.startsWith(`${row.hls_key.slice(0, slash)}/`)) {
    return false
  }

  try {
    const backend = await getBackendById(row.backend_id)
    if (!backend) return true
    const playlist = await streamToString(await backend.createStream(row.hls_key))
    const dir = row.hls_key.slice(0, slash)
    return hlsSegmentNames(playlist).some(name => key === `${dir}/${name}`)
  } catch {
    // If the playlist cannot be read, keep the object rather than risk data loss.
    return true
  }
}

export async function cleanupSiteSyncJobArtifacts(jobId: string): Promise<{
  deleted: number
  referenced: number
  failed: number
}> {
  ensureArtifactSchema()
  const rows = getDb().prepare(`
    SELECT job_id, media_key, key, backend_id, created, updated_at
    FROM site_sync_artifacts
    WHERE job_id = ?
    ORDER BY updated_at ASC
  `).all(jobId) as unknown as ArtifactRow[]

  let deleted = 0
  let referenced = 0
  let failed = 0
  for (const row of rows) {
    if (Number(row.created) !== 1) {
      getDb().prepare(`
        DELETE FROM site_sync_artifacts WHERE job_id = ? AND key = ?
      `).run(jobId, row.key)
      continue
    }

    try {
      if (await isReferencedByCommittedMedia(row.media_key, row.key)) {
        referenced++
      } else {
        const backend = await getBackendById(row.backend_id)
        if (!backend) throw new Error('存储后端不存在')
        if (await backend.head(row.key)) {
          await backend.delete(row.key)
          deleted++
        }
      }
      getDb().prepare(`
        DELETE FROM site_sync_artifacts WHERE job_id = ? AND key = ?
      `).run(jobId, row.key)
    } catch {
      failed++
    }
  }

  return { deleted, referenced, failed }
}

export async function cleanupExpiredSiteSyncArtifacts(
  maxAgeMs = 24 * 60 * 60 * 1000
): Promise<{ jobs: number, deleted: number, failed: number }> {
  ensureArtifactSchema()
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString()
  const rows = getDb().prepare(`
    SELECT DISTINCT job_id
    FROM site_sync_artifacts
    WHERE updated_at < ?
  `).all(cutoff) as Array<{ job_id: string }>

  let deleted = 0
  let failed = 0
  for (const row of rows) {
    const result = await cleanupSiteSyncJobArtifacts(row.job_id)
    deleted += result.deleted
    failed += result.failed
  }
  return { jobs: rows.length, deleted, failed }
}
