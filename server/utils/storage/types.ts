import type { Readable } from 'node:stream'

export interface StoredImageMeta {
  originalName: string
  uploadedAt: string
  contentType: string
  size: number
  userId?: number | null
  /** 索引表中的资源类型：图片或文件床文件 */
  mediaType?: MediaType
}

export type MediaType = 'image' | 'video' | 'file'

export type TranscodeStatus = 'none' | 'pending' | 'running' | 'done' | 'failed'

export interface StoredImage extends StoredImageMeta {
  key: string
  mtimeMs: number
  backendId?: string
  /** HLS 播放列表 key（转码完成后有值） */
  hlsKey?: string | null
  transcodeStatus?: TranscodeStatus
  /** 转码进度 0–100 */
  transcodeProgress?: number
  /** 本视频使用的转码档位 */
  transcodePreset?: string | null
  /** 转码开始时间（ISO） */
  transcodeStartedAt?: string | null
  /** 转码总耗时（毫秒），结束后固定 */
  transcodeDurationMs?: number | null
  /** 转码失败原因 */
  transcodeError?: string | null
  /** 视频封面缩略图 key */
  thumbKey?: string | null
  /** 转码成功后源视频是否已删除 */
  sourceDeleted?: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface FolderStorageStat {
  folder: string
  count: number
  bytes: number
}

export type StorageBackendType = 'local' | 's3' | 'telegram'
export type ServingMode = 'proxy' | 'public'

export interface S3BackendConfig {
  endpoint: string
  region: string
  bucket: string
  prefix?: string
  forcePathStyle?: boolean
}

export interface S3BackendSecrets {
  accessKeyId: string
  secretAccessKey: string
}

export interface TelegramBackendConfig {
  chatId: string
  apiProxyUrl?: string
}

export interface TelegramBackendSecrets {
  botToken: string
}

export interface TelegramObjectRef {
  fileId: string
  fileUniqueId?: string
  messageId?: number
}

export interface StorageBackendRow {
  id: string
  name: string
  type: StorageBackendType
  config_json: string
  secret_json: string
  serving_mode: ServingMode
  public_url: string
  quota_bytes: number | null
  enabled: number
  is_default: number
  sort_order: number
}

export interface StorageBackendInfo {
  id: string
  name: string
  type: StorageBackendType
  config: S3BackendConfig | TelegramBackendConfig | Record<string, never>
  servingMode: ServingMode
  publicUrl: string
  quotaBytes: number | null
  enabled: boolean
  isDefault: boolean
  sortOrder: number
}

export interface StorageBackend {
  readonly id: string
  readonly type: StorageBackendType
  readonly servingMode: ServingMode
  readonly publicUrl: string
  put(key: string, bytes: Uint8Array, meta: StoredImageMeta): Promise<void>
  head(key: string): Promise<StoredImage | null>
  delete(key: string): Promise<void>
  createStream(key: string, range?: { start: number, end: number }): Promise<Readable>
  testConnection(): Promise<{ ok: boolean, message: string }>
  getUsageStats(): Promise<{ count: number, bytes: number }>
}
