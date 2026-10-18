import { randomUUID } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import type { ReadStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { contentTypeFromKey } from '../content-type'
import { getDataDir } from '../data-dir'
import { validateStorageKey } from '../image-key'
import type { StoredImage, StoredImageMeta, StorageBackend } from './types'

const META_SUFFIX = '.meta.json'
const ATOMIC_TEMP_DIR = '.pichost-tmp'

function keyToFilePath(key: string): string {
  return join(getDataDir(), ...key.split('/'))
}

async function readMeta(key: string): Promise<Partial<StoredImageMeta>> {
  try {
    const raw = await fs.readFile(keyToFilePath(key) + META_SUFFIX, 'utf8')
    return JSON.parse(raw) as Partial<StoredImageMeta>
  } catch {
    return {}
  }
}

export class LocalStorageBackend implements StorageBackend {
  readonly id: string
  readonly type = 'local' as const
  readonly servingMode: 'proxy' | 'public'
  readonly publicUrl: string

  constructor(
    id = 'local',
    servingMode: 'proxy' | 'public' = 'proxy',
    publicUrl = ''
  ) {
    this.id = id
    this.servingMode = servingMode
    this.publicUrl = publicUrl
  }

  async put(key: string, bytes: Uint8Array, _meta: StoredImageMeta): Promise<void> {
    const filePath = keyToFilePath(key)
    const tempDir = join(getDataDir(), ATOMIC_TEMP_DIR)
    const tempPath = join(tempDir, `${randomUUID()}.part`)
    await fs.mkdir(tempDir, { recursive: true })
    await fs.mkdir(dirname(filePath), { recursive: true })

    const handle = await fs.open(tempPath, 'w')
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }

    try {
      await fs.rename(tempPath, filePath)
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {})
      throw error
    }

    try {
      const directory = await fs.open(dirname(filePath), 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } catch {
      // The rename already completed; directory fsync is best-effort on macOS.
    }
  }

  async head(key: string): Promise<StoredImage | null> {
    if (!validateStorageKey(key)) return null

    let stat
    try {
      stat = await fs.stat(keyToFilePath(key))
    } catch {
      return null
    }
    if (!stat.isFile()) return null

    const meta = await readMeta(key)
    return {
      key,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      contentType: meta.contentType ?? contentTypeFromKey(key),
      originalName: meta.originalName ?? key.split('/').pop() ?? 'image',
      uploadedAt: meta.uploadedAt ?? stat.mtime.toISOString(),
      userId: meta.userId ?? null,
      backendId: this.id
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = keyToFilePath(key)
    await fs.unlink(filePath)
    await fs.unlink(filePath + META_SUFFIX).catch(() => {})
  }

  async createStream(
    key: string,
    range?: { start: number, end: number }
  ): Promise<ReadStream> {
    return createReadStream(keyToFilePath(key), range)
  }

  async testConnection(): Promise<{ ok: boolean, message: string }> {
    try {
      await fs.access(getDataDir())
      return { ok: true, message: '本地磁盘可访问' }
    } catch {
      return { ok: false, message: '无法访问数据目录' }
    }
  }

  async getUsageStats(): Promise<{ count: number, bytes: number }> {
    return { count: 0, bytes: 0 }
  }
}

export async function cleanupLocalAtomicTempFiles(
  maxAgeMs = 60 * 60 * 1000
): Promise<number> {
  const tempDir = join(getDataDir(), ATOMIC_TEMP_DIR)
  let entries
  try {
    entries = await fs.readdir(tempDir, { withFileTypes: true })
  } catch {
    return 0
  }

  const cutoff = Date.now() - maxAgeMs
  let removed = 0
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.part')) continue
    const path = join(tempDir, entry.name)
    try {
      const stat = await fs.stat(path)
      if (stat.mtimeMs > cutoff) continue
      await fs.rm(path, { force: true })
      removed++
    } catch {
      // A later startup will retry stale temporary files.
    }
  }
  return removed
}

/** Move an already-complete file into the storage tree without loading it into memory. */
export async function putLocalFileAtomic(
  key: string,
  sourcePath: string
): Promise<void> {
  const filePath = keyToFilePath(key)
  await fs.mkdir(dirname(filePath), { recursive: true })
  try {
    await fs.rename(sourcePath, filePath)
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'EXDEV'
    ) {
      await fs.copyFile(sourcePath, filePath)
      await fs.rm(sourcePath, { force: true })
      return
    }
    throw error
  }
}
