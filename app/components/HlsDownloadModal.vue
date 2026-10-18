<script setup lang="ts">
import type { FileItem } from '~/types/file'

const props = defineProps<{
  open: boolean
  item: FileItem | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const toast = useToast()
const downloading = ref(false)

watch(() => props.open, (open) => {
  if (!open) downloading.value = false
})

async function confirmDownload() {
  const item = props.item
  if (!item?.hlsKey || downloading.value) return

  downloading.value = true
  try {
    const response = await fetch('/api/files/hls-mp4', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: item.key })
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as {
        error?: { message?: string }
      } | null
      throw new Error(payload?.error?.message || t('library.video.downloadMp4Failed'))
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const dot = item.originalName.lastIndexOf('.')
    const filename = `${dot > 0 ? item.originalName.slice(0, dot) : item.originalName}.mp4`
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    emit('update:open', false)
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : t('library.video.downloadMp4Failed'),
      color: 'error'
    })
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <UModal
    :open="open && !!item"
    :title="t('library.video.downloadMp4Title')"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <p class="text-sm leading-6 text-muted">
        {{ t('library.video.downloadMp4Confirm') }}
      </p>
      <p
        v-if="downloading"
        class="mt-3 text-sm text-primary"
      >
        {{ t('library.video.downloadMp4Working') }}
      </p>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="outline"
          :disabled="downloading"
          @click="emit('update:open', false)"
        />
        <UButton
          :label="t('common.continue')"
          color="primary"
          :loading="downloading"
          @click="confirmDownload"
        />
      </div>
    </template>
  </UModal>
</template>
