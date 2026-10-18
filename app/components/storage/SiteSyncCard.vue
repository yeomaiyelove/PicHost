<script setup lang="ts">
import type {
  SiteSyncDirection,
  SiteSyncRequest
} from '~/types/backup'

const props = defineProps<{
  busy: boolean
  disabled?: boolean
  activeJob?: {
    progress: number
    total: number
    message: string
    payload: Record<string, unknown>
  } | null
  resumableJob?: {
    id: string
    payload: Record<string, unknown>
  } | null
}>()

const emit = defineEmits<{
  sync: [body: SiteSyncRequest]
}>()

const { t } = useI18n()
const targetBaseUrl = ref('')
const token = ref('')
const conflictMode = ref<'skip' | 'overwrite'>('skip')
const direction = ref<SiteSyncDirection>('push')
const scope = ref<'all' | 'image' | 'video' | 'file'>('all')

/** 目标站点地址与 Token 自动保存 24 小时 */
const FORM_STORAGE_KEY = 'pichost.site-sync-form'
const FORM_TTL_MS = 24 * 60 * 60 * 1000

function loadSavedForm() {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as {
      targetBaseUrl?: string
      token?: string
      savedAt?: number
    }
    if (!data.savedAt || Date.now() - data.savedAt > FORM_TTL_MS) {
      localStorage.removeItem(FORM_STORAGE_KEY)
      return
    }
    if (data.targetBaseUrl) targetBaseUrl.value = data.targetBaseUrl
    if (data.token) token.value = data.token
  } catch {
    localStorage.removeItem(FORM_STORAGE_KEY)
  }
}

function persistForm() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({
      targetBaseUrl: targetBaseUrl.value,
      token: token.value,
      savedAt: Date.now()
    }))
  } catch {
    // 存储不可用时忽略
  }
}

watch([targetBaseUrl, token], persistForm)

onMounted(loadSavedForm)

const scopeItems = computed(() => [
  { value: 'all' as const, label: t('storage.backup.siteSyncScopeAll') },
  { value: 'image' as const, label: t('storage.backup.siteSyncScopeImage') },
  { value: 'video' as const, label: t('storage.backup.siteSyncScopeVideo') },
  { value: 'file' as const, label: t('storage.backup.siteSyncScopeFile') }
])

watch(() => props.resumableJob, (job) => {
  if (!job) return
  direction.value = job.payload.direction === 'pull' ? 'pull' : 'push'
  if (typeof job.payload.targetBaseUrl === 'string') {
    targetBaseUrl.value = job.payload.targetBaseUrl
  }
}, { immediate: true })

const canSubmit = computed(() =>
  !props.busy
  && !props.disabled
  && Boolean(targetBaseUrl.value.trim())
  && Boolean(token.value.trim())
)
const canResume = computed(() =>
  !props.busy
  && !props.disabled
  && Boolean(props.resumableJob)
  && Boolean(token.value.trim())
)
const fileProgress = computed(() => {
  const payload = props.activeJob?.payload
  return {
    synced: Number(payload?.filesSynced ?? 0),
    total: Number(payload?.totalFiles ?? 0)
  }
})
const isPull = computed(() => direction.value === 'pull')
const canAbandon = computed(() =>
  !props.busy
  && Boolean(props.resumableJob)
)
const abandonConfirm = computed(() => (
  isPull.value || token.value.trim()
    ? t('storage.backup.siteSyncAbandonConfirm')
    : t('storage.backup.siteSyncAbandonWithoutTokenConfirm')
))
const directionSubtitle = computed(() => (
  isPull.value
    ? t('storage.backup.siteSyncPullSubtitle')
    : t('storage.backup.siteSyncPushSubtitle')
))
const endpointLabel = computed(() => (
  isPull.value
    ? t('storage.backup.siteSyncSource')
    : t('storage.backup.siteSyncTarget')
))
const tokenLabel = computed(() => (
  isPull.value
    ? t('storage.backup.siteSyncSourceToken')
    : t('storage.backup.siteSyncToken')
))
const tokenPlaceholder = computed(() => (
  isPull.value
    ? t('storage.backup.siteSyncSourceTokenPlaceholder')
    : t('storage.backup.siteSyncTokenPlaceholder')
))
const startLabel = computed(() => (
  isPull.value
    ? t('storage.backup.siteSyncStartPull')
    : t('storage.backup.siteSyncStartPush')
))

function submit(resume = false) {
  if (resume ? !canResume.value : !canSubmit.value) return
  emit('sync', {
    targetBaseUrl: targetBaseUrl.value.trim(),
    token: token.value.trim(),
    conflictMode: conflictMode.value,
    direction: direction.value,
    scope: scope.value,
    ...(resume && props.resumableJob ? { resumeJobId: props.resumableJob.id } : {})
  })
}

function startNew() {
  submit(false)
}

function resumeSync() {
  submit(true)
}

function abandonSync() {
  if (!canAbandon.value || !props.resumableJob) return
  if (!window.confirm(abandonConfirm.value)) return
  emit('sync', {
    targetBaseUrl: targetBaseUrl.value.trim(),
    token: token.value.trim(),
    conflictMode: conflictMode.value,
    direction: direction.value,
    abandonJobId: props.resumableJob.id
  })
}

function setConflictMode(mode: 'skip' | 'overwrite') {
  conflictMode.value = mode
}

function setDirection(value: SiteSyncDirection) {
  direction.value = value
}

function setScope(value: 'all' | 'image' | 'video' | 'file') {
  scope.value = value
}
</script>

<template>
  <article class="rounded-xl border border-default bg-elevated p-4 sm:p-5">
    <div class="flex items-start gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <UIcon
          name="i-lucide-server-cog"
          class="size-5"
        />
      </div>
      <div class="min-w-0">
        <h3 class="text-base font-semibold">
          {{ t('storage.backup.siteSyncTitle') }}
        </h3>
        <p class="mt-0.5 text-sm leading-relaxed text-muted">
          {{ directionSubtitle }}
        </p>
      </div>
    </div>

    <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-end">
      <div class="space-y-1.5">
        <label class="text-xs text-muted">{{ endpointLabel }}</label>
        <UInput
          v-model="targetBaseUrl"
          placeholder="https://target.example.com"
          size="sm"
          class="w-full"
          :disabled="busy || disabled"
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-xs text-muted">{{ tokenLabel }}</label>
        <UInput
          v-model="token"
          type="password"
          :placeholder="tokenPlaceholder"
          size="sm"
          class="w-full"
          :disabled="busy || disabled"
        />
      </div>
      <UButton
        :label="startLabel"
        :icon="isPull ? 'i-lucide-cloud-download' : 'i-lucide-cloud-upload'"
        color="primary"
        :loading="busy"
        :disabled="!canSubmit"
        @click="startNew"
      />
      <UButton
        v-if="resumableJob"
        :label="t('storage.backup.siteSyncResume')"
        icon="i-lucide-play"
        color="warning"
        :loading="busy"
        :disabled="!canResume"
        class="lg:col-start-3"
        @click="resumeSync"
      />
      <UButton
        v-if="resumableJob"
        :label="t('storage.backup.siteSyncAbandon')"
        icon="i-lucide-trash-2"
        color="error"
        variant="outline"
        :loading="busy"
        :disabled="!canAbandon"
        class="lg:col-start-3"
        @click="abandonSync"
      />
    </div>

    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted">{{ t('storage.backup.siteSyncDirection') }}</span>
        <UButton
          size="xs"
          :variant="direction === 'push' ? 'solid' : 'ghost'"
          :color="direction === 'push' ? 'primary' : 'neutral'"
          :label="t('storage.backup.siteSyncPush')"
          :disabled="busy || disabled"
          @click="setDirection('push')"
        />
        <UButton
          size="xs"
          :variant="direction === 'pull' ? 'solid' : 'ghost'"
          :color="direction === 'pull' ? 'primary' : 'neutral'"
          :label="t('storage.backup.siteSyncPull')"
          :disabled="busy || disabled"
          @click="setDirection('pull')"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2 sm:justify-end">
        <span class="text-xs text-muted">{{ t('storage.backup.siteSyncConflict') }}</span>
        <UButton
          size="xs"
          :variant="conflictMode === 'skip' ? 'solid' : 'ghost'"
          :color="conflictMode === 'skip' ? 'primary' : 'neutral'"
          :label="t('storage.backup.siteSyncSkip')"
          :disabled="busy || disabled"
          @click="setConflictMode('skip')"
        />
        <UButton
          size="xs"
          :variant="conflictMode === 'overwrite' ? 'solid' : 'ghost'"
          :color="conflictMode === 'overwrite' ? 'primary' : 'neutral'"
          :label="t('storage.backup.siteSyncOverwrite')"
          :disabled="busy || disabled"
          @click="setConflictMode('overwrite')"
        />
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted">{{ t('storage.backup.siteSyncContent') }}</span>
      <UButton
        v-for="item in scopeItems"
        :key="item.value"
        size="xs"
        :variant="scope === item.value ? 'solid' : 'ghost'"
        :color="scope === item.value ? 'primary' : 'neutral'"
        :label="item.label"
        :disabled="busy || disabled"
        @click="setScope(item.value)"
      />
    </div>

    <UAlert
      v-if="activeJob"
      class="mt-4"
      color="primary"
      variant="subtle"
      icon="i-lucide-refresh-cw"
      :description="activeJob.message"
    />

    <div
      v-if="activeJob"
      class="mt-3 grid gap-3 rounded-lg border border-default bg-default/40 p-3 sm:grid-cols-2"
    >
      <div>
        <p class="text-xs text-muted">
          {{ t('storage.backup.siteSyncScanProgress') }}
        </p>
        <p class="mt-1 font-mono text-sm font-medium">
          {{ activeJob.message }}
        </p>
      </div>
      <div>
        <p class="text-xs text-muted">
          {{ t('storage.backup.siteSyncFileProgress') }}
        </p>
        <p class="mt-1 font-mono text-sm font-medium">
          {{ fileProgress.synced }} / {{ fileProgress.total }}
        </p>
      </div>
    </div>

    <BackupJobProgress
      v-if="activeJob"
      class="mt-2"
      :message="activeJob.message"
      :progress="activeJob.progress"
      :total="activeJob.total"
    />
  </article>
</template>
