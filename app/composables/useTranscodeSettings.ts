interface TranscodeSettingsResponse {
  concurrency: number
  threads: number
  preset: string
  bitratePercent: number
  maxConcurrency: number
  maxThreads: number
  minBitratePercent: number
  maxBitratePercent: number
  presets: string[]
  memoryBytes: number
  lowMemoryThresholdBytes: number
  lowMemory: boolean
}

/** 服务端转码参数：并发任务数与单任务 CPU 核心数（仅管理员可改） */
export function useTranscodeSettings() {
  const { isAuthenticated, isAdmin, handleAuthError } = useAuth()
  const toast = useToast()
  const { t } = useI18n()

  const concurrency = ref(1)
  const threads = ref(1)
  const maxConcurrency = ref(8)
  const maxThreads = ref(64)
  const preset = ref('veryfast')
  const presets = ref<string[]>(['veryfast', 'medium', 'slow'])
  const bitratePercent = ref(80)
  const minBitratePercent = ref(10)
  const maxBitratePercent = ref(100)
  const loaded = ref(false)
  const hydrated = ref(false)
  const memoryBytes = ref(0)
  const lowMemoryThresholdBytes = ref(2 * 1024 * 1024 * 1024)
  const lowMemory = ref(false)

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function apply(data: TranscodeSettingsResponse) {
    hydrated.value = false
    concurrency.value = data.concurrency
    threads.value = data.threads
    preset.value = data.preset
    bitratePercent.value = data.bitratePercent
    minBitratePercent.value = data.minBitratePercent ?? 10
    maxBitratePercent.value = data.maxBitratePercent ?? 100
    if (data.presets?.length) presets.value = data.presets
    maxConcurrency.value = data.maxConcurrency
    maxThreads.value = data.maxThreads
    memoryBytes.value = data.memoryBytes ?? 0
    lowMemoryThresholdBytes.value = data.lowMemoryThresholdBytes
      ?? 2 * 1024 * 1024 * 1024
    lowMemory.value = data.lowMemory === true
    loaded.value = true
    nextTick(() => {
      hydrated.value = true
    })
  }

  async function load() {
    if (!isAuthenticated.value) return
    try {
      apply(await $fetch<TranscodeSettingsResponse>('/api/videos/transcode-settings', {
        credentials: 'include'
      }))
    } catch (error: unknown) {
      handleAuthError(error)
      if (isAuthenticated.value) {
        toast.add({ title: t('preferences.transcodeLoadFailed'), color: 'error' })
      }
    }
  }

  async function save() {
    if (!hydrated.value || !isAdmin.value) return
    try {
      const data = await $fetch<TranscodeSettingsResponse>('/api/videos/transcode-settings', {
        method: 'PATCH',
        credentials: 'include',
        body: {
          concurrency: concurrency.value,
          threads: threads.value,
          preset: preset.value,
          bitratePercent: bitratePercent.value
        }
      })
      hydrated.value = false
      concurrency.value = data.concurrency
      threads.value = data.threads
      preset.value = data.preset
      bitratePercent.value = data.bitratePercent
      nextTick(() => {
        hydrated.value = true
      })
    } catch (error: unknown) {
      handleAuthError(error)
      if (isAuthenticated.value) {
        toast.add({ title: t('preferences.transcodeSaveFailed'), color: 'error' })
      }
    }
  }

  watch([concurrency, threads, preset, bitratePercent], () => {
    if (!hydrated.value || !isAdmin.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void save()
    }, 600)
  })

  return {
    concurrency,
    threads,
    preset,
    bitratePercent,
    minBitratePercent,
    maxBitratePercent,
    presets,
    maxConcurrency,
    maxThreads,
    memoryBytes,
    lowMemoryThresholdBytes,
    lowMemory,
    loaded,
    load
  }
}
