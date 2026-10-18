import { requireUserAuth } from '../../utils/access'
import { detectSystemMemory } from '../../utils/system-resources'
import {
  getTranscodeSettings,
  MAX_TRANSCODE_CONCURRENCY,
  MAX_TRANSCODE_THREADS,
  MAX_TRANSCODE_BITRATE_PERCENT,
  MIN_TRANSCODE_BITRATE_PERCENT,
  TRANSCODE_PRESETS
} from '../../utils/transcode'

export default defineEventHandler(async (event) => {
  await requireUserAuth(event)

  const memory = detectSystemMemory()
  return {
    ...getTranscodeSettings(),
    maxConcurrency: MAX_TRANSCODE_CONCURRENCY,
    maxThreads: MAX_TRANSCODE_THREADS,
    minBitratePercent: MIN_TRANSCODE_BITRATE_PERCENT,
    maxBitratePercent: MAX_TRANSCODE_BITRATE_PERCENT,
    presets: TRANSCODE_PRESETS,
    memoryBytes: memory.totalBytes,
    lowMemoryThresholdBytes: memory.thresholdBytes,
    lowMemory: memory.lowMemory
  }
})
