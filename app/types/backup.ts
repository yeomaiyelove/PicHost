export type BackupJobType = 'full_export' | 'full_restore' | 'backend_sync' | 'site_sync'
export type BackupJobStatus = 'pending' | 'running' | 'done' | 'failed'
export type SiteSyncDirection = 'push' | 'pull'

export interface BackupJobItem {
  id: string
  type: BackupJobType
  status: BackupJobStatus
  progress: number
  total: number
  message: string
  payload: Record<string, unknown>
  outputPath: string | null
  archiveName: string | null
  downloadable: boolean
  error: string | null
  createdAt: string
  updatedAt: string
  hidden: boolean
  finishedAt: string | null
}

export interface BackupEstimate {
  imageCount: number
  imageBytes: number
  databaseBytes: number
  totalBytes: number
}

export interface BackupPackageItem {
  name: string
  bytes: number
  modifiedAt: string
}

export interface BackupRestorePreview {
  imageCount: number
  imageBytes: number
  newImages: number
  conflictingImages: number
  formatVersion: number
  appVersion: string
  createdAt: string
}

export interface BackendSyncPreview {
  imageCount: number
  imageBytes: number
  fromBackendId: string
  toBackendId: string
}

export interface SyncDraft {
  fromBackendId: string
  toBackendId: string
}

export interface SiteSyncRequest {
  targetBaseUrl: string
  token: string
  conflictMode: 'skip' | 'overwrite'
  direction: SiteSyncDirection
  /** 同步内容：全站或某一类媒体 */
  scope?: 'all' | 'image' | 'video' | 'file'
  /** 指定资源（同一类型） */
  keys?: string[]
  resumeJobId?: string
  abandonJobId?: string
}
