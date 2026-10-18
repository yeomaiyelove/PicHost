import { requireAdminAuth } from '../../../utils/access'
import { listAdminUsers } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdminAuth(event)
  return { users: listAdminUsers() }
})
