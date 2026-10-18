const STORAGE_KEY = 'pichost.upload-preferences'

export type CopyFormat = 'url' | 'markdown' | 'html' | 'bbcode'
export type UploadMediaKind = 'image' | 'video' | 'file'

/** 每种上传页各存一份偏好，互不影响 */
function storageKeyFor(kind: UploadMediaKind): string {
  return kind === 'image' ? STORAGE_KEY : `${STORAGE_KEY}.${kind}`
}

export interface UploadPreferences {
  compressEnabled: boolean
  autoCopyMarkdown: boolean
  copyFormat: CopyFormat
  clientWebpQuality: number
  uploadTagNames: string[]
  /** 视频床专属：上传后转码为 HLS（m3u8 + 分片） */
  transcodeToHls: boolean
}

const DEFAULTS: UploadPreferences = {
  compressEnabled: false,
  autoCopyMarkdown: false,
  copyFormat: 'markdown',
  clientWebpQuality: 80,
  uploadTagNames: [],
  transcodeToHls: false
}

export function normalizeUploadTagNames(value: string | readonly string[]): string[] {
  const parts = typeof value === 'string'
    ? value.split(/[,，\n]/)
    : value.flatMap(item => String(item).split(/[,，\n]/))
  return [...new Set(
    parts
      .map(name => name.trim())
      .filter(name => Boolean(name) && name.length <= 32)
  )]
}

function clampQuality(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return DEFAULTS.clientWebpQuality
  return Math.min(100, Math.max(1, Math.round(num)))
}

function isCopyFormat(value: unknown): value is CopyFormat {
  return value === 'url' || value === 'markdown' || value === 'html' || value === 'bbcode'
}

function readStored(kind: UploadMediaKind): UploadPreferences {
  if (import.meta.server) return { ...DEFAULTS }

  try {
    const raw = localStorage.getItem(storageKeyFor(kind))
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<UploadPreferences>
    return {
      compressEnabled: parsed.compressEnabled === true,
      autoCopyMarkdown: parsed.autoCopyMarkdown === true,
      copyFormat: isCopyFormat(parsed.copyFormat) ? parsed.copyFormat : DEFAULTS.copyFormat,
      clientWebpQuality: clampQuality(parsed.clientWebpQuality),
      /** 标签输入只在当前页面会话内生效，刷新后默认为空。 */
      uploadTagNames: [...DEFAULTS.uploadTagNames],
      transcodeToHls: parsed.transcodeToHls === true
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeStored(kind: UploadMediaKind, prefs: UploadPreferences) {
  if (import.meta.server) return
  localStorage.setItem(storageKeyFor(kind), JSON.stringify(prefs))
}

export function useUploadPreferences(kind: UploadMediaKind = 'image') {
  const compressEnabled = useState(`upload-pref-compress-${kind}`, () => DEFAULTS.compressEnabled)
  const autoCopyMarkdown = useState(`upload-pref-auto-md-${kind}`, () => DEFAULTS.autoCopyMarkdown)
  const copyFormat = useState<CopyFormat>(`upload-pref-copy-format-${kind}`, () => DEFAULTS.copyFormat)
  const clientWebpQuality = useState(`upload-pref-webp-quality-${kind}`, () => DEFAULTS.clientWebpQuality)
  const uploadTagNames = useState<string[]>(
    `upload-pref-tag-names-${kind}`,
    () => [...DEFAULTS.uploadTagNames]
  )
  const transcodeToHls = useState(`upload-pref-transcode-${kind}`, () => DEFAULTS.transcodeToHls)
  const loaded = useState(`upload-pref-loaded-${kind}`, () => false)

  function loadPreferences() {
    const firstLoad = !loaded.value
    const stored = readStored(kind)
    compressEnabled.value = stored.compressEnabled
    autoCopyMarkdown.value = stored.autoCopyMarkdown
    copyFormat.value = stored.copyFormat
    clientWebpQuality.value = stored.clientWebpQuality
    if (firstLoad) {
      uploadTagNames.value = [...stored.uploadTagNames]
    }
    transcodeToHls.value = stored.transcodeToHls
    loaded.value = true
  }

  if (import.meta.client && !loaded.value) {
    loadPreferences()
  }

  function savePreferences() {
    writeStored(kind, {
      compressEnabled: compressEnabled.value,
      autoCopyMarkdown: autoCopyMarkdown.value,
      copyFormat: copyFormat.value,
      clientWebpQuality: clampQuality(clientWebpQuality.value),
      uploadTagNames: [...DEFAULTS.uploadTagNames],
      transcodeToHls: transcodeToHls.value
    })
  }

  function resetToDefaults() {
    compressEnabled.value = DEFAULTS.compressEnabled
    autoCopyMarkdown.value = DEFAULTS.autoCopyMarkdown
    copyFormat.value = DEFAULTS.copyFormat
    clientWebpQuality.value = DEFAULTS.clientWebpQuality
    uploadTagNames.value = [...DEFAULTS.uploadTagNames]
    transcodeToHls.value = DEFAULTS.transcodeToHls
    savePreferences()
  }

  watch(
    [compressEnabled, autoCopyMarkdown, copyFormat, clientWebpQuality, transcodeToHls],
    () => {
      if (loaded.value) {
        savePreferences()
      }
    }
  )

  return {
    kind,
    compressEnabled,
    autoCopyMarkdown,
    copyFormat,
    clientWebpQuality,
    uploadTagNames,
    transcodeToHls,
    loaded,
    loadPreferences,
    savePreferences,
    resetToDefaults
  }
}
