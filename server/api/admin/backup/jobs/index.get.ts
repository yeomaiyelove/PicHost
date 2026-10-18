import { requireAdminAuth } from '../../../../utils/access'
import { serializeBackupJob } from '../../../../utils/backup/api'
import {
  getActiveBackupJob,
  getRunningBackupJob,
  listBackupJobsPage,
  recoverInterruptedBackupJobs
} from '../../../../utils/backup/jobs'
import { isBackupRunnerBusy } from '../../../../utils/backup/runner'

export default defineEventHandler(async (event) => {
  const user = await requireAdminAuth(event)
  if (getRunningBackupJob() && !isBackupRunnerBusy()) {
    recoverInterruptedBackupJobs()
  }
  const query = getQuery(event)
  const includeHidden = query.includeHidden === 'true'
    || query.includeHidden === '1'
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10))
  const pageNum = Math.max(1, Number(query.pageNum) || Number(query.page) || 1)
  const { jobs, total } = listBackupJobsPage(
    pageNum,
    pageSize,
    user.id,
    includeHidden
  )
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = total > 0 ? Math.min(pageNum, totalPages) : 1
  const slice = page === pageNum
    ? jobs
    : listBackupJobsPage(page, pageSize, user.id, includeHidden).jobs

  const activeJob = getActiveBackupJob(user.id)

  return {
    jobs: slice.map(serializeBackupJob),
    total,
    page,
    pageSize,
    totalPages,
    includeHidden,
    activeJob: activeJob ? serializeBackupJob(activeJob) : null
  }
})
