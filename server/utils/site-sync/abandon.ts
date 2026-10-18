import {
  getBackupJob,
  updateBackupJob,
  type BackupJob
} from '../backup/jobs'
import { cleanupSiteSyncJobArtifacts } from './artifacts'
import { fetchSiteSyncJson } from './runner'

interface CleanupResult {
  deleted: number
  referenced: number
  failed: number
}

export async function abandonSiteSyncJob(
  jobId: string,
  token: string,
  userId: number
): Promise<BackupJob> {
  const job = getBackupJob(jobId, userId)
  if (!job || job.type !== 'site_sync') throw new Error('同步任务不存在')
  if (job.status !== 'failed') throw new Error('只能放弃已停止的同步任务')

  const direction = job.payload.direction === 'pull' ? 'pull' : 'push'
  const targetBaseUrl = typeof job.payload.targetBaseUrl === 'string'
    ? job.payload.targetBaseUrl.replace(/\/+$/, '')
    : ''
  let cleanup: CleanupResult | null = null
  let cleanupError: string | null = null
  if (direction === 'push') {
    if (targetBaseUrl && token) {
      try {
        cleanup = await fetchSiteSyncJson<CleanupResult>(
          `${targetBaseUrl}/api/site-sync/cleanup`,
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId })
          }
        )
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : '目标站残留清理失败'
      }
    }
  } else {
    try {
      cleanup = await cleanupSiteSyncJobArtifacts(jobId)
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : '本地残留清理失败'
    }
  }

  const cleanupPending = Boolean(
    cleanupError
    || !cleanup
    || cleanup.failed > 0
  )

  const message = cleanupPending
    ? `已放弃同步 · 残留待清理${cleanupError ? `：${cleanupError}` : ''}`
    : `已放弃同步 · 清理 ${cleanup!.deleted} 个残留对象`
  updateBackupJob(jobId, {
    status: 'failed',
    message,
    error: '已放弃同步',
    finishedAt: new Date().toISOString(),
    payload: {
      ...job.payload,
      resumable: false,
      abandoned: true,
      cancelled: false,
      cleanupPending,
      cleanupError,
      failedKeys: [],
      cleanup
    }
  })
  return getBackupJob(jobId, userId)!
}
