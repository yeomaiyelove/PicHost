import type { UploadProgressItem } from '~/types/image'
import type { FileItem, FileListResponse, FileUploadResponse } from '~/types/file'
import type { CopyFormat, UploadMediaKind } from './useUploadPreferences'
import { isUnauthorizedError } from './useAuth'
import { normalizeUploadTagNames } from './useUploadPreferences'

const MAX_FILES = 10

function buildCopyText(item: FileItem, format: CopyFormat): string {
  switch (format) {
    case 'url':
      return item.url
    case 'html':
      return `<a href="${item.url}">${item.originalName}</a>`
    case 'bbcode':
      return `[url=${item.url}]${item.originalName}[/url]`
    default:
      return `[${item.originalName}](${item.url})`
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 内网 http:// 等非安全上下文继续走回退方案
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/** 视频床 / 文件床的上传：走文件床接口，偏好按类型独立 */
export function useMediaUpload(kind: UploadMediaKind) {
  const toast = useToast()
  const { t } = useI18n()
  const {
    load: loadUploadPolicy
  } = useUploadPolicy()
  const {
    autoCopyMarkdown,
    copyFormat,
    transcodeToHls,
    uploadTagNames,
    loadPreferences
  } = useUploadPreferences(kind)

  const uploading = ref(false)
  const progressItems = ref<UploadProgressItem[]>([])
  const lastResult = ref<FileUploadResponse | null>(null)
  /** 本次会话内上传的条目，页面刷新后清空 */
  const sessionItems = ref<FileItem[]>([])
  const accessMode = ref<'public' | 'token'>('public')
  const apiToken = ref('')

  const endpoint = kind === 'video' ? '/api/videos/upload' : '/api/files/upload'

  loadPreferences()

  async function loadApiToken() {
    try {
      const data = await $fetch<{ apiUploadToken: string }>('/api/user/api-token', {
        credentials: 'include'
      })
      apiToken.value = data.apiUploadToken ?? ''
    } catch {
      apiToken.value = ''
    }
  }

  /** Token 模式下复制出的链接需要带上令牌 */
  function linkUrl(item: FileItem): string {
    // 转码完成后优先给出 m3u8 播放地址
    const base = item.hlsUrl ?? item.url
    if (accessMode.value !== 'token' || !apiToken.value) return base
    const separator = base.includes('?') ? '&' : '?'
    return `${base}${separator}token=${encodeURIComponent(apiToken.value)}`
  }

  /** 封面缩略图地址（同样按访问模式拼接） */
  function thumbLink(item: FileItem): string {
    const base = item.thumbUrl
    if (!base) return '/video-placeholder.svg'
    if (accessMode.value !== 'token' || !apiToken.value) return base
    const separator = base.includes('?') ? '&' : '?'
    return `${base}${separator}token=${encodeURIComponent(apiToken.value)}`
  }

  let statusTimer: ReturnType<typeof setInterval> | null = null

  function stopStatusPolling() {
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
  }

  function hasPendingTranscode(): boolean {
    return sessionItems.value.some(
      item => item.transcodeStatus === 'pending' || item.transcodeStatus === 'running'
    )
  }

  /** 转码是异步的，轮询列表把状态与 m3u8 地址同步回来 */
  async function refreshTranscodeStatus() {
    if (!hasPendingTranscode()) {
      stopStatusPolling()
      return
    }

    try {
      const [active, finished] = await Promise.all([
        $fetch<FileListResponse>('/api/files', {
          credentials: 'include',
          query: { kind: 'video', limit: 100, processing: '1' }
        }),
        $fetch<FileListResponse>('/api/files', {
          credentials: 'include',
          query: { kind: 'video', limit: 100 }
        })
      ])
      const latest = new Map(
        [...active.items, ...finished.items].map(item => [item.key, item])
      )
      sessionItems.value = sessionItems.value.map(item => latest.get(item.key) ?? item)
    } catch {
      // 轮询失败保持现状，下个周期重试
    }

    if (!hasPendingTranscode()) stopStatusPolling()
  }

  function startStatusPolling() {
    if (kind !== 'video' || statusTimer) return
    statusTimer = setInterval(() => {
      void refreshTranscodeStatus()
    }, 1000)
  }

  onUnmounted(stopStatusPolling)

  /** 刷新或换页后仍要显示还在排队/转码中的视频 */
  async function loadActiveTranscodes() {
    if (kind !== 'video') return

    try {
      const response = await $fetch<FileListResponse>('/api/files', {
        credentials: 'include',
        query: { kind: 'video', limit: 100, processing: '1' }
      })
      if (!response.items.length) return

      const known = new Set(sessionItems.value.map(item => item.key))
      const missing = response.items.filter(item => !known.has(item.key))
      const latest = new Map(response.items.map(item => [item.key, item]))

      sessionItems.value = [
        ...missing,
        ...sessionItems.value.map(item => latest.get(item.key) ?? item)
      ]
      startStatusPolling()
    } catch {
      // 拉取失败时保持现状
    }
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || uploading.value) return

    const currentPolicy = await loadUploadPolicy().catch(() => null)
    const acceptedFiles = files.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (
        kind === 'video'
        && currentPolicy
        && !currentPolicy.allowedVideoExtensions.includes(extension)
      ) {
        toast.add({
          title: `${file.name}：${t('files.videoFormatBlocked', {
            format: extension ? extension.toUpperCase() : '—'
          })}`,
          color: 'error'
        })
        return false
      }
      if (
        kind === 'file'
        && currentPolicy?.forbiddenFileExtensions.includes(extension)
      ) {
        toast.add({
          title: `${file.name}：${t('files.fileFormatBlocked', {
            format: extension.toUpperCase()
          })}`,
          color: 'error'
        })
        return false
      }
      const maxFileSizeMb = kind === 'video'
        ? (currentPolicy?.videoMaxFileSizeMb ?? 500)
        : (currentPolicy?.fileMaxFileSizeMb ?? 100)
      if (file.size > maxFileSizeMb * 1024 * 1024) {
        toast.add({
          title: t('files.fileTooLarge', {
            name: file.name,
            limit: maxFileSizeMb
          }),
          color: 'error'
        })
        return false
      }
      return true
    })
    if (!acceptedFiles.length) return

    if (acceptedFiles.length > MAX_FILES) {
      toast.add({ title: t('files.maxFiles', { n: MAX_FILES }), color: 'warning' })
      return
    }

    uploading.value = true
    progressItems.value = acceptedFiles.map(file => ({
      name: file.name,
      status: 'pending',
      progress: 0
    }))

    try {
      const formData = new FormData()
      for (const file of acceptedFiles) {
        formData.append('files', file, file.name)
      }

      if (kind === 'video' && transcodeToHls.value) {
        formData.append('transcode', '1')
      }
      const tagNames = normalizeUploadTagNames(uploadTagNames.value).join(',')
      if (tagNames) {
        formData.append('tagNames', tagNames)
      }

      progressItems.value = progressItems.value.map(item => ({
        ...item,
        status: 'uploading',
        progress: 50
      }))

      const response = await $fetch<FileUploadResponse>(endpoint, {
        method: 'POST',
        body: formData
      })

      lastResult.value = response
      accessMode.value = response.accessMode
      if (response.accessMode === 'token' && !apiToken.value) {
        await loadApiToken()
      }

      progressItems.value = acceptedFiles.map((file) => {
        const failed = response.errors.find(error => error.name === file.name)
        return {
          name: file.name,
          status: failed ? 'error' : 'success',
          progress: 100,
          error: failed?.error.message
        }
      })

      if (response.items.length) {
        const wantsTranscode = kind === 'video' && transcodeToHls.value
        const uploaded = wantsTranscode
          ? response.items.map(item => ({ ...item, transcodeStatus: 'pending' as const }))
          : response.items

        sessionItems.value = [...uploaded, ...sessionItems.value]
        if (wantsTranscode) startStatusPolling()

        toast.add({
          title: t('files.uploadSuccess', { n: response.items.length }),
          color: 'success'
        })

        const first = response.items[0]
        if (autoCopyMarkdown.value && first) {
          const text = buildCopyText(first, copyFormat.value)
          if (text && await copyToClipboard(text)) {
            toast.add({ title: t('copy.copied'), color: 'success' })
          }
        }
      }

      for (const failure of response.errors.slice(0, 3)) {
        toast.add({
          title: `${failure.name}：${failure.error.message}`,
          color: 'error'
        })
      }

      return response
    } catch (error: unknown) {
      if (!isUnauthorizedError(error)) {
        progressItems.value = progressItems.value.map(item => ({
          ...item,
          status: 'error',
          progress: 100,
          error: t('files.uploadFailed')
        }))
        toast.add({ title: t('files.uploadFailed'), color: 'error' })
      }
      throw error
    } finally {
      uploading.value = false
    }
  }

  return {
    uploading,
    progressItems,
    lastResult,
    sessionItems,
    accessMode,
    linkUrl,
    thumbLink,
    loadActiveTranscodes,
    uploadFiles
  }
}
