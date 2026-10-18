<script setup lang="ts">
const { t } = useI18n()
const { isAdmin } = useAuth()
const {
  concurrency,
  threads,
  maxConcurrency,
  maxThreads,
  preset,
  bitratePercent,
  minBitratePercent,
  maxBitratePercent,
  load
} = useTranscodeSettings()

const presetItems = computed(() => [
  { value: 'copy', label: t('preferences.presetCopy') },
  { value: 'veryfast', label: t('preferences.presetSpeed') },
  { value: 'medium', label: t('preferences.presetBalanced') },
  { value: 'slow', label: t('preferences.presetQuality') },
  { value: 'compress', label: t('preferences.presetCompress') }
])

function onBitrateInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  bitratePercent.value = Number.isFinite(value) ? value : 80
}

function selectPreset(value: string) {
  preset.value = value
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2 text-sm">
      <span class="shrink-0">{{ t('preferences.transcodeConcurrency') }}</span>
      <UInput
        v-model.number="concurrency"
        type="number"
        min="1"
        :max="maxConcurrency"
        size="xs"
        class="w-16 tabular-nums"
        :disabled="!isAdmin"
      />
      <span class="text-muted">{{ t('preferences.unitCount') }}</span>
      <span class="text-xs text-muted">{{ t('preferences.concurrentHint') }}</span>
    </div>

    <div class="flex items-center gap-2 text-sm">
      <span class="shrink-0">{{ t('preferences.transcodeThreads') }}</span>
      <UInput
        v-model.number="threads"
        type="number"
        min="1"
        :max="maxThreads"
        size="xs"
        class="w-16 tabular-nums"
        :disabled="!isAdmin"
      />
      <span class="text-muted">{{ t('preferences.unitCount') }}</span>
      <span class="text-xs text-muted">{{ t('preferences.threadsHint') }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="shrink-0">{{ t('preferences.transcodeQuality') }}</span>
      <div class="flex gap-1 rounded-lg border border-default p-0.5">
        <UButton
          v-for="item in presetItems"
          :key="item.value"
          size="xs"
          class="flex-1 justify-center"
          :variant="preset === item.value ? 'solid' : 'ghost'"
          :color="preset === item.value ? 'primary' : 'neutral'"
          :label="item.label"
          :disabled="!isAdmin"
          @click="selectPreset(item.value)"
        />
      </div>
    </div>

    <div
      class="flex items-center gap-2 text-sm"
      :class="preset === 'compress' ? '' : 'opacity-40'"
    >
      <span class="shrink-0">{{ t('preferences.compressBitrate') }}</span>
      <input
        type="range"
        :min="minBitratePercent"
        :max="maxBitratePercent"
        :value="bitratePercent"
        :disabled="!isAdmin || preset !== 'compress'"
        class="h-2 min-w-24 flex-1 cursor-pointer appearance-none rounded-full bg-default accent-primary disabled:opacity-40"
        @input="onBitrateInput"
      >
      <span class="w-12 shrink-0 text-right tabular-nums text-muted">
        {{ bitratePercent }}%
      </span>
    </div>
  </div>
</template>
