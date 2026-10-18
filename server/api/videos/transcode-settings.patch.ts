import { requireAdminAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import {
  MAX_TRANSCODE_CONCURRENCY,
  MAX_TRANSCODE_THREADS,
  MAX_TRANSCODE_BITRATE_PERCENT,
  MIN_TRANSCODE_BITRATE_PERCENT,
  parseTranscodePreset,
  setTranscodeSettings
} from '../../utils/transcode'

interface TranscodeSettingsPatch {
  concurrency?: unknown
  threads?: unknown
  preset?: unknown
  bitratePercent?: unknown
}

export default defineEventHandler(async (event) => {
  await requireAdminAuth(event)

  const body = await readBody<TranscodeSettingsPatch>(event).catch(
    (): TranscodeSettingsPatch => ({})
  )

  const full: Parameters<typeof setTranscodeSettings>[0] = {}

  if (body.concurrency !== undefined) {
    const value = Number(body.concurrency)
    if (!Number.isInteger(value) || value < 1 || value > MAX_TRANSCODE_CONCURRENCY) {
      createApiError(
        event,
        'INVALID_REQUEST',
        `并发转码数量需为 1–${MAX_TRANSCODE_CONCURRENCY} 的整数`,
        400
      )
    }
    full.concurrency = value
  }

  if (body.threads !== undefined) {
    const value = Number(body.threads)
    if (!Number.isInteger(value) || value < 1 || value > MAX_TRANSCODE_THREADS) {
      createApiError(
        event,
        'INVALID_REQUEST',
        `限制核心数需为 1–${MAX_TRANSCODE_THREADS} 的整数`,
        400
      )
    }
    full.threads = value
  }

  if (body.preset !== undefined) {
    const preset = parseTranscodePreset(String(body.preset))
    if (!preset) {
      createApiError(event, 'INVALID_REQUEST', '无效的转码质量档位', 400)
    }
    full.preset = preset
  }

  if (body.bitratePercent !== undefined) {
    const value = Number(body.bitratePercent)
    if (
      !Number.isInteger(value)
      || value < MIN_TRANSCODE_BITRATE_PERCENT
      || value > MAX_TRANSCODE_BITRATE_PERCENT
    ) {
      createApiError(
        event,
        'INVALID_REQUEST',
        `码率需为 ${MIN_TRANSCODE_BITRATE_PERCENT}–${MAX_TRANSCODE_BITRATE_PERCENT} 的整数`,
        400
      )
    }
    full.bitratePercent = value
  }

  return setTranscodeSettings(full)
})
