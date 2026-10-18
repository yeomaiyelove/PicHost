import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getDb,
  insertActivityLog,
  insertUser
} from './db'
import {
  listImageIndexRowsForUser,
  updateImageThumb,
  updateImageTranscode
} from './image-index'
import { ensureDefaultBackends } from './storage-backends'
import { getActiveBackend } from './storage/resolver'
import { putImage } from './storage'
import { createTag } from './tags'
import { clearUserStorage } from './user-storage'
import {
  createBackupJob,
  getBackupJob,
  markJobDone
} from './backup/jobs'
import { getBackupsDir } from './backup/paths'

describe('clearUserStorage', () => {
  it('deletes only the selected user media, tags, logs and cache', async () => {
    ensureDefaultBackends()
    const now = new Date().toISOString()
    const userA = insertUser({
      username: 'clear-user-a',
      passwordHash: 'hash-a',
      role: 'user',
      createdAt: now
    })
    const userB = insertUser({
      username: 'clear-user-b',
      passwordHash: 'hash-b',
      role: 'user',
      createdAt: now
    })

    const keyA = 'videos/2026/10/clear-a.mp4'
    const thumbA = 'videos/2026/10/clear-a.webp'
    const hlsA = 'videos/2026/10/clear-a/index.m3u8'
    const segmentA = 'videos/2026/10/clear-a/seg000.ts'
    const keyB = 'images/2026/10/clear-b.webp'
    const videoMeta = {
      originalName: 'clear-a.mp4',
      uploadedAt: now,
      contentType: 'video/mp4',
      size: 1,
      userId: userA,
      mediaType: 'video' as const
    }

    await putImage(keyA, new Uint8Array([1]), videoMeta)
    const backend = await getActiveBackend()
    await backend.put(thumbA, new Uint8Array([2]), videoMeta)
    await backend.put(
      hlsA,
      new TextEncoder().encode('#EXTM3U\n#EXTINF:6,\nseg000.ts\n'),
      videoMeta
    )
    await backend.put(segmentA, new Uint8Array([3]), videoMeta)
    updateImageThumb(keyA, thumbA)
    updateImageTranscode(keyA, { status: 'done', hlsKey: hlsA, progress: 100 })

    await putImage(keyB, new Uint8Array([4]), {
      originalName: 'clear-b.webp',
      uploadedAt: now,
      contentType: 'image/webp',
      size: 1,
      userId: userB,
      mediaType: 'image'
    })

    const tagA = createTag(userA, 'A tag')
    const tagB = createTag(userB, 'B tag')
    getDb().prepare('INSERT INTO image_tags (image_key, tag_id) VALUES (?, ?)').run(keyA, tagA.id)
    getDb().prepare('INSERT INTO image_tags (image_key, tag_id) VALUES (?, ?)').run(keyB, tagB.id)
    insertActivityLog({
      action: 'upload',
      key: keyA,
      originalName: 'clear-a.mp4',
      size: 1,
      contentType: 'video/mp4',
      source: 'web',
      userId: userA
    })
    insertActivityLog({
      action: 'upload',
      key: keyB,
      originalName: 'clear-b.webp',
      size: 1,
      contentType: 'image/webp',
      source: 'web',
      userId: userB
    })
    const cacheDir = await fs.mkdtemp(join(tmpdir(), `pichost-hls-download-${userA}-`))
    const jobA = createBackupJob({ type: 'full_export', userId: userA })
    const jobB = createBackupJob({ type: 'full_export', userId: userB })
    const archiveA = join(getBackupsDir(), `clear-a-${jobA.id}.phost.tar.gz`)
    const archiveB = join(getBackupsDir(), `clear-b-${jobB.id}.phost.tar.gz`)
    await fs.mkdir(getBackupsDir(), { recursive: true })
    await fs.writeFile(archiveA, 'a')
    await fs.writeFile(archiveB, 'b')
    markJobDone(jobA.id, { outputPath: archiveA })
    markJobDone(jobB.id, { outputPath: archiveB })

    const result = await clearUserStorage(userA)

    expect(result.failed).toEqual([])
    expect(result.deletedMedia).toBe(1)
    expect(result.deletedObjects).toBe(4)
    expect(result.deletedJobs).toBe(1)
    expect(listImageIndexRowsForUser(userA)).toHaveLength(0)
    expect(listImageIndexRowsForUser(userB)).toHaveLength(1)
    expect(await backend.head(keyB)).not.toBeNull()
    expect(await backend.head(keyA)).toBeNull()
    expect(await backend.head(thumbA)).toBeNull()
    expect(await backend.head(hlsA)).toBeNull()
    expect(await backend.head(segmentA)).toBeNull()
    await expect(fs.access(cacheDir)).rejects.toThrow()

    const db = getDb()
    expect(db.prepare('SELECT COUNT(*) AS count FROM tags WHERE user_id = ?').get(userA))
      .toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tags WHERE user_id = ?').get(userB))
      .toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM activity_logs WHERE user_id = ?').get(userA))
      .toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM activity_logs WHERE user_id = ?').get(userB))
      .toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM image_tags WHERE image_key = ?').get(keyA))
      .toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM image_tags WHERE image_key = ?').get(keyB))
      .toEqual({ count: 1 })
    expect(getBackupJob(jobA.id, userA)).toBeNull()
    expect(getBackupJob(jobB.id, userB)).not.toBeNull()
    await expect(fs.access(archiveA)).rejects.toThrow()
    await expect(fs.access(archiveB)).resolves.toBeUndefined()
  })
})
