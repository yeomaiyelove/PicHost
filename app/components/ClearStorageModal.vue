<script setup lang="ts">
const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'cleared': []
}>()

const { t } = useI18n()
const toast = useToast()
const step = ref<'warning' | 'confirm'>('warning')
const confirmation = ref('')
const clearing = ref(false)

const canConfirm = computed(() =>
  !clearing.value && confirmation.value.trim() === t('storage.clearStoragePhrase')
)

watch(() => props.open, (open) => {
  if (open) {
    step.value = 'warning'
    confirmation.value = ''
    clearing.value = false
  }
})

function close() {
  if (clearing.value) return
  emit('update:open', false)
}

function goToConfirm() {
  step.value = 'confirm'
}

function clearBrowserCache() {
  const keys = [
    'pichost.upload-preferences',
    'pichost.upload-preferences.video',
    'pichost.upload-preferences.file',
    'pichost.recent-tag-ids',
    'pichost.library-view.image',
    'pichost.library-view.video',
    'pichost.library-view.file'
  ]
  for (const key of keys) localStorage.removeItem(key)
}

async function confirmClear() {
  if (!canConfirm.value) return
  clearing.value = true
  try {
    const result = await $fetch<{
      deletedMedia: number
      deletedObjects: number
      clearedCacheDirs: number
      failed: Array<{ key: string }>
    }>('/api/user/storage/purge', {
      method: 'POST',
      credentials: 'include',
      body: { confirmation: confirmation.value.trim() }
    })

    clearBrowserCache()
    emit('cleared')

    if (result.failed.length) {
      toast.add({
        title: t('storage.clearStoragePartial', {
          failed: result.failed.length,
          total: result.deletedMedia + result.failed.length
        }),
        color: 'warning'
      })
    } else {
      toast.add({
        title: t('storage.clearStorageSuccess', {
          files: result.deletedObjects,
          cache: result.clearedCacheDirs
        }),
        color: 'success'
      })
    }
    emit('update:open', false)
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
      : undefined
    toast.add({
      title: message || t('storage.clearStorageFailed'),
      color: 'error'
    })
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="step === 'warning' ? t('storage.clearStorageTitle') : t('storage.clearStorageFinalTitle')"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <template v-if="step === 'warning'">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-octagon-alert"
          :description="t('storage.clearStorageWarning')"
        />
        <p class="mt-3 text-sm text-muted">
          {{ t('storage.clearStorageScope') }}
        </p>
      </template>

      <template v-else>
        <p class="text-sm leading-6 text-muted">
          {{ t('storage.clearStorageInstruction') }}
        </p>
        <UInput
          v-model="confirmation"
          class="mt-3 w-full"
          :placeholder="t('storage.clearStoragePlaceholder')"
          autofocus
        />
      </template>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="outline"
          :disabled="clearing"
          @click="close"
        />
        <UButton
          v-if="step === 'warning'"
          :label="t('common.continue')"
          color="error"
          @click="goToConfirm"
        />
        <UButton
          v-else
          :label="t('storage.clearStorageConfirm')"
          color="error"
          :loading="clearing"
          :disabled="!canConfirm"
          @click="confirmClear"
        />
      </div>
    </template>
  </UModal>
</template>
