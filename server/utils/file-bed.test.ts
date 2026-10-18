import { describe, expect, it } from 'vitest'
import {
  buildAttachmentDisposition,
  isForbiddenFileExtension,
  normalizeFileContentType,
  normalizeVideoContentType,
  sanitizeDownloadName
} from './file-bed'
import {
  extensionFromFilename,
  generateFileKey,
  generateVideoKey,
  isVideoExtension,
  validateFileKey,
  validateStorageKey,
  validateVideoKey
} from './image-key'
import { parseFileBedAccessMode } from './env'

describe('isForbiddenFileExtension', () => {
  it('blocks html, htm and svg regardless of case', () => {
    expect(isForbiddenFileExtension('html')).toBe(true)
    expect(isForbiddenFileExtension('HTM')).toBe(true)
    expect(isForbiddenFileExtension('svg')).toBe(true)
  })

  it('allows other extensions', () => {
    expect(isForbiddenFileExtension('pdf')).toBe(false)
    expect(isForbiddenFileExtension('')).toBe(false)
  })
})

describe('sanitizeDownloadName', () => {
  it('keeps unicode names and strips path segments', () => {
    expect(sanitizeDownloadName('C:\\path/设计稿.pdf')).toBe('设计稿.pdf')
  })

  it('replaces reserved characters', () => {
    expect(sanitizeDownloadName('a"b<c>.txt')).toBe('a_b_c_.txt')
  })

  it('falls back when the name is empty', () => {
    expect(sanitizeDownloadName('')).toBe('file')
  })
})

describe('buildAttachmentDisposition', () => {
  it('includes an ascii fallback and a utf-8 filename', () => {
    const value = buildAttachmentDisposition('报告.pdf')
    expect(value.startsWith('attachment; ')).toBe(true)
    expect(value).toContain('filename="__.pdf"')
    expect(value).toContain(`filename*=UTF-8''${encodeURIComponent('报告.pdf')}`)
  })
})

describe('normalizeFileContentType', () => {
  it('keeps valid mime types', () => {
    expect(normalizeFileContentType('application/pdf; charset=binary', 'pdf'))
      .toBe('application/pdf')
  })

  it('infers from the extension when the declared type is invalid', () => {
    expect(normalizeFileContentType('not a mime', 'pdf')).toBe('application/pdf')
    expect(normalizeFileContentType(undefined, 'mp4')).toBe('video/mp4')
  })

  it('falls back to octet-stream without an extension', () => {
    expect(normalizeFileContentType('', '')).toBe('application/octet-stream')
  })
})

describe('extensionFromFilename', () => {
  it('lowercases and sanitizes the extension', () => {
    expect(extensionFromFilename('a/b/报告.PDF')).toBe('pdf')
    expect(extensionFromFilename('archive.tar.gz')).toBe('gz')
  })

  it('returns empty for files without a usable extension', () => {
    expect(extensionFromFilename('README')).toBe('')
    expect(extensionFromFilename('.env')).toBe('')
  })
})

describe('validateFileKey', () => {
  it('accepts files/ keys with or without extension', () => {
    expect(validateFileKey('files/2026/10/abc123.pdf')).toBe(true)
    expect(validateFileKey('files/abc123')).toBe(true)
  })

  it('rejects traversal, absolute and image keys', () => {
    expect(validateFileKey('files/../../etc/passwd')).toBe(false)
    expect(validateFileKey('/files/a.pdf')).toBe(false)
    expect(validateFileKey('images/2026/10/a.webp')).toBe(false)
    expect(validateFileKey('../files/a.pdf')).toBe(false)
  })

  it('keeps image keys working through validateStorageKey', () => {
    expect(validateStorageKey('images/2026/10/a.webp')).toBe(true)
    expect(validateStorageKey('files/2026/10/a.pdf')).toBe(true)
    expect(validateStorageKey('other/2026/10/a.pdf')).toBe(false)
  })
})

describe('generateFileKey', () => {
  const date = new Date('2026-10-16T00:00:00Z')

  it('builds a dated key with the sanitized extension', () => {
    expect(generateFileKey('pdf', date)).toMatch(/^files\/2026\/10\/[A-Za-z0-9]{12}\.pdf$/)
  })

  it('drops unknown extensions and supports flat layout', () => {
    expect(generateFileKey('../../etc', date)).toMatch(/^files\/2026\/10\/[A-Za-z0-9]{12}$/)
    expect(generateFileKey('', date, 'flat')).toMatch(/^files\/[A-Za-z0-9]{12}$/)
  })
})

describe('parseFileBedAccessMode', () => {
  it('parses known modes and rejects others', () => {
    expect(parseFileBedAccessMode('public')).toBe('public')
    expect(parseFileBedAccessMode(' TOKEN ')).toBe('token')
    expect(parseFileBedAccessMode('other')).toBeNull()
    expect(parseFileBedAccessMode(null)).toBeNull()
  })
})

describe('isVideoExtension', () => {
  it('accepts common video containers', () => {
    expect(isVideoExtension('mp4')).toBe(true)
    expect(isVideoExtension('MP4')).toBe(true)
    expect(isVideoExtension('webm')).toBe(true)
    expect(isVideoExtension('mkv')).toBe(true)
  })

  it('rejects HLS sidecars from the user upload allowlist', () => {
    expect(isVideoExtension('ts')).toBe(false)
    expect(isVideoExtension('m3u8')).toBe(false)
  })

  it('rejects non-video extensions', () => {
    expect(isVideoExtension('png')).toBe(false)
    expect(isVideoExtension('pdf')).toBe(false)
    expect(isVideoExtension('')).toBe(false)
  })
})

describe('validateVideoKey', () => {
  it('accepts videos/ keys with a video extension', () => {
    expect(validateVideoKey('videos/2026/10/abc123.mp4')).toBe(true)
    expect(validateVideoKey('videos/2026/10/abc123.MKV')).toBe(true)
  })

  it('rejects other folders, non-video extensions and traversal', () => {
    expect(validateVideoKey('files/2026/10/abc123.mp4')).toBe(false)
    expect(validateVideoKey('videos/2026/10/abc123.txt')).toBe(false)
    expect(validateVideoKey('videos/../../etc/passwd')).toBe(false)
    expect(validateVideoKey('/videos/a.mp4')).toBe(false)
  })

  it('is covered by validateStorageKey', () => {
    expect(validateStorageKey('videos/2026/10/a.mp4')).toBe(true)
    expect(validateStorageKey('videos/2026/10/a/index.m3u8')).toBe(true)
    expect(validateStorageKey('videos/2026/10/a/seg000.ts')).toBe(true)
  })
})

describe('generateVideoKey', () => {
  const date = new Date('2026-10-16T00:00:00Z')

  it('builds a dated key and keeps the extension', () => {
    expect(generateVideoKey('mp4', date)).toMatch(/^videos\/2026\/10\/[A-Za-z0-9]{12}\.mp4$/)
    expect(generateVideoKey('', date)).toMatch(/^videos\/2026\/10\/[A-Za-z0-9]{12}\.mp4$/)
  })
})

describe('normalizeVideoContentType', () => {
  it('keeps declared video mime types', () => {
    expect(normalizeVideoContentType('video/mp4', 'mp4')).toBe('video/mp4')
  })

  it('falls back to the extension when the declared type is not a video', () => {
    expect(normalizeVideoContentType('application/octet-stream', 'mkv'))
      .toBe('video/x-matroska')
    expect(normalizeVideoContentType(undefined, 'm4v')).toBe('video/x-m4v')
  })
})
