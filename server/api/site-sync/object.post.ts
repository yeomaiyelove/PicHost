import { readMultipartFormData } from 'h3'
import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { MAX_VIDEO_FILE_SIZE } from '../../utils/constants'
import { findUserByUsername } from '../../utils/db'
import { validateStorageKey } from '../../utils/image-key'
import { getActiveBackend } from '../../utils/storage/resolver'
import { recordSiteSyncArtifact } from '../../utils/site-sync/artifacts'

function field(form: Awaited<ReturnType<typeof readMultipartFormData>>, name: string): string {
  const part = form?.find(item => item.name === name)
  return part?.data?.length ? new TextDecoder().decode(part.data).trim() : ''
}

export default defineEventHandler(async (event) => {
  await requireSiteSyncAuth(event)
  const form = await readMultipartFormData(event)
  if (!form?.length) createApiError(event, 'INVALID_REQUEST', '未收到同步数据', 400)

  const key = field(form, 'key')
  const file = form.find(part => part.name === 'file' && part.data?.length)
  if (!validateStorageKey(key) || !file?.data) {
    createApiError(event, 'INVALID_REQUEST', '同步文件参数无效', 400)
  }
  if (file.data.length > MAX_VIDEO_FILE_SIZE) {
    createApiError(event, 'FILE_TOO_LARGE', '同步文件超过 500 MB', 413)
  }

  const conflictMode = field(form, 'conflictMode') === 'skip' ? 'skip' : 'overwrite'
  const backend = await getActiveBackend()
  if (conflictMode === 'skip' && await backend.head(key)) {
    return { success: true, skipped: true }
  }
  const existedBefore = Boolean(await backend.head(key))

  const ownerUsername = field(form, 'ownerUsername')
  const owner = ownerUsername ? findUserByUsername(ownerUsername) : null
  if (ownerUsername && !owner) {
    createApiError(event, 'INVALID_REQUEST', `目标站点缺少用户：${ownerUsername}`, 400)
  }

  const jobId = field(form, 'jobId')
  const mediaKey = field(form, 'mediaKey')
  if (jobId && validateStorageKey(mediaKey)) {
    recordSiteSyncArtifact({
      jobId,
      mediaKey,
      key,
      backendId: backend.id,
      created: !existedBefore
    })
  }

  await backend.put(key, new Uint8Array(file.data), {
    originalName: field(form, 'originalName') || file.filename || key.split('/').pop() || 'file',
    uploadedAt: field(form, 'uploadedAt') || new Date().toISOString(),
    contentType: file.type || field(form, 'contentType') || 'application/octet-stream',
    size: file.data.length,
    userId: owner?.id ?? null,
    mediaType: key.startsWith('videos/')
      ? 'video'
      : key.startsWith('files/')
        ? 'file'
        : 'image'
  })

  return { success: true, skipped: false }
})
