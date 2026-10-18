import { createReadStream, promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertImageOwnership, requireUserAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { buildAttachmentDisposition } from '../../utils/file-bed'
import { getImageIndexRow } from '../../utils/image-index'
import { validateVideoKey } from '../../utils/image-key'
import { logException, logInfo } from '../../utils/logger'
import {
  cleanupExpiredHlsDownloads,
  markHlsDownloadForCleanup,
  remuxHlsToMp4
} from '../../utils/transcode'

interface DownloadBody {
  key?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireUserAuth(event)

  const body = await readBody<DownloadBody>(event).catch(() => null)
  const key = body?.key
  if (!key || !validateVideoKey(key)) {
    createApiError(event, 'INVALID_VIDEO_KEY', '无效的视频路径', 400)
  }

  const row = getImageIndexRow(key)
  if (!row?.hls_key) {
    createApiError(event, 'HLS_NOT_FOUND', 'HLS 视频不存在或尚未转码完成', 404)
  }
  await assertImageOwnership(event, row.user_id)

  void cleanupExpiredHlsDownloads()
  const workDir = join(tmpdir(), `pichost-hls-download-${user.id}-${randomUUID()}`)
  try {
    await fs.mkdir(workDir, { recursive: true })
    await markHlsDownloadForCleanup(workDir)
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  let outputPath: string
  try {
    outputPath = await remuxHlsToMp4(row.hls_key, workDir)
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    logException('HLS download remux failed', error, { key })
    createApiError(event, 'HLS_REMUX_FAILED', '视频合并失败，请稍后重试', 500)
  }

  let outputSize: number
  try {
    const stat = await fs.stat(outputPath)
    if (!stat.isFile() || stat.size === 0) {
      createApiError(event, 'HLS_REMUX_FAILED', '视频合并失败，请稍后重试', 500)
    }
    outputSize = stat.size
    await markHlsDownloadForCleanup(workDir)
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  const baseName = row.original_name.replace(/\.[^.]+$/, '') || 'video'
  setResponseHeader(event, 'Content-Type', 'video/mp4')
  setResponseHeader(event, 'Content-Length', outputSize)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(
    event,
    'Content-Disposition',
    buildAttachmentDisposition(`${baseName}.mp4`)
  )

  logInfo('HLS download remuxed', { key, size: outputSize })
  await sendStream(event, createReadStream(outputPath))
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
})
