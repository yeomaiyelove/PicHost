import { describe, expect, it } from 'vitest'
import { ensureDefaultBackends } from '../storage-backends'
import { getActiveBackend } from '../storage/resolver'
import { putImage } from '../storage'
import { updateImageThumb, updateImageTranscode } from '../image-index'
import { createBackupJob, getBackupJob } from './jobs'
import { runFullExportJob } from './full-export'
import { previewFullRestore } from './full-restore'

describe('previewFullRestore', () => {
  it('counts media records instead of HLS sidecar files', async () => {
    ensureDefaultBackends()
    const key = 'videos/2026/10/preview-count.mp4'
    const thumbKey = 'videos/2026/10/preview-count.webp'
    const hlsKey = 'videos/2026/10/preview-count/index.m3u8'
    const segmentKey = 'videos/2026/10/preview-count/seg000.ts'
    const hlsOnlyKey = 'videos/2026/10/preview-count-hls-only.mp4'
    const hlsOnlyThumbKey = 'videos/2026/10/preview-count-hls-only.webp'
    const hlsOnlyPlaylistKey = 'videos/2026/10/preview-count-hls-only/index.m3u8'
    const hlsOnlySegmentKey = 'videos/2026/10/preview-count-hls-only/seg000.ts'
    const meta = {
      originalName: 'preview-count.mp4',
      uploadedAt: '2026-10-18T00:00:00.000Z',
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

    await putImage(hlsOnlyKey, new Uint8Array([4]), meta)
    await backend.put(hlsOnlyThumbKey, new Uint8Array([5]), meta)
    await backend.put(
      hlsOnlyPlaylistKey,
      new TextEncoder().encode('#EXTM3U\n#EXTINF:6,\nseg000.ts\n'),
      meta
    )
    await backend.put(hlsOnlySegmentKey, new Uint8Array([6]), meta)
    updateImageThumb(hlsOnlyKey, hlsOnlyThumbKey)
    updateImageTranscode(hlsOnlyKey, {
      status: 'done',
      hlsKey: hlsOnlyPlaylistKey,
      progress: 100,
      sourceDeleted: true
    })

    const exportJob = createBackupJob({ type: 'full_export', message: 'test' })
    await runFullExportJob(exportJob.id, 'test')
    const archivePath = getBackupJob(exportJob.id)!.outputPath!

    for (const fileKey of [
      key,
      thumbKey,
      hlsKey,
      segmentKey,
      hlsOnlyThumbKey,
      hlsOnlyPlaylistKey,
      hlsOnlySegmentKey
    ]) {
      await backend.delete(fileKey)
    }

    const preview = await previewFullRestore(archivePath)
    expect(preview.imageCount).toBe(2)
    expect(preview.newImages).toBe(2)
    expect(preview.conflictingImages).toBe(0)

    await backend.put(
      hlsOnlyPlaylistKey,
      new TextEncoder().encode('#EXTM3U\n#EXTINF:6,\nseg000.ts\n'),
      meta
    )
    const conflictPreview = await previewFullRestore(archivePath)
    expect(conflictPreview.newImages).toBe(1)
    expect(conflictPreview.conflictingImages).toBe(1)
  })
})
