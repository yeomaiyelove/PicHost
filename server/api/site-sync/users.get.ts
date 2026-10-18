import { requireSiteSyncAuth } from '../../utils/access'
import { listUserIdUsernameMap } from '../../utils/db'
import type { SiteSyncUsers } from '../../utils/site-sync/protocol'

export default defineEventHandler(async (event): Promise<SiteSyncUsers> => {
  await requireSiteSyncAuth(event)
  return {
    users: [...listUserIdUsernameMap().values()].sort()
  }
})
