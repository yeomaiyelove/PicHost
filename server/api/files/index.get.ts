import type { H3Event } from 'h3'
import type { FileListResponse } from '~/types/file'
import type { MediaType, TranscodeStatus } from '../../utils/storage/types'
import { requireApiOrAdminAuth, getImageUserFilter } from '../../utils/access'
import { getCurrentUser } from '../../utils/auth'
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from '../../utils/constants'
import { getUploadSourcesForKeys, listUserIdUsernameMap } from '../../utils/db'
import { getFileBedAccessMode } from '../../utils/env'
import { buildFileItem } from '../../utils/file-bed'
import {
  resolveImageOwner,
  resolveImageStorage,
  resolveImageUrl
} from '../../utils/image-response'
import { getTagsForImageKeys } from '../../utils/tags'
import { listStorageBackendNameMap } from '../../utils/storage-backends'
import { createApiError } from '../../utils/api-error'
import {
  readBackendIdQuery,
  readTagFilterQuery,
  readUploadSourceQuery
} from '../../utils/image-query'
import { listImages, searchImages } from '../../utils/storage'

export async function handleFileList(
  event: H3Event,
  forcedKind?: MediaType
): Promise<FileListResponse> {
  await requireApiOrAdminAuth(event)

  const query = getQuery(event)

  const limitRaw = Number(query.limit ?? DEFAULT_LIST_LIMIT)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT

  const pageRaw = Number(query.page ?? 1)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1

  const search = typeof query.q === 'string' ? query.q.trim() : ''
  const userFilter = await getImageUserFilter(event)

  const backendId = readBackendIdQuery(query)
  if (backendId === null) {
    createApiError(event, 'INVALID_REQUEST', '无效的存储后端', 400)
  }
  const uploadSource = readUploadSourceQuery(query)
  if (uploadSource === null) {
    createApiError(event, 'INVALID_REQUEST', '无效的上传来源', 400)
  }
  const tagFilter = readTagFilterQuery(query)
  if (tagFilter === null) {
    createApiError(event, 'INVALID_REQUEST', '无效的标签筛选参数', 400)
  }

  // 文件床按类型分工：视频库看 media_type=video，文件库看 media_type=file
  const kindRaw = forcedKind ?? (typeof query.kind === 'string' ? query.kind.trim() : '')
  if (kindRaw && kindRaw !== 'file' && kindRaw !== 'video') {
    createApiError(event, 'INVALID_REQUEST', '无效的文件类型筛选', 400)
  }
  const mediaType: MediaType = kindRaw === 'video' ? 'video' : 'file'
  // 视频库只收录转码已结束的条目；processing=1 用于上传页查仍在转码中的视频
  const processingRaw = query.processing
  const processingOnly = processingRaw === '1' || processingRaw === 'true'
  const transcodeStatuses: TranscodeStatus[] | undefined = mediaType === 'video'
    ? (processingOnly ? ['pending', 'running'] : ['none', 'done', 'failed'])
    : undefined

  const listing = search
    ? await searchImages({
        query: search,
        limit,
        page,
        userFilter,
        mediaType,
        transcodeStatuses,
        backendId,
        uploadSource,
        tagFilter
      })
    : await listImages({
        limit,
        page,
        userFilter,
        mediaType,
        transcodeStatuses,
        backendId,
        uploadSource,
        tagFilter
      })

  const user = await getCurrentUser(event)
  const ownerMap = user?.role === 'admin' ? listUserIdUsernameMap() : undefined
  const backendMap = listStorageBackendNameMap()
  const sourceMap = getUploadSourcesForKeys(listing.items.map(item => item.key))

  const mapped = listing.items.map((stored) => {
    const owner = resolveImageOwner(stored.userId, ownerMap)
    const storage = resolveImageStorage(stored.backendId, backendMap)
    const uploadSource = sourceMap.get(stored.key)

    return {
      ...buildFileItem({
        event,
        key: stored.key,
        backendId: stored.backendId,
        originalName: stored.originalName,
        contentType: stored.contentType,
        size: stored.size,
        uploadedAt: stored.uploadedAt
      }),
      ...(owner ? { owner } : {}),
      ...(storage ? { storage } : {}),
      ...(uploadSource === 'web' || uploadSource === 'api' ? { uploadSource } : {}),
      transcodeStatus: stored.transcodeStatus ?? 'none',
      transcodeProgress: stored.transcodeProgress ?? 0,
      ...(stored.transcodeError ? { transcodeError: stored.transcodeError } : {}),
      ...(stored.transcodePreset ? { transcodePreset: stored.transcodePreset } : {}),
      ...(stored.transcodeStartedAt
        ? { transcodeStartedAt: stored.transcodeStartedAt }
        : {}),
      ...(typeof stored.transcodeDurationMs === 'number'
        ? { transcodeDurationMs: stored.transcodeDurationMs }
        : {}),
      ...(stored.sourceDeleted ? { sourceDeleted: true } : {}),
      ...(stored.thumbKey
        ? { thumbUrl: resolveImageUrl(event, stored.thumbKey, stored.backendId) }
        : {}),
      ...(stored.hlsKey
        ? {
            hlsUrl: resolveImageUrl(event, stored.hlsKey, stored.backendId),
            hlsKey: stored.hlsKey
          }
        : {})
    }
  })

  const tagMap = getTagsForImageKeys(mapped.map(item => item.key))
  const items = mapped.map(item => ({ ...item, tags: tagMap.get(item.key) ?? [] }))

  const response: FileListResponse = {
    items,
    total: listing.total,
    page: listing.page,
    pageSize: listing.pageSize,
    totalPages: listing.totalPages,
    accessMode: getFileBedAccessMode()
  }

  return response
}

export default defineEventHandler(handleFileList)
