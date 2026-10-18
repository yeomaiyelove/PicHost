import { requireAdminAuth } from '../../../../utils/access'
import { setAllFinishedBackupJobsHidden } from '../../../../utils/backup/jobs'

interface Body {
  hidden?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAdminAuth(event)
  const body = await readBody<Body>(event).catch(() => null)
  const hidden = body?.hidden !== false
  const updated = setAllFinishedBackupJobsHidden(user.id, hidden)
  return { success: true, hidden, updated }
})
