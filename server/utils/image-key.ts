import { VIDEO_EXTENSIONS } from './constants'
import type { AllowedMimeType } from './constants'

const EXT_MAP: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico'
}

export const DEFAULT_FOLDER = 'images'
export const FILE_FOLDER = 'files'
export const VIDEO_FOLDER = 'videos'

export type StorageLayout = 'date' | 'flat'

const IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png|webp|gif|svg|ico)$/i

/** 文件床文件名：字母数字开头，允许 - _ .，最长 64（含扩展名） */
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

function generateRandomId(length = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

export function mimeToExtension(mime: AllowedMimeType): string {
  return EXT_MAP[mime]
}

/** 路径段：字母数字开头，允许 - _ .，最长 64 */
function isValidPathSegment(segment: string): boolean {
  if (!segment || segment.length > 64) return false
  if (segment === '.' || segment === '..') return false
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
}

export function generateImageKey(
  contentType: AllowedMimeType,
  date = new Date(),
  layout: StorageLayout = 'date'
): string {
  const id = generateRandomId(12)
  const ext = mimeToExtension(contentType)
  if (layout === 'flat') {
    return `${DEFAULT_FOLDER}/${id}.${ext}`
  }
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${DEFAULT_FOLDER}/${year}/${month}/${id}.${ext}`
}

export function validateImageKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false
  if (key.startsWith('/')) return false
  if (key.includes('..')) return false
  if (key.includes('//')) return false

  const parts = key.split('/')
  if (parts.length < 2 || parts.some(part => !part)) return false

  if (parts[0] !== DEFAULT_FOLDER) return false

  const filename = parts[parts.length - 1]!
  if (!IMAGE_EXT_PATTERN.test(filename)) return false

  for (let i = 1; i < parts.length - 1; i++) {
    if (!isValidPathSegment(parts[i]!)) return false
  }

  return true
}

/** 扩展名清洗：只保留 1–10 位字母数字 */
export function sanitizeFileExtension(raw: string): string {
  const ext = raw.trim().toLowerCase().replace(/^\.+/, '')
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : ''
}

/** 从原始文件名取安全扩展名；无扩展名时返回空串 */
export function extensionFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return sanitizeFileExtension(base.slice(dot + 1))
}

export function generateFileKey(
  extension: string,
  date = new Date(),
  layout: StorageLayout = 'date'
): string {
  const id = generateRandomId(12)
  const ext = sanitizeFileExtension(extension)
  const suffix = ext ? `.${ext}` : ''
  if (layout === 'flat') {
    return `${FILE_FOLDER}/${id}${suffix}`
  }
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${FILE_FOLDER}/${year}/${month}/${id}${suffix}`
}

/** 文件床 key（files/…）；图片 key 走 validateImageKey */
export function validateFileKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false
  if (key.startsWith('/')) return false
  if (key.includes('..')) return false
  if (key.includes('//')) return false

  const parts = key.split('/')
  if (parts.length < 2 || parts.some(part => !part)) return false

  if (parts[0] !== FILE_FOLDER) return false

  const filename = parts[parts.length - 1]!
  if (!FILE_NAME_PATTERN.test(filename)) return false

  for (let i = 1; i < parts.length - 1; i++) {
    if (!isValidPathSegment(parts[i]!)) return false
  }

  return true
}

/** 图片或文件床的存储 key */
export function validateStorageKey(key: string): boolean {
  return validateImageKey(key) || validateFileKey(key) || validateVideoKey(key)
}

export function mediaTypeForKey(key: string): 'image' | 'video' | 'file' {
  if (key.startsWith(`${FILE_FOLDER}/`)) return 'file'
  if (key.startsWith(`${VIDEO_FOLDER}/`)) return 'video'
  return 'image'
}

/** videos/ 下除视频本体外的附属资源：播放列表、分片、封面缩略图 */
const VIDEO_SIDECAR_EXTENSIONS = ['m3u8', 'ts', 'webp', 'jpg', 'jpeg', 'png']

function isVideoKeyExtension(extension: string): boolean {
  if (!extension) return false
  const value = extension.toLowerCase()
  return (VIDEO_EXTENSIONS as readonly string[]).includes(value)
    || VIDEO_SIDECAR_EXTENSIONS.includes(value)
}

/** 附属资源不进索引，也不出现在列表里 */
export function isVideoSidecarKey(key: string): boolean {
  return validateVideoKey(key)
    && VIDEO_SIDECAR_EXTENSIONS.includes(extensionFromFilename(key))
}

export function isVideoExtension(extension: string): boolean {
  if (!extension) return false
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())
}

export function generateVideoKey(
  extension: string,
  date = new Date(),
  layout: StorageLayout = 'date'
): string {
  const id = generateRandomId(12)
  const ext = sanitizeFileExtension(extension) || 'mp4'
  if (layout === 'flat') {
    return `${VIDEO_FOLDER}/${id}.${ext}`
  }
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${VIDEO_FOLDER}/${year}/${month}/${id}.${ext}`
}

/** 视频床 key（videos/…），扩展名必须在视频白名单内 */
export function validateVideoKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false
  if (key.startsWith('/')) return false
  if (key.includes('..')) return false
  if (key.includes('//')) return false

  const parts = key.split('/')
  if (parts.length < 2 || parts.some(part => !part)) return false

  if (parts[0] !== VIDEO_FOLDER) return false

  const filename = parts[parts.length - 1]!
  if (!FILE_NAME_PATTERN.test(filename)) return false
  if (!isVideoKeyExtension(extensionFromFilename(filename))) return false

  for (let i = 1; i < parts.length - 1; i++) {
    if (!isValidPathSegment(parts[i]!)) return false
  }

  return true
}

/** 将遗留顶层目录 key（如 blog/foo.webp）映射为 images/blog/foo.webp */
export function toCanonicalImageKey(key: string): string | null {
  if (validateImageKey(key)) return key
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('//')) return null

  const parts = key.split('/')
  if (parts.length < 2 || parts.some(part => !part)) return null
  if (parts[0] === DEFAULT_FOLDER) return null

  const filename = parts[parts.length - 1]!
  if (!IMAGE_EXT_PATTERN.test(filename)) return null

  for (let i = 0; i < parts.length - 1; i++) {
    if (!isValidPathSegment(parts[i]!)) return null
  }

  const canonical = `${DEFAULT_FOLDER}/${key}`
  return validateImageKey(canonical) ? canonical : null
}
