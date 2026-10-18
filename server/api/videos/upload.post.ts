import { readMultipartFormData } from 'h3'
import type { FileItem, FileUploadResponse } from '~/types/file'
import type { UploadErrorItem } from '~/types/image'
import {
  getUploadUserId,
  requireUploadAuth,
  verifyApiUploadToken
} from '../../utils/access'
import { MAX_FILES_PER_UPLOAD } from '../../utils/constants'
import { createApiError } from '../../utils/api-error'
import { checkUploadRateLimit } from '../../utils/rate-limit'
import { processSingleVideoUpload } from '../../utils/file-bed'
import {
  enqueueTranscode,
  MAX_TRANSCODE_BITRATE_PERCENT,
  MIN_TRANSCODE_BITRATE_PERCENT,
  parseTranscodePreset
} from '../../utils/transcode'
import { getFileBedAccessMode } from '../../utils/env'
import { readMultipartFormFieldValues } from '../../utils/multipart-form'
import {
  parseTagNamesParam,
  resolveUploadTagIds
} from '../../utils/tags'

export default defineEventHandler(async (event) => {
  await requireUploadAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData?.length) {
    createApiError(event, 'INVALID_REQUEST', '未收到上传文件', 400)
  }

  const tokenField = formData.find(part => part.name === 'token')
  const formToken = tokenField?.data?.length
    ? new TextDecoder().decode(tokenField.data).trim()
    : ''
  checkUploadRateLimit(event, formToken)

  const source = verifyApiUploadToken(event) ? 'api' : 'web'
  const uploadUserId = await getUploadUserId(event, formToken)
  const tagNamesRaw = readMultipartFormFieldValues(formData, 'tagNames')
  const uploadTagNames = parseTagNamesParam(
    tagNamesRaw.length === 1 ? tagNamesRaw[0] : tagNamesRaw
  )
  const resolvedTags = resolveUploadTagIds(uploadUserId, uploadTagNames)
  if ('message' in resolvedTags) {
    createApiError(event, 'INVALID_REQUEST', resolvedTags.message, 400)
  }
  const uploadTagIds = resolvedTags.tagIds

  const transcodeField = formData.find(part => part.name === 'transcode')
  const wantTranscode = transcodeField?.data?.length
    ? ['1', 'true', 'yes'].includes(
        new TextDecoder().decode(transcodeField.data).trim().toLowerCase()
      )
    : false

  const presetField = formData.find(part => part.name === 'transcodePreset')
  const presetRaw = presetField?.data?.length
    ? new TextDecoder().decode(presetField.data).trim()
    : ''
  const transcodePreset = presetRaw ? parseTranscodePreset(presetRaw) : undefined
  if (presetRaw && !transcodePreset) {
    createApiError(event, 'INVALID_REQUEST', '无效的转码质量档位', 400)
  }

  const bitrateField = formData.find(part => part.name === 'transcodeBitratePercent')
  const bitrateRaw = bitrateField?.data?.length
    ? new TextDecoder().decode(bitrateField.data).trim()
    : ''
  const transcodeBitratePercent = bitrateRaw ? Number(bitrateRaw) : undefined
  if (
    bitrateRaw
    && (
      !Number.isInteger(transcodeBitratePercent)
      || transcodeBitratePercent! < MIN_TRANSCODE_BITRATE_PERCENT
      || transcodeBitratePercent! > MAX_TRANSCODE_BITRATE_PERCENT
    )
  ) {
    createApiError(
      event,
      'INVALID_REQUEST',
      `转码目标码率需为 ${MIN_TRANSCODE_BITRATE_PERCENT}–${MAX_TRANSCODE_BITRATE_PERCENT} 的整数`,
      400
    )
  }

  const fileParts = formData.filter(
    part => (part.name === 'file' || part.name === 'files' || part.name === 'video')
      && part.data?.length
  )
  if (!fileParts.length) {
    createApiError(event, 'INVALID_REQUEST', '未收到上传文件', 400)
  }

  if (fileParts.length > MAX_FILES_PER_UPLOAD) {
    createApiError(
      event,
      'TOO_MANY_FILES',
      `每次最多上传 ${MAX_FILES_PER_UPLOAD} 个视频`,
      400
    )
  }

  const items: FileItem[] = []
  const errors: UploadErrorItem[] = []

  for (const part of fileParts) {
    const result = await processSingleVideoUpload(event, {
      bytes: new Uint8Array(part.data),
      filename: part.filename,
      contentType: part.type,
      source,
      userId: uploadUserId,
      tagIds: uploadTagIds
    })

    if ('error' in result) {
      errors.push(result.error)
    } else {
      items.push(result.item)
    }
  }

  const response: FileUploadResponse = {
    success: items.length > 0,
    items,
    errors,
    accessMode: getFileBedAccessMode()
  }

  if (wantTranscode) {
    for (const item of items) {
      enqueueTranscode(item.key, {
        ...(transcodePreset ? { preset: transcodePreset } : {}),
        ...(transcodeBitratePercent !== undefined ? { bitratePercent: transcodeBitratePercent } : {})
      })
    }
  }

  if (!items.length && errors.length) {
    setResponseStatus(event, 400)
  }

  return response
})
