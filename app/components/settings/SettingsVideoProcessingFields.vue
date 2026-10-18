<script setup lang="ts">
const { transcodeToHls, loadPreferences } = useUploadPreferences('video')
const { t } = useI18n()
const {
  lowMemory,
  memoryBytes,
  load: loadTranscodeSettings
} = useTranscodeSettings()

const memoryGb = computed(() => (
  memoryBytes.value > 0
    ? (memoryBytes.value / (1024 * 1024 * 1024)).toFixed(1)
    : '—'
))

onMounted(() => {
  loadPreferences()
  void loadTranscodeSettings()
})
</script>

<template>
  <UAlert
    v-if="lowMemory"
    color="warning"
    variant="subtle"
    icon="i-lucide-triangle-alert"
    :title="t('preferences.lowMemoryTranscodeTitle')"
    :description="t('preferences.lowMemoryTranscodeHint', { memory: memoryGb })"
    class="my-4"
  />
  <SettingsToggleRow
    v-model="transcodeToHls"
    :title="t('preferences.transcodeToHls')"
    :hint="t('preferences.transcodeToHlsHint')"
  />
  <div
    v-if="transcodeToHls"
    class="border-t border-default/50 py-4"
  >
    <TranscodeSettingsControls />
  </div>
</template>
