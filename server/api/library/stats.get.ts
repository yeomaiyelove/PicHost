import { getImageUserFilter, requireApiOrAdminAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { getMediaStats } from '../../utils/image-index'
import { buildBackendCapacity } from '../../utils/storage-capacity'
import { getActiveBackendRow } from '../../utils/storage/resolver'
import type { MediaType } from '../../utils/storage/types'

const ALLOWED_KINDS: MediaType[] = ['image', 'video', 'file']

export default defineEventHandler(async (event) => {
  await requireApiOrAdminAuth(event)

  const query = getQuery(event)
  const kindRaw = typeof query.kind === 'string' ? query.kind.trim() : 'image'
  const kind = ALLOWED_KINDS.find(item => item === kindRaw)
  if (!kind) {
    createApiError(event, 'INVALID_REQUEST', '无效的统计类型', 400)
  }

  const userFilter = await getImageUserFilter(event)
  const stats = getMediaStats(kind, userFilter)

  const backend = getActiveBackendRow()
  const capacity = backend
    ? await buildBackendCapacity(
        backend.id,
        backend.type,
        stats.uploadBytesTotal,
        backend.quota_bytes
      )
    : { totalBytes: null, percent: null }

  return {
    ...stats,
    storageUsage: {
      usedBytes: stats.uploadBytesTotal,
      totalBytes: capacity.totalBytes,
      percent: capacity.percent
    }
  }
})
