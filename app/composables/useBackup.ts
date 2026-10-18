import type {
  BackupEstimate,
  BackupJobItem,
  BackupPackageItem,
  BackupRestorePreview,
  BackendSyncPreview,
  SiteSyncRequest
} from '~/types/backup'

const jobs = ref<BackupJobItem[]>([])
const jobsPage = ref(1)
const jobsPageSize = ref(10)
const jobsTotal = ref(0)
const jobsTotalPages = ref(1)
const jobsLoading = ref(false)
const showHiddenJobs = ref(false)
const activeJobState = ref<BackupJobItem | null>(null)
const estimate = ref<BackupEstimate | null>(null)
const packages = ref<BackupPackageItem[]>([])
const loadingEstimate = ref(false)
const polling = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

export function useBackup() {
  const toast = useToast()
  const { t } = useI18n()

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    polling.value = false
  }

  function hasActiveJob(): boolean {
    return activeJobState.value !== null
  }

  function getActiveJob(): BackupJobItem | null {
    return activeJobState.value
  }

  async function cancelJob(jobId: string) {
    try {
      await $fetch(`/api/admin/backup/jobs/${jobId}/cancel`, {
        method: 'POST',
        credentials: 'include'
      })
      await loadJobs()
      toast.add({ title: t('storage.backup.cancelDone'), color: 'success' })
    } catch (error: unknown) {
      handleError(error, t('storage.backup.cancelFailed'))
    }
  }

  async function loadJobs(options?: { page?: number, pageSize?: number }) {
    if (options?.page !== undefined) jobsPage.value = options.page
    if (options?.pageSize !== undefined) jobsPageSize.value = options.pageSize
    jobsLoading.value = true
    try {
      const data = await $fetch<{
        jobs: BackupJobItem[]
        total: number
        page: number
        pageSize: number
        totalPages: number
        activeJob: BackupJobItem | null
      }>('/api/admin/backup/jobs', {
        credentials: 'include',
        query: {
          pageNum: jobsPage.value,
          pageSize: jobsPageSize.value,
          includeHidden: showHiddenJobs.value
        }
      })
      jobs.value = data.jobs
      jobsTotal.value = data.total
      jobsPage.value = data.page
      jobsPageSize.value = data.pageSize
      jobsTotalPages.value = data.totalPages
      activeJobState.value = data.activeJob
      if (!data.activeJob) {
        stopPolling()
        void loadEstimate().catch(() => {})
      }
      return data.jobs
    } finally {
      jobsLoading.value = false
    }
  }

  async function setJobsPage(page: number) {
    jobsPage.value = page
    return loadJobs()
  }

  async function setJobsPageSize(pageSize: number) {
    jobsPageSize.value = pageSize
    jobsPage.value = 1
    return loadJobs()
  }

  async function refreshJobsFirstPage() {
    jobsPage.value = 1
    return loadJobs()
  }

  async function toggleShowHiddenJobs() {
    showHiddenJobs.value = !showHiddenJobs.value
    jobsPage.value = 1
    await loadJobs()
  }

  async function hideJob(jobId: string, hidden = true) {
    try {
      await $fetch('/api/admin/backup/jobs/hide', {
        method: 'POST',
        credentials: 'include',
        body: { jobId, hidden }
      })
      if (hidden) {
        showHiddenJobs.value = false
        jobsPage.value = 1
      }
      await loadJobs()
      toast.add({
        title: hidden
          ? t('storage.backup.jobHidden')
          : t('storage.backup.jobUnhidden'),
        color: 'success'
      })
    } catch (error: unknown) {
      handleError(error, t('storage.backup.hideFailed'))
    }
  }

  async function hideAllJobs(hidden = true) {
    try {
      await $fetch('/api/admin/backup/jobs/hide-all', {
        method: 'POST',
        credentials: 'include',
        body: { hidden }
      })
      if (hidden) {
        showHiddenJobs.value = false
      }
      jobsPage.value = 1
      await loadJobs()
      toast.add({
        title: hidden
          ? t('storage.backup.jobsHiddenAll')
          : t('storage.backup.jobsUnhiddenAll'),
        color: 'success'
      })
    } catch (error: unknown) {
      handleError(error, t('storage.backup.hideFailed'))
    }
  }

  async function loadEstimate() {
    loadingEstimate.value = true
    try {
      const data = await $fetch<{
        estimate: BackupEstimate
        packages: BackupPackageItem[]
        backupsDir: string
      }>('/api/admin/backup/estimate', { credentials: 'include' })
      estimate.value = data.estimate
      packages.value = data.packages
      return data
    } finally {
      loadingEstimate.value = false
    }
  }

  function startPolling() {
    if (pollTimer) return
    polling.value = true
    pollTimer = setInterval(() => {
      void loadJobs().catch(() => {})
    }, 2000)
  }

  async function createExport() {
    try {
      const data = await $fetch<{ job: BackupJobItem, estimate: BackupEstimate }>(
        '/api/admin/backup/export',
        { method: 'POST', credentials: 'include' }
      )
      estimate.value = data.estimate
      await refreshJobsFirstPage()
      startPolling()
      toast.add({ title: t('storage.backup.exportStarted'), color: 'success' })
      return data.job
    } catch (error: unknown) {
      handleError(error, t('storage.backup.exportFailed'))
      throw error
    }
  }

  async function previewRestore(input: {
    file?: File
    archiveName?: string
  }): Promise<BackupRestorePreview> {
    if (input.file) {
      const data = await $fetch<{ preview: BackupRestorePreview }>(
        '/api/admin/backup/restore',
        {
          method: 'POST',
          credentials: 'include',
          body: input.file,
          headers: {
            'content-type': 'application/octet-stream',
            'x-pichost-dry-run': 'true'
          }
        }
      )
      return data.preview
    }

    const data = await $fetch<{ preview: BackupRestorePreview }>(
      '/api/admin/backup/restore',
      {
        method: 'POST',
        credentials: 'include',
        body: {
          archiveName: input.archiveName,
          dryRun: true
        }
      }
    )
    return data.preview
  }

  async function confirmRestore(input: {
    file?: File
    archiveName?: string
    conflictMode: 'skip' | 'overwrite'
  }) {
    try {
      if (input.file) {
        const data = await $fetch<{ job: BackupJobItem }>(
          '/api/admin/backup/restore',
          {
            method: 'POST',
            credentials: 'include',
            body: input.file,
            headers: {
              'content-type': 'application/octet-stream',
              'x-pichost-dry-run': 'false',
              'x-pichost-conflict-mode': input.conflictMode
            }
          }
        )
        await refreshJobsFirstPage()
        startPolling()
        toast.add({ title: t('storage.backup.restoreStarted'), color: 'success' })
        return data.job
      }

      const data = await $fetch<{ job: BackupJobItem }>(
        '/api/admin/backup/restore',
        {
          method: 'POST',
          credentials: 'include',
          body: {
            archiveName: input.archiveName,
            conflictMode: input.conflictMode,
            dryRun: false
          }
        }
      )
      await refreshJobsFirstPage()
      startPolling()
      toast.add({ title: t('storage.backup.restoreStarted'), color: 'success' })
      return data.job
    } catch (error: unknown) {
      handleError(error, t('storage.backup.restoreFailed'))
      throw error
    }
  }

  async function previewSync(body: {
    fromBackendId: string
    toBackendId: string
  }): Promise<BackendSyncPreview> {
    const data = await $fetch<{ preview: BackendSyncPreview }>(
      '/api/admin/storage/sync',
      {
        method: 'POST',
        credentials: 'include',
        body: { ...body, dryRun: true }
      }
    )
    return data.preview
  }

  async function startSync(body: {
    fromBackendId: string
    toBackendId: string
    deleteSource?: boolean
    setDefault?: boolean
  }) {
    try {
      const data = await $fetch<{ job: BackupJobItem }>(
        '/api/admin/storage/sync',
        {
          method: 'POST',
          credentials: 'include',
          body
        }
      )
      await refreshJobsFirstPage()
      startPolling()
      toast.add({ title: t('storage.backup.syncStarted'), color: 'success' })
      return data.job
    } catch (error: unknown) {
      handleError(error, t('storage.backup.syncFailed'))
      throw error
    }
  }

  async function startSiteSync(body: SiteSyncRequest) {
    try {
      const data = await $fetch<{ job: BackupJobItem }>(
        '/api/admin/site-sync',
        {
          method: 'POST',
          credentials: 'include',
          body
        }
      )
      await refreshJobsFirstPage()
      startPolling()
      const cleanupPending = Boolean(
        body.abandonJobId
        && data.job.payload.cleanupPending === true
      )
      toast.add({
        title: cleanupPending
          ? t('storage.backup.siteSyncAbandonedPendingCleanup')
          : body.abandonJobId
            ? t('storage.backup.siteSyncAbandoned')
            : t('storage.backup.siteSyncStarted'),
        color: cleanupPending ? 'warning' : 'success'
      })
      return data.job
    } catch (error: unknown) {
      handleError(error, t('storage.backup.siteSyncFailed'))
      throw error
    }
  }

  async function retryJob(jobId: string) {
    try {
      await $fetch(`/api/admin/backup/jobs/${jobId}/retry`, {
        method: 'POST',
        credentials: 'include'
      })
      await refreshJobsFirstPage()
      startPolling()
      toast.add({ title: t('storage.backup.retryStarted'), color: 'success' })
    } catch (error: unknown) {
      handleError(error, t('storage.backup.retryFailed'))
    }
  }

  function downloadUrl(jobId: string): string {
    return `/api/admin/backup/jobs/${jobId}/download`
  }

  function handleError(error: unknown, fallback: string) {
    const status = typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as { statusCode: number }).statusCode
      : 0
    if (status === 409) {
      toast.add({ title: t('storage.backup.jobRunning'), color: 'warning' })
      return
    }
    toast.add({ title: fallback, color: 'error' })
  }

  onUnmounted(() => {
    stopPolling()
  })

  return {
    jobs,
    jobsPage,
    jobsPageSize,
    jobsTotal,
    jobsTotalPages,
    jobsLoading,
    showHiddenJobs,
    estimate,
    packages,
    loadingEstimate,
    polling,
    hasActiveJob,
    getActiveJob,
    loadJobs,
    toggleShowHiddenJobs,
    hideJob,
    hideAllJobs,
    setJobsPage,
    setJobsPageSize,
    loadEstimate,
    startPolling,
    stopPolling,
    createExport,
    previewRestore,
    confirmRestore,
    previewSync,
    startSync,
    startSiteSync,
    retryJob,
    cancelJob,
    downloadUrl
  }
}
