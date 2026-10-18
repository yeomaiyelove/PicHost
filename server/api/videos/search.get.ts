import { handleFileList } from '../files/index.get'
import { createApiError } from '../../utils/api-error'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = typeof query.q === 'string' ? query.q.trim() : ''
  if (!search) {
    createApiError(event, 'INVALID_REQUEST', '搜索关键词不能为空', 400)
  }
  return handleFileList(event, 'video')
})
