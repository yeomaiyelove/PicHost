import { createApiError } from '../utils/api-error'
import {
  createSession,
  createUserAccount,
  isInitialized
} from '../utils/auth'
import {
  setAllowRegistration,
  setSetting,
  SETTINGS_IMAGE_BASE_URL,
  SETTINGS_SITE_BASE_URL,
  SETTINGS_VIDEO_BASE_URL,
  SETTINGS_FILE_BASE_URL,
  SETTINGS_DOMAIN_SEPARATION,
  SETTINGS_IMAGE_DOMAIN_SEPARATED,
  SETTINGS_VIDEO_DOMAIN_SEPARATED,
  SETTINGS_FILE_DOMAIN_SEPARATED
} from '../utils/db'
import {
  normalizeFileBaseUrl,
  normalizeImageBaseUrl,
  normalizeSiteBaseUrl,
  normalizeVideoBaseUrl,
  validateDomainSeparationPair
} from '../utils/env'
import { clientIp, logInfo } from '../utils/logger'

interface SetupBody {
  username?: string
  password?: string
  allowRegistration?: boolean
  domainSeparation?: boolean
  siteBaseUrl?: string
  imageBaseUrl?: string
  videoBaseUrl?: string
  fileBaseUrl?: string
}

export default defineEventHandler(async (event) => {
  if (isInitialized()) {
    createApiError(event, 'FORBIDDEN', '系统已初始化', 403)
  }

  const body = await readBody<SetupBody>(event)
  const username = body?.username?.trim() ?? ''
  const password = body?.password ?? ''

  try {
    const user = await createUserAccount({
      username,
      password,
      role: 'admin'
    })

    setAllowRegistration(Boolean(body?.allowRegistration))

    if (body?.domainSeparation) {
      const siteBaseUrl = normalizeSiteBaseUrl(body.siteBaseUrl ?? '')
      const imageBaseUrl = normalizeImageBaseUrl(body.imageBaseUrl ?? '')
      const videoBaseUrl = normalizeVideoBaseUrl(body.videoBaseUrl ?? '')
      const fileBaseUrl = normalizeFileBaseUrl(body.fileBaseUrl ?? '')
      const pairError = validateDomainSeparationPair(
        siteBaseUrl,
        imageBaseUrl,
        videoBaseUrl,
        fileBaseUrl
      )
      if (pairError) {
        createApiError(event, 'INVALID_REQUEST', pairError, 400)
      }
      setSetting(SETTINGS_SITE_BASE_URL, siteBaseUrl)
      setSetting(SETTINGS_IMAGE_BASE_URL, imageBaseUrl)
      setSetting(SETTINGS_VIDEO_BASE_URL, videoBaseUrl)
      setSetting(SETTINGS_FILE_BASE_URL, fileBaseUrl)
      setSetting(SETTINGS_DOMAIN_SEPARATION, 'true')
      setSetting(SETTINGS_IMAGE_DOMAIN_SEPARATED, imageBaseUrl ? 'true' : 'false')
      setSetting(SETTINGS_VIDEO_DOMAIN_SEPARATED, videoBaseUrl ? 'true' : 'false')
      setSetting(SETTINGS_FILE_DOMAIN_SEPARATED, fileBaseUrl ? 'true' : 'false')
    } else {
      setSetting(SETTINGS_DOMAIN_SEPARATION, 'false')
    }

    await createSession(event, user.id)

    logInfo('setup complete', { ip: clientIp(event), username: user.username })

    return {
      success: true,
      user: { id: user.id, username: user.username, role: user.role }
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'INVALID_USERNAME') {
        createApiError(
          event,
          'INVALID_REQUEST',
          '用户名需为 3–32 位字母、数字或下划线',
          400
        )
      } else if (error.message === 'INVALID_PASSWORD') {
        createApiError(
          event,
          'INVALID_REQUEST',
          '密码至少 8 位',
          400
        )
      } else if (error.message === 'USERNAME_TAKEN') {
        createApiError(event, 'INVALID_REQUEST', '用户名已被占用', 400)
      }
    }
    throw error
  }
})
