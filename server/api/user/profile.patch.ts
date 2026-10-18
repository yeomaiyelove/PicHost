import { requireUserAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { findUserByUsername, updateUsername } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUserAuth(event)
  const body = await readBody<{ username?: unknown }>(event).catch(
    (): { username?: unknown } => ({})
  )

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
    createApiError(event, 'INVALID_REQUEST', '用户名需为 2–32 位字母、数字、下划线、点或短横线', 400)
  }

  const existing = findUserByUsername(username)
  if (existing && existing.id !== user.id) {
    createApiError(event, 'CONFLICT', '用户名已被占用', 409)
  }

  updateUsername(user.id, username)
  return { success: true, user: { ...user, username } }
})
