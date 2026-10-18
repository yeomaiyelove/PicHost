import type { ImageIndexRow } from '../image-index'
import { getUploadSourcesForKeys } from '../db'
import { getTagsForImageKeys } from '../tags'
import type {
  SiteSyncMediaTransfer,
  SiteSyncTag
} from './protocol'

export function toSiteSyncMediaTransfer(
  row: ImageIndexRow,
  ownerUsername: string | null,
  tags: SiteSyncTag[]
): SiteSyncMediaTransfer {
  const source = getUploadSourcesForKeys([row.key]).get(row.key)
  const uploadSource = source === 'web' || source === 'api' ? source : undefined
  return {
    key: row.key,
    ownerUsername,
    originalName: row.original_name,
    contentType: row.content_type,
    size: row.size,
    uploadedAt: row.uploaded_at,
    mediaType: row.media_type,
    ...(uploadSource ? { uploadSource } : {}),
    thumbKey: row.thumb_key,
    hlsKey: row.hls_key,
    transcodeStatus: row.transcode_status as SiteSyncMediaTransfer['transcodeStatus'],
    transcodeProgress: Number(row.transcode_progress ?? 0),
    transcodePreset: row.transcode_preset,
    transcodeError: row.transcode_error,
    sourceDeleted: Number(row.source_deleted ?? 0) === 1,
    tags
  }
}

export function toSiteSyncMediaTransferWithTags(
  row: ImageIndexRow,
  ownerUsername: string | null
): SiteSyncMediaTransfer {
  const tags = getTagsForImageKeys([row.key]).get(row.key) ?? []
  return toSiteSyncMediaTransfer(row, ownerUsername, tags)
}
