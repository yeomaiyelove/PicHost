import type { H3Event } from 'h3'
import type { UploadErrorItem } from '~/types/image'
import type { FileItem } from '~/types/file'
import { contentTypeFromKey } from './content-type'
import {
  extensionFromFilename,
  generateFileKey,
  generateVideoKey
} from './image-key'
import { getStorageLayout } from './env'
import { resolveImageUrl } from './image-response'
import type { LogSource } from './db'
import type { MediaType } from './storage/types'
import { logActivity } from './activity-log'
import { logException, logInfo } from './logger'
import { putImage } from './storage'
import { generateVideoThumbnail } from './transcode'
import { updateImageThumb } from './image-index'
import {
  formatEffectiveMaxFileSizeMessage,
  getAllowedVideoExtensions,
  getEffectiveMaxFileSizeBytes,
  isForbiddenFileExtension,
  isVideoExtensionAllowed
} from './upload-policy'
import {
  attachTagsAfterUpload,
  getTagsForImageKeys
} from './tags'

export { isForbiddenFileExtension }

/** 下载文件名清洗：保留中文等字符，去掉路径与控制字符 */
export function sanitizeDownloadName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file'
  const withoutControl = Array.from(base)
    .filter(char => char.charCodeAt(0) > 0x1f && char.charCodeAt(0) !== 0x7f)
    .join('')
  const cleaned = withoutControl
    .replace(/["<>|:*?]/g, '_')
    .trim()
  return cleaned.slice(0, 200) || 'file'
}

/** RFC 5987 兼容的附件下载响应头值 */
export function buildAttachmentDisposition(name: string): string {
  const safe = sanitizeDownloadName(name)
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

export function generateFileStorageKey(originalName: string, date = new Date()): string {
  return generateFileKey(extensionFromFilename(originalName), date, getStorageLayout())
}

export function generateVideoStorageKey(originalName: string, date = new Date()): string {
  return generateVideoKey(extensionFromFilename(originalName), date, getStorageLayout())
}

/** 声明 MIME 清洗；不合法时按扩展名推断 */
export function normalizeFileContentType(
  declared: string | undefined,
  extension: string
): string {
  const value = (declared ?? '').split(';')[0]!.trim().toLowerCase()
  const valid = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(value)
  if (valid) return value
  return extension ? contentTypeFromKey(`file.${extension}`) : 'application/octet-stream'
}

/** 视频必须落到 video/* 上，否则按扩展名推断 */
export function normalizeVideoContentType(
  declared: string | undefined,
  extension: string
): string {
  const normalized = normalizeFileContentType(declared, extension)
  if (normalized.startsWith('video/')) return normalized
  return contentTypeFromKey(`video.${extension}`)
}

export function buildFileItem(input: {
  event: H3Event
  key: string
  backendId?: string
  originalName: string
  contentType: string
  size: number
  uploadedAt: string
}): FileItem {
  const url = resolveImageUrl(input.event, input.key, input.backendId)
  const name = sanitizeDownloadName(input.originalName)

  return {
    key: input.key,
    url,
    originalName: name,
    contentType: input.contentType,
    size: input.size,
    uploadedAt: input.uploadedAt,
    markdown: `[${name}](${url})`
  }
}

export async function processSingleFileUpload(
  event: H3Event,
  input: {
    bytes: Uint8Array
    filename?: string
    contentType?: string
    source?: LogSource
    userId?: number | null
    tagIds?: number[]
  }
): Promise<{ item: FileItem } | { error: UploadErrorItem }> {
  const originalName = sanitizeDownloadName(input.filename ?? 'file')
  const bytes = input.bytes

  if (!bytes.byteLength) {
    return {
      error: {
        name: originalName,
        error: { code: 'INVALID_REQUEST', message: '文件内容为空' }
      }
    }
  }

  if (bytes.byteLength > getEffectiveMaxFileSizeBytes('file')) {
    return {
      error: {
        name: originalName,
        error: {
          code: 'FILE_TOO_LARGE',
          message: formatEffectiveMaxFileSizeMessage('file')
        }
      }
    }
  }

  const extension = extensionFromFilename(originalName)
  if (isForbiddenFileExtension(extension)) {
    return {
      error: {
        name: originalName,
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: `不允许上传 ${extension.toUpperCase()} 文件`
        }
      }
    }
  }

  const uploadedAt = new Date().toISOString()
  const key = generateFileStorageKey(originalName, new Date(uploadedAt))

  return persistMediaUpload(event, {
    key,
    bytes,
    originalName,
    uploadedAt,
    contentType: normalizeFileContentType(input.contentType, extension),
    source: input.source,
    userId: input.userId,
    mediaType: 'file',
    tagIds: input.tagIds
  })
}

/** 写存储 + 建索引 + 记日志 + 组装返回项（文件床与视频床共用） */
async function persistMediaUpload(
  event: H3Event,
  input: {
    key: string
    bytes: Uint8Array
    originalName: string
    uploadedAt: string
    contentType: string
    source?: LogSource
    userId?: number | null
    mediaType: MediaType
    tagIds?: number[]
  }
): Promise<{ item: FileItem } | { error: UploadErrorItem }> {
  let backendId: string
  try {
    backendId = await putImage(input.key, input.bytes, {
      originalName: input.originalName,
      uploadedAt: input.uploadedAt,
      contentType: input.contentType,
      size: input.bytes.byteLength,
      userId: input.userId ?? null,
      mediaType: input.mediaType
    })
  } catch (error) {
    logException('upload failed: storage error', error, {
      name: input.originalName,
      source: input.source ?? 'web'
    })
    const detail = error instanceof Error ? error.message.trim() : ''
    return {
      error: {
        name: input.originalName,
        error: {
          code: 'UPLOAD_FAILED',
          message: detail.startsWith('Telegram') || detail.includes('群组')
            ? detail
            : '上传失败，请稍后重试'
        }
      }
    }
  }

  logActivity(event, {
    action: 'upload',
    key: input.key,
    originalName: input.originalName,
    size: input.bytes.byteLength,
    contentType: input.contentType,
    source: input.source,
    userId: input.userId ?? null,
    backendId
  })

  logInfo(`${input.mediaType} upload success`, {
    key: input.key,
    size: input.bytes.byteLength,
    contentType: input.contentType,
    source: input.source ?? 'web'
  })

  if (input.tagIds?.length && input.userId != null) {
    attachTagsAfterUpload(input.key, input.tagIds, input.userId)
  }

  const item = buildFileItem({
    event,
    key: input.key,
    backendId,
    originalName: input.originalName,
    contentType: input.contentType,
    size: input.bytes.byteLength,
    uploadedAt: input.uploadedAt
  })
  const tags = getTagsForImageKeys([input.key]).get(input.key) ?? []
  return {
    item: tags.length ? { ...item, tags } : item
  }
}

export async function processSingleVideoUpload(
  event: H3Event,
  input: {
    bytes: Uint8Array
    filename?: string
    contentType?: string
    source?: LogSource
    userId?: number | null
    tagIds?: number[]
  }
): Promise<{ item: FileItem } | { error: UploadErrorItem }> {
  const originalName = sanitizeDownloadName(input.filename ?? 'video')
  const bytes = input.bytes

  if (!bytes.byteLength) {
    return {
      error: {
        name: originalName,
        error: { code: 'INVALID_REQUEST', message: '文件内容为空' }
      }
    }
  }

  if (bytes.byteLength > getEffectiveMaxFileSizeBytes('video')) {
    return {
      error: {
        name: originalName,
        error: {
          code: 'FILE_TOO_LARGE',
          message: formatEffectiveMaxFileSizeMessage('video')
        }
      }
    }
  }

  const extension = extensionFromFilename(originalName)
  if (!isVideoExtensionAllowed(extension)) {
    return {
      error: {
        name: originalName,
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: `只支持 ${getAllowedVideoExtensions().map(item => item.toUpperCase()).join(' / ')} 视频格式`
        }
      }
    }
  }

  const uploadedAt = new Date().toISOString()
  const key = generateVideoStorageKey(originalName, new Date(uploadedAt))

  const result = await persistMediaUpload(event, {
    key,
    bytes,
    originalName,
    uploadedAt,
    contentType: normalizeVideoContentType(input.contentType, extension),
    source: input.source,
    userId: input.userId,
    mediaType: 'video',
    tagIds: input.tagIds
  })

  // 生成封面缩略图；失败不影响上传结果
  if ('item' in result) {
    const thumbKey = await generateVideoThumbnail(key).catch(() => null)
    if (thumbKey) {
      updateImageThumb(key, thumbKey)
      result.item.thumbUrl = resolveImageUrl(event, thumbKey)
    }
  }

  return result
}
