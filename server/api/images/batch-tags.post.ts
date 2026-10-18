import { requireApiOrAdminAuth } from '../../utils/access'
import { logActivity } from '../../utils/activity-log'
import { getCurrentUser } from '../../utils/auth'
import { createApiError } from '../../utils/api-error'
import { MAX_DELETE_BATCH } from '../../utils/constants'
import { getImageIndexRow } from '../../utils/image-index'
import { toCanonicalImageKey, validateStorageKey } from '../../utils/image-key'
import {
  addTagsToImage,
  removeTagFromImage
} from '../../utils/tags'
import { handleTagApiError } from '../../utils/tag-api'

interface BatchTagsBody {
  keys?: string[]
  tagIds?: number[]
  action?: 'add' | 'remove'
}

function validateKeys(keys: string[]): void {
  for (const key of keys) {
    if (
      !validateStorageKey(key)
      && !toCanonicalImageKey(key)
      && !getImageIndexRow(key)
    ) {
      throw new Error(`INVALID_KEY:${key}`)
    }
  }
}

export default defineEventHandler(async (event) => {
  await requireApiOrAdminAuth(event)
  const user = await getCurrentUser(event)
  if (!user) {
    createApiError(event, 'UNAUTHORIZED', '批量打标需要登录', 401)
  }
  const body = await readBody<BatchTagsBody>(event)

  const keys = Array.isArray(body?.keys)
    ? body.keys.filter(key => typeof key === 'string' && key.trim())
    : []
  const tagIds = Array.isArray(body?.tagIds)
    ? body.tagIds.filter(id => Number.isInteger(id) && id > 0)
    : []
  const action = body?.action === 'remove' ? 'remove' : 'add'

  if (!keys.length) {
    createApiError(event, 'INVALID_REQUEST', '请提供媒体列表', 400)
  }
  if (!tagIds.length) {
    createApiError(event, 'INVALID_REQUEST', '请提供标签列表', 400)
  }
  if (keys.length > MAX_DELETE_BATCH) {
    createApiError(
      event,
      'INVALID_REQUEST',
      `每次最多处理 ${MAX_DELETE_BATCH} 个媒体`,
      400
    )
  }

  try {
    validateKeys(keys)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('INVALID_KEY:')) {
      createApiError(event, 'INVALID_IMAGE_KEY', `无效的媒体路径: ${error.message.slice(12)}`, 400)
    }
    throw error
  }

  let updated = 0
  try {
    for (const key of keys) {
      if (action === 'add') {
        addTagsToImage(key, tagIds, user.id, user.role === 'admin')
      } else {
        for (const tagId of tagIds) {
          removeTagFromImage(key, tagId, user.id, user.role === 'admin')
        }
      }
      updated++
    }
  } catch (error) {
    handleTagApiError(event, error)
  }

  logActivity(event, {
    action: 'tags',
    key: 'media/batch-tags',
    originalName: action === 'add'
      ? `批量打标（${keys.length} 个媒体）`
      : `批量移除标签（${keys.length} 个媒体）`,
    userId: user.id
  })

  return { success: true, updated }
})
