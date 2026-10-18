import { getHeader, readRawBody } from 'h3'
import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { validateStorageKey } from '../../utils/image-key'
import {
  isSiteSyncChunkMetadata,
  SITE_SYNC_CHUNK_SIZE,
  writeSiteSyncChunk
} from '../../utils/site-sync/chunks'

export default defineEventHandler(async (event) => {
  await requireSiteSyncAuth(event)
  const encoded = getHeader(event, 'x-pichost-chunk-metadata') ?? ''
  let metadata: unknown
  try {
    metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    createApiError(event, 'INVALID_REQUEST', '分块元数据无效', 400)
  }
  if (
    !isSiteSyncChunkMetadata(metadata)
    || !validateStorageKey(metadata.key)
    || !validateStorageKey(metadata.mediaKey)
  ) {
    createApiError(event, 'INVALID_REQUEST', '分块元数据无效', 400)
  }

  const index = Number.parseInt(getHeader(event, 'x-pichost-chunk-index') ?? '', 10)
  if (!Number.isInteger(index)) {
    createApiError(event, 'INVALID_REQUEST', '分块序号无效', 400)
  }
  const body = await readRawBody(event, false)
  if (!body?.length) {
    createApiError(event, 'INVALID_REQUEST', '未收到分块数据', 400)
  }
  if (body.length > SITE_SYNC_CHUNK_SIZE) {
    createApiError(event, 'FILE_TOO_LARGE', '分块超过 4 MB', 413)
  }

  try {
    return await writeSiteSyncChunk({
      metadata,
      index,
      bytes: new Uint8Array(body)
    })
  } catch (error) {
    createApiError(
      event,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : '分块写入失败',
      400
    )
  }
})
