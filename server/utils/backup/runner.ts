import { runBackendSyncJob } from './backend-sync'
import { runFullExportJob } from './full-export'
import { runFullRestoreJob } from './full-restore'
import { registerSiteSyncToken, runSiteSyncJob, type SiteSyncOptions } from '../site-sync/runner'
import {
  createBackupJob,
  getBackupJob,
  markJobFailed,
  markJobRunning,
  recoverInterruptedBackupJobs,
  updateBackupJobPayload,
  type BackupJob
} from './jobs'
import {
  beginJobCancellationScope,
  endJobCancellationScope,
  requestJobCancellation
} from './cancel-state'

interface BackupRunnerState {
  running: boolean
  currentJobId: string | null
}

const runnerState: BackupRunnerState = (globalThis as typeof globalThis & {
  __pichostBackupRunner?: BackupRunnerState
}).__pichostBackupRunner ?? {
  running: false,
  currentJobId: null
}
;(globalThis as typeof globalThis & {
  __pichostBackupRunner?: BackupRunnerState
}).__pichostBackupRunner = runnerState

export function isBackupRunnerBusy(): boolean {
  return runnerState.running
}

function claimJobSlot(): void {
  if (runnerState.running) {
    throw new Error('BACKUP_JOB_RUNNING')
  }
  recoverInterruptedBackupJobs()
}

export function cancelBackupJob(jobId: string): boolean {
  const job = getBackupJob(jobId)
  if (!job || (job.status !== 'running' && job.status !== 'pending')) {
    return false
  }
  requestJobCancellation(jobId)
  markJobFailed(jobId, '任务已取消', '已请求取消，正在停止…')
  return true
}

export function scheduleBackupJob(
  job: BackupJob,
  runner: () => Promise<void>
): void {
  if (runnerState.running) {
    throw new Error('BACKUP_JOB_RUNNING')
  }
  runnerState.running = true
  runnerState.currentJobId = job.id
  beginJobCancellationScope(job.id)
  markJobRunning(job.id)

  setImmediate(() => {
    runner()
      .catch(() => {})
      .finally(() => {
        endJobCancellationScope(job.id)
        if (runnerState.currentJobId === job.id) {
          runnerState.running = false
          runnerState.currentJobId = null
        }
      })
  })
}

export function startFullExportJob(appVersion: string, userId?: number | null): BackupJob {
  claimJobSlot()
  const job = createBackupJob({
    type: 'full_export',
    userId,
    message: '等待开始…'
  })
  scheduleBackupJob(job, () => runFullExportJob(job.id, appVersion))
  return getBackupJob(job.id)!
}

export function startFullRestoreJob(
  archivePath: string,
  conflictMode: 'skip' | 'overwrite',
  userId?: number | null
): BackupJob {
  claimJobSlot()
  const job = createBackupJob({
    type: 'full_restore',
    userId,
    message: '等待开始…',
    payload: { archivePath, conflictMode }
  })
  scheduleBackupJob(job, () => runFullRestoreJob(job.id, archivePath, { conflictMode }))
  return getBackupJob(job.id)!
}

export function startBackendSyncJob(options: {
  fromBackendId: string
  toBackendId: string
  deleteSource?: boolean
  setDefault?: boolean
  dryRun?: boolean
}, userId?: number | null): BackupJob {
  claimJobSlot()
  const job = createBackupJob({
    type: 'backend_sync',
    userId,
    message: options.dryRun ? '预检中…' : '等待开始…',
    payload: options
  })
  scheduleBackupJob(job, () => runBackendSyncJob(job.id, options))
  return getBackupJob(job.id)!
}

export function startSiteSyncJob(
  options: SiteSyncOptions,
  token: string,
  userId?: number | null
): BackupJob {
  claimJobSlot()
  const job = createBackupJob({
    type: 'site_sync',
    userId,
    message: '等待开始…',
    payload: {
      targetBaseUrl: options.targetBaseUrl,
      conflictMode: options.conflictMode,
      direction: options.direction
    }
  })
  registerSiteSyncToken(job.id, token)
  scheduleBackupJob(job, () => runSiteSyncJob(job.id, options))
  return getBackupJob(job.id)!
}

export function resumeSiteSyncJob(
  jobId: string,
  token: string,
  userId?: number | null
): BackupJob {
  claimJobSlot()
  const previousJob = getBackupJob(jobId, userId ?? undefined)
  if (
    !previousJob
    || previousJob.type !== 'site_sync'
    || previousJob.status !== 'failed'
    || previousJob.payload.resumable !== true
  ) {
    throw new Error('SITE_SYNC_JOB_NOT_RESUMABLE')
  }
  const targetBaseUrl = typeof previousJob.payload.targetBaseUrl === 'string'
    ? previousJob.payload.targetBaseUrl
    : ''
  const conflictMode = previousJob.payload.conflictMode === 'skip'
    ? 'skip'
    : 'overwrite'
  const direction = previousJob.payload.direction === 'pull' ? 'pull' : 'push'
  if (!targetBaseUrl) throw new Error('SITE_SYNC_JOB_NOT_RESUMABLE')

  const job = createBackupJob({
    type: 'site_sync',
    userId: previousJob.userId,
    total: previousJob.total,
    message: `继续任务 ${previousJob.id}…`,
    payload: {
      ...previousJob.payload,
      resumedFromJobId: previousJob.id,
      resumedAt: new Date().toISOString(),
      cancelled: false
    }
  })
  updateBackupJobPayload(previousJob.id, {
    ...previousJob.payload,
    resumable: false,
    supersededByJobId: job.id
  })
  registerSiteSyncToken(job.id, token)
  scheduleBackupJob(job, () => runSiteSyncJob(job.id, {
    targetBaseUrl,
    conflictMode,
    direction
  }))
  return getBackupJob(job.id)!
}
