import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { cleanupSiteSyncJobArtifacts } from '../../utils/site-sync/artifacts'
import { cleanupSiteSyncChunkSessions } from '../../utils/site-sync/chunks'

interface Body {
  jobId?: string
}

export default defineEventHandler(async (event) => {
  await requireSiteSyncAuth(event)
  const body = await readBody<Body>(event).catch(() => null)
  const jobId = body?.jobId?.trim() ?? ''
  if (!jobId || jobId.length > 128) {
    createApiError(event, 'INVALID_REQUEST', '缺少同步任务 ID', 400)
  }
  const removedChunkSessions = await cleanupSiteSyncChunkSessions(jobId)
  return {
    success: true,
    removedChunkSessions,
    ...await cleanupSiteSyncJobArtifacts(jobId)
  }
})
