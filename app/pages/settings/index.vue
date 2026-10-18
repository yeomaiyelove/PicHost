<script setup lang="ts">
import type { SettingsTab } from '~/types/settings'
import { ADMIN_SETTINGS_TABS, USER_SETTINGS_TABS } from '~/types/settings'
import SettingsUserPreferencesFields from '~/components/settings/SettingsUserPreferencesFields.vue'
import SettingsUploadPolicyFields from '~/components/settings/SettingsUploadPolicyFields.vue'
import SettingsVideoProcessingFields from '~/components/settings/SettingsVideoProcessingFields.vue'

type SettingSource = 'env' | 'db' | 'none'
type WebpQualitySource = 'env' | 'db' | 'default'
type PolicySource = 'env' | 'db' | 'default'
type LoginVerificationMethod = 'slider' | 'turnstile' | 'cap'
type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/svg+xml' | 'image/x-icon'
type VideoExtension = 'mp4' | 'm4v' | 'webm' | 'mov' | 'mkv' | 'avi' | 'flv' | 'wmv' | 'mpg' | 'mpeg'

interface SettingsResponse {
  apiUploadToken: string
  tokenSource: SettingSource
  envTokenOverride: boolean
  webpQuality: number
  webpQualitySource: WebpQualitySource
  allowedRefererHosts: string
  refererSource: SettingSource
  refererEnvFallback: string
  imageBaseUrl: string
  imageBaseUrlConfigured: string
  imageBaseUrlSource: SettingSource
  imageDomainSeparated: boolean
  videoBaseUrl: string
  videoBaseUrlSource: SettingSource
  videoDomainSeparated: boolean
  fileBaseUrl: string
  fileBaseUrlSource: SettingSource
  fileDomainSeparated: boolean
  effectiveImageBaseUrl: string
  effectiveVideoBaseUrl: string
  effectiveFileBaseUrl: string
  siteBaseUrl: string
  siteBaseUrlConfigured: string
  siteBaseUrlSource: SettingSource
  effectiveSiteBaseUrl: string
  domainSeparation: boolean
  runtime: {
    currentOrigin: string
    currentHost: string
    hostRole: 'site' | 'image' | 'unknown' | 'single'
  }
  hideFolderInUrl: boolean
  hideFolderInUrlSource: SettingSource
  storageUseDatePath: boolean
  storageUseDatePathSource: SettingSource
  allowRegistration: boolean
  loginVerificationMethod: LoginVerificationMethod
  turnstileSiteKey: string
  turnstileSecretKey: string
  capApiEndpoint: string
  capSecret: string
  appVersion: string
  uploadImageMaxFileSizeMb: number
  uploadImageMaxFileSizeMbSource: PolicySource
  uploadVideoMaxFileSizeMb: number
  uploadVideoMaxFileSizeMbSource: PolicySource
  uploadFileMaxFileSizeMb: number
  uploadFileMaxFileSizeMbSource: PolicySource
  allowedMimeTypes: MimeType[]
  allowedMimeTypesSource: PolicySource
  allowedVideoExtensions: VideoExtension[]
  allowedVideoExtensionsSource: PolicySource
  forbiddenFileExtensions: string[]
  forbiddenFileExtensionsSource: PolicySource
  uploadRateIpMax: number
  uploadRateIpMaxSource: PolicySource
  uploadRateTokenMax: number
  uploadRateTokenMaxSource: PolicySource
  uploadRateWindowMinutes: number
  uploadRateWindowMinutesSource: PolicySource
  loginRateMax: number
  loginRateMaxSource: PolicySource
  loginRateWindowMinutes: number
  loginRateWindowMinutesSource: PolicySource
  preserveOriginalUpload: boolean
  preserveOriginalUploadSource: PolicySource
  fileBedAccess: 'public' | 'token'
  mimeTypeOptions: ReadonlyArray<{ mime: MimeType, label: string }>
  videoExtensionOptions: ReadonlyArray<{ extension: VideoExtension, label: string }>
  forbiddenFileExtensionOptions: ReadonlyArray<{ extension: string, label: string }>
}

const { isChecking, isAuthenticated, checkSession, handleAuthError, fetchStatus, isAdmin } = useAuth()
const toast = useToast()
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const allowedTabs = computed(() => (isAdmin.value ? ADMIN_SETTINGS_TABS : USER_SETTINGS_TABS))

const defaultTab = computed<SettingsTab>(() => (isAdmin.value ? 'basic' : 'tags'))

function parseTab(value: unknown): SettingsTab | null {
  if (typeof value !== 'string') return null
  return allowedTabs.value.includes(value as SettingsTab) ? value as SettingsTab : null
}

const activeTab = computed<SettingsTab>({
  get() {
    return parseTab(route.query.tab) ?? defaultTab.value
  },
  set(tab) {
    void router.replace({ query: { tab } })
  }
})

const sidebarItems = computed(() => {
  const labels: Record<SettingsTab, { label: string, icon: string }> = {
    basic: { label: t('settings.navBasic'), icon: 'i-lucide-settings' },
    domains: { label: t('settings.navDomains'), icon: 'i-lucide-globe' },
    access: { label: t('settings.navAccess'), icon: 'i-lucide-shield' },
    tags: { label: t('settings.navTags'), icon: 'i-lucide-tags' },
    logs: { label: t('settings.navLogs'), icon: 'i-lucide-scroll-text' }
  }
  return allowedTabs.value.map(id => ({ id, ...labels[id] }))
})

const tabPageHeader = computed(() => {
  const headers: Record<SettingsTab, { icon: string, title: string, subtitle: string }> = {
    basic: {
      icon: 'i-lucide-settings',
      title: t('settings.navBasic'),
      subtitle: t('settings.pageSubtitleBasic')
    },
    domains: {
      icon: 'i-lucide-globe',
      title: t('settings.navDomains'),
      subtitle: t('settings.pageSubtitleDomains')
    },
    access: {
      icon: 'i-lucide-shield',
      title: t('settings.navAccess'),
      subtitle: t('settings.pageSubtitleAccess')
    },
    tags: {
      icon: 'i-lucide-tags',
      title: t('settings.navTags'),
      subtitle: t('settings.pageSubtitleTags')
    },
    logs: {
      icon: 'i-lucide-scroll-text',
      title: t('settings.navLogs'),
      subtitle: t('settings.pageSubtitleLogs')
    }
  }
  return headers[activeTab.value]
})

const showSaveBar = computed(() =>
  isAdmin.value && ['basic', 'domains', 'access'].includes(activeTab.value)
)

const checkingRelease = ref(false)
const { resetToDefaults: resetImagePreferences } = useUploadPreferences('image')
const { resetToDefaults: resetVideoPreferences } = useUploadPreferences('video')
const { resetToDefaults: resetFilePreferences } = useUploadPreferences('file')
const { load: reloadUserSettings } = useUserAutoDeleteSettings()
const { load: reloadUploadPolicy } = useUploadPolicy()

const domainSeparationDocUrl = computed(() =>
  locale.value === 'en'
    ? 'https://o96u.github.io/PicHost/en/guide/domain-separation'
    : 'https://o96u.github.io/PicHost/guide/domain-separation'
)

const settings = ref<SettingsResponse | null>(null)
const savingServer = ref(false)

const refererDraft = ref('')
const siteBaseUrlDraft = ref('')
const imageBaseUrlDraft = ref('')
const videoBaseUrlDraft = ref('')
const fileBaseUrlDraft = ref('')
const imageDomainSeparatedDraft = ref(false)
const videoDomainSeparatedDraft = ref(false)
const fileDomainSeparatedDraft = ref(false)
const hideFolderInUrlDraft = ref(false)
const storageUseDatePathDraft = ref(true)
const allowRegistrationDraft = ref(false)
const loginVerificationMethodDraft = ref<LoginVerificationMethod>('slider')
const turnstileSiteKeyDraft = ref('')
const turnstileSecretKeyDraft = ref('')
const capApiEndpointDraft = ref('')
const capSecretDraft = ref('')
const domainSeparationSaveConfirmOpen = ref(false)

const uploadImageMaxFileSizeMbDraft = ref(10)
const uploadVideoMaxFileSizeMbDraft = ref(500)
const uploadFileMaxFileSizeMbDraft = ref(100)
const allowedMimeTypesDraft = ref<MimeType[]>([])
const allowedVideoExtensionsDraft = ref<VideoExtension[]>([])
const forbiddenFileExtensionsDraft = ref<string[]>([])
const uploadRateIpMaxDraft = ref(60)
const uploadRateTokenMaxDraft = ref(120)
const uploadRateWindowMinutesDraft = ref(15)
const loginRateMaxDraft = ref(10)
const loginRateWindowMinutesDraft = ref(15)
const preserveOriginalUploadDraft = ref(false)
const fileBedAccessDraft = ref<'public' | 'token'>('public')

const fileBedAccessOptions = computed(() => [
  {
    value: 'public',
    label: t('settings.fileBedPublic'),
    description: t('settings.fileBedPublicHint')
  },
  {
    value: 'token',
    label: t('settings.fileBedToken'),
    description: t('settings.fileBedTokenHint')
  }
])

interface ReleaseCheckResponse {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
}

const releaseCheck = ref<ReleaseCheckResponse | null>(null)

function mimeListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.slice().sort().join(',') === right.slice().sort().join(',')
}

const hasServerChanges = computed(() => {
  if (!settings.value) return false
  return refererDraft.value !== settings.value.allowedRefererHosts
    || anyResourceDomainSeparated.value !== settings.value.domainSeparation
    || siteBaseUrlDraft.value !== settings.value.siteBaseUrl
    || imageBaseUrlDraft.value !== settings.value.imageBaseUrl
    || videoBaseUrlDraft.value !== settings.value.videoBaseUrl
    || fileBaseUrlDraft.value !== settings.value.fileBaseUrl
    || imageDomainSeparatedDraft.value !== settings.value.imageDomainSeparated
    || videoDomainSeparatedDraft.value !== settings.value.videoDomainSeparated
    || fileDomainSeparatedDraft.value !== settings.value.fileDomainSeparated
    || hideFolderInUrlDraft.value !== settings.value.hideFolderInUrl
    || storageUseDatePathDraft.value !== settings.value.storageUseDatePath
    || allowRegistrationDraft.value !== settings.value.allowRegistration
    || loginVerificationMethodDraft.value !== settings.value.loginVerificationMethod
    || turnstileSiteKeyDraft.value !== settings.value.turnstileSiteKey
    || turnstileSecretKeyDraft.value !== settings.value.turnstileSecretKey
    || capApiEndpointDraft.value !== settings.value.capApiEndpoint
    || capSecretDraft.value !== settings.value.capSecret
    || uploadImageMaxFileSizeMbDraft.value !== settings.value.uploadImageMaxFileSizeMb
    || uploadVideoMaxFileSizeMbDraft.value !== settings.value.uploadVideoMaxFileSizeMb
    || uploadFileMaxFileSizeMbDraft.value !== settings.value.uploadFileMaxFileSizeMb
    || !mimeListsEqual(allowedMimeTypesDraft.value, settings.value.allowedMimeTypes)
    || !mimeListsEqual(allowedVideoExtensionsDraft.value, settings.value.allowedVideoExtensions)
    || !mimeListsEqual(forbiddenFileExtensionsDraft.value, settings.value.forbiddenFileExtensions)
    || uploadRateIpMaxDraft.value !== settings.value.uploadRateIpMax
    || uploadRateTokenMaxDraft.value !== settings.value.uploadRateTokenMax
    || uploadRateWindowMinutesDraft.value !== settings.value.uploadRateWindowMinutes
    || loginRateMaxDraft.value !== settings.value.loginRateMax
    || loginRateWindowMinutesDraft.value !== settings.value.loginRateWindowMinutes
    || preserveOriginalUploadDraft.value !== settings.value.preserveOriginalUpload
    || fileBedAccessDraft.value !== settings.value.fileBedAccess
})

const anyResourceDomainSeparated = computed(() =>
  imageDomainSeparatedDraft.value
  || videoDomainSeparatedDraft.value
  || fileDomainSeparatedDraft.value
)

const domainSeparationWouldActivate = computed(() =>
  anyResourceDomainSeparated.value
  && Boolean(siteBaseUrlDraft.value.trim())
)

const domainSeparationFieldsChanged = computed(() => {
  if (!settings.value) return false
  return anyResourceDomainSeparated.value !== settings.value.domainSeparation
    || siteBaseUrlDraft.value !== settings.value.siteBaseUrl
    || imageBaseUrlDraft.value !== settings.value.imageBaseUrl
    || videoBaseUrlDraft.value !== settings.value.videoBaseUrl
    || fileBaseUrlDraft.value !== settings.value.fileBaseUrl
    || imageDomainSeparatedDraft.value !== settings.value.imageDomainSeparated
    || videoDomainSeparatedDraft.value !== settings.value.videoDomainSeparated
    || fileDomainSeparatedDraft.value !== settings.value.fileDomainSeparated
})

const needsDomainSeparationSaveConfirm = computed(() =>
  domainSeparationWouldActivate.value && domainSeparationFieldsChanged.value
)

function sourceBadge(source: SettingSource | WebpQualitySource) {
  switch (source) {
    case 'env':
      return { label: t('settings.badgeEnv'), color: 'warning' as const }
    case 'db':
      return { label: t('settings.badgeSaved'), color: 'success' as const }
    case 'default':
      return { label: t('settings.badgeDefault'), color: 'neutral' as const }
    default:
      return { label: t('settings.badgeUnset'), color: 'neutral' as const }
  }
}

function errorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode
  }
  return 0
}

function applySettings(data: SettingsResponse) {
  settings.value = data
  refererDraft.value = data.allowedRefererHosts
  siteBaseUrlDraft.value = data.siteBaseUrl
  imageBaseUrlDraft.value = data.imageBaseUrl
  videoBaseUrlDraft.value = data.videoBaseUrl
  fileBaseUrlDraft.value = data.fileBaseUrl
  imageDomainSeparatedDraft.value = data.imageDomainSeparated
  videoDomainSeparatedDraft.value = data.videoDomainSeparated
  fileDomainSeparatedDraft.value = data.fileDomainSeparated
  hideFolderInUrlDraft.value = data.hideFolderInUrl
  storageUseDatePathDraft.value = data.storageUseDatePath
  allowRegistrationDraft.value = data.allowRegistration
  loginVerificationMethodDraft.value = data.loginVerificationMethod
  turnstileSiteKeyDraft.value = data.turnstileSiteKey
  turnstileSecretKeyDraft.value = data.turnstileSecretKey
  capApiEndpointDraft.value = data.capApiEndpoint
  capSecretDraft.value = data.capSecret
  uploadImageMaxFileSizeMbDraft.value = data.uploadImageMaxFileSizeMb
  uploadVideoMaxFileSizeMbDraft.value = data.uploadVideoMaxFileSizeMb
  uploadFileMaxFileSizeMbDraft.value = data.uploadFileMaxFileSizeMb
  allowedMimeTypesDraft.value = [...data.allowedMimeTypes]
  allowedVideoExtensionsDraft.value = [...data.allowedVideoExtensions]
  forbiddenFileExtensionsDraft.value = [...data.forbiddenFileExtensions]
  uploadRateIpMaxDraft.value = data.uploadRateIpMax
  uploadRateTokenMaxDraft.value = data.uploadRateTokenMax
  uploadRateWindowMinutesDraft.value = data.uploadRateWindowMinutes
  loginRateMaxDraft.value = data.loginRateMax
  loginRateWindowMinutesDraft.value = data.loginRateWindowMinutes
  preserveOriginalUploadDraft.value = data.preserveOriginalUpload
  fileBedAccessDraft.value = data.fileBedAccess
}

async function patchSettings(body: Record<string, unknown>) {
  const data = await $fetch<SettingsResponse>('/api/settings', {
    method: 'PATCH',
    credentials: 'include',
    body
  })
  applySettings(data)
  return data
}

function handlePatchError(error: unknown, fallback: string) {
  handleAuthError(error)
  if (!isAuthenticated.value) return
  if (errorStatus(error) === 409) {
    toast.add({ title: t('settings.envOverride'), color: 'warning' })
    void loadSettings()
    return
  }
  toast.add({ title: fallback, color: 'error' })
}

function fillDetectedOrigin(target: 'site' | 'image' | 'video' | 'file') {
  const origin = settings.value?.runtime.currentOrigin
  if (!origin) return
  if (target === 'site') siteBaseUrlDraft.value = origin
  else if (target === 'image') imageBaseUrlDraft.value = origin
  else if (target === 'video') videoBaseUrlDraft.value = origin
  else fileBaseUrlDraft.value = origin
}

function effectiveResourceDraft(
  separated: boolean,
  configuredUrl: string
): string {
  return separated
    ? configuredUrl.trim() || settings.value?.runtime.currentOrigin || ''
    : siteBaseUrlDraft.value.trim() || settings.value?.runtime.currentOrigin || ''
}

async function saveServerSettings() {
  if (!isAuthenticated.value || !hasServerChanges.value) return

  if (anyResourceDomainSeparated.value) {
    if (!siteBaseUrlDraft.value.trim() || !imageBaseUrlDraft.value.trim()) {
      toast.add({ title: t('settings.domainSeparationRequired'), color: 'error' })
      return
    }
  }

  if (needsDomainSeparationSaveConfirm.value) {
    domainSeparationSaveConfirmOpen.value = true
    return
  }

  await performSaveServerSettings()
}

async function performSaveServerSettings() {
  domainSeparationSaveConfirmOpen.value = false
  if (!isAuthenticated.value || !hasServerChanges.value) return

  savingServer.value = true
  try {
    if (allowedMimeTypesDraft.value.length === 0) {
      toast.add({ title: t('settings.allowedMimeTypesHint'), color: 'error' })
      return
    }
    if (allowedVideoExtensionsDraft.value.length === 0) {
      toast.add({ title: t('settings.allowedVideoExtensionsHint'), color: 'error' })
      return
    }

    await patchSettings({
      allowedRefererHosts: refererDraft.value,
      domainSeparation: anyResourceDomainSeparated.value,
      siteBaseUrl: siteBaseUrlDraft.value,
      imageBaseUrl: imageBaseUrlDraft.value,
      videoBaseUrl: videoBaseUrlDraft.value,
      fileBaseUrl: fileBaseUrlDraft.value,
      imageDomainSeparated: imageDomainSeparatedDraft.value,
      videoDomainSeparated: videoDomainSeparatedDraft.value,
      fileDomainSeparated: fileDomainSeparatedDraft.value,
      hideFolderInUrl: hideFolderInUrlDraft.value,
      storageUseDatePath: storageUseDatePathDraft.value,
      allowRegistration: allowRegistrationDraft.value,
      loginVerificationMethod: loginVerificationMethodDraft.value,
      turnstileSiteKey: turnstileSiteKeyDraft.value,
      turnstileSecretKey: turnstileSecretKeyDraft.value,
      capApiEndpoint: capApiEndpointDraft.value,
      capSecret: capSecretDraft.value,
      uploadImageMaxFileSizeMb: uploadImageMaxFileSizeMbDraft.value,
      uploadVideoMaxFileSizeMb: uploadVideoMaxFileSizeMbDraft.value,
      uploadFileMaxFileSizeMb: uploadFileMaxFileSizeMbDraft.value,
      allowedMimeTypes: allowedMimeTypesDraft.value,
      allowedVideoExtensions: allowedVideoExtensionsDraft.value,
      forbiddenFileExtensions: forbiddenFileExtensionsDraft.value,
      uploadRateIpMax: uploadRateIpMaxDraft.value,
      uploadRateTokenMax: uploadRateTokenMaxDraft.value,
      uploadRateWindowMinutes: uploadRateWindowMinutesDraft.value,
      loginRateMax: loginRateMaxDraft.value,
      loginRateWindowMinutes: loginRateWindowMinutesDraft.value,
      preserveOriginalUpload: preserveOriginalUploadDraft.value,
      fileBedAccess: fileBedAccessDraft.value
    })
    await reloadUploadPolicy(true)
    toast.add({ title: t('settings.saved'), color: 'success' })
  } catch (error: unknown) {
    handlePatchError(error, t('settings.saveFailed'))
  } finally {
    savingServer.value = false
  }
}

async function loadSettings() {
  try {
    const data = await $fetch<SettingsResponse>('/api/settings', {
      credentials: 'include'
    })
    applySettings(data)
  } catch (error: unknown) {
    handleAuthError(error)
    if (isAuthenticated.value) {
      toast.add({ title: t('settings.loadFailed'), color: 'error' })
    }
  }
}

async function checkLatestRelease(options: { notify?: boolean, refresh?: boolean } = {}) {
  const { notify = false, refresh = false } = options
  checkingRelease.value = true
  try {
    releaseCheck.value = await $fetch<ReleaseCheckResponse>('/api/version/latest', {
      credentials: 'include',
      query: refresh ? { refresh: '1' } : undefined
    })

    if (!notify) return

    const result = releaseCheck.value
    if (!result?.latestVersion) {
      toast.add({ title: t('settings.checkUpdateFailed'), color: 'error' })
      return
    }
    if (result.updateAvailable) {
      toast.add({
        title: t('settings.updateAvailable', { version: `v${result.latestVersion}` }),
        color: 'warning'
      })
      return
    }
    toast.add({ title: t('settings.upToDate'), color: 'success' })
  } catch {
    releaseCheck.value = null
    if (notify) {
      toast.add({ title: t('settings.checkUpdateFailed'), color: 'error' })
    }
  } finally {
    checkingRelease.value = false
  }
}

const loginVerificationOptions = computed(() => [
  {
    value: 'slider' as const,
    label: t('settings.loginVerificationSlider'),
    description: t('settings.loginVerificationSliderHint')
  },
  {
    value: 'turnstile' as const,
    label: t('settings.loginVerificationTurnstile'),
    description: t('settings.loginVerificationTurnstileHint')
  },
  {
    value: 'cap' as const,
    label: t('settings.loginVerificationCap'),
    description: t('settings.loginVerificationCapHint')
  }
])

function restoreDefaults() {
  if (activeTab.value === 'basic') {
    resetImagePreferences()
    resetVideoPreferences()
    resetFilePreferences()
    void reloadUserSettings()
  }
  if (settings.value) {
    applySettings(settings.value)
  }
  toast.add({ title: t('settings.restoredDefaults'), color: 'success' })
}

async function loadPage() {
  if (isAdmin.value) {
    await loadSettings()
    await checkLatestRelease()
  }
}

function ensureValidTab() {
  if (route.query.tab && !parseTab(route.query.tab)) {
    void router.replace({ query: { tab: defaultTab.value } })
  }
}

onMounted(async () => {
  const status = await fetchStatus()
  if (!status.initialized && !status.legacyMode) {
    await navigateTo('/setup')
    return
  }
  await checkSession()
  if (!isAuthenticated.value) {
    return
  }
  ensureValidTab()
  await loadPage()
})

watch(isAuthenticated, async (authed, prev) => {
  if (authed && prev === false) {
    ensureValidTab()
    await nextTick()
    await loadPage()
  } else if (!authed) {
    settings.value = null
    releaseCheck.value = null
  }
})

watch(() => route.query.tab, () => {
  ensureValidTab()
})

watch(isAdmin, () => {
  ensureValidTab()
})
</script>

<template>
  <div class="min-h-screen">
    <div
      v-if="isChecking"
      class="flex min-h-screen items-center justify-center"
    >
      <div class="flex flex-col items-center gap-3 text-muted">
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin"
        />
        <p class="text-sm">
          {{ t('common.loadingSession') }}
        </p>
      </div>
    </div>

    <AdminLoginGate v-else-if="!isAuthenticated" />

    <AppShell v-else>
      <section class="overflow-hidden rounded-2xl border border-default bg-elevated shadow-sm">
        <div class="flex min-h-[36rem] flex-col lg:flex-row lg:items-stretch">
          <SettingsSidebar
            v-model="activeTab"
            :items="sidebarItems"
          />

          <div class="flex min-w-0 flex-1 flex-col bg-default">
            <div class="flex-1 p-5 text-sm sm:p-6">
              <SettingsPageHeader
                v-if="activeTab !== 'logs'"
                :icon="tabPageHeader.icon"
                :title="tabPageHeader.title"
                :subtitle="tabPageHeader.subtitle"
              />

              <div
                v-if="activeTab === 'basic' && isAdmin"
              >
                <SettingsPanel v-if="settings">
                  <SettingsSection :title="t('settings.featureToggles')">
                    <SettingsGroup>
                      <SettingsToggleRow
                        v-model="allowRegistrationDraft"
                        :title="t('settings.allowRegistration')"
                        :hint="t('settings.allowRegistrationHint')"
                      />
                    </SettingsGroup>
                  </SettingsSection>

                  <SettingsSection
                    :title="t('preferences.title')"
                    :hint="t('settings.uploadLimitsHint')"
                  >
                    <SettingsGroup>
                      <SettingsUploadPolicyFields
                        v-model:upload-image-max-file-size-mb="uploadImageMaxFileSizeMbDraft"
                        v-model:upload-video-max-file-size-mb="uploadVideoMaxFileSizeMbDraft"
                        v-model:upload-file-max-file-size-mb="uploadFileMaxFileSizeMbDraft"
                        v-model:allowed-mime-types="allowedMimeTypesDraft"
                        v-model:allowed-video-extensions="allowedVideoExtensionsDraft"
                        v-model:forbidden-file-extensions="forbiddenFileExtensionsDraft"
                        v-model:upload-rate-ip-max="uploadRateIpMaxDraft"
                        v-model:upload-rate-token-max="uploadRateTokenMaxDraft"
                        v-model:upload-rate-window-minutes="uploadRateWindowMinutesDraft"
                        part="upload-preference"
                        :upload-image-max-file-size-mb-source="settings.uploadImageMaxFileSizeMbSource"
                        :upload-video-max-file-size-mb-source="settings.uploadVideoMaxFileSizeMbSource"
                        :upload-file-max-file-size-mb-source="settings.uploadFileMaxFileSizeMbSource"
                        :allowed-mime-types-source="settings.allowedMimeTypesSource"
                        :allowed-video-extensions-source="settings.allowedVideoExtensionsSource"
                        :forbidden-file-extensions-source="settings.forbiddenFileExtensionsSource"
                        :upload-rate-ip-max-source="settings.uploadRateIpMaxSource"
                        :upload-rate-token-max-source="settings.uploadRateTokenMaxSource"
                        :upload-rate-window-minutes-source="settings.uploadRateWindowMinutesSource"
                        :mime-type-options="settings.mimeTypeOptions"
                        :video-extension-options="settings.videoExtensionOptions"
                        :forbidden-file-extension-options="settings.forbiddenFileExtensionOptions"
                      />
                      <SettingsUserPreferencesFields part="upload-preference" />
                    </SettingsGroup>
                  </SettingsSection>

                  <SettingsSection
                    :title="t('preferences.processing')"
                    :hint="t('settings.imageProcessingHint')"
                  >
                    <SettingsGroup>
                      <SettingsUploadPolicyFields
                        v-model:preserve-original-upload="preserveOriginalUploadDraft"
                        part="image-processing"
                        :preserve-original-upload-source="settings.preserveOriginalUploadSource"
                      />
                      <SettingsUserPreferencesFields part="image-processing" />
                    </SettingsGroup>
                  </SettingsSection>

                  <SettingsSection
                    :title="t('preferences.videoProcessing')"
                    :hint="t('settings.videoProcessingHint')"
                  >
                    <SettingsGroup>
                      <SettingsVideoProcessingFields />
                    </SettingsGroup>
                  </SettingsSection>

                  <SettingsSection :title="t('settings.systemInfo')">
                    <SettingsGroup>
                      <SettingsSystemInfo
                        :app-version="settings.appVersion"
                        :update-available="!!releaseCheck?.updateAvailable"
                        :latest-version="releaseCheck?.latestVersion ?? null"
                        :release-url="releaseCheck?.releaseUrl ?? null"
                        :checking="checkingRelease"
                        @check-update="checkLatestRelease({ notify: true, refresh: true })"
                      />
                    </SettingsGroup>
                  </SettingsSection>
                </SettingsPanel>
                <div
                  v-else
                  class="flex justify-center py-16"
                >
                  <UIcon
                    name="i-lucide-loader-circle"
                    class="size-6 animate-spin text-muted"
                  />
                </div>
              </div>

              <div
                v-else-if="activeTab === 'domains' && isAdmin"
              >
                <SettingsPanel v-if="settings">
                  <SettingsSection :title="t('settings.domainSettings')">
                    <div class="divide-y divide-default">
                      <p
                        v-if="settings.runtime.currentOrigin"
                        class="py-4 text-xs text-primary"
                      >
                        <span class="rounded-lg bg-primary/5 px-3 py-2 inline-block">
                          {{ t('settings.runtimeDetected', { url: settings.runtime.currentOrigin }) }}
                        </span>
                      </p>
                      <div
                        v-if="anyResourceDomainSeparated"
                        class="py-4"
                      >
                        <div class="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 sm:flex-row sm:items-start">
                          <UIcon
                            name="i-lucide-triangle-alert"
                            class="mt-0.5 size-4 shrink-0 text-warning"
                          />
                          <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-warning">
                              {{ t('settings.domainSeparationProxyTitle') }}
                            </p>
                            <p class="mt-1 text-xs leading-relaxed text-warning/90">
                              {{ t('settings.domainSeparationProxyBody') }}
                            </p>
                          </div>
                          <a
                            :href="domainSeparationDocUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="shrink-0 text-xs text-primary hover:underline sm:pt-0.5"
                          >
                            {{ t('setup.domainSeparationProxyExample') }} →
                          </a>
                        </div>
                        <UAlert
                          v-if="settings.runtime.hostRole === 'unknown'"
                          color="warning"
                          variant="subtle"
                          icon="i-lucide-triangle-alert"
                          :title="t('settings.hostRoleUnknown')"
                          class="mt-4"
                        />
                      </div>
                      <SettingsDomainConfiguration
                        v-model:site-base-url="siteBaseUrlDraft"
                        v-model:image-base-url="imageBaseUrlDraft"
                        v-model:video-base-url="videoBaseUrlDraft"
                        v-model:file-base-url="fileBaseUrlDraft"
                        v-model:image-separated="imageDomainSeparatedDraft"
                        v-model:video-separated="videoDomainSeparatedDraft"
                        v-model:file-separated="fileDomainSeparatedDraft"
                        :current-origin="settings.runtime.currentOrigin"
                        :effective-site-url="settings.effectiveSiteBaseUrl"
                      />
                    </div>
                  </SettingsSection>

                  <SettingsSection :title="t('settings.pathAndLink')">
                    <SettingsGroup>
                      <SettingsToggleRow
                        :model-value="hideFolderInUrlDraft"
                        :disabled="settings.hideFolderInUrlSource === 'env'"
                        @update:model-value="(v) => hideFolderInUrlDraft = v"
                      >
                        <template #title>
                          <span class="inline-flex flex-wrap items-center gap-2">
                            {{ t('settings.hideFolderInUrl') }}
                            <UBadge
                              v-if="settings.hideFolderInUrlSource === 'env'"
                              :color="sourceBadge(settings.hideFolderInUrlSource).color"
                              variant="subtle"
                              size="xs"
                            >
                              {{ sourceBadge(settings.hideFolderInUrlSource).label }}
                            </UBadge>
                          </span>
                        </template>
                        <template #hint>
                          {{ t('settings.hideFolderInUrlHint') }}
                        </template>
                      </SettingsToggleRow>
                      <SettingsToggleRow
                        :model-value="storageUseDatePathDraft"
                        :disabled="settings.storageUseDatePathSource === 'env'"
                        @update:model-value="(v) => storageUseDatePathDraft = v"
                      >
                        <template #title>
                          <span class="inline-flex flex-wrap items-center gap-2">
                            {{ t('settings.storageUseDatePath') }}
                            <UBadge
                              v-if="settings.storageUseDatePathSource === 'env'"
                              :color="sourceBadge(settings.storageUseDatePathSource).color"
                              variant="subtle"
                              size="xs"
                            >
                              {{ sourceBadge(settings.storageUseDatePathSource).label }}
                            </UBadge>
                          </span>
                        </template>
                        <template #hint>
                          {{ t('settings.storageUseDatePathHint') }}
                        </template>
                      </SettingsToggleRow>
                    </SettingsGroup>
                  </SettingsSection>

                  <SettingsSection
                    v-if="false && settings"
                    :title="t('settings.resourceDomainSection')"
                  >
                    <div class="grid gap-4 sm:grid-cols-2">
                      <SettingsGroup>
                        <div class="space-y-3 py-4 sm:pr-4">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-medium text-highlighted">
                              {{ t('settings.siteBaseUrl') }}
                            </p>
                          </div>
                          <p class="text-xs leading-relaxed text-muted">
                            {{ t('settings.siteBaseUrlRoleHint') }}
                          </p>
                          <div class="flex gap-2">
                            <UInput
                              v-model="siteBaseUrlDraft"
                              size="sm"
                              :placeholder="t('settings.siteBaseUrlPlaceholder')"
                              class="min-w-0 flex-1 font-mono"
                            />
                            <UButton
                              v-if="settings?.runtime.currentOrigin"
                              :label="t('settings.fillDetectedOrigin')"
                              color="neutral"
                              variant="outline"
                              size="sm"
                              class="shrink-0"
                              @click="fillDetectedOrigin('site')"
                            />
                          </div>
                          <p
                            v-if="settings?.effectiveSiteBaseUrl"
                            class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted"
                            :title="settings?.effectiveSiteBaseUrl"
                          >
                            {{ t('settings.siteBaseUrlActive', { url: settings?.effectiveSiteBaseUrl }) }}
                          </p>
                        </div>
                      </SettingsGroup>

                      <SettingsGroup>
                        <div class="space-y-3 py-4 sm:pl-4">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-medium text-highlighted">
                              {{ t('settings.imageBaseUrl') }}
                            </p>
                            <USwitch v-model="imageDomainSeparatedDraft" />
                          </div>
                          <p class="text-xs leading-relaxed text-muted">
                            {{ t('settings.imageBaseUrlRoleHint') }}
                          </p>
                          <div
                            class="flex gap-2"
                            :class="imageDomainSeparatedDraft ? '' : 'pointer-events-none opacity-50'"
                          >
                            <UInput
                              v-model="imageBaseUrlDraft"
                              size="sm"
                              :placeholder="t('settings.imageBaseUrlPlaceholder')"
                              class="min-w-0 flex-1 font-mono"
                            />
                            <UButton
                              v-if="settings?.runtime.currentOrigin"
                              :label="t('settings.fillDetectedOrigin')"
                              color="neutral"
                              variant="outline"
                              size="sm"
                              class="shrink-0"
                              @click="fillDetectedOrigin('image')"
                            />
                          </div>
                          <p
                            v-if="effectiveResourceDraft(imageDomainSeparatedDraft, imageBaseUrlDraft)"
                            class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted"
                            :title="effectiveResourceDraft(imageDomainSeparatedDraft, imageBaseUrlDraft)"
                          >
                            {{ t('settings.imageBaseUrlActive', {
                              url: effectiveResourceDraft(imageDomainSeparatedDraft, imageBaseUrlDraft)
                            }) }}
                          </p>
                        </div>
                      </SettingsGroup>

                      <SettingsGroup>
                        <div class="space-y-3 py-4 sm:pr-4">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-medium text-highlighted">
                              {{ t('settings.videoBaseUrl') }}
                            </p>
                            <USwitch v-model="videoDomainSeparatedDraft" />
                          </div>
                          <p class="text-xs leading-relaxed text-muted">
                            {{ t('settings.videoBaseUrlRoleHint') }}
                          </p>
                          <div
                            class="flex gap-2"
                            :class="videoDomainSeparatedDraft ? '' : 'pointer-events-none opacity-50'"
                          >
                            <UInput
                              v-model="videoBaseUrlDraft"
                              size="sm"
                              :placeholder="t('settings.videoBaseUrlPlaceholder')"
                              class="min-w-0 flex-1 font-mono"
                            />
                            <UButton
                              v-if="settings?.runtime.currentOrigin"
                              :label="t('settings.fillDetectedOrigin')"
                              color="neutral"
                              variant="outline"
                              size="sm"
                              class="shrink-0"
                              @click="fillDetectedOrigin('video')"
                            />
                          </div>
                          <p
                            v-if="effectiveResourceDraft(videoDomainSeparatedDraft, videoBaseUrlDraft)"
                            class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted"
                            :title="effectiveResourceDraft(videoDomainSeparatedDraft, videoBaseUrlDraft)"
                          >
                            {{ t('settings.videoBaseUrlActive', {
                              url: effectiveResourceDraft(videoDomainSeparatedDraft, videoBaseUrlDraft)
                            }) }}
                          </p>
                        </div>
                      </SettingsGroup>

                      <SettingsGroup>
                        <div class="space-y-3 py-4 sm:pl-4">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-medium text-highlighted">
                              {{ t('settings.fileBaseUrl') }}
                            </p>
                            <USwitch v-model="fileDomainSeparatedDraft" />
                          </div>
                          <p class="text-xs leading-relaxed text-muted">
                            {{ t('settings.fileBaseUrlRoleHint') }}
                          </p>
                          <div
                            class="flex gap-2"
                            :class="fileDomainSeparatedDraft ? '' : 'pointer-events-none opacity-50'"
                          >
                            <UInput
                              v-model="fileBaseUrlDraft"
                              size="sm"
                              :placeholder="t('settings.fileBaseUrlPlaceholder')"
                              class="min-w-0 flex-1 font-mono"
                            />
                            <UButton
                              v-if="settings?.runtime.currentOrigin"
                              :label="t('settings.fillDetectedOrigin')"
                              color="neutral"
                              variant="outline"
                              size="sm"
                              class="shrink-0"
                              @click="fillDetectedOrigin('file')"
                            />
                          </div>
                          <p
                            v-if="effectiveResourceDraft(fileDomainSeparatedDraft, fileBaseUrlDraft)"
                            class="truncate rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted"
                            :title="effectiveResourceDraft(fileDomainSeparatedDraft, fileBaseUrlDraft)"
                          >
                            {{ t('settings.fileBaseUrlActive', {
                              url: effectiveResourceDraft(fileDomainSeparatedDraft, fileBaseUrlDraft)
                            }) }}
                          </p>
                        </div>
                      </SettingsGroup>
                    </div>
                  </SettingsSection>
                </SettingsPanel>
                <div
                  v-else
                  class="flex justify-center py-16"
                >
                  <UIcon
                    name="i-lucide-loader-circle"
                    class="size-6 animate-spin text-muted"
                  />
                </div>
              </div>

              <div
                v-else-if="activeTab === 'access' && isAdmin"
                class="settings-referer-section"
              >
                <SettingsPanel v-if="settings">
                  <SettingsPlainSection
                    :title="t('settings.refererProtection')"
                    :hint="t('settings.refererHint')"
                  >
                    <template #badge>
                      <UBadge
                        :color="refererDraft.trim() ? 'success' : 'neutral'"
                        variant="subtle"
                        size="xs"
                      >
                        {{ refererDraft.trim() ? t('settings.refererEnabled') : t('settings.refererUnrestricted') }}
                      </UBadge>
                    </template>

                    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_12rem] xl:grid-cols-[minmax(0,1fr)_14rem]">
                      <div class="min-w-0 space-y-3">
                        <label class="block text-sm font-medium text-highlighted">
                          {{ t('settings.refererDomainsLabel') }}
                        </label>
                        <UTextarea
                          v-model="refererDraft"
                          size="sm"
                          :placeholder="t('settings.refererPlaceholder')"
                          :rows="7"
                          :autoresize="false"
                          class="settings-referer-field w-full font-mono"
                        />
                        <div class="flex gap-2 rounded-lg border border-info/20 bg-info/5 px-3 py-2.5 text-xs leading-relaxed text-muted">
                          <UIcon
                            name="i-lucide-info"
                            class="mt-0.5 size-3.5 shrink-0 text-info"
                          />
                          <span>{{ t('settings.refererTip') }}</span>
                        </div>
                      </div>

                      <div class="space-y-4 border-l border-default pl-4">
                        <div>
                          <p class="text-sm font-medium text-highlighted">
                            {{ t('settings.refererExamplesTitle') }}
                          </p>
                          <p class="mt-2 font-mono text-xs text-muted">
                            {{ t('settings.refererExamplesSample') }}
                          </p>
                        </div>
                        <div>
                          <p class="text-sm font-medium text-highlighted">
                            {{ t('settings.refererScenarioTitle') }}
                          </p>
                          <ul class="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
                            <li>{{ t('settings.refererScenario1') }}</li>
                            <li>{{ t('settings.refererScenario2') }}</li>
                            <li>{{ t('settings.refererScenario3') }}</li>
                            <li>{{ t('settings.refererScenario4') }}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </SettingsPlainSection>

                  <SettingsSection
                    :title="t('settings.fileBed')"
                    :hint="t('settings.fileBedHint')"
                  >
                    <SettingsGroup>
                      <SettingsRadioGroup
                        v-model="fileBedAccessDraft"
                        :items="fileBedAccessOptions"
                      />
                    </SettingsGroup>
                  </SettingsSection>

                  <SettingsSection
                    :title="t('settings.loginVerification')"
                    :hint="t('settings.loginVerificationHint')"
                  >
                    <SettingsGroup>
                      <SettingsRadioGroup
                        v-model="loginVerificationMethodDraft"
                        :items="loginVerificationOptions"
                      />
                      <div
                        v-if="loginVerificationMethodDraft === 'turnstile'"
                        class="py-4"
                      >
                        <div class="space-y-3 rounded-xl border border-default bg-muted/20 p-4">
                          <div class="space-y-2">
                            <label class="text-sm font-medium text-highlighted">
                              {{ t('settings.turnstileSiteKey') }}
                            </label>
                            <UInput
                              v-model="turnstileSiteKeyDraft"
                              size="sm"
                              :placeholder="t('settings.turnstileSiteKeyPlaceholder')"
                              class="w-full font-mono"
                            />
                          </div>
                          <div class="space-y-2">
                            <label class="text-sm font-medium text-highlighted">
                              {{ t('settings.turnstileSecretKey') }}
                            </label>
                            <UInput
                              v-model="turnstileSecretKeyDraft"
                              type="password"
                              size="sm"
                              :placeholder="t('settings.turnstileSecretKeyPlaceholder')"
                              class="w-full font-mono"
                            />
                          </div>
                        </div>
                      </div>
                      <div
                        v-else-if="loginVerificationMethodDraft === 'cap'"
                        class="py-4"
                      >
                        <div class="space-y-3 rounded-xl border border-default bg-muted/20 p-4">
                          <div class="space-y-2">
                            <label class="text-sm font-medium text-highlighted">
                              {{ t('settings.capApiEndpoint') }}
                            </label>
                            <UInput
                              v-model="capApiEndpointDraft"
                              size="sm"
                              :placeholder="t('settings.capApiEndpointPlaceholder')"
                              class="w-full font-mono"
                            />
                          </div>
                          <div class="space-y-2">
                            <label class="text-sm font-medium text-highlighted">
                              {{ t('settings.capSecretKey') }}
                            </label>
                            <UInput
                              v-model="capSecretDraft"
                              type="password"
                              size="sm"
                              :placeholder="t('settings.capSecretKeyPlaceholder')"
                              class="w-full font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </SettingsGroup>
                  </SettingsSection>

                  <SettingsSection
                    :title="t('settings.rateLimits')"
                    :hint="t('settings.loginRateLimitsHint')"
                  >
                    <SettingsGroup>
                      <SettingsUploadPolicyFields
                        v-model:login-rate-max="loginRateMaxDraft"
                        v-model:login-rate-window-minutes="loginRateWindowMinutesDraft"
                        part="login-rate"
                        :login-rate-max-source="settings.loginRateMaxSource"
                        :login-rate-window-minutes-source="settings.loginRateWindowMinutesSource"
                      />
                    </SettingsGroup>
                  </SettingsSection>
                </SettingsPanel>
                <div
                  v-else
                  class="flex justify-center py-16"
                >
                  <UIcon
                    name="i-lucide-loader-circle"
                    class="size-6 animate-spin text-muted"
                  />
                </div>
              </div>

              <SettingsTagsPanel v-else-if="activeTab === 'tags'" />

              <SettingsLogsPanel v-else-if="activeTab === 'logs'" />
            </div>

            <SettingsServerFooter
              v-if="showSaveBar && settings"
              :has-changes="hasServerChanges"
              :saving="savingServer"
              @save="saveServerSettings"
              @restore="restoreDefaults"
            />
          </div>
        </div>
      </section>
    </AppShell>

    <UModal
      :open="domainSeparationSaveConfirmOpen"
      :title="t('domainSeparationConfirm.title')"
      :description="t('domainSeparationConfirm.description')"
      @update:open="(v) => { if (!v) domainSeparationSaveConfirmOpen = false }"
    >
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="outline"
            @click="() => { domainSeparationSaveConfirmOpen = false }"
          />
          <UButton
            :label="t('domainSeparationConfirm.confirm')"
            color="warning"
            :loading="savingServer"
            @click="performSaveServerSettings"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.settings-referer-section {
  min-width: 0;
}

.settings-referer-field :deep(textarea),
.settings-referer-field :deep(> div) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.settings-referer-field :deep(textarea) {
  min-height: 5.5rem;
  resize: none;
}
</style>
