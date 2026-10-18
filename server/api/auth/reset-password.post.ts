import { createApiError } from '../../utils/api-error'
import { createSession, hashPassword } from '../../utils/auth'
import {
  findUserByUsername,
  isPasswordResetRequired,
  setUserPassword
} from '../../utils/db'
import { logInfo } from '../../utils/logger'

interface ResetBody {
  username?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ResetBody>(event).catch((): ResetBody => ({}))
  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''

  if (!username || password.length < 6) {
    createApiError(event, 'INVALID_REQUEST', '请输入用户名和至少 6 位的新密码', 400)
  }

  const user = findUserByUsername(username)
  if (!user || !isPasswordResetRequired(user.id)) {
    createApiError(event, 'UNAUTHORIZED', '该账号无需重置密码', 401)
  }

  setUserPassword(user.id, await hashPassword(password))
  await createSession(event, user.id)
  logInfo('password reset completed', { username })

  return { success: true }
})
