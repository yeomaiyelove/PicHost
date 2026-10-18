import type { BatchDeleteResponse } from '~/types/image'
import { assertImageOwnership, requireApiOrAdminAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { logActivity } from '../../utils/activity-log'
import { deleteImageIndex, getImageIndexRow } from '../../utils/image-index'
import { validateStorageKey, validateVideoKey } from '../../utils/image-key'
import { deleteImage, headImage } from '../../utils/storage'
import { cancelTranscode, removeHlsArtifacts } from '../../utils/transcode'
import { MAX_DELETE_BATCH } from '../../utils/constants'

interface BatchDeleteBody {
  keys?: unknown
}

export default defineEventHandler(async (event) => {
  await requireApiOrAdminAuth(event)

  const body = await readBody<BatchDeleteBody>(event).catch((): BatchDeleteBody => ({}))
  const keys = Array.isArray(body.keys)
    ? body.keys.map(key => String(key)).filter(Boolean)
    : []

  if (!keys.length) {
    createApiError(event, 'INVALID_REQUEST', '未提供要删除的文件', 400)
  }
  if (keys.length > MAX_DELETE_BATCH) {
    createApiError(event, 'INVALID_REQUEST', `每次最多删除 ${MAX_DELETE_BATCH} 个文件`, 400)
  }

  const deleted: string[] = []
  const failed: BatchDeleteResponse['failed'] = []

  for (const key of keys) {
    if (!validateStorageKey(key)) {
      failed.push({ key, error: { code: 'INVALID_IMAGE_KEY', message: '无效的文件路径' } })
      continue
    }

    try {
      const existing = await headImage(key)
      const indexed = getImageIndexRow(key)

      if (!existing && !indexed) {
        failed.push({ key, error: { code: 'IMAGE_NOT_FOUND', message: '文件不存在' } })
        continue
      }

      const ownerId = existing?.userId ?? indexed?.user_id ?? null
      await assertImageOwnership(event, ownerId)

      if (validateVideoKey(key)) {
        cancelTranscode(key)
        await removeHlsArtifacts(key).catch(() => {})
      }

      if (existing) {
        await deleteImage(key, key)
      } else {
        deleteImageIndex(key)
      }

      logActivity(event, {
        action: 'delete',
        key,
        originalName: existing?.originalName ?? indexed?.original_name ?? key,
        size: existing?.size ?? indexed?.size ?? 0,
        contentType: existing?.contentType ?? indexed?.content_type ?? 'application/octet-stream',
        userId: ownerId,
        backendId: existing?.backendId ?? indexed?.backend_id ?? null
      })

      deleted.push(key)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '删除失败'
      failed.push({ key, error: { code: 'DELETE_FAILED', message } })
    }
  }

  const response: BatchDeleteResponse = { success: failed.length === 0, deleted, failed }
  return response
})
