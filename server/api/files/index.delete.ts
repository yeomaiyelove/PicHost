import type { DeleteResponse } from '~/types/image'
import { assertImageOwnership, requireApiOrAdminAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { logActivity } from '../../utils/activity-log'
import { deleteImageIndex, getImageIndexRow } from '../../utils/image-index'
import { validateStorageKey, validateVideoKey } from '../../utils/image-key'
import { deleteImage, headImage } from '../../utils/storage'
import { cancelTranscode, removeHlsArtifacts } from '../../utils/transcode'
import { logInfo } from '../../utils/logger'

interface DeleteBody {
  key?: string
}

export default defineEventHandler(async (event) => {
  try {
    await requireApiOrAdminAuth(event)

    const query = getQuery(event)
    const body = await readBody<DeleteBody>(event).catch(() => null)
    const key = (typeof query.key === 'string' ? query.key : undefined) ?? body?.key

    if (!key || !validateStorageKey(key)) {
      createApiError(event, 'INVALID_IMAGE_KEY', '无效的文件路径', 400)
    }

    const existing = await headImage(key)
    const indexed = getImageIndexRow(key)

    if (!existing && !indexed) {
      createApiError(event, 'IMAGE_NOT_FOUND', '文件不存在', 404)
    }

    const originalName = existing?.originalName ?? indexed?.original_name ?? key
    const size = existing?.size ?? indexed?.size ?? 0
    const contentType = existing?.contentType ?? indexed?.content_type ?? 'application/octet-stream'
    const ownerId = existing?.userId ?? indexed?.user_id ?? null
    const backendId = existing?.backendId ?? indexed?.backend_id ?? null

    await assertImageOwnership(event, ownerId)

    try {
      if (validateVideoKey(key)) {
        // 立即中断正在进行的转码，再清理产物与原文件
        cancelTranscode(key)
        await removeHlsArtifacts(key).catch(() => {})
      }
      if (existing) {
        await deleteImage(key, key)
      } else {
        deleteImageIndex(key)
      }
    } catch {
      createApiError(event, 'DELETE_FAILED', '删除失败', 500)
    }

    logActivity(event, {
      action: 'delete',
      key,
      originalName,
      size,
      contentType,
      userId: ownerId,
      backendId
    })

    logInfo('file delete success', { key, size })

    const response: DeleteResponse = { success: true }
    return response
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    createApiError(event, 'DELETE_FAILED', '删除失败', 500)
  }
})
