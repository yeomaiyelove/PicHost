<script setup lang="ts">
const props = defineProps<{
  open: boolean
  keys: string[]
  scope: 'image' | 'video' | 'file'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const { startSiteSync } = useBackup()

const targetBaseUrl = ref('')
const token = ref('')
const conflictMode = ref<'skip' | 'overwrite'>('skip')
const busy = ref(false)

const canSubmit = computed(() =>
  !busy.value
  && props.keys.length > 0
  && Boolean(targetBaseUrl.value.trim())
  && Boolean(token.value.trim())
)

function setConflict(mode: 'skip' | 'overwrite') {
  conflictMode.value = mode
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  try {
    await startSiteSync({
      targetBaseUrl: targetBaseUrl.value.trim(),
      token: token.value.trim(),
      conflictMode: conflictMode.value,
      direction: 'push',
      scope: props.scope,
      keys: props.keys
    })
    emit('update:open', false)
  } catch {
    // useBackup 已提示错误
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('storage.backup.syncSelectedTitle')"
    :description="t('storage.backup.syncSelectedSubtitle', { n: keys.length })"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-3">
        <div class="space-y-1.5">
          <label class="text-xs text-muted">{{ t('storage.backup.siteSyncTarget') }}</label>
          <UInput
            v-model="targetBaseUrl"
            placeholder="https://target.example.com"
            size="sm"
            class="w-full"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs text-muted">{{ t('storage.backup.siteSyncToken') }}</label>
          <UInput
            v-model="token"
            type="password"
            :placeholder="t('storage.backup.siteSyncTokenPlaceholder')"
            size="sm"
            class="w-full"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted">{{ t('storage.backup.siteSyncConflict') }}</span>
          <UButton
            size="xs"
            :variant="conflictMode === 'skip' ? 'solid' : 'ghost'"
            :color="conflictMode === 'skip' ? 'primary' : 'neutral'"
            :label="t('storage.backup.siteSyncSkip')"
            @click="setConflict('skip')"
          />
          <UButton
            size="xs"
            :variant="conflictMode === 'overwrite' ? 'solid' : 'ghost'"
            :color="conflictMode === 'overwrite' ? 'primary' : 'neutral'"
            :label="t('storage.backup.siteSyncOverwrite')"
            @click="setConflict('overwrite')"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="outline"
          @click="emit('update:open', false)"
        />
        <UButton
          :label="t('storage.backup.syncSelectedStart')"
          icon="i-lucide-cloud-upload"
          color="primary"
          :loading="busy"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
