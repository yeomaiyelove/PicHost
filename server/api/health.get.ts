import { resolveRuntimeAppVersion } from '../utils/app-version'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  return {
    status: 'ok',
    version: resolveRuntimeAppVersion(String(config.appVersion ?? ''))
  }
})
