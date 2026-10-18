import { requireAdminAuth } from '../../utils/access'
import {
  fetchLatestGitHubRelease,
  isVersionNewer,
  resolveRuntimeAppVersion
} from '../../utils/app-version'

export default defineEventHandler(async (event) => {
  await requireAdminAuth(event)

  const config = useRuntimeConfig(event)
  const currentVersion = resolveRuntimeAppVersion(
    String(config.appVersion ?? '')
  )

  // 桌面版保持完全离线，不主动请求远端版本信息。
  if (process.env.PIC_HOST_DESKTOP === '1') {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null
    }
  }

  const query = getQuery(event)
  const force = query.refresh === '1' || query.refresh === 'true'
  const latest = await fetchLatestGitHubRelease(force)

  if (!latest) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null
    }
  }

  return {
    currentVersion,
    latestVersion: latest.latestVersion,
    updateAvailable: isVersionNewer(latest.latestVersion, currentVersion),
    releaseUrl: latest.releaseUrl
  }
})
