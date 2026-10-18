import { getQuery } from 'h3'
import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { validateStorageKey } from '../../utils/image-key'
import { getSiteSyncChunkStatus } from '../../utils/site-sync/chunks'

export default defineEventHandler(async (event) => {
  await requireSiteSyncAuth(event)
  const query = getQuery(event)
  const jobId = typeof query.jobId === 'string' ? query.jobId.trim() : ''
  const key = typeof query.key === 'string' ? query.key.trim() : ''
  if (!jobId || !validateStorageKey(key)) {
    createApiError(event, 'INVALID_REQUEST', '分块查询参数无效', 400)
  }
  return getSiteSyncChunkStatus({ jobId, key })
})
