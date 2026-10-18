import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { validateStorageKey } from '../../utils/image-key'
import { applySiteSyncMedia } from '../../utils/site-sync/apply'
import { completeSiteSyncMediaArtifacts } from '../../utils/site-sync/artifacts'
import type { SiteSyncMediaTransfer } from '../../utils/site-sync/protocol'

interface Body {
  media?: SiteSyncMediaTransfer
  conflictMode?: 'skip' | 'overwrite'
  jobId?: string
}

export default defineEventHandler(async (event) => {
  const admin = await requireSiteSyncAuth(event)
  const body = await readBody<Body>(event).catch(() => null)
  const media = body?.media
  if (!media || !validateStorageKey(media.key)) {
    createApiError(event, 'INVALID_REQUEST', '媒体同步参数无效', 400)
  }
  const conflictMode = body?.conflictMode === 'skip' ? 'skip' : 'overwrite'
  try {
    const result = await applySiteSyncMedia(media, conflictMode, admin.id)
    if (body?.jobId) {
      completeSiteSyncMediaArtifacts(body.jobId, media.key)
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : '媒体同步失败'
    createApiError(event, 'INVALID_REQUEST', message, 400)
  }
})
