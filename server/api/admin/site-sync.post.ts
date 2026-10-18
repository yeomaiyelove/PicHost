import { requireAdminAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { serializeBackupJob } from '../../utils/backup/api'
import {
  resumeSiteSyncJob,
  startSiteSyncJob
} from '../../utils/backup/runner'
import { abandonSiteSyncJob } from '../../utils/site-sync/abandon'

interface SiteSyncBody {
  targetBaseUrl?: string
  token?: string
  conflictMode?: 'skip' | 'overwrite'
  direction?: 'push' | 'pull'
  scope?: 'all' | 'image' | 'video' | 'file'
  keys?: string[]
  resumeJobId?: string
  abandonJobId?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAdminAuth(event)
  const body = await readBody<SiteSyncBody>(event).catch(() => null)
  const targetBaseUrl = body?.targetBaseUrl?.trim() ?? ''
  const token = body?.token?.trim() ?? ''
  const conflictMode = body?.conflictMode === 'skip' ? 'skip' : 'overwrite'
  const direction = body?.direction === 'pull' ? 'pull' : 'push'

  if (!token && !body?.abandonJobId) {
    createApiError(event, 'INVALID_REQUEST', '请输入目标站点管理员 API Token', 400)
  }

  try {
    if (body?.abandonJobId) {
      const job = await abandonSiteSyncJob(body.abandonJobId, token, user.id)
      return { job: serializeBackupJob(job) }
    }
    let job
    if (body?.resumeJobId) {
      job = resumeSiteSyncJob(body.resumeJobId, token, user.id)
    } else {
      let targetUrl: URL
      try {
        targetUrl = new URL(targetBaseUrl)
        if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
          throw new Error('invalid protocol')
        }
      } catch {
        createApiError(event, 'INVALID_REQUEST', '请输入有效的目标站点地址', 400)
      }
      job = startSiteSyncJob({
        targetBaseUrl: targetUrl.toString(),
        conflictMode,
        direction,
        scope: body?.scope === 'image' || body?.scope === 'video' || body?.scope === 'file'
          ? body.scope
          : 'all',
        ...(Array.isArray(body?.keys) && body.keys.length
          ? { keys: body.keys.filter(key => typeof key === 'string') }
          : {})
      }, token, user.id)
    }
    return { job: serializeBackupJob(job) }
  } catch (error) {
    if (error instanceof Error && error.message === 'BACKUP_JOB_RUNNING') {
      createApiError(event, 'CONFLICT', '已有备份或迁移任务正在运行', 409)
    }
    if (error instanceof Error && error.message === 'SITE_SYNC_JOB_NOT_RESUMABLE') {
      createApiError(event, 'INVALID_REQUEST', '该同步任务无法继续', 400)
    }
    if (body?.abandonJobId) {
      createApiError(
        event,
        'INVALID_REQUEST',
        error instanceof Error ? error.message : '放弃同步失败',
        400
      )
    }
    throw error
  }
})
