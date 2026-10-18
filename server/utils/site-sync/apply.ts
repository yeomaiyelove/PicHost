import {
  findUserByUsername,
  getUploadSourcesForKeys,
  insertActivityLog
} from '../db'
import {
  getImageIndexRow,
  insertImageIndex,
  updateImageThumb,
  updateImageTranscode
} from '../image-index'
import { getActiveBackend } from '../storage/resolver'
import {
  createTag,
  findTagByName,
  setImageTags
} from '../tags'
import type { SiteSyncMediaTransfer } from './protocol'

export async function applySiteSyncMedia(
  media: SiteSyncMediaTransfer,
  conflictMode: 'skip' | 'overwrite',
  actorUserId: number
): Promise<{ success: true, skipped: boolean }> {
  if (conflictMode === 'skip' && getImageIndexRow(media.key)) {
    return { success: true, skipped: true }
  }

  const owner = media.ownerUsername
    ? findUserByUsername(media.ownerUsername)
    : null
  if (media.ownerUsername && !owner) {
    throw new Error(`当前站点缺少用户：${media.ownerUsername}`)
  }

  const backend = await getActiveBackend()
  const requiredKeys = [
    ...(!media.sourceDeleted ? [media.key] : []),
    ...(media.thumbKey ? [media.thumbKey] : []),
    ...(media.hlsKey ? [media.hlsKey] : [])
  ]
  for (const key of requiredKeys) {
    if (!await backend.head(key)) {
      throw new Error(`同步对象尚未写入：${key}`)
    }
  }

  insertImageIndex({
    key: media.key,
    backendId: backend.id,
    userId: owner?.id ?? null,
    originalName: media.originalName,
    contentType: media.contentType,
    size: media.size,
    uploadedAt: media.uploadedAt,
    mediaType: media.mediaType
  })

  if (
    media.uploadSource
    && getUploadSourcesForKeys([media.key]).get(media.key) !== media.uploadSource
  ) {
    insertActivityLog({
      action: 'upload',
      key: media.key,
      originalName: media.originalName,
      size: media.size,
      contentType: media.contentType,
      source: media.uploadSource,
      userId: owner?.id ?? null,
      backendId: backend.id,
      status: 'success',
      createdAt: media.uploadedAt
    })
  }

  if (media.thumbKey) updateImageThumb(media.key, media.thumbKey)
  if (media.mediaType === 'video') {
    updateImageTranscode(media.key, {
      status: media.transcodeStatus,
      hlsKey: media.hlsKey,
      progress: media.transcodeProgress,
      preset: media.transcodePreset,
      sourceDeleted: media.sourceDeleted,
      error: media.transcodeError
    })
  }

  const tagOwnerId = owner?.id ?? actorUserId
  const tagIds: number[] = []
  for (const tag of media.tags) {
    const existing = findTagByName(tagOwnerId, tag.name)
    const item = existing
      ? { id: existing.id }
      : createTag(tagOwnerId, tag.name, tag.color)
    tagIds.push(item.id)
  }
  setImageTags(media.key, tagIds, tagOwnerId, true)

  return { success: true, skipped: false }
}
