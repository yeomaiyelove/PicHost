import * as tar from 'tar'
import { describe, expect, it } from 'vitest'
import { ensureDefaultBackends } from '../storage-backends'
import { getActiveBackend } from '../storage/resolver'
import { putImage } from '../storage'
import { updateImageThumb, updateImageTranscode } from '../image-index'
import { createBackupJob, getBackupJob } from './jobs'
import { runFullExportJob } from './full-export'
import { runFullRestoreJob } from './full-restore'

async function archiveEntries(path: string): Promise<string[]> {
  const entries: string[] = []
  await tar.t({
    file: path,
    onentry: (entry) => {
      if (entry.type === 'File') entries.push(entry.path.replace(/^\.\//, ''))
    }
  })
  return entries
}

describe('runFullExportJob', () => {
  it('includes video source, thumbnail and HLS artifacts', async () => {
    ensureDefaultBackends()
    const key = 'videos/2026/10/backup-test.mp4'
    const thumbKey = 'videos/2026/10/backup-test.webp'
    const hlsKey = 'videos/2026/10/backup-test/index.m3u8'
    const segmentKey = 'videos/2026/10/backup-test/seg000.ts'
    const meta = {
      originalName: 'backup-test.mp4',
      uploadedAt: '2026-10-17T00:00:00.000Z',
      contentType: 'video/mp4',
      size: 1,
      userId: 1,
      mediaType: 'video' as const
    }

    await putImage(key, new Uint8Array([1]), meta)
    const backend = await getActiveBackend()
    await backend.put(thumbKey, new Uint8Array([2]), meta)
    await backend.put(
      hlsKey,
      new TextEncoder().encode('#EXTM3U\n#EXTINF:6,\nseg000.ts\n'),
      meta
    )
    await backend.put(segmentKey, new Uint8Array([3]), meta)
    updateImageThumb(key, thumbKey)
    updateImageTranscode(key, {
      status: 'done',
      hlsKey,
      progress: 100
    })

    const job = createBackupJob({ type: 'full_export', message: 'test' })
    await runFullExportJob(job.id, 'test')

    const done = getBackupJob(job.id)
    expect(done?.status).toBe('done')
    const entries = await archiveEntries(done!.outputPath!)
    expect(entries).toEqual(expect.arrayContaining([
      'blobs/videos/2026/10/backup-test.mp4',
      'blobs/videos/2026/10/backup-test.webp',
      'blobs/videos/2026/10/backup-test/index.m3u8',
      'blobs/videos/2026/10/backup-test/seg000.ts'
    ]))
  })

  it('restores missing sidecar files in skip mode', async () => {
    ensureDefaultBackends()
    const key = 'videos/2026/10/restore-test.mp4'
    const thumbKey = 'videos/2026/10/restore-test.webp'
    const hlsKey = 'videos/2026/10/restore-test/index.m3u8'
    const segmentKey = 'videos/2026/10/restore-test/seg000.ts'
    const meta = {
      originalName: 'restore-test.mp4',
      uploadedAt: '2026-10-17T00:00:00.000Z',
      contentType: 'video/mp4',
      size: 1,
      userId: 1,
      mediaType: 'video' as const
    }

    await putImage(key, new Uint8Array([1]), meta)
    const backend = await getActiveBackend()
    await backend.put(thumbKey, new Uint8Array([2]), meta)
    await backend.put(
      hlsKey,
      new TextEncoder().encode('#EXTM3U\n#EXTINF:6,\nseg000.ts\n'),
      meta
    )
    await backend.put(segmentKey, new Uint8Array([3]), meta)
    updateImageThumb(key, thumbKey)
    updateImageTranscode(key, { status: 'done', hlsKey, progress: 100 })

    const exportJob = createBackupJob({ type: 'full_export', message: 'test' })
    await runFullExportJob(exportJob.id, 'test')
    const archivePath = getBackupJob(exportJob.id)!.outputPath!

    await backend.delete(segmentKey)
    expect(await backend.head(segmentKey)).toBeNull()

    const restoreJob = createBackupJob({ type: 'full_restore', message: 'test' })
    await runFullRestoreJob(restoreJob.id, archivePath, { conflictMode: 'skip' })
    expect(await backend.head(segmentKey)).not.toBeNull()
  })
})
