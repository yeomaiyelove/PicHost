import { cleanupExpiredHlsDownloads } from '../utils/transcode'

export default defineNitroPlugin(() => {
  const cleanup = () => {
    void cleanupExpiredHlsDownloads()
  }

  cleanup()
  const timer = setInterval(cleanup, 60_000)
  timer.unref()
})
