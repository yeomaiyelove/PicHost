import {
  ALLOWED_MIME_TYPES,
  FORBIDDEN_FILE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  type VideoExtension,
  type AllowedMimeType
} from './constants'
import { getSetting, setSetting } from './db'
import { getActiveBackendRow } from './storage/resolver'
import { TELEGRAM_MAX_FILE_BYTES } from './storage/telegram'

export const SETTINGS_UPLOAD_MAX_FILE_SIZE_MB = 'upload_max_file_size_mb'
export const SETTINGS_UPLOAD_IMAGE_MAX_FILE_SIZE_MB = 'upload_image_max_file_size_mb'
export const SETTINGS_UPLOAD_VIDEO_MAX_FILE_SIZE_MB = 'upload_video_max_file_size_mb'
export const SETTINGS_UPLOAD_FILE_MAX_FILE_SIZE_MB = 'upload_file_max_file_size_mb'
export const SETTINGS_ALLOWED_MIME_TYPES = 'allowed_mime_types'
export const SETTINGS_ALLOWED_VIDEO_EXTENSIONS = 'allowed_video_extensions'
export const SETTINGS_FORBIDDEN_FILE_EXTENSIONS = 'forbidden_file_extensions'
export const SETTINGS_UPLOAD_RATE_IP_MAX = 'upload_rate_ip_max'
export const SETTINGS_UPLOAD_RATE_TOKEN_MAX = 'upload_rate_token_max'
export const SETTINGS_UPLOAD_RATE_WINDOW_MINUTES = 'upload_rate_window_minutes'
export const SETTINGS_LOGIN_RATE_MAX = 'login_rate_max'
export const SETTINGS_LOGIN_RATE_WINDOW_MINUTES = 'login_rate_window_minutes'
export const SETTINGS_PRESERVE_ORIGINAL_UPLOAD = 'preserve_original_upload'

export const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 10
export const MIN_UPLOAD_MAX_FILE_SIZE_MB = 0
export const MAX_UPLOAD_MAX_FILE_SIZE_MB = 100
export const DEFAULT_UPLOAD_IMAGE_MAX_FILE_SIZE_MB = 10
export const DEFAULT_UPLOAD_VIDEO_MAX_FILE_SIZE_MB = 500
export const DEFAULT_UPLOAD_FILE_MAX_FILE_SIZE_MB = 100
export const MAX_UPLOAD_IMAGE_MAX_FILE_SIZE_MB = 100
export const MAX_UPLOAD_VIDEO_MAX_FILE_SIZE_MB = 2048
export const MAX_UPLOAD_FILE_MAX_FILE_SIZE_MB = 1024

export const DEFAULT_UPLOAD_RATE_IP_MAX = 60
export const DEFAULT_UPLOAD_RATE_TOKEN_MAX = 120
export const DEFAULT_UPLOAD_RATE_WINDOW_MINUTES = 15
export const MIN_UPLOAD_RATE_MAX = 1
export const MAX_UPLOAD_RATE_IP_MAX = 1000
export const MAX_UPLOAD_RATE_TOKEN_MAX = 5000
export const MIN_RATE_WINDOW_MINUTES = 1
export const MAX_RATE_WINDOW_MINUTES = 1440

export const DEFAULT_LOGIN_RATE_MAX = 10
export const DEFAULT_LOGIN_RATE_WINDOW_MINUTES = 15
export const MAX_LOGIN_RATE_MAX = 100

export const ALL_MIME_TYPE_OPTIONS = [
  { mime: 'image/jpeg', label: 'JPEG' },
  { mime: 'image/png', label: 'PNG' },
  { mime: 'image/webp', label: 'WebP' },
  { mime: 'image/gif', label: 'GIF' },
  { mime: 'image/svg+xml', label: 'SVG' },
  { mime: 'image/x-icon', label: 'ICO' }
] as const satisfies ReadonlyArray<{ mime: AllowedMimeType, label: string }>

export const ALL_VIDEO_EXTENSION_OPTIONS = VIDEO_EXTENSIONS.map(extension => ({
  extension,
  label: extension.toUpperCase()
}))

export const FORBIDDEN_FILE_EXTENSION_OPTIONS = [
  'html',
  'htm',
  'xhtml',
  'svg',
  'xml',
  'js',
  'mjs',
  'cjs',
  'php',
  'phtml',
  'sh',
  'bash',
  'zsh',
  'bat',
  'cmd',
  'ps1',
  'exe',
  'dll',
  'msi',
  'scr'
].map(extension => ({
  extension,
  label: extension.toUpperCase()
}))

export type PolicySource = 'env' | 'db' | 'default'
export type UploadMaxFileSizeKind = 'image' | 'video' | 'file'

const uploadMaxFileSizeConfig: Record<UploadMaxFileSizeKind, {
  setting: string
  env: string
  fallbackEnv?: string
  legacySetting?: string
  defaultMb: number
  maxMb: number
  label: string
}> = {
  image: {
    setting: SETTINGS_UPLOAD_IMAGE_MAX_FILE_SIZE_MB,
    env: 'UPLOAD_IMAGE_MAX_FILE_SIZE_MB',
    fallbackEnv: 'UPLOAD_MAX_FILE_SIZE_MB',
    legacySetting: SETTINGS_UPLOAD_MAX_FILE_SIZE_MB,
    defaultMb: DEFAULT_UPLOAD_IMAGE_MAX_FILE_SIZE_MB,
    maxMb: MAX_UPLOAD_IMAGE_MAX_FILE_SIZE_MB,
    label: '图片'
  },
  video: {
    setting: SETTINGS_UPLOAD_VIDEO_MAX_FILE_SIZE_MB,
    env: 'UPLOAD_VIDEO_MAX_FILE_SIZE_MB',
    defaultMb: DEFAULT_UPLOAD_VIDEO_MAX_FILE_SIZE_MB,
    maxMb: MAX_UPLOAD_VIDEO_MAX_FILE_SIZE_MB,
    label: '视频'
  },
  file: {
    setting: SETTINGS_UPLOAD_FILE_MAX_FILE_SIZE_MB,
    env: 'UPLOAD_FILE_MAX_FILE_SIZE_MB',
    defaultMb: DEFAULT_UPLOAD_FILE_MAX_FILE_SIZE_MB,
    maxMb: MAX_UPLOAD_FILE_MAX_FILE_SIZE_MB,
    label: '文件'
  }
}

function readEnv(name: string): string {
  try {
    return process.env[name]?.trim() ?? ''
  } catch {
    return ''
  }
}

function parsePositiveInt(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null
  if (value < min || value > max) return null
  return value
}

export function parseUploadMaxFileSizeMb(raw: string): number | null {
  return parsePositiveInt(raw, MIN_UPLOAD_MAX_FILE_SIZE_MB, MAX_UPLOAD_MAX_FILE_SIZE_MB)
}

export function parseUploadMaxFileSizeMbForKind(
  raw: string,
  kind: UploadMaxFileSizeKind
): number | null {
  return parsePositiveInt(
    raw,
    MIN_UPLOAD_MAX_FILE_SIZE_MB,
    uploadMaxFileSizeConfig[kind].maxMb
  )
}

export function parseUploadRateIpMax(raw: string): number | null {
  return parsePositiveInt(raw, MIN_UPLOAD_RATE_MAX, MAX_UPLOAD_RATE_IP_MAX)
}

export function parseUploadRateTokenMax(raw: string): number | null {
  return parsePositiveInt(raw, MIN_UPLOAD_RATE_MAX, MAX_UPLOAD_RATE_TOKEN_MAX)
}

export function parseUploadRateWindowMinutes(raw: string): number | null {
  return parsePositiveInt(raw, MIN_RATE_WINDOW_MINUTES, MAX_RATE_WINDOW_MINUTES)
}

export function parseLoginRateMax(raw: string): number | null {
  return parsePositiveInt(raw, MIN_UPLOAD_RATE_MAX, MAX_LOGIN_RATE_MAX)
}

export function parseLoginRateWindowMinutes(raw: string): number | null {
  return parsePositiveInt(raw, MIN_RATE_WINDOW_MINUTES, MAX_RATE_WINDOW_MINUTES)
}

export function parsePreserveOriginalUpload(raw: string): boolean | null {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') return true
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'no') return false
  return null
}

export function serializePreserveOriginalUpload(value: boolean): string {
  return value ? 'true' : 'false'
}

export function normalizeAllowedMimeTypes(raw: string): AllowedMimeType[] {
  const allowedSet = new Set<string>(ALLOWED_MIME_TYPES)
  const seen = new Set<string>()
  const result: AllowedMimeType[] = []

  for (const part of raw.split(',')) {
    const mime = part.trim().toLowerCase()
    if (!mime || seen.has(mime) || !allowedSet.has(mime)) continue
    seen.add(mime)
    result.push(mime as AllowedMimeType)
  }

  return result
}

export function serializeAllowedMimeTypes(mimes: readonly string[]): string {
  const normalized = new Set(normalizeAllowedMimeTypes(mimes.join(',')))
  return ALL_MIME_TYPE_OPTIONS
    .map(option => option.mime)
    .filter(mime => normalized.has(mime))
    .join(',')
}

export function normalizeAllowedVideoExtensions(raw: string): VideoExtension[] {
  const allowedSet = new Set<string>(VIDEO_EXTENSIONS)
  const seen = new Set<string>()
  const result: VideoExtension[] = []
  for (const part of raw.split(',')) {
    const extension = part.trim().toLowerCase().replace(/^\.+/, '')
    if (!extension || seen.has(extension) || !allowedSet.has(extension)) continue
    seen.add(extension)
    result.push(extension as VideoExtension)
  }
  return result
}

export function serializeAllowedVideoExtensions(extensions: readonly string[]): string {
  const normalized = new Set(normalizeAllowedVideoExtensions(extensions.join(',')))
  return VIDEO_EXTENSIONS
    .filter(extension => normalized.has(extension))
    .join(',')
}

export function normalizeForbiddenFileExtensions(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of raw.split(',')) {
    const extension = part
      .trim()
      .toLowerCase()
      .replace(/^\.+/, '')
    if (!extension || seen.has(extension)) continue
    if (!/^[a-z0-9][a-z0-9_-]{0,15}$/.test(extension)) continue
    seen.add(extension)
    result.push(extension)
  }
  return result
}

export function serializeForbiddenFileExtensions(extensions: readonly string[]): string {
  const configuredOrder = new Map(
    FORBIDDEN_FILE_EXTENSION_OPTIONS.map((option, index) => [option.extension, index])
  )
  return normalizeForbiddenFileExtensions(extensions.join(','))
    .sort((left, right) => {
      const leftOrder = configuredOrder.get(left)
      const rightOrder = configuredOrder.get(right)
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER)
          - (rightOrder ?? Number.MAX_SAFE_INTEGER)
      }
      return left.localeCompare(right)
    })
    .join(',')
}

function getConfiguredUploadMaxFileSizeMbFromDb(kind: UploadMaxFileSizeKind): number | null {
  const config = uploadMaxFileSizeConfig[kind]
  const direct = getSetting(config.setting)
  if (direct !== null) {
    const parsed = parseUploadMaxFileSizeMbForKind(direct, kind)
    if (parsed !== null) return parsed
  }
  if (config.legacySetting) {
    const legacy = getSetting(config.legacySetting)
    if (legacy !== null) {
      const parsed = parseUploadMaxFileSizeMbForKind(legacy, kind)
      if (parsed !== null) return parsed
    }
  }
  return null
}

function getConfiguredUploadMaxFileSizeMbFromEnv(kind: UploadMaxFileSizeKind): number | null {
  const config = uploadMaxFileSizeConfig[kind]
  const direct = parseUploadMaxFileSizeMbForKind(readEnv(config.env), kind)
  if (direct !== null) return direct
  if (config.fallbackEnv) {
    return parseUploadMaxFileSizeMbForKind(readEnv(config.fallbackEnv), kind)
  }
  return null
}

function getUploadMaxFileSizeMbSource(kind: UploadMaxFileSizeKind): PolicySource {
  if (getConfiguredUploadMaxFileSizeMbFromDb(kind) !== null) return 'db'
  if (getConfiguredUploadMaxFileSizeMbFromEnv(kind) !== null) return 'env'
  return 'default'
}

function getAllowedVideoExtensionsSource(): PolicySource {
  if (getSetting(SETTINGS_ALLOWED_VIDEO_EXTENSIONS) !== null) return 'db'
  if (normalizeAllowedVideoExtensions(readEnv('ALLOWED_VIDEO_EXTENSIONS')).length > 0) {
    return 'env'
  }
  return 'default'
}

function getForbiddenFileExtensionsSource(): PolicySource {
  if (getSetting(SETTINGS_FORBIDDEN_FILE_EXTENSIONS) !== null) return 'db'
  if (readEnv('FORBIDDEN_FILE_EXTENSIONS')) return 'env'
  return 'default'
}

function getAllowedMimeTypesSource(): PolicySource {
  if (getSetting(SETTINGS_ALLOWED_MIME_TYPES) !== null) return 'db'
  if (normalizeAllowedMimeTypes(readEnv('ALLOWED_MIME_TYPES')).length > 0) return 'env'
  return 'default'
}

function getUploadRateIpMaxSource(): PolicySource {
  if (getSetting(SETTINGS_UPLOAD_RATE_IP_MAX) !== null) return 'db'
  if (parseUploadRateIpMax(readEnv('UPLOAD_RATE_IP_MAX')) !== null) return 'env'
  return 'default'
}

function getUploadRateTokenMaxSource(): PolicySource {
  if (getSetting(SETTINGS_UPLOAD_RATE_TOKEN_MAX) !== null) return 'db'
  if (parseUploadRateTokenMax(readEnv('UPLOAD_RATE_TOKEN_MAX')) !== null) return 'env'
  return 'default'
}

function getUploadRateWindowMinutesSource(): PolicySource {
  if (getSetting(SETTINGS_UPLOAD_RATE_WINDOW_MINUTES) !== null) return 'db'
  if (parseUploadRateWindowMinutes(readEnv('UPLOAD_RATE_WINDOW_MINUTES')) !== null) return 'env'
  return 'default'
}

function getLoginRateMaxSource(): PolicySource {
  if (getSetting(SETTINGS_LOGIN_RATE_MAX) !== null) return 'db'
  if (parseLoginRateMax(readEnv('LOGIN_RATE_MAX')) !== null) return 'env'
  return 'default'
}

function getLoginRateWindowMinutesSource(): PolicySource {
  if (getSetting(SETTINGS_LOGIN_RATE_WINDOW_MINUTES) !== null) return 'db'
  if (parseLoginRateWindowMinutes(readEnv('LOGIN_RATE_WINDOW_MINUTES')) !== null) return 'env'
  return 'default'
}

function getPreserveOriginalUploadSource(): PolicySource {
  if (getSetting(SETTINGS_PRESERVE_ORIGINAL_UPLOAD) !== null) return 'db'
  if (parsePreserveOriginalUpload(readEnv('PRESERVE_ORIGINAL_UPLOAD')) !== null) return 'env'
  return 'default'
}

export function getUploadMaxFileSizeMb(kind: UploadMaxFileSizeKind = 'image'): number {
  return getConfiguredUploadMaxFileSizeMbFromDb(kind)
    ?? getConfiguredUploadMaxFileSizeMbFromEnv(kind)
    ?? uploadMaxFileSizeConfig[kind].defaultMb
}

export function getMaxFileSizeBytes(kind: UploadMaxFileSizeKind = 'image'): number {
  return getUploadMaxFileSizeMb(kind) * 1024 * 1024
}

export function getEffectiveMaxFileSizeBytes(kind: UploadMaxFileSizeKind = 'image'): number {
  const configured = getMaxFileSizeBytes(kind)
  const row = getActiveBackendRow()
  if (row?.type === 'telegram') {
    return Math.min(configured, TELEGRAM_MAX_FILE_BYTES)
  }
  return configured
}

export function getEffectiveUploadMaxFileSizeMb(kind: UploadMaxFileSizeKind): number {
  return Math.floor(getEffectiveMaxFileSizeBytes(kind) / (1024 * 1024))
}

export function getAllowedMimeTypesList(): AllowedMimeType[] {
  const dbRaw = getSetting(SETTINGS_ALLOWED_MIME_TYPES)
  if (dbRaw !== null) {
    const parsed = normalizeAllowedMimeTypes(dbRaw)
    if (parsed.length > 0) return parsed
  }
  const fromEnv = normalizeAllowedMimeTypes(readEnv('ALLOWED_MIME_TYPES'))
  if (fromEnv.length > 0) return fromEnv
  return [...ALLOWED_MIME_TYPES]
}

export function getAllowedVideoExtensions(): VideoExtension[] {
  const dbRaw = getSetting(SETTINGS_ALLOWED_VIDEO_EXTENSIONS)
  if (dbRaw !== null) {
    const parsed = normalizeAllowedVideoExtensions(dbRaw)
    if (parsed.length > 0) return parsed
  }
  const fromEnv = normalizeAllowedVideoExtensions(readEnv('ALLOWED_VIDEO_EXTENSIONS'))
  if (fromEnv.length > 0) return fromEnv
  return [...VIDEO_EXTENSIONS]
}

export function getForbiddenFileExtensions(): string[] {
  const dbRaw = getSetting(SETTINGS_FORBIDDEN_FILE_EXTENSIONS)
  if (dbRaw !== null) return normalizeForbiddenFileExtensions(dbRaw)
  const envRaw = readEnv('FORBIDDEN_FILE_EXTENSIONS')
  if (envRaw) return normalizeForbiddenFileExtensions(envRaw)
  return [...FORBIDDEN_FILE_EXTENSIONS]
}

export function isVideoExtensionAllowed(extension: string): boolean {
  const normalized = extension.trim().toLowerCase().replace(/^\.+/, '')
  return getAllowedVideoExtensions().includes(normalized as VideoExtension)
}

export function isForbiddenFileExtension(extension: string): boolean {
  const normalized = extension.trim().toLowerCase().replace(/^\.+/, '')
  return Boolean(normalized) && getForbiddenFileExtensions().includes(normalized)
}

export function isMimeTypeAllowed(mime: string): mime is AllowedMimeType {
  return getAllowedMimeTypesList().includes(mime as AllowedMimeType)
}

export function isPreserveOriginalUpload(): boolean {
  const dbRaw = getSetting(SETTINGS_PRESERVE_ORIGINAL_UPLOAD)
  if (dbRaw !== null) {
    const parsed = parsePreserveOriginalUpload(dbRaw)
    if (parsed !== null) return parsed
  }
  const fromEnv = parsePreserveOriginalUpload(readEnv('PRESERVE_ORIGINAL_UPLOAD'))
  if (fromEnv !== null) return fromEnv
  return false
}

export function getUploadRateLimitSettings(): {
  ipMax: number
  tokenMax: number
  windowMs: number
} {
  const ipMax = (() => {
    const dbRaw = getSetting(SETTINGS_UPLOAD_RATE_IP_MAX)
    if (dbRaw !== null) {
      const parsed = parseUploadRateIpMax(dbRaw)
      if (parsed !== null) return parsed
    }
    return parseUploadRateIpMax(readEnv('UPLOAD_RATE_IP_MAX')) ?? DEFAULT_UPLOAD_RATE_IP_MAX
  })()

  const tokenMax = (() => {
    const dbRaw = getSetting(SETTINGS_UPLOAD_RATE_TOKEN_MAX)
    if (dbRaw !== null) {
      const parsed = parseUploadRateTokenMax(dbRaw)
      if (parsed !== null) return parsed
    }
    return parseUploadRateTokenMax(readEnv('UPLOAD_RATE_TOKEN_MAX')) ?? DEFAULT_UPLOAD_RATE_TOKEN_MAX
  })()

  const windowMinutes = (() => {
    const dbRaw = getSetting(SETTINGS_UPLOAD_RATE_WINDOW_MINUTES)
    if (dbRaw !== null) {
      const parsed = parseUploadRateWindowMinutes(dbRaw)
      if (parsed !== null) return parsed
    }
    return parseUploadRateWindowMinutes(readEnv('UPLOAD_RATE_WINDOW_MINUTES'))
      ?? DEFAULT_UPLOAD_RATE_WINDOW_MINUTES
  })()

  return {
    ipMax,
    tokenMax,
    windowMs: windowMinutes * 60 * 1000
  }
}

export function getLoginRateLimitSettings(): {
  max: number
  windowMs: number
} {
  const max = (() => {
    const dbRaw = getSetting(SETTINGS_LOGIN_RATE_MAX)
    if (dbRaw !== null) {
      const parsed = parseLoginRateMax(dbRaw)
      if (parsed !== null) return parsed
    }
    return parseLoginRateMax(readEnv('LOGIN_RATE_MAX')) ?? DEFAULT_LOGIN_RATE_MAX
  })()

  const windowMinutes = (() => {
    const dbRaw = getSetting(SETTINGS_LOGIN_RATE_WINDOW_MINUTES)
    if (dbRaw !== null) {
      const parsed = parseLoginRateWindowMinutes(dbRaw)
      if (parsed !== null) return parsed
    }
    return parseLoginRateWindowMinutes(readEnv('LOGIN_RATE_WINDOW_MINUTES'))
      ?? DEFAULT_LOGIN_RATE_WINDOW_MINUTES
  })()

  return {
    max,
    windowMs: windowMinutes * 60 * 1000
  }
}

export function formatMaxFileSizeMessage(kind: UploadMaxFileSizeKind = 'image'): string {
  return `${uploadMaxFileSizeConfig[kind].label}大小不能超过 ${getUploadMaxFileSizeMb(kind)} MB`
}

export function formatEffectiveMaxFileSizeMessage(
  kind: UploadMaxFileSizeKind = 'image'
): string {
  const row = getActiveBackendRow()
  if (row?.type === 'telegram') {
    const mb = TELEGRAM_MAX_FILE_BYTES / (1024 * 1024)
    const siteMb = getUploadMaxFileSizeMb(kind)
    if (siteMb * 1024 * 1024 <= TELEGRAM_MAX_FILE_BYTES) {
      return formatMaxFileSizeMessage(kind)
    }
    return `${uploadMaxFileSizeConfig[kind].label}大小不能超过 ${mb} MB（Telegram 存储上限）`
  }
  return formatMaxFileSizeMessage(kind)
}

export function getUploadPolicySettingsPayload() {
  return {
    uploadImageMaxFileSizeMb: getUploadMaxFileSizeMb('image'),
    uploadImageMaxFileSizeMbSource: getUploadMaxFileSizeMbSource('image'),
    uploadImageMaxFileSizeMbEnvFallback: parseUploadMaxFileSizeMbForKind(
      readEnv('UPLOAD_IMAGE_MAX_FILE_SIZE_MB'),
      'image'
    ) ?? parseUploadMaxFileSizeMb(readEnv('UPLOAD_MAX_FILE_SIZE_MB'))
    ?? DEFAULT_UPLOAD_IMAGE_MAX_FILE_SIZE_MB,
    uploadVideoMaxFileSizeMb: getUploadMaxFileSizeMb('video'),
    uploadVideoMaxFileSizeMbSource: getUploadMaxFileSizeMbSource('video'),
    uploadVideoMaxFileSizeMbEnvFallback: parseUploadMaxFileSizeMbForKind(
      readEnv('UPLOAD_VIDEO_MAX_FILE_SIZE_MB'),
      'video'
    ) ?? DEFAULT_UPLOAD_VIDEO_MAX_FILE_SIZE_MB,
    uploadFileMaxFileSizeMb: getUploadMaxFileSizeMb('file'),
    uploadFileMaxFileSizeMbSource: getUploadMaxFileSizeMbSource('file'),
    uploadFileMaxFileSizeMbEnvFallback: parseUploadMaxFileSizeMbForKind(
      readEnv('UPLOAD_FILE_MAX_FILE_SIZE_MB'),
      'file'
    ) ?? DEFAULT_UPLOAD_FILE_MAX_FILE_SIZE_MB,
    uploadMaxFileSizeMb: getUploadMaxFileSizeMb('image'),
    uploadMaxFileSizeMbSource: getUploadMaxFileSizeMbSource('image'),
    uploadMaxFileSizeMbEnvFallback: parseUploadMaxFileSizeMb(readEnv('UPLOAD_MAX_FILE_SIZE_MB'))
      ?? DEFAULT_UPLOAD_MAX_FILE_SIZE_MB,
    allowedMimeTypes: getAllowedMimeTypesList(),
    allowedMimeTypesSource: getAllowedMimeTypesSource(),
    allowedMimeTypesEnvFallback: normalizeAllowedMimeTypes(readEnv('ALLOWED_MIME_TYPES')),
    allowedVideoExtensions: getAllowedVideoExtensions(),
    allowedVideoExtensionsSource: getAllowedVideoExtensionsSource(),
    allowedVideoExtensionsEnvFallback: normalizeAllowedVideoExtensions(
      readEnv('ALLOWED_VIDEO_EXTENSIONS')
    ),
    forbiddenFileExtensions: getForbiddenFileExtensions(),
    forbiddenFileExtensionsSource: getForbiddenFileExtensionsSource(),
    forbiddenFileExtensionsEnvFallback: normalizeForbiddenFileExtensions(
      readEnv('FORBIDDEN_FILE_EXTENSIONS')
    ),
    uploadRateIpMax: getUploadRateLimitSettings().ipMax,
    uploadRateIpMaxSource: getUploadRateIpMaxSource(),
    uploadRateTokenMax: getUploadRateLimitSettings().tokenMax,
    uploadRateTokenMaxSource: getUploadRateTokenMaxSource(),
    uploadRateWindowMinutes: getUploadRateLimitSettings().windowMs / (60 * 1000),
    uploadRateWindowMinutesSource: getUploadRateWindowMinutesSource(),
    loginRateMax: getLoginRateLimitSettings().max,
    loginRateMaxSource: getLoginRateMaxSource(),
    loginRateWindowMinutes: getLoginRateLimitSettings().windowMs / (60 * 1000),
    loginRateWindowMinutesSource: getLoginRateWindowMinutesSource(),
    preserveOriginalUpload: isPreserveOriginalUpload(),
    preserveOriginalUploadSource: getPreserveOriginalUploadSource(),
    mimeTypeOptions: ALL_MIME_TYPE_OPTIONS.map(option => ({
      mime: option.mime,
      label: option.label
    })),
    videoExtensionOptions: ALL_VIDEO_EXTENSION_OPTIONS,
    forbiddenFileExtensionOptions: FORBIDDEN_FILE_EXTENSION_OPTIONS
  }
}

export function setUploadPolicySettings(input: {
  uploadMaxFileSizeMb?: number
  uploadImageMaxFileSizeMb?: number
  uploadVideoMaxFileSizeMb?: number
  uploadFileMaxFileSizeMb?: number
  allowedMimeTypes?: readonly string[]
  allowedVideoExtensions?: readonly string[]
  forbiddenFileExtensions?: readonly string[]
  uploadRateIpMax?: number
  uploadRateTokenMax?: number
  uploadRateWindowMinutes?: number
  loginRateMax?: number
  loginRateWindowMinutes?: number
  preserveOriginalUpload?: boolean
}): void {
  const imageMaxFileSizeMb = input.uploadImageMaxFileSizeMb ?? input.uploadMaxFileSizeMb
  if (imageMaxFileSizeMb !== undefined) {
    setSetting(SETTINGS_UPLOAD_IMAGE_MAX_FILE_SIZE_MB, String(imageMaxFileSizeMb))
  }
  if (input.uploadVideoMaxFileSizeMb !== undefined) {
    setSetting(
      SETTINGS_UPLOAD_VIDEO_MAX_FILE_SIZE_MB,
      String(input.uploadVideoMaxFileSizeMb)
    )
  }
  if (input.uploadFileMaxFileSizeMb !== undefined) {
    setSetting(
      SETTINGS_UPLOAD_FILE_MAX_FILE_SIZE_MB,
      String(input.uploadFileMaxFileSizeMb)
    )
  }
  if (input.allowedMimeTypes !== undefined) {
    setSetting(SETTINGS_ALLOWED_MIME_TYPES, serializeAllowedMimeTypes(input.allowedMimeTypes))
  }
  if (input.allowedVideoExtensions !== undefined) {
    setSetting(
      SETTINGS_ALLOWED_VIDEO_EXTENSIONS,
      serializeAllowedVideoExtensions(input.allowedVideoExtensions)
    )
  }
  if (input.forbiddenFileExtensions !== undefined) {
    setSetting(
      SETTINGS_FORBIDDEN_FILE_EXTENSIONS,
      serializeForbiddenFileExtensions(input.forbiddenFileExtensions)
    )
  }
  if (input.uploadRateIpMax !== undefined) {
    setSetting(SETTINGS_UPLOAD_RATE_IP_MAX, String(input.uploadRateIpMax))
  }
  if (input.uploadRateTokenMax !== undefined) {
    setSetting(SETTINGS_UPLOAD_RATE_TOKEN_MAX, String(input.uploadRateTokenMax))
  }
  if (input.uploadRateWindowMinutes !== undefined) {
    setSetting(SETTINGS_UPLOAD_RATE_WINDOW_MINUTES, String(input.uploadRateWindowMinutes))
  }
  if (input.loginRateMax !== undefined) {
    setSetting(SETTINGS_LOGIN_RATE_MAX, String(input.loginRateMax))
  }
  if (input.loginRateWindowMinutes !== undefined) {
    setSetting(SETTINGS_LOGIN_RATE_WINDOW_MINUTES, String(input.loginRateWindowMinutes))
  }
  if (input.preserveOriginalUpload !== undefined) {
    setSetting(
      SETTINGS_PRESERVE_ORIGINAL_UPLOAD,
      serializePreserveOriginalUpload(input.preserveOriginalUpload)
    )
  }
}
