import { requireUserAuth } from '../../utils/access'
import { ensureUserApiToken } from '../../utils/db'
import {
  getFileBaseUrl,
  getImageBaseUrl,
  getSiteBaseUrl,
  getVideoBaseUrl,
  isHideFolderInUrl
} from '../../utils/env'
import { resolveRuntimeAppVersion } from '../../utils/app-version'

export default defineEventHandler(async (event) => {
  const user = await requireUserAuth(event)
  const config = useRuntimeConfig(event)

  return {
    apiUploadToken: ensureUserApiToken(user.id),
    tokenSource: 'db' as const,
    envTokenOverride: false,
    env: {
      webpQuality: 80,
      refererConfigured: false,
      siteBaseUrl: getSiteBaseUrl(event),
      imageBaseUrl: getImageBaseUrl(event),
      videoBaseUrl: getVideoBaseUrl(event),
      fileBaseUrl: getFileBaseUrl(event),
      hideFolderInUrl: isHideFolderInUrl(event),
      appVersion: resolveRuntimeAppVersion(String(config.appVersion ?? ''))
    }
  }
})
