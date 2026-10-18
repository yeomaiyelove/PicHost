import type { ImageTag, UploadErrorItem } from './image'

export interface FileItem {
  key: string
  url: string
  originalName: string
  contentType: string
  size: number
  uploadedAt: string
  markdown: string
  /** 视频转码状态（仅视频有值） */
  transcodeStatus?: 'none' | 'pending' | 'running' | 'done' | 'failed'
  /** 转码进度 0–100 */
  transcodeProgress?: number
  /** 本视频使用的转码档位 */
  transcodePreset?: string
  /** 转码开始时间（ISO） */
  transcodeStartedAt?: string
  /** 转码总耗时（毫秒） */
  transcodeDurationMs?: number
  /** 转码失败原因 */
  transcodeError?: string
  /** HLS 播放列表地址（转码完成后有值） */
  hlsUrl?: string
  /** HLS 播放列表在存储中的 key */
  hlsKey?: string
  /** 视频封面缩略图地址 */
  thumbUrl?: string
  /** 上传来源（来自活动日志） */
  uploadSource?: 'web' | 'api'
  /** 转码成功后源视频已删除，不再提供原文件下载 */
  sourceDeleted?: boolean
  /** 视频标签 */
  tags?: ImageTag[]
  /** 管理员列表可见：上传者信息 */
  owner?: {
    userId: number | null
    username: string
  }
  /** 文件所在存储后端 */
  storage?: {
    id: string
    name: string
    type: 'local' | 's3' | 'telegram'
  }
}

export interface FileListResponse {
  items: FileItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** 文件床直链访问方式（后台可切换） */
  accessMode: 'public' | 'token'
}

export interface FileUploadResponse {
  success: boolean
  items: FileItem[]
  errors: UploadErrorItem[]
  /** 直链访问方式，token 模式下复制链接需要附带令牌 */
  accessMode: 'public' | 'token'
}
