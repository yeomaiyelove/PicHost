<script setup lang="ts">
import type { FileItem } from '~/types/file'
import type { CopyFormat } from '~/composables/useUploadPreferences'

const props = withDefaults(defineProps<{
  open: boolean
  item: FileItem | null
  /** 已按访问模式拼接好的视频直链 */
  link: string
  /** 缩略图直链 */
  thumbLink: string
  /** 原始视频下载地址 */
  downloadLink: string
  deleting?: boolean
  allowDelete?: boolean
}>(), {
  allowDelete: true
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'delete': []
  'download': []
}>()

const toast = useToast()
const { formatFileSize } = useFileSize()
const { t, locale } = useI18n()
const transcodeFailureLabel = useTranscodeFailureLabel()
const { copyFormat } = useUploadPreferences('video')

const videoEl = ref<HTMLVideoElement | null>(null)
const copyingUrl = ref(false)
const embedFormat = ref<CopyFormat>('url')

let hlsInstance: { destroy: () => void } | null = null

const embedFormatItems = computed(() => [
  { label: t('copy.url'), value: 'url' as const },
  { label: t('copy.markdown'), value: 'markdown' as const },
  { label: t('copy.html'), value: 'html' as const },
  { label: t('copy.bbcode'), value: 'bbcode' as const }
])

/** 转码完成后按 HLS 播放列表展示 */
const displayName = computed(() => {
  const item = props.item
  if (!item) return '—'
  if (!item.hlsUrl) return item.originalName
  const dot = item.originalName.lastIndexOf('.')
  const base = dot > 0 ? item.originalName.slice(0, dot) : item.originalName
  return `${base}.m3u8`
})

const uploadedLabel = computed(() => {
  const item = props.item
  if (!item) return '—'
  try {
    return new Date(item.uploadedAt).toLocaleString(locale.value, { hour12: false })
  } catch {
    return item.uploadedAt
  }
})

const sizeLabel = computed(() => {
  const item = props.item
  if (!item) return '—'
  return t('image.previewSizeDetail', {
    size: formatFileSize(item.size),
    bytes: item.size.toLocaleString(locale.value)
  })
})

const transcodeLabel = computed(() => {
  const item = props.item
  if (!item) return '—'
  switch (item.transcodeStatus) {
    case 'pending':
      return t('library.transcodePending')
    case 'running':
      return `${t('library.transcoding')} ${item.transcodeProgress ?? 0}%`
    case 'done':
      return t('library.video.transcodeDone')
    case 'failed':
      return transcodeFailureLabel(item.transcodeError)
    default:
      return t('library.video.transcodeNone')
  }
})

/** 转码完成后条目实际代表 HLS，路径与类型都按播放列表展示 */
const storagePath = computed(() => props.item?.hlsKey ?? props.item?.key ?? '—')
const contentTypeLabel = computed(() =>
  props.item?.hlsKey ? 'application/vnd.apple.mpegurl' : props.item?.contentType ?? '—'
)

const previewValue = computed(() => {
  if (!props.item) return ''
  switch (embedFormat.value) {
    case 'markdown':
      return `[${displayName.value}](${props.link})`
    case 'html':
      return `<a href="${props.link}">${displayName.value}</a>`
    case 'bbcode':
      return `[url=${props.link}]${displayName.value}[/url]`
    default:
      return props.link
  }
})

const copySuccessTitle = computed(() => {
  switch (embedFormat.value) {
    case 'markdown':
      return t('copy.copiedMarkdown')
    case 'html':
      return t('copy.copiedHtml')
    case 'bbcode':
      return t('copy.copiedBbcode')
    default:
      return t('copy.copiedUrl')
  }
})

const storageIcon = computed(() =>
  props.item?.storage?.type === 'local' ? 'i-lucide-hard-drive' : 'i-lucide-cloud'
)

const uploadSourceTag = computed(() => {
  switch (props.item?.uploadSource) {
    case 'web':
      return t('stats.tagWeb')
    case 'api':
      return t('stats.tagApi')
    default:
      return null
  }
})

const uploadSourceIcon = computed(() => {
  switch (props.item?.uploadSource) {
    case 'web':
      return 'i-lucide-globe'
    case 'api':
      return 'i-lucide-code-xml'
    default:
      return null
  }
})

function destroyPlayer() {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
  if (videoEl.value) {
    videoEl.value.removeAttribute('src')
    videoEl.value.load()
  }
}

async function attachPlayerSource() {
  const item = props.item
  const element = videoEl.value
  if (!item || !element) return

  element.src = props.link
  if (!item.hlsUrl || element.canPlayType('application/vnd.apple.mpegurl')) return

  const { default: Hls } = await import('hls.js')
  if (!Hls.isSupported()) return

  const hls = new Hls()
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return
    // 切片缺失（例如从备份恢复）时回退播放原视频
    hls.destroy()
    hlsInstance = null
    element.src = props.downloadLink
  })
  hls.loadSource(props.link)
  hls.attachMedia(element)
  hlsInstance = hls
}

watch(() => props.open, async (open) => {
  if (!open) {
    destroyPlayer()
    return
  }
  embedFormat.value = copyFormat.value
  await nextTick()
  await attachPlayerSource()
})

onUnmounted(destroyPlayer)

function selectEmbedFormat(value: CopyFormat) {
  embedFormat.value = value
  copyFormat.value = value
}

async function copyText(text: string, successTitle: string) {
  if (!text) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      toast.add({ title: successTitle, color: 'success' })
      return
    }
  } catch {
    // 回退方案见下
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  } finally {
    document.body.removeChild(textarea)
  }

  toast.add({
    title: ok ? successTitle : t('copy.failedManual'),
    color: ok ? 'success' : 'error'
  })
}

async function copyLink() {
  if (!props.link || copyingUrl.value) return
  copyingUrl.value = true
  try {
    await copyText(props.link, t('copy.copiedUrl'))
  } finally {
    copyingUrl.value = false
  }
}

function openInNewTab() {
  if (!props.link) return
  window.open(props.link, '_blank', 'noopener,noreferrer')
}

function downloadOriginal() {
  if (!props.downloadLink) return
  const link = document.createElement('a')
  link.href = props.downloadLink
  link.download = props.item?.originalName || 'video'
  link.rel = 'noopener'
  link.click()
}
</script>

<template>
  <UModal
    :open="open && !!item"
    :title="t('library.video.previewTitle')"
    :description="t('library.video.previewSubtitle')"
    :ui="{ content: 'max-w-5xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template
      v-if="item"
      #body
    >
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div class="flex items-center justify-center overflow-hidden rounded-xl border border-default bg-black p-2">
          <video
            ref="videoEl"
            controls
            autoplay
            playsinline
            class="max-h-[min(60vh,24rem)] w-full rounded-lg bg-black"
          />
        </div>

        <div class="flex min-w-0 flex-col gap-5">
          <dl class="divide-y divide-default text-sm">
            <div class="flex gap-4 py-2.5 first:pt-0">
              <dt class="w-20 shrink-0 text-muted">
                {{ t('image.previewOriginalName') }}
              </dt>
              <dd class="min-w-0 flex-1 break-all font-medium">
                {{ displayName }}
              </dd>
            </div>
            <div class="flex gap-4 py-2.5">
              <dt class="w-20 shrink-0 text-muted">
                {{ t('image.previewUploadedAt') }}
              </dt>
              <dd class="min-w-0 flex-1">
                {{ uploadedLabel }}
              </dd>
            </div>
            <div class="flex gap-4 py-2.5">
              <dt class="w-20 shrink-0 text-muted">
                {{ t('image.previewSize') }}
              </dt>
              <dd class="min-w-0 flex-1">
                {{ sizeLabel }}
              </dd>
            </div>
            <div class="flex gap-4 py-2.5">
              <dt class="w-20 shrink-0 text-muted">
                {{ t('image.previewContentType') }}
              </dt>
              <dd class="min-w-0 flex-1">
                {{ contentTypeLabel }}
              </dd>
            </div>
            <div class="flex gap-4 py-2.5">
              <dt class="w-20 shrink-0 text-muted">
                {{ t('library.video.previewTranscode') }}
              </dt>
              <dd class="min-w-0 flex-1">
                <UBadge
                  :color="item.hlsUrl ? 'success' : item.transcodeStatus === 'failed' ? 'error' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ transcodeLabel }}
                </UBadge>
              </dd>
            </div>
            <div
              v-if="item.storage"
              class="flex gap-4 py-2.5"
            >
              <dt class="w-20 shrink-0 text-muted">
                {{ t('image.previewStorage') }}
              </dt>
              <dd class="min-w-0 flex-1">
                <span class="inline-flex items-center gap-1.5">
                  <UIcon
                    :name="storageIcon"
                    class="size-3.5 shrink-0 text-muted"
                  />
                  {{ item.storage.name }}
                </span>
              </dd>
            </div>
            <div
              v-if="uploadSourceTag"
              class="flex gap-4 py-2.5"
            >
              <dt class="w-20 shrink-0 text-muted">
                {{ t('image.previewUploadSource') }}
              </dt>
              <dd class="min-w-0 flex-1">
                <span
                  v-if="uploadSourceIcon"
                  class="inline-flex items-center gap-1 rounded-md border border-default px-2 py-0.5 text-xs text-muted"
                >
                  <UIcon
                    :name="uploadSourceIcon"
                    class="size-3 shrink-0"
                  />
                  {{ uploadSourceTag }}
                </span>
              </dd>
            </div>
            <div
              v-if="item.owner"
              class="flex gap-4 py-2.5"
            >
              <dt class="w-20 shrink-0 text-muted">
                {{ t('image.previewOwner') }}
              </dt>
              <dd class="min-w-0 flex-1">
                {{ item.owner.username }}
              </dd>
            </div>
            <div class="flex gap-4 py-2.5">
              <dt class="w-20 shrink-0 text-muted">
                {{ t('tags.column') }}
              </dt>
              <dd class="min-w-0 flex-1">
                <div
                  v-if="item.tags?.length"
                  class="flex flex-wrap gap-1.5"
                >
                  <TagBadge
                    v-for="tag in item.tags"
                    :key="tag.id"
                    :tag="tag"
                  />
                </div>
                <span
                  v-else
                  class="inline-flex rounded-md border border-dashed border-default px-2 py-0.5 text-xs text-muted"
                >
                  {{ t('tags.unlabeled') }}
                </span>
              </dd>
            </div>
            <div class="flex gap-4 py-2.5 last:pb-0">
              <dt class="w-20 shrink-0 text-muted">
                {{ t('library.video.previewKey') }}
              </dt>
              <dd class="flex min-w-0 flex-1 items-start gap-2">
                <span class="min-w-0 flex-1 break-all font-mono text-xs text-dimmed">
                  {{ storagePath }}
                </span>
                <CopyButton
                  icon="i-lucide-copy"
                  icon-only
                  variant="ghost"
                  color="neutral"
                  class="shrink-0"
                  :label="t('common.copy')"
                  :value="storagePath"
                  :success-title="t('copy.copied')"
                />
              </dd>
            </div>
          </dl>

          <div class="border-t border-default pt-4">
            <p class="mb-2.5 text-sm font-medium">
              {{ t('image.previewLinks') }}
            </p>
            <div class="flex gap-1 rounded-lg border border-default bg-default p-0.5">
              <UButton
                v-for="option in embedFormatItems"
                :key="option.value"
                size="xs"
                class="flex-1 justify-center"
                :variant="embedFormat === option.value ? 'solid' : 'ghost'"
                :color="embedFormat === option.value ? 'primary' : 'neutral'"
                :label="option.label"
                @click="selectEmbedFormat(option.value)"
              />
            </div>
            <div class="mt-2 flex items-center gap-2">
              <UInput
                :model-value="previewValue"
                readonly
                size="sm"
                class="min-w-0 flex-1 font-mono text-xs"
              />
              <CopyButton
                :label="t('common.copy')"
                :value="previewValue"
                :success-title="copySuccessTitle"
              />
            </div>

            <div
              v-if="thumbLink"
              class="mt-3"
            >
              <p class="mb-1.5 text-xs text-muted">
                {{ t('library.video.previewThumbLink') }}
              </p>
              <div class="flex items-center gap-2">
                <UInput
                  :model-value="thumbLink"
                  readonly
                  size="sm"
                  class="min-w-0 flex-1 font-mono text-xs"
                />
                <CopyButton
                  :label="t('common.copy')"
                  :value="thumbLink"
                  :success-title="t('copy.copiedUrl')"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template
      v-if="item"
      #footer
    >
      <div class="flex w-full flex-wrap justify-end gap-1.5">
        <UButton
          :label="t('image.previewOpen')"
          icon="i-lucide-external-link"
          color="neutral"
          variant="outline"
          size="sm"
          @click="openInNewTab"
        />
        <UButton
          v-if="!item.sourceDeleted"
          :label="t('image.previewDownload')"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          size="sm"
          @click="downloadOriginal"
        />
        <UButton
          v-else-if="item.hlsUrl"
          :label="t('library.video.downloadMp4')"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          size="sm"
          @click="emit('download')"
        />
        <UButton
          :label="t('image.previewCopyLink')"
          icon="i-lucide-link"
          color="primary"
          size="sm"
          :loading="copyingUrl"
          @click="copyLink"
        />
        <UButton
          v-if="allowDelete"
          :label="t('common.delete')"
          icon="i-lucide-trash-2"
          color="error"
          variant="outline"
          size="sm"
          :loading="deleting"
          @click="emit('delete')"
        />
      </div>
    </template>
  </UModal>
</template>
