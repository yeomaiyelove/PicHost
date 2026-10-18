export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon'
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const MAX_FILES_PER_UPLOAD = 10
export const MAX_DELETE_BATCH = 100
export const DEFAULT_LIST_LIMIT = 30
export const MAX_LIST_LIMIT = 100

export const IMAGE_CACHE_CONTROL
  = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'

/** 文件床单文件上限（当前上传全量读入内存，限制在可控范围） */
export const MAX_FILE_BED_FILE_SIZE = 100 * 1024 * 1024

/** 视频床单文件上限 */
export const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024

/** 文件床禁止的扩展名：避免上传的文件被浏览器当作脚本或页面执行 */
export const FORBIDDEN_FILE_EXTENSIONS = ['html', 'htm', 'svg'] as const

/** 视频床允许的扩展名 */
export const VIDEO_EXTENSIONS = [
  'mp4',
  'm4v',
  'webm',
  'mov',
  'mkv',
  'avi',
  'flv',
  'wmv',
  'mpg',
  'mpeg'
] as const

export type VideoExtension = (typeof VIDEO_EXTENSIONS)[number]

/** 文件床直链缓存：公开访问可长期缓存，Token 访问不能进共享缓存 */
export const FILE_CACHE_CONTROL
  = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
export const FILE_PRIVATE_CACHE_CONTROL = 'private, no-store'
