import { requireUserAuth } from '../../../utils/access'
import { createApiError } from '../../../utils/api-error'
import { logInfo } from '../../../utils/logger'
import { clearUserStorage } from '../../../utils/user-storage'

export default defineEventHandler(async (event) => {
  const user = await requireUserAuth(event)
  const body = await readBody<{ confirmation?: string }>(event).catch(() => null)
  if (!['我已确认', 'I confirm'].includes(body?.confirmation?.trim() ?? '')) {
    createApiError(event, 'INVALID_REQUEST', '请输入“我已确认”以继续', 400)
  }

  try {
    const result = await clearUserStorage(user.id)
    logInfo('user storage cleared', {
      userId: user.id,
      deletedMedia: result.deletedMedia,
      deletedObjects: result.deletedObjects,
      failed: result.failed.length
    })
    return result
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_STORAGE_CLEAR_IN_PROGRESS') {
      createApiError(event, 'CONFLICT', '清空存储任务正在执行，请勿重复操作', 409)
    }
    if (error instanceof Error && error.message === 'USER_STORAGE_CLEAR_ACTIVE_JOB') {
      createApiError(event, 'CONFLICT', '当前有备份或迁移任务正在运行，请完成后再清空存储', 409)
    }
    throw error
  }
})
