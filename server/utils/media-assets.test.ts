import { describe, expect, it } from 'vitest'
import { LocalStorageBackend } from './storage/local'
import type { ImageIndexRow } from './image-index'
import { collectMediaAssetKeys } from './media-assets'

const row: ImageIndexRow = {
  key: 'videos/2026/10/example.mp4',
  backend_id: 'local',
  user_id: 1,
  folder: 'videos',
  media_type: 'video',
  original_name: 'example.mp4',
  content_type: 'video/mp4',
  size: 100,
  uploaded_at: '2026-10-17T00:00:00.000Z',
  hls_key: 'videos/2026/10/example/index.m3u8',
  transcode_status: 'done',
  transcode_progress: 100,
  thumb_key: 'videos/2026/10/example.webp',
  source_deleted: 0,
  transcode_preset: 'veryfast',
  transcode_error: null,
  transcode_started_at: null,
  transcode_duration_ms: null
}

async function createBackend() {
  const backend = new LocalStorageBackend()
  const meta = {
    originalName: 'example',
    uploadedAt: row.uploaded_at,
    contentType: 'application/octet-stream',
    size: 0,
    userId: row.user_id,
    mediaType: 'video' as const
  }
  await backend.put(row.key, new Uint8Array([1]), meta)
  await backend.put(row.thumb_key!, new Uint8Array([2]), meta)
  await backend.put(
    row.hls_key!,
    new TextEncoder().encode('#EXTM3U\n#EXTINF:6,\nseg000.ts\n'),
    meta
  )
  await backend.put('videos/2026/10/example/seg000.ts', new Uint8Array([3]), meta)
  return backend
}

describe('collectMediaAssetKeys', () => {
  it('includes source, thumbnail, playlist and HLS segments', async () => {
    const backend = await createBackend()
    expect(new Set(await collectMediaAssetKeys(row, backend))).toEqual(new Set([
      row.key,
      row.thumb_key,
      row.hls_key,
      'videos/2026/10/example/seg000.ts'
    ]))
  })

  it('omits the source when transcoding already removed it', async () => {
    const backend = await createBackend()
    expect(new Set(await collectMediaAssetKeys({
      ...row,
      source_deleted: 1
    }, backend))).toEqual(new Set([
      row.thumb_key,
      row.hls_key,
      'videos/2026/10/example/seg000.ts'
    ]))
  })
})
