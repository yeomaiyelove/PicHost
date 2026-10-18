import { requireAdminAuth } from '../../../../utils/access'
import { createApiError } from '../../../../utils/api-error'
import {
  getBackupJob,
  setBackupJobHidden
} from '../../../../utils/backup/jobs'

interface Body {
  jobId?: string
  hidden?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAdminAuth(event)
  const body = await readBody<Body>(event).catch(() => null)
  const jobId = body?.jobId?.trim() ?? ''
  if (!jobId || !getBackupJob(jobId, user.id)) {
    createApiError(event, 'INVALID_REQUEST', '任务不存在', 404)
  }
  const hidden = body?.hidden !== false
  if (!setBackupJobHidden(jobId, user.id, hidden)) {
    createApiError(event, 'INVALID_REQUEST', '更新任务显示状态失败', 400)
  }
  return { success: true, hidden }
})
