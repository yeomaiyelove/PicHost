import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { validateStorageKey } from '../../utils/image-key'
import { finalizeSiteSyncChunk } from '../../utils/site-sync/chunks'

interface Body {
  jobId?: string
  key?: string
}

export default defineEventHandler(async (event) => {
  await requireSiteSyncAuth(event)
  const body = await readBody<Body>(event).catch(() => null)
  const jobId = body?.jobId?.trim() ?? ''
  const key = body?.key?.trim() ?? ''
  if (!jobId || !validateStorageKey(key)) {
    createApiError(event, 'INVALID_REQUEST', '分块完成参数无效', 400)
  }
  try {
    return await finalizeSiteSyncChunk({ jobId, key })
  } catch (error) {
    createApiError(
      event,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : '分块组装失败',
      400
    )
  }
})
