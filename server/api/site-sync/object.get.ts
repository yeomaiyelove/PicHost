import { getQuery, sendStream, setResponseHeader } from 'h3'
import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { validateStorageKey } from '../../utils/image-key'
import { getBackendForKey } from '../../utils/storage/resolver'

export default defineEventHandler(async (event) => {
  await requireSiteSyncAuth(event)

  const query = getQuery(event)
  const key = typeof query.key === 'string' ? query.key.trim() : ''
  if (!validateStorageKey(key)) {
    createApiError(event, 'INVALID_REQUEST', '同步对象 key 无效', 400)
  }

  const backend = await getBackendForKey(key)
  const stored = await backend.head(key)
  if (!stored) {
    createApiError(event, 'IMAGE_NOT_FOUND', `目标对象不存在：${key}`, 404)
  }

  setResponseHeader(event, 'Content-Type', stored.contentType)
  setResponseHeader(event, 'Content-Length', stored.size)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return sendStream(event, await backend.createStream(key))
})
