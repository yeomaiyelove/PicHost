import { requireSiteSyncAuth } from '../../utils/access'
import { listAllImageIndexRows } from '../../utils/image-index'
import { listUserIdUsernameMap } from '../../utils/db'
import { collectMediaAssetKeys } from '../../utils/media-assets'
import { getBackendForKey } from '../../utils/storage/resolver'
import type { SiteSyncInventory } from '../../utils/site-sync/protocol'

export default defineEventHandler(async (event): Promise<SiteSyncInventory> => {
  await requireSiteSyncAuth(event)

  const rows = listAllImageIndexRows()
  const objects = new Map<string, number>()

  for (const row of rows) {
    const backend = await getBackendForKey(row.key)
    let keys: string[]
    try {
      keys = await collectMediaAssetKeys(row, backend)
    } catch {
      keys = [
        ...(Number(row.source_deleted ?? 0) !== 1 ? [row.key] : []),
        ...(row.thumb_key ? [row.thumb_key] : []),
        ...(row.hls_key ? [row.hls_key] : [])
      ]
    }

    for (const key of new Set(keys)) {
      const stored = await backend.head(key)
      if (stored) objects.set(key, stored.size)
    }
  }

  return {
    users: [...listUserIdUsernameMap().values()].sort(),
    mediaKeys: rows.map(row => row.key),
    objects: [...objects].map(([key, size]) => ({ key, size }))
  }
})
