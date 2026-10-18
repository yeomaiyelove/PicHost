import { handleFileList } from './index.get'
import { createApiError } from '../../utils/api-error'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = typeof query.q === 'string' ? query.q.trim() : ''
  if (!search) {
    createApiError(event, 'INVALID_REQUEST', '搜索关键词不能为空', 400)
  }

  const kind = typeof query.kind === 'string' ? query.kind.trim() : 'file'
  if (kind !== 'file' && kind !== 'video') {
    createApiError(event, 'INVALID_REQUEST', '无效的文件类型筛选', 400)
  }
  return handleFileList(event)
})
