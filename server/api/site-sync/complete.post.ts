import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { validateStorageKey } from '../../utils/image-key'
import { completeSiteSyncMediaArtifacts } from '../../utils/site-sync/artifacts'

interface Body {
  jobId?: string
  mediaKey?: string
}

export default defineEventHandler(async (event) => {
  await requireSiteSyncAuth(event)
  const body = await readBody<Body>(event).catch(() => null)
  const jobId = body?.jobId?.trim() ?? ''
  const mediaKey = body?.mediaKey?.trim() ?? ''
  if (!jobId || jobId.length > 128 || !validateStorageKey(mediaKey)) {
    createApiError(event, 'INVALID_REQUEST', '同步完成标记参数无效', 400)
  }
  completeSiteSyncMediaArtifacts(jobId, mediaKey)
  return { success: true }
})
