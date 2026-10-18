<script setup lang="ts">
const props = defineProps<{
  currentOrigin: string
  effectiveSiteUrl: string
}>()

const siteBaseUrl = defineModel<string>('siteBaseUrl', { required: true })
const imageBaseUrl = defineModel<string>('imageBaseUrl', { required: true })
const videoBaseUrl = defineModel<string>('videoBaseUrl', { required: true })
const fileBaseUrl = defineModel<string>('fileBaseUrl', { required: true })
const imageSeparated = defineModel<boolean>('imageSeparated', { required: true })
const videoSeparated = defineModel<boolean>('videoSeparated', { required: true })
const fileSeparated = defineModel<boolean>('fileSeparated', { required: true })

const { t } = useI18n()

function fillDetected(target: 'site' | 'image' | 'video' | 'file') {
  if (!props.currentOrigin) return
  if (target === 'site') siteBaseUrl.value = props.currentOrigin
  else if (target === 'image') imageBaseUrl.value = props.currentOrigin
  else if (target === 'video') videoBaseUrl.value = props.currentOrigin
  else fileBaseUrl.value = props.currentOrigin
}

function effectiveUrl(separated: boolean, configuredUrl: string): string {
  return separated
    ? configuredUrl.trim() || props.currentOrigin
    : siteBaseUrl.value.trim() || props.effectiveSiteUrl || props.currentOrigin
}
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <SettingsGroup>
      <div class="space-y-3 py-4 sm:pr-4">
        <p class="text-sm font-medium text-highlighted">
          {{ t('settings.siteBaseUrl') }}
        </p>
        <p class="text-xs leading-relaxed text-muted">
          {{ t('settings.siteBaseUrlRoleHint') }}
        </p>
        <div class="flex gap-2">
          <UInput
            v-model="siteBaseUrl"
            size="sm"
            :placeholder="t('settings.siteBaseUrlPlaceholder')"
            class="min-w-0 flex-1 font-mono"
          />
          <UButton
            v-if="currentOrigin"
            :label="t('settings.fillDetectedOrigin')"
            color="neutral"
            variant="outline"
            size="sm"
            class="shrink-0"
            @click="fillDetected('site')"
          />
        </div>
        <p class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted">
          {{ t('settings.siteBaseUrlActive', { url: effectiveSiteUrl || currentOrigin }) }}
        </p>
      </div>
    </SettingsGroup>

    <SettingsGroup>
      <div class="space-y-3 py-4 sm:pl-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">
            {{ t('settings.imageBaseUrl') }}
          </p>
          <USwitch v-model="imageSeparated" />
        </div>
        <p class="text-xs leading-relaxed text-muted">
          {{ t('settings.imageBaseUrlRoleHint') }}
        </p>
        <div
          class="flex gap-2"
          :class="imageSeparated ? '' : 'pointer-events-none opacity-50'"
        >
          <UInput
            v-model="imageBaseUrl"
            size="sm"
            :placeholder="t('settings.imageBaseUrlPlaceholder')"
            class="min-w-0 flex-1 font-mono"
          />
          <UButton
            v-if="currentOrigin"
            :label="t('settings.fillDetectedOrigin')"
            color="neutral"
            variant="outline"
            size="sm"
            class="shrink-0"
            @click="fillDetected('image')"
          />
        </div>
        <p class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted">
          {{ t('settings.imageBaseUrlActive', {
            url: effectiveUrl(imageSeparated, imageBaseUrl)
          }) }}
        </p>
      </div>
    </SettingsGroup>

    <SettingsGroup>
      <div class="space-y-3 py-4 sm:pr-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">
            {{ t('settings.videoBaseUrl') }}
          </p>
          <USwitch v-model="videoSeparated" />
        </div>
        <p class="text-xs leading-relaxed text-muted">
          {{ t('settings.videoBaseUrlRoleHint') }}
        </p>
        <div
          class="flex gap-2"
          :class="videoSeparated ? '' : 'pointer-events-none opacity-50'"
        >
          <UInput
            v-model="videoBaseUrl"
            size="sm"
            :placeholder="t('settings.videoBaseUrlPlaceholder')"
            class="min-w-0 flex-1 font-mono"
          />
          <UButton
            v-if="currentOrigin"
            :label="t('settings.fillDetectedOrigin')"
            color="neutral"
            variant="outline"
            size="sm"
            class="shrink-0"
            @click="fillDetected('video')"
          />
        </div>
        <p class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted">
          {{ t('settings.videoBaseUrlActive', {
            url: effectiveUrl(videoSeparated, videoBaseUrl)
          }) }}
        </p>
      </div>
    </SettingsGroup>

    <SettingsGroup>
      <div class="space-y-3 py-4 sm:pl-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">
            {{ t('settings.fileBaseUrl') }}
          </p>
          <USwitch v-model="fileSeparated" />
        </div>
        <p class="text-xs leading-relaxed text-muted">
          {{ t('settings.fileBaseUrlRoleHint') }}
        </p>
        <div
          class="flex gap-2"
          :class="fileSeparated ? '' : 'pointer-events-none opacity-50'"
        >
          <UInput
            v-model="fileBaseUrl"
            size="sm"
            :placeholder="t('settings.fileBaseUrlPlaceholder')"
            class="min-w-0 flex-1 font-mono"
          />
          <UButton
            v-if="currentOrigin"
            :label="t('settings.fillDetectedOrigin')"
            color="neutral"
            variant="outline"
            size="sm"
            class="shrink-0"
            @click="fillDetected('file')"
          />
        </div>
        <p class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted">
          {{ t('settings.fileBaseUrlActive', {
            url: effectiveUrl(fileSeparated, fileBaseUrl)
          }) }}
        </p>
      </div>
    </SettingsGroup>
  </div>
</template>
