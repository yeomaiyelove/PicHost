<script setup lang="ts">
import type { UploadMediaKind } from '~/composables/useUploadPreferences'

const props = withDefaults(defineProps<{
  disabled?: boolean
  /** 上传页类型：决定默认可选文件类型、粘贴支持与偏好面板内容 */
  kind?: UploadMediaKind
  title?: string
  hint?: string
  formats?: string
  accept?: string
  heroImage?: string
  backgroundImage?: string
  pasteEnabled?: boolean
}>(), {
  kind: 'image'
})

const emit = defineEmits<{
  upload: [files: File[]]
}>()

const flipped = ref(false)

const mediaKind = computed(() => (props.kind === 'file' ? 'any' : props.kind))
const pasteEnabled = computed(() => props.pasteEnabled ?? props.kind === 'image')
const defaultAccept = computed(() => {
  if (props.kind === 'video') return 'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v'
  if (props.kind === 'file') return ''
  return undefined
})
const accept = computed(() => props.accept ?? defaultAccept.value)

function onOpenSettings() {
  flipped.value = true
}

function onBack() {
  flipped.value = false
}
</script>

<template>
  <div
    class="upload-card-flip"
    :class="[`upload-card-flip--${kind}`, { 'is-flipped': flipped }]"
  >
    <div class="upload-card-flip-inner">
      <div class="upload-card-face upload-card-face--front">
        <UploadCard
          :disabled="disabled"
          :title="title"
          :hint="hint"
          :formats="formats"
          :accept="accept"
          :hero-image="heroImage"
          :background-image="backgroundImage"
          :media-kind="mediaKind"
          :paste-enabled="pasteEnabled"
          @upload="emit('upload', $event)"
          @open-settings="onOpenSettings"
        />
      </div>
      <div class="upload-card-face upload-card-face--back">
        <UploadPreferencesPanel
          :kind="kind"
          @back="onBack"
        />
      </div>
    </div>
  </div>
</template>
