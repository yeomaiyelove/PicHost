<script setup lang="ts">
type PolicySource = 'env' | 'db' | 'default'
type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/svg+xml' | 'image/x-icon'
type VideoExtension = 'mp4' | 'm4v' | 'webm' | 'mov' | 'mkv' | 'avi' | 'flv' | 'wmv' | 'mpg' | 'mpeg'

const props = defineProps<{
  part: 'upload-preference' | 'image-processing' | 'login-rate'
  uploadImageMaxFileSizeMbSource?: PolicySource
  uploadVideoMaxFileSizeMbSource?: PolicySource
  uploadFileMaxFileSizeMbSource?: PolicySource
  allowedMimeTypesSource?: PolicySource
  allowedVideoExtensionsSource?: PolicySource
  forbiddenFileExtensionsSource?: PolicySource
  uploadRateIpMaxSource?: PolicySource
  uploadRateTokenMaxSource?: PolicySource
  uploadRateWindowMinutesSource?: PolicySource
  loginRateMaxSource?: PolicySource
  loginRateWindowMinutesSource?: PolicySource
  preserveOriginalUploadSource?: PolicySource
  mimeTypeOptions?: ReadonlyArray<{ mime: MimeType, label: string }>
  videoExtensionOptions?: ReadonlyArray<{ extension: VideoExtension, label: string }>
  forbiddenFileExtensionOptions?: ReadonlyArray<{ extension: string, label: string }>
}>()

const uploadImageMaxFileSizeMbDraft = defineModel<number>('uploadImageMaxFileSizeMb')
const uploadVideoMaxFileSizeMbDraft = defineModel<number>('uploadVideoMaxFileSizeMb')
const uploadFileMaxFileSizeMbDraft = defineModel<number>('uploadFileMaxFileSizeMb')
const allowedMimeTypesDraft = defineModel<MimeType[]>('allowedMimeTypes')
const allowedVideoExtensionsDraft = defineModel<VideoExtension[]>('allowedVideoExtensions')
const forbiddenFileExtensionsDraft = defineModel<string[]>('forbiddenFileExtensions')
const uploadRateIpMaxDraft = defineModel<number>('uploadRateIpMax')
const uploadRateTokenMaxDraft = defineModel<number>('uploadRateTokenMax')
const uploadRateWindowMinutesDraft = defineModel<number>('uploadRateWindowMinutes')
const loginRateMaxDraft = defineModel<number>('loginRateMax')
const loginRateWindowMinutesDraft = defineModel<number>('loginRateWindowMinutes')
const preserveOriginalUploadDraft = defineModel<boolean>('preserveOriginalUpload')
const customForbiddenExtension = ref('')

const { t } = useI18n()

function sourceBadge(source: PolicySource) {
  switch (source) {
    case 'env':
      return { label: t('settings.badgeEnv'), color: 'warning' as const }
    case 'db':
      return { label: t('settings.badgeSaved'), color: 'success' as const }
    default:
      return { label: t('settings.badgeDefault'), color: 'neutral' as const }
  }
}

function toggleMime(mime: MimeType, checked: boolean) {
  if (!allowedMimeTypesDraft.value) return
  if (checked) {
    if (!allowedMimeTypesDraft.value.includes(mime)) {
      allowedMimeTypesDraft.value = [...allowedMimeTypesDraft.value, mime]
    }
    return
  }
  if (allowedMimeTypesDraft.value.length <= 1) return
  allowedMimeTypesDraft.value = allowedMimeTypesDraft.value.filter(item => item !== mime)
}

function isMimeChecked(mime: MimeType): boolean {
  return allowedMimeTypesDraft.value?.includes(mime) ?? false
}

function toggleVideoExtension(extension: VideoExtension, checked: boolean) {
  if (!allowedVideoExtensionsDraft.value) return
  if (checked) {
    if (!allowedVideoExtensionsDraft.value.includes(extension)) {
      allowedVideoExtensionsDraft.value = [
        ...allowedVideoExtensionsDraft.value,
        extension
      ]
    }
    return
  }
  if (allowedVideoExtensionsDraft.value.length <= 1) return
  allowedVideoExtensionsDraft.value = allowedVideoExtensionsDraft.value
    .filter(item => item !== extension)
}

function isVideoExtensionChecked(extension: VideoExtension): boolean {
  return allowedVideoExtensionsDraft.value?.includes(extension) ?? false
}

function toggleForbiddenExtension(extension: string, checked: boolean) {
  if (!forbiddenFileExtensionsDraft.value) return
  if (checked) {
    if (!forbiddenFileExtensionsDraft.value.includes(extension)) {
      forbiddenFileExtensionsDraft.value = [
        ...forbiddenFileExtensionsDraft.value,
        extension
      ]
    }
    return
  }
  forbiddenFileExtensionsDraft.value = forbiddenFileExtensionsDraft.value
    .filter(item => item !== extension)
}

function isForbiddenExtensionChecked(extension: string): boolean {
  return forbiddenFileExtensionsDraft.value?.includes(extension) ?? false
}

const allForbiddenExtensionOptions = computed(() => {
  const options = new Map(
    (props.forbiddenFileExtensionOptions ?? []).map(option => [
      option.extension,
      option.label
    ])
  )
  for (const extension of forbiddenFileExtensionsDraft.value ?? []) {
    if (!options.has(extension)) options.set(extension, extension.toUpperCase())
  }
  return [...options].map(([extension, label]) => ({ extension, label }))
})

function addCustomForbiddenExtension() {
  const values = customForbiddenExtension.value
    .split(',')
    .map(value => value.trim().toLowerCase().replace(/^\.+/, ''))
    .filter(value => /^[a-z0-9][a-z0-9_-]{0,15}$/.test(value))
  if (!values.length) return
  const next = new Set(forbiddenFileExtensionsDraft.value ?? [])
  for (const value of values) next.add(value)
  forbiddenFileExtensionsDraft.value = [...next]
  customForbiddenExtension.value = ''
}

type UploadSizeKind = 'image' | 'video' | 'file'

const uploadSizeFields = computed(() => [
  {
    kind: 'image' as const,
    title: t('settings.uploadImageMaxFileSize'),
    hint: t('settings.uploadImageMaxFileSizeHint'),
    source: props.uploadImageMaxFileSizeMbSource,
    value: uploadImageMaxFileSizeMbDraft.value ?? 10,
    max: 100
  },
  {
    kind: 'video' as const,
    title: t('settings.uploadVideoMaxFileSize'),
    hint: t('settings.uploadVideoMaxFileSizeHint'),
    source: props.uploadVideoMaxFileSizeMbSource,
    value: uploadVideoMaxFileSizeMbDraft.value ?? 500,
    max: 2048
  },
  {
    kind: 'file' as const,
    title: t('settings.uploadFileMaxFileSize'),
    hint: t('settings.uploadFileMaxFileSizeHint'),
    source: props.uploadFileMaxFileSizeMbSource,
    value: uploadFileMaxFileSizeMbDraft.value ?? 100,
    max: 1024
  }
])

function uploadSizeModel(kind: UploadSizeKind) {
  if (kind === 'video') return uploadVideoMaxFileSizeMbDraft
  if (kind === 'file') return uploadFileMaxFileSizeMbDraft
  return uploadImageMaxFileSizeMbDraft
}

function clampUploadMaxFileSizeMb(kind: UploadSizeKind, value: unknown): number {
  const num = Number(value)
  const model = uploadSizeModel(kind)
  const max = kind === 'video' ? 2048 : kind === 'file' ? 1024 : 100
  if (!Number.isFinite(num)) return model.value ?? (kind === 'video' ? 500 : kind === 'file' ? 100 : 10)
  return Math.min(max, Math.max(0, Math.round(num)))
}

function onUploadMaxFileSizeInput(kind: UploadSizeKind, event: Event) {
  uploadSizeModel(kind).value = clampUploadMaxFileSizeMb(kind,
    (event.target as HTMLInputElement).value
  )
}

function onUploadMaxFileSizeNumberInput(kind: UploadSizeKind, value: string | number) {
  uploadSizeModel(kind).value = clampUploadMaxFileSizeMb(kind, value)
}
</script>

<template>
  <template v-if="part === 'upload-preference'">
    <div class="space-y-5 py-4">
      <div
        v-for="field in uploadSizeFields"
        :key="field.kind"
      >
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm font-medium text-highlighted">
            {{ field.title }}
          </p>
          <UBadge
            v-if="field.source"
            :color="sourceBadge(field.source).color"
            variant="subtle"
            size="xs"
          >
            {{ sourceBadge(field.source).label }}
          </UBadge>
        </div>
        <p class="mt-1 text-xs leading-relaxed text-muted">
          {{ field.hint }}
        </p>
        <div
          class="mt-3 flex items-center gap-3"
          :class="field.source === 'env' ? 'pointer-events-none opacity-60' : ''"
        >
          <input
            type="range"
            min="0"
            :max="field.max"
            :value="field.value"
            class="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            :disabled="field.source === 'env'"
            @input="onUploadMaxFileSizeInput(field.kind, $event)"
          >
          <div class="flex shrink-0 items-center gap-1.5">
            <UInput
              :model-value="field.value"
              type="number"
              :min="0"
              :max="field.max"
              size="xs"
              class="w-16 tabular-nums"
              :disabled="field.source === 'env'"
              @update:model-value="onUploadMaxFileSizeNumberInput(field.kind, $event)"
            />
            <span class="text-xs text-muted">MB</span>
          </div>
        </div>
      </div>
    </div>

    <div class="border-t border-default/50 py-4">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-medium text-highlighted">
          {{ t('settings.allowedMimeTypes') }}
        </p>
        <UBadge
          v-if="allowedMimeTypesSource"
          :color="sourceBadge(allowedMimeTypesSource).color"
          variant="subtle"
          size="xs"
        >
          {{ sourceBadge(allowedMimeTypesSource).label }}
        </UBadge>
      </div>
      <p class="mt-1 text-xs leading-relaxed text-muted">
        {{ t('settings.allowedMimeTypesHint') }}
      </p>
      <div
        class="mt-3 flex flex-wrap gap-2"
        :class="allowedMimeTypesSource === 'env' ? 'pointer-events-none opacity-60' : ''"
      >
        <label
          v-for="option in mimeTypeOptions ?? []"
          :key="option.mime"
          class="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
          :class="isMimeChecked(option.mime)
            ? 'border-primary/40 bg-primary/5'
            : 'border-default bg-muted/20 hover:bg-muted/40'"
          :title="option.mime"
        >
          <UCheckbox
            :model-value="isMimeChecked(option.mime)"
            @update:model-value="(v) => toggleMime(option.mime, v === true)"
            @click.stop
          />
          <span class="font-medium text-highlighted">{{ option.label }}</span>
        </label>
      </div>
    </div>

    <div class="border-t border-default/50 py-4">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-medium text-highlighted">
          {{ t('settings.allowedVideoExtensions') }}
        </p>
        <UBadge
          v-if="allowedVideoExtensionsSource"
          :color="sourceBadge(allowedVideoExtensionsSource).color"
          variant="subtle"
          size="xs"
        >
          {{ sourceBadge(allowedVideoExtensionsSource).label }}
        </UBadge>
      </div>
      <p class="mt-1 text-xs leading-relaxed text-muted">
        {{ t('settings.allowedVideoExtensionsHint') }}
      </p>
      <div
        class="mt-3 flex flex-wrap gap-2"
        :class="allowedVideoExtensionsSource === 'env' ? 'pointer-events-none opacity-60' : ''"
      >
        <label
          v-for="option in videoExtensionOptions ?? []"
          :key="option.extension"
          class="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
          :class="isVideoExtensionChecked(option.extension)
            ? 'border-primary/40 bg-primary/5'
            : 'border-default bg-muted/20 hover:bg-muted/40'"
        >
          <UCheckbox
            :model-value="isVideoExtensionChecked(option.extension)"
            @update:model-value="(v) => toggleVideoExtension(option.extension, v === true)"
            @click.stop
          />
          <span class="font-medium text-highlighted">{{ option.label }}</span>
        </label>
      </div>
    </div>

    <div class="border-t border-default/50 py-4">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-medium text-highlighted">
          {{ t('settings.forbiddenFileExtensions') }}
        </p>
        <UBadge
          v-if="forbiddenFileExtensionsSource"
          :color="sourceBadge(forbiddenFileExtensionsSource).color"
          variant="subtle"
          size="xs"
        >
          {{ sourceBadge(forbiddenFileExtensionsSource).label }}
        </UBadge>
      </div>
      <p class="mt-1 text-xs leading-relaxed text-muted">
        {{ t('settings.forbiddenFileExtensionsHint') }}
      </p>
      <div
        class="mt-3 flex flex-wrap gap-2"
        :class="forbiddenFileExtensionsSource === 'env' ? 'pointer-events-none opacity-60' : ''"
      >
        <label
          v-for="option in allForbiddenExtensionOptions"
          :key="option.extension"
          class="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
          :class="isForbiddenExtensionChecked(option.extension)
            ? 'border-error/40 bg-error/5'
            : 'border-default bg-muted/20 hover:bg-muted/40'"
        >
          <UCheckbox
            :model-value="isForbiddenExtensionChecked(option.extension)"
            @update:model-value="(v) => toggleForbiddenExtension(option.extension, v === true)"
            @click.stop
          />
          <span class="font-medium text-highlighted">{{ option.label }}</span>
        </label>
      </div>
      <div
        class="mt-3 flex max-w-md items-center gap-2"
        :class="forbiddenFileExtensionsSource === 'env' ? 'pointer-events-none opacity-60' : ''"
      >
        <UInput
          v-model="customForbiddenExtension"
          size="sm"
          class="min-w-0 flex-1"
          :placeholder="t('settings.forbiddenFileExtensionsCustomPlaceholder')"
          :disabled="forbiddenFileExtensionsSource === 'env'"
          @keydown.enter.prevent="addCustomForbiddenExtension"
        />
        <UButton
          :label="t('settings.forbiddenFileExtensionsAdd')"
          size="sm"
          variant="outline"
          color="neutral"
          :disabled="forbiddenFileExtensionsSource === 'env'"
          @click="addCustomForbiddenExtension"
        />
      </div>
    </div>

    <div class="py-4">
      <p class="text-sm font-medium text-highlighted">
        {{ t('settings.uploadRateGroup') }}
      </p>
      <p class="mt-1 text-xs leading-relaxed text-muted">
        {{ t('settings.uploadRateFootnote') }}
      </p>
      <div class="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-medium text-muted">
              {{ t('settings.uploadRateIpMax') }}
            </p>
            <UBadge
              v-if="uploadRateIpMaxSource"
              :color="sourceBadge(uploadRateIpMaxSource).color"
              variant="subtle"
              size="xs"
            >
              {{ sourceBadge(uploadRateIpMaxSource).label }}
            </UBadge>
          </div>
          <UInput
            v-model.number="uploadRateIpMaxDraft"
            type="number"
            :min="1"
            :max="1000"
            size="sm"
            class="mt-2 w-full tabular-nums"
            :disabled="uploadRateIpMaxSource === 'env'"
          />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-medium text-muted">
              {{ t('settings.uploadRateTokenMax') }}
            </p>
            <UBadge
              v-if="uploadRateTokenMaxSource"
              :color="sourceBadge(uploadRateTokenMaxSource).color"
              variant="subtle"
              size="xs"
            >
              {{ sourceBadge(uploadRateTokenMaxSource).label }}
            </UBadge>
          </div>
          <UInput
            v-model.number="uploadRateTokenMaxDraft"
            type="number"
            :min="1"
            :max="5000"
            size="sm"
            class="mt-2 w-full tabular-nums"
            :disabled="uploadRateTokenMaxSource === 'env'"
          />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-medium text-muted">
              {{ t('settings.uploadRateWindowMinutes') }}
            </p>
            <UBadge
              v-if="uploadRateWindowMinutesSource"
              :color="sourceBadge(uploadRateWindowMinutesSource).color"
              variant="subtle"
              size="xs"
            >
              {{ sourceBadge(uploadRateWindowMinutesSource).label }}
            </UBadge>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <UInput
              v-model.number="uploadRateWindowMinutesDraft"
              type="number"
              :min="1"
              :max="1440"
              size="sm"
              class="w-full tabular-nums"
              :disabled="uploadRateWindowMinutesSource === 'env'"
            />
            <span class="shrink-0 text-xs text-muted">{{ t('settings.minutesUnit') }}</span>
          </div>
        </div>
      </div>
    </div>
  </template>

  <SettingsToggleRow
    v-else-if="part === 'image-processing'"
    v-model="preserveOriginalUploadDraft!"
    :disabled="preserveOriginalUploadSource === 'env'"
  >
    <template #title>
      <span class="inline-flex flex-wrap items-center gap-2">
        {{ t('settings.preserveOriginalUpload') }}
        <UBadge
          v-if="preserveOriginalUploadSource"
          :color="sourceBadge(preserveOriginalUploadSource).color"
          variant="subtle"
          size="xs"
        >
          {{ sourceBadge(preserveOriginalUploadSource).label }}
        </UBadge>
      </span>
    </template>
    <template #hint>
      {{ t('settings.preserveOriginalUploadHint') }}
    </template>
  </SettingsToggleRow>

  <template v-else-if="part === 'login-rate'">
    <div class="grid gap-4 py-4 sm:grid-cols-2">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm font-medium text-highlighted">
            {{ t('settings.loginRateMax') }}
          </p>
          <UBadge
            v-if="loginRateMaxSource"
            :color="sourceBadge(loginRateMaxSource).color"
            variant="subtle"
            size="xs"
          >
            {{ sourceBadge(loginRateMaxSource).label }}
          </UBadge>
        </div>
        <UInput
          v-model.number="loginRateMaxDraft"
          type="number"
          :min="1"
          :max="100"
          size="sm"
          class="mt-2 w-full tabular-nums"
          :disabled="loginRateMaxSource === 'env'"
        />
      </div>
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm font-medium text-highlighted">
            {{ t('settings.loginRateWindowMinutes') }}
          </p>
          <UBadge
            v-if="loginRateWindowMinutesSource"
            :color="sourceBadge(loginRateWindowMinutesSource).color"
            variant="subtle"
            size="xs"
          >
            {{ sourceBadge(loginRateWindowMinutesSource).label }}
          </UBadge>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <UInput
            v-model.number="loginRateWindowMinutesDraft"
            type="number"
            :min="1"
            :max="1440"
            size="sm"
            class="w-full tabular-nums"
            :disabled="loginRateWindowMinutesSource === 'env'"
          />
          <span class="shrink-0 text-xs text-muted">{{ t('settings.minutesUnit') }}</span>
        </div>
      </div>
    </div>
    <p class="pb-4 text-xs leading-relaxed text-muted">
      {{ t('settings.loginRateFootnote') }}
    </p>
  </template>
</template>
