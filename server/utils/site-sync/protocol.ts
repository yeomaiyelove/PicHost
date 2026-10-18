import type { MediaType, TranscodeStatus } from '../storage/types'

export interface SiteSyncTag {
  name: string
  color: string
}

export interface SiteSyncMediaTransfer {
  key: string
  ownerUsername: string | null
  originalName: string
  contentType: string
  size: number
  uploadedAt: string
  mediaType: MediaType
  uploadSource?: 'web' | 'api'
  thumbKey: string | null
  hlsKey: string | null
  transcodeStatus: TranscodeStatus
  transcodeProgress: number
  transcodePreset: string | null
  transcodeError: string | null
  sourceDeleted: boolean
  tags: SiteSyncTag[]
}

export interface SiteSyncInventory {
  users: string[]
  mediaKeys: string[]
  objects: Array<{ key: string, size: number }>
}

export interface SiteSyncMediaAsset {
  key: string
  size: number
}

export interface SiteSyncMediaBundle {
  media: SiteSyncMediaTransfer
  assets: SiteSyncMediaAsset[]
}

export interface SiteSyncMediaPage {
  items: SiteSyncMediaBundle[]
  totalMedia: number
  nextCursor: string | null
}

export interface SiteSyncUsers {
  users: string[]
}

export type SiteSyncDirection = 'push' | 'pull'

export interface SiteSyncObjectOptions {
  targetBaseUrl: string
  token: string
  conflictMode: 'skip' | 'overwrite'
  direction?: SiteSyncDirection
}
