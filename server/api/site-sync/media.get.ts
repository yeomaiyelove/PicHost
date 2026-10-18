import { getQuery } from 'h3'
import { requireSiteSyncAuth } from '../../utils/access'
import { createApiError } from '../../utils/api-error'
import { listUserIdUsernameMap } from '../../utils/db'
import {
  getImageIndexRow,
  getImageTotals,
  listImageIndexRowsAfter
} from '../../utils/image-index'
import { validateStorageKey } from '../../utils/image-key'
import { collectMediaAssetKeys } from '../../utils/media-assets'
import { getBackendForKey } from '../../utils/storage/resolver'
import { getTagsForImageKeys } from '../../utils/tags'
import { toSiteSyncMediaTransfer } from '../../utils/site-sync/manifest'
import type {
  SiteSyncMediaAsset,
  SiteSyncMediaBundle,
  SiteSyncMediaPage
} from '../../utils/site-sync/protocol'

export default defineEventHandler(async (event): Promise<SiteSyncMediaPage> => {
  await requireSiteSyncAuth(event)

  const query = getQuery(event)
  const key = typeof query.key === 'string' ? query.key.trim() : ''
  const after = typeof query.after === 'string' ? query.after : ''
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(query.limit ?? '50'), 10) || 50)
  )

  if (key && !validateStorageKey(key)) {
    createApiError(event, 'INVALID_REQUEST', '媒体 key 无效', 400)
  }

  const rows = key
    ? [getImageIndexRow(key)].filter(row => row !== null)
    : listImageIndexRowsAfter(after, limit)
  if (key && rows.length === 0) {
    createApiError(event, 'IMAGE_NOT_FOUND', '目标媒体不存在', 404)
  }

  const ownerMap = listUserIdUsernameMap()
  const tagMap = getTagsForImageKeys(rows.map(row => row.key))
  const items: SiteSyncMediaBundle[] = []

  for (const row of rows) {
    const backend = await getBackendForKey(row.key)
    const keys = await collectMediaAssetKeys(row, backend)
    const assets: SiteSyncMediaAsset[] = []
    for (const assetKey of new Set(keys)) {
      const stored = await backend.head(assetKey)
      if (!stored) {
        throw new Error(`目标媒体对象不存在：${assetKey}`)
      }
      assets.push({ key: assetKey, size: stored.size })
    }
    items.push({
      media: toSiteSyncMediaTransfer(
        row,
        row.user_id == null ? null : ownerMap.get(row.user_id) ?? null,
        tagMap.get(row.key) ?? []
      ),
      assets
    })
  }

  return {
    items,
    totalMedia: getImageTotals().count,
    nextCursor: key || rows.length < limit
      ? null
      : rows.at(-1)?.key ?? null
  }
})
