import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cleanupExpiredHlsDownloads,
  buildThumbnailFfmpegArgs,
  DEFAULT_TRANSCODE_CONCURRENCY,
  DEFAULT_TRANSCODE_PRESET,
  DEFAULT_TRANSCODE_THREADS,
  getTranscodeConcurrency,
  getTranscodeSettings,
  hlsSegmentNames,
  hlsPlaylistKey,
  markHlsDownloadForCleanup,
  parseTranscodePreset,
  setTranscodeSettings,
  summarizeTranscodeFailure,
  thumbKeyFor,
  THUMBNAIL_FFMPEG_TIMEOUT_MS
} from './transcode'
import { isVideoSidecarKey, mediaTypeForKey } from './image-key'

describe('hlsPlaylistKey', () => {
  it('uses the video key without extension as the hls directory', () => {
    expect(hlsPlaylistKey('videos/2026/10/abc123.mp4'))
      .toBe('videos/2026/10/abc123/index.m3u8')
    expect(hlsPlaylistKey('videos/abc123.mkv'))
      .toBe('videos/abc123/index.m3u8')
  })
})

describe('thumbnail ffmpeg args', () => {
  it('limits thumbnail extraction to one worker and one filter thread', () => {
    const args = buildThumbnailFfmpegArgs('/tmp/input.mp4', '/tmp/thumb.png', 1)
    expect(args.slice(args.indexOf('-threads'), args.indexOf('-threads') + 2))
      .toEqual(['-threads', '1'])
    expect(args.slice(args.indexOf('-filter_threads'), args.indexOf('-filter_threads') + 2))
      .toEqual(['-filter_threads', '1'])
    expect(THUMBNAIL_FFMPEG_TIMEOUT_MS).toBe(10_000)
  })
})

describe('isVideoSidecarKey', () => {
  it('detects playlists, segments and thumbnails', () => {
    expect(isVideoSidecarKey('videos/2026/10/abc/index.m3u8')).toBe(true)
    expect(isVideoSidecarKey('videos/2026/10/abc/seg000.ts')).toBe(true)
    expect(isVideoSidecarKey('videos/2026/10/abc.webp')).toBe(true)
  })

  it('leaves the original video and other media out', () => {
    expect(isVideoSidecarKey('videos/2026/10/abc.mp4')).toBe(false)
    expect(isVideoSidecarKey('files/2026/10/abc.pdf')).toBe(false)
    expect(isVideoSidecarKey('images/2026/10/abc.webp')).toBe(false)
  })

  it('builds thumbnail keys next to the video', () => {
    expect(thumbKeyFor('videos/2026/10/abc.mp4')).toBe('videos/2026/10/abc.webp')
  })
})

describe('hlsSegmentNames', () => {
  it('returns unique relative segment names and ignores tags', () => {
    expect(hlsSegmentNames([
      '#EXTM3U',
      '#EXTINF:6,',
      'seg000.ts',
      '#EXTINF:6,',
      'seg001.ts',
      'seg000.ts'
    ].join('\n'))).toEqual(['seg000.ts', 'seg001.ts'])
  })

  it('ignores absolute and traversal paths', () => {
    expect(hlsSegmentNames([
      '../secret.ts',
      'https://example.com/video.ts',
      'folder/seg.ts',
      'seg.ts'
    ].join('\n'))).toEqual(['seg.ts'])
  })
})

describe('cleanupExpiredHlsDownloads', () => {
  it('keeps fresh downloads and removes files after their marker expires', async () => {
    const now = Date.now()
    const fresh = await fs.mkdtemp(join(tmpdir(), 'pichost-hls-download-fresh-'))
    const expired = await fs.mkdtemp(join(tmpdir(), 'pichost-hls-download-expired-'))

    await markHlsDownloadForCleanup(fresh, now + 60_000)
    await markHlsDownloadForCleanup(expired, now - 1)
    await cleanupExpiredHlsDownloads(now)

    await expect(fs.access(fresh)).resolves.toBeUndefined()
    await expect(fs.access(expired)).rejects.toThrow()
    await fs.rm(fresh, { recursive: true, force: true })
  })
})

describe('mediaTypeForKey', () => {
  it('maps folders to media types', () => {
    expect(mediaTypeForKey('images/2026/10/a.webp')).toBe('image')
    expect(mediaTypeForKey('videos/2026/10/a.mp4')).toBe('video')
    expect(mediaTypeForKey('files/2026/10/a.pdf')).toBe('file')
  })
})

describe('summarizeTranscodeFailure', () => {
  it('recognizes a missing FFmpeg binary', () => {
    expect(summarizeTranscodeFailure(new Error('spawn ffmpeg ENOENT')))
      .toBe('ffmpeg-missing')
  })

  it('maps other FFmpeg errors to unknown', () => {
    const error = new Error(`first line\n${'invalid data '.repeat(20)}`)
    expect(summarizeTranscodeFailure(error)).toBe('unknown')
  })
})

describe('transcode settings', () => {
  it('defaults to one concurrent job with one thread', () => {
    expect(DEFAULT_TRANSCODE_CONCURRENCY).toBe(1)
    expect(DEFAULT_TRANSCODE_THREADS).toBe(1)
    expect(getTranscodeSettings()).toEqual({
      concurrency: 1,
      threads: 1,
      preset: 'veryfast',
      bitratePercent: 80
    })
  })

  it('round-trips stored values', () => {
    setTranscodeSettings({ concurrency: 3, threads: 2 })
    expect(getTranscodeSettings()).toEqual({
      concurrency: 3,
      threads: 2,
      preset: 'veryfast',
      bitratePercent: 80
    })
  })

  it('falls back to the default when the stored value is out of range', () => {
    setTranscodeSettings({ concurrency: 99 })
    expect(getTranscodeConcurrency()).toBe(DEFAULT_TRANSCODE_CONCURRENCY)

    setTranscodeSettings({ concurrency: 1, threads: 1 })
  })

  it('stores the quality preset and rejects unknown ones', () => {
    setTranscodeSettings({ preset: 'slow' })
    expect(getTranscodeSettings().preset).toBe('slow')

    expect(parseTranscodePreset('nope')).toBeNull()
    setTranscodeSettings({ preset: DEFAULT_TRANSCODE_PRESET })
  })
})
