import { describe, expect, it } from 'vitest'

import {
  DEFAULT_UPLOAD_MAX_FILE_SIZE_MB,
  normalizeAllowedMimeTypes,
  normalizeAllowedVideoExtensions,
  normalizeForbiddenFileExtensions,
  parseLoginRateMax,
  parsePreserveOriginalUpload,
  parseUploadMaxFileSizeMb,
  parseUploadMaxFileSizeMbForKind,
  parseUploadRateIpMax,
  serializeAllowedMimeTypes,
  serializeAllowedVideoExtensions,
  serializeForbiddenFileExtensions,
  serializePreserveOriginalUpload
} from './upload-policy'

describe('upload-policy parsers', () => {
  it('parses upload max file size mb', () => {
    expect(parseUploadMaxFileSizeMb('10')).toBe(10)
    expect(parseUploadMaxFileSizeMb('0')).toBe(0)
    expect(parseUploadMaxFileSizeMb('101')).toBeNull()
  })

  it('parses separate image, video and file size limits', () => {
    expect(parseUploadMaxFileSizeMbForKind('0', 'image')).toBe(0)
    expect(parseUploadMaxFileSizeMbForKind('100', 'image')).toBe(100)
    expect(parseUploadMaxFileSizeMbForKind('2048', 'video')).toBe(2048)
    expect(parseUploadMaxFileSizeMbForKind('2049', 'video')).toBeNull()
    expect(parseUploadMaxFileSizeMbForKind('1024', 'file')).toBe(1024)
    expect(parseUploadMaxFileSizeMbForKind('1025', 'file')).toBeNull()
  })

  it('normalizes allowed mime types', () => {
    expect(normalizeAllowedMimeTypes('image/png, image/jpeg, image/png')).toEqual([
      'image/png',
      'image/jpeg'
    ])
    expect(normalizeAllowedMimeTypes('image/bmp')).toEqual([])
  })

  it('serializes allowed mime types in canonical order', () => {
    expect(serializeAllowedMimeTypes(['image/webp', 'image/jpeg'])).toBe('image/jpeg,image/webp')
  })

  it('normalizes and serializes allowed video extensions', () => {
    expect(normalizeAllowedVideoExtensions('.MOV, mp4,mkv,mp4,ts')).toEqual([
      'mov',
      'mp4',
      'mkv'
    ])
    expect(serializeAllowedVideoExtensions(['mkv', 'mp4'])).toBe('mp4,mkv')
  })

  it('normalizes and serializes forbidden file extensions', () => {
    expect(normalizeForbiddenFileExtensions('.HTML, exe,php,exe,bad/ext')).toEqual([
      'html',
      'exe',
      'php'
    ])
    expect(serializeForbiddenFileExtensions(['php', 'svg', 'html']))
      .toBe('html,svg,php')
  })

  it('parses rate limit values', () => {
    expect(parseUploadRateIpMax('60')).toBe(60)
    expect(parseLoginRateMax('10')).toBe(10)
    expect(parseUploadRateIpMax('0')).toBeNull()
  })

  it('defaults max file size mb constant matches legacy 10MB', () => {
    expect(DEFAULT_UPLOAD_MAX_FILE_SIZE_MB).toBe(10)
  })

  it('parses preserve original upload flag', () => {
    expect(parsePreserveOriginalUpload('true')).toBe(true)
    expect(parsePreserveOriginalUpload('0')).toBe(false)
    expect(parsePreserveOriginalUpload('')).toBeNull()
    expect(serializePreserveOriginalUpload(true)).toBe('true')
  })
})
