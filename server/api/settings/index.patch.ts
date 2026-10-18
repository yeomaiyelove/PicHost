import { requireAdminAuth } from '../../utils/access'
import { logActivity } from '../../utils/activity-log'
import { createApiError } from '../../utils/api-error'
import {
  getSetting,
  setSetting,
  SETTINGS_ALLOWED_REFERER_HOSTS,
  SETTINGS_HIDE_FOLDER_IN_URL,
  SETTINGS_STORAGE_USE_DATE_PATH,
  SETTINGS_IMAGE_BASE_URL,
  SETTINGS_SITE_BASE_URL,
  SETTINGS_VIDEO_BASE_URL,
  SETTINGS_FILE_BASE_URL,
  SETTINGS_DOMAIN_SEPARATION,
  SETTINGS_IMAGE_DOMAIN_SEPARATED,
  SETTINGS_VIDEO_DOMAIN_SEPARATED,
  SETTINGS_FILE_DOMAIN_SEPARATED,
  SETTINGS_WEBP_QUALITY,
  SETTINGS_LOGIN_VERIFICATION_METHOD,
  SETTINGS_TURNSTILE_SITE_KEY,
  SETTINGS_TURNSTILE_SECRET_KEY,
  SETTINGS_CAP_API_ENDPOINT,
  SETTINGS_CAP_SECRET,
  SETTINGS_FILE_BED_ACCESS,
  setAllowRegistration
} from '../../utils/db'
import {
  parseFileBedAccessMode,
  getSettingsPayload,
  isValidImageBaseUrl,
  isValidRefererHost,
  isValidSiteBaseUrl,
  normalizeCapApiEndpoint,
  parseLoginVerificationMethod,
  MAX_AUTO_DELETE_DAYS,
  normalizeImageBaseUrl,
  normalizeVideoBaseUrl,
  normalizeFileBaseUrl,
  normalizeRefererHosts,
  normalizeSiteBaseUrl,
  parseAutoDeleteDays,
  parseWebpQuality,
  setGlobalAutoDeletePolicy,
  validateLoginVerificationSettings,
  validateSettingsDomainPatch
} from '../../utils/env'
import {
  normalizeAllowedMimeTypes,
  normalizeAllowedVideoExtensions,
  normalizeForbiddenFileExtensions,
  parseLoginRateMax,
  parseLoginRateWindowMinutes,
  parseUploadMaxFileSizeMb,
  parseUploadMaxFileSizeMbForKind,
  parseUploadRateIpMax,
  parseUploadRateTokenMax,
  parseUploadRateWindowMinutes,
  setUploadPolicySettings
} from '../../utils/upload-policy'

interface SettingsPatchBody {
  webpQuality?: unknown
  allowedRefererHosts?: unknown
  siteBaseUrl?: unknown
  imageBaseUrl?: unknown
  videoBaseUrl?: unknown
  fileBaseUrl?: unknown
  imageDomainSeparated?: unknown
  videoDomainSeparated?: unknown
  fileDomainSeparated?: unknown
  domainSeparation?: unknown
  hideFolderInUrl?: unknown
  storageUseDatePath?: unknown
  autoDeleteDays?: unknown
  allowRegistration?: unknown
  loginVerificationMethod?: unknown
  turnstileSiteKey?: unknown
  turnstileSecretKey?: unknown
  capApiEndpoint?: unknown
  capSecret?: unknown
  uploadMaxFileSizeMb?: unknown
  uploadImageMaxFileSizeMb?: unknown
  uploadVideoMaxFileSizeMb?: unknown
  uploadFileMaxFileSizeMb?: unknown
  allowedMimeTypes?: unknown
  allowedVideoExtensions?: unknown
  forbiddenFileExtensions?: unknown
  uploadRateIpMax?: unknown
  uploadRateTokenMax?: unknown
  uploadRateWindowMinutes?: unknown
  loginRateMax?: unknown
  loginRateWindowMinutes?: unknown
  preserveOriginalUpload?: unknown
  fileBedAccess?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await requireAdminAuth(event)

  const body = await readBody<SettingsPatchBody>(event).catch(
    (): SettingsPatchBody => ({})
  )

  if (body.webpQuality !== undefined) {
    const quality = parseWebpQuality(String(body.webpQuality))
    if (quality === null) {
      createApiError(event, 'INVALID_REQUEST', '压缩质量需为 1–100 的整数', 400)
    }
    setSetting(SETTINGS_WEBP_QUALITY, String(quality))
  }

  if (body.allowedRefererHosts !== undefined) {
    const raw = typeof body.allowedRefererHosts === 'string'
      ? body.allowedRefererHosts
      : ''
    const normalized = normalizeRefererHosts(raw)
    if (normalized) {
      const invalid = normalized.split(',').find(host => !isValidRefererHost(host))
      if (invalid) {
        createApiError(
          event,
          'INVALID_REQUEST',
          `无效的 Referer 域名：${invalid}`,
          400
        )
      }
    }
    setSetting(SETTINGS_ALLOWED_REFERER_HOSTS, normalized)
  }

  const existingSite = normalizeSiteBaseUrl(getSetting(SETTINGS_SITE_BASE_URL) ?? '')
  const existingImage = normalizeImageBaseUrl(getSetting(SETTINGS_IMAGE_BASE_URL) ?? '')
  const existingVideo = normalizeVideoBaseUrl(getSetting(SETTINGS_VIDEO_BASE_URL) ?? '')
  const existingFile = normalizeFileBaseUrl(getSetting(SETTINGS_FILE_BASE_URL) ?? '')
  const existingImageSeparated = getSetting(SETTINGS_IMAGE_DOMAIN_SEPARATED) === 'true'
  const existingVideoSeparated = getSetting(SETTINGS_VIDEO_DOMAIN_SEPARATED) === 'true'
  const existingFileSeparated = getSetting(SETTINGS_FILE_DOMAIN_SEPARATED) === 'true'
  let nextSite = existingSite
  let nextImage = existingImage
  let nextVideo = existingVideo
  let nextFile = existingFile
  let nextImageSeparated = existingImageSeparated
  let nextVideoSeparated = existingVideoSeparated
  let nextFileSeparated = existingFileSeparated

  if (body.siteBaseUrl !== undefined) {
    const configured = normalizeSiteBaseUrl(
      typeof body.siteBaseUrl === 'string' ? body.siteBaseUrl : ''
    )
    if (configured && !isValidSiteBaseUrl(configured)) {
      createApiError(
        event,
        'INVALID_REQUEST',
        'SITE_BASE_URL 需为 http(s) 地址，且末尾不加 /',
        400
      )
    }
    nextSite = configured
  }

  if (body.imageBaseUrl !== undefined) {
    const configured = normalizeImageBaseUrl(
      typeof body.imageBaseUrl === 'string' ? body.imageBaseUrl : ''
    )
    if (configured && !isValidImageBaseUrl(configured)) {
      createApiError(
        event,
        'INVALID_REQUEST',
        'IMAGE_BASE_URL 需为 http(s) 地址，或留空使用当前请求域名',
        400
      )
    }
    nextImage = configured
  }

  if (body.videoBaseUrl !== undefined) {
    const configured = normalizeVideoBaseUrl(
      typeof body.videoBaseUrl === 'string' ? body.videoBaseUrl : ''
    )
    if (configured && !isValidImageBaseUrl(configured)) {
      createApiError(event, 'INVALID_REQUEST', '视频域名需为 http(s) 地址，且末尾不加 /', 400)
    }
    nextVideo = configured
  }

  if (body.fileBaseUrl !== undefined) {
    const configured = normalizeFileBaseUrl(
      typeof body.fileBaseUrl === 'string' ? body.fileBaseUrl : ''
    )
    if (configured && !isValidImageBaseUrl(configured)) {
      createApiError(event, 'INVALID_REQUEST', '文件域名需为 http(s) 地址，且末尾不加 /', 400)
    }
    nextFile = configured
  }

  if (body.imageDomainSeparated !== undefined) {
    nextImageSeparated = Boolean(body.imageDomainSeparated)
  }
  if (body.videoDomainSeparated !== undefined) {
    nextVideoSeparated = Boolean(body.videoDomainSeparated)
  }
  if (body.fileDomainSeparated !== undefined) {
    nextFileSeparated = Boolean(body.fileDomainSeparated)
  }

  const domainSeparationProvided = body.domainSeparation !== undefined
  const wantSeparation = domainSeparationProvided
    ? Boolean(body.domainSeparation)
    : null

  const patchError = validateSettingsDomainPatch({
    existingSite,
    existingImage,
    existingVideo,
    existingFile,
    nextSite,
    nextImage,
    nextVideo,
    nextFile,
    wantSeparation,
    siteBaseUrlProvided: body.siteBaseUrl !== undefined
  })
  if (patchError) {
    createApiError(event, 'INVALID_REQUEST', patchError, 400)
  }
  if (wantSeparation === true) {
    if (nextImageSeparated && !nextImage) {
      createApiError(event, 'INVALID_REQUEST', '开启图片独立域名时必须填写图片域名', 400)
    }
    if (nextVideoSeparated && !nextVideo) {
      createApiError(event, 'INVALID_REQUEST', '开启视频独立域名时必须填写视频域名', 400)
    }
    if (nextFileSeparated && !nextFile) {
      createApiError(event, 'INVALID_REQUEST', '开启文件独立域名时必须填写文件域名', 400)
    }
  }

  if (body.domainSeparation !== undefined) {
    setSetting(SETTINGS_DOMAIN_SEPARATION, wantSeparation ? 'true' : 'false')
  }

  if (body.siteBaseUrl !== undefined || body.domainSeparation !== undefined) {
    setSetting(SETTINGS_SITE_BASE_URL, nextSite)
  }

  if (body.imageBaseUrl !== undefined) {
    setSetting(SETTINGS_IMAGE_BASE_URL, nextImage)
  }
  if (body.videoBaseUrl !== undefined || body.domainSeparation !== undefined) {
    setSetting(SETTINGS_VIDEO_BASE_URL, nextVideo)
  }
  if (body.fileBaseUrl !== undefined || body.domainSeparation !== undefined) {
    setSetting(SETTINGS_FILE_BASE_URL, nextFile)
  }
  if (body.imageDomainSeparated !== undefined) {
    setSetting(SETTINGS_IMAGE_DOMAIN_SEPARATED, nextImageSeparated ? 'true' : 'false')
  }
  if (body.videoDomainSeparated !== undefined) {
    setSetting(SETTINGS_VIDEO_DOMAIN_SEPARATED, nextVideoSeparated ? 'true' : 'false')
  }
  if (body.fileDomainSeparated !== undefined) {
    setSetting(SETTINGS_FILE_DOMAIN_SEPARATED, nextFileSeparated ? 'true' : 'false')
  }

  if (body.autoDeleteDays !== undefined) {
    const days = parseAutoDeleteDays(String(body.autoDeleteDays))
    if (days === null) {
      createApiError(
        event,
        'INVALID_REQUEST',
        `自动删除天数需为 0–${MAX_AUTO_DELETE_DAYS} 的整数（0 表示关闭）`,
        400
      )
    }
    setGlobalAutoDeletePolicy(days)
  }

  if (body.allowRegistration !== undefined) {
    setAllowRegistration(Boolean(body.allowRegistration))
  }

  if (body.hideFolderInUrl !== undefined) {
    setSetting(SETTINGS_HIDE_FOLDER_IN_URL, body.hideFolderInUrl ? 'true' : 'false')
  }

  if (body.storageUseDatePath !== undefined) {
    setSetting(SETTINGS_STORAGE_USE_DATE_PATH, body.storageUseDatePath ? 'true' : 'false')
  }

  const currentMethod = parseLoginVerificationMethod(
    getSetting(SETTINGS_LOGIN_VERIFICATION_METHOD) ?? 'slider'
  ) ?? 'slider'
  let nextMethod = currentMethod
  let nextTurnstileSiteKey = getSetting(SETTINGS_TURNSTILE_SITE_KEY) ?? ''
  let nextTurnstileSecretKey = getSetting(SETTINGS_TURNSTILE_SECRET_KEY) ?? ''
  let nextCapApiEndpoint = getSetting(SETTINGS_CAP_API_ENDPOINT) ?? ''
  let nextCapSecret = getSetting(SETTINGS_CAP_SECRET) ?? ''

  if (body.loginVerificationMethod !== undefined) {
    const parsed = parseLoginVerificationMethod(String(body.loginVerificationMethod))
    if (!parsed) {
      createApiError(event, 'INVALID_REQUEST', '无效的登录验证方式', 400)
    }
    nextMethod = parsed
  }

  if (body.turnstileSiteKey !== undefined) {
    nextTurnstileSiteKey = typeof body.turnstileSiteKey === 'string'
      ? body.turnstileSiteKey.trim()
      : ''
  }

  if (body.turnstileSecretKey !== undefined) {
    nextTurnstileSecretKey = typeof body.turnstileSecretKey === 'string'
      ? body.turnstileSecretKey.trim()
      : ''
  }

  if (body.capApiEndpoint !== undefined) {
    nextCapApiEndpoint = typeof body.capApiEndpoint === 'string'
      ? normalizeCapApiEndpoint(body.capApiEndpoint)
      : ''
  }

  if (body.capSecret !== undefined) {
    nextCapSecret = typeof body.capSecret === 'string'
      ? body.capSecret.trim()
      : ''
  }

  if (body.loginVerificationMethod !== undefined
    || body.turnstileSiteKey !== undefined
    || body.turnstileSecretKey !== undefined
    || body.capApiEndpoint !== undefined
    || body.capSecret !== undefined) {
    const settingsError = validateLoginVerificationSettings(
      nextMethod,
      nextTurnstileSiteKey,
      nextTurnstileSecretKey,
      nextCapApiEndpoint,
      nextCapSecret
    )
    if (settingsError) {
      createApiError(event, 'INVALID_REQUEST', settingsError, 400)
    }
  }

  if (body.loginVerificationMethod !== undefined) {
    setSetting(SETTINGS_LOGIN_VERIFICATION_METHOD, nextMethod)
  }
  if (body.turnstileSiteKey !== undefined) {
    setSetting(SETTINGS_TURNSTILE_SITE_KEY, nextTurnstileSiteKey)
  }
  if (body.turnstileSecretKey !== undefined) {
    setSetting(SETTINGS_TURNSTILE_SECRET_KEY, nextTurnstileSecretKey)
  }
  if (body.capApiEndpoint !== undefined) {
    setSetting(SETTINGS_CAP_API_ENDPOINT, nextCapApiEndpoint)
  }
  if (body.capSecret !== undefined) {
    setSetting(SETTINGS_CAP_SECRET, nextCapSecret)
  }

  if (body.uploadMaxFileSizeMb !== undefined) {
    const mb = parseUploadMaxFileSizeMb(String(body.uploadMaxFileSizeMb))
    if (mb === null) {
      createApiError(event, 'INVALID_REQUEST', '图片大小需为 0–100 MB 的整数', 400)
    }
    setUploadPolicySettings({ uploadMaxFileSizeMb: mb })
  }

  if (body.uploadImageMaxFileSizeMb !== undefined) {
    const mb = parseUploadMaxFileSizeMbForKind(
      String(body.uploadImageMaxFileSizeMb),
      'image'
    )
    if (mb === null) {
      createApiError(event, 'INVALID_REQUEST', '图片大小需为 0–100 MB 的整数', 400)
    }
    setUploadPolicySettings({ uploadImageMaxFileSizeMb: mb })
  }

  if (body.uploadVideoMaxFileSizeMb !== undefined) {
    const mb = parseUploadMaxFileSizeMbForKind(
      String(body.uploadVideoMaxFileSizeMb),
      'video'
    )
    if (mb === null) {
      createApiError(event, 'INVALID_REQUEST', '视频大小需为 0–2048 MB 的整数', 400)
    }
    setUploadPolicySettings({ uploadVideoMaxFileSizeMb: mb })
  }

  if (body.uploadFileMaxFileSizeMb !== undefined) {
    const mb = parseUploadMaxFileSizeMbForKind(
      String(body.uploadFileMaxFileSizeMb),
      'file'
    )
    if (mb === null) {
      createApiError(event, 'INVALID_REQUEST', '文件大小需为 0–1024 MB 的整数', 400)
    }
    setUploadPolicySettings({ uploadFileMaxFileSizeMb: mb })
  }

  if (body.allowedMimeTypes !== undefined) {
    const raw = Array.isArray(body.allowedMimeTypes)
      ? body.allowedMimeTypes.map(item => String(item))
      : String(body.allowedMimeTypes).split(',')
    const normalized = normalizeAllowedMimeTypes(raw.join(','))
    if (normalized.length === 0) {
      createApiError(event, 'INVALID_REQUEST', '至少选择一种允许上传的图片格式', 400)
    }
    setUploadPolicySettings({ allowedMimeTypes: normalized })
  }

  if (body.allowedVideoExtensions !== undefined) {
    const raw = Array.isArray(body.allowedVideoExtensions)
      ? body.allowedVideoExtensions.map(item => String(item))
      : String(body.allowedVideoExtensions).split(',')
    const normalized = normalizeAllowedVideoExtensions(raw.join(','))
    if (normalized.length === 0) {
      createApiError(event, 'INVALID_REQUEST', '至少选择一种允许上传的视频格式', 400)
    }
    setUploadPolicySettings({ allowedVideoExtensions: normalized })
  }

  if (body.forbiddenFileExtensions !== undefined) {
    const raw = Array.isArray(body.forbiddenFileExtensions)
      ? body.forbiddenFileExtensions.map(item => String(item))
      : String(body.forbiddenFileExtensions).split(',')
    setUploadPolicySettings({
      forbiddenFileExtensions: normalizeForbiddenFileExtensions(raw.join(','))
    })
  }

  if (body.uploadRateIpMax !== undefined) {
    const value = parseUploadRateIpMax(String(body.uploadRateIpMax))
    if (value === null) {
      createApiError(event, 'INVALID_REQUEST', '上传 IP 限流次数无效', 400)
    }
    setUploadPolicySettings({ uploadRateIpMax: value })
  }

  if (body.uploadRateTokenMax !== undefined) {
    const value = parseUploadRateTokenMax(String(body.uploadRateTokenMax))
    if (value === null) {
      createApiError(event, 'INVALID_REQUEST', '上传 Token 限流次数无效', 400)
    }
    setUploadPolicySettings({ uploadRateTokenMax: value })
  }

  if (body.uploadRateWindowMinutes !== undefined) {
    const value = parseUploadRateWindowMinutes(String(body.uploadRateWindowMinutes))
    if (value === null) {
      createApiError(event, 'INVALID_REQUEST', '上传限流窗口无效', 400)
    }
    setUploadPolicySettings({ uploadRateWindowMinutes: value })
  }

  if (body.loginRateMax !== undefined) {
    const value = parseLoginRateMax(String(body.loginRateMax))
    if (value === null) {
      createApiError(event, 'INVALID_REQUEST', '登录限流次数无效', 400)
    }
    setUploadPolicySettings({ loginRateMax: value })
  }

  if (body.loginRateWindowMinutes !== undefined) {
    const value = parseLoginRateWindowMinutes(String(body.loginRateWindowMinutes))
    if (value === null) {
      createApiError(event, 'INVALID_REQUEST', '登录限流窗口无效', 400)
    }
    setUploadPolicySettings({ loginRateWindowMinutes: value })
  }

  if (body.preserveOriginalUpload !== undefined) {
    if (typeof body.preserveOriginalUpload !== 'boolean') {
      createApiError(event, 'INVALID_REQUEST', '保留原图设置无效', 400)
    }
    setUploadPolicySettings({ preserveOriginalUpload: body.preserveOriginalUpload })
  }

  if (body.fileBedAccess !== undefined) {
    const mode = parseFileBedAccessMode(String(body.fileBedAccess))
    if (!mode) {
      createApiError(event, 'INVALID_REQUEST', '文件床访问方式无效', 400)
    }
    setSetting(SETTINGS_FILE_BED_ACCESS, mode)
  }

  logActivity(event, {
    action: 'settings',
    key: 'settings/system',
    originalName: '系统设置',
    userId: user.id,
    source: 'admin'
  })

  return getSettingsPayload(event)
})
