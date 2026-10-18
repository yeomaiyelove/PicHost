import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { getDb, getUploadSourcesForKeys } from './db'
import { getDataDir } from './data-dir'
import { contentTypeFromKey } from './content-type'
import {
  DEFAULT_FOLDER,
  FILE_FOLDER,
  VIDEO_FOLDER,
  isVideoSidecarKey,
  mediaTypeForKey,
  toCanonicalImageKey,
  validateImageKey,
  validateStorageKey
} from './image-key'
import { buildTagFilterSql, type TagFilterInput } from './tags'
import { isBareImageFilename, isHiddenImageDatePath } from './image-public-path'
import {
  ensureDefaultBackends,
  ensureStorageSchema,
  LOCAL_BACKEND_ID
} from './storage-backends'
import type {
  MediaType,
  PaginatedResult,
  StoredImage,
  StoredImageMeta,
  TranscodeStatus
} from './storage/types'

const META_SUFFIX = '.meta.json'

export interface ImageIndexRow {
  key: string
  backend_id: string
  user_id: number | null
  folder: string
  media_type: MediaType
  original_name: string
  content_type: string
  size: number
  uploaded_at: string
  hls_key: string | null
  transcode_status: string
  transcode_progress: number
  thumb_key: string | null
  source_deleted: number
  transcode_preset: string | null
  transcode_error: string | null
  transcode_started_at: string | null
  transcode_duration_ms: number | null
}

function keyToFilePath(key: string): string {
  return join(getDataDir(), ...key.split('/'))
}

async function readLocalMeta(key: string): Promise<Partial<StoredImageMeta>> {
  try {
    const raw = await fs.readFile(keyToFilePath(key) + META_SUFFIX, 'utf8')
    return JSON.parse(raw) as Partial<StoredImageMeta>
  } catch {
    return {}
  }
}

function rowToStoredImage(row: ImageIndexRow): StoredImage {
  const uploadedMs = new Date(row.uploaded_at).getTime()
  return {
    key: row.key,
    backendId: row.backend_id,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
    contentType: row.content_type,
    size: row.size,
    userId: row.user_id,
    mediaType: row.media_type,
    hlsKey: row.hls_key ?? null,
    transcodeStatus: (row.transcode_status ?? 'none') as TranscodeStatus,
    transcodeProgress: Number(row.transcode_progress ?? 0),
    thumbKey: row.thumb_key ?? null,
    sourceDeleted: Number(row.source_deleted ?? 0) === 1,
    transcodePreset: row.transcode_preset ?? null,
    transcodeError: row.transcode_error ?? null,
    transcodeStartedAt: row.transcode_started_at ?? null,
    transcodeDurationMs: row.transcode_duration_ms ?? null,
    mtimeMs: Number.isFinite(uploadedMs) ? uploadedMs : Date.now()
  }
}

function buildUserFilterSql(
  userFilter: number | 'admin' | undefined,
  params: Array<string | number>
): string {
  if (userFilter === undefined || userFilter === 'admin') return ''
  params.push(userFilter)
  return ' AND user_id = ?'
}

export function insertImageIndex(input: {
  key: string
  backendId: string
  userId?: number | null
  originalName: string
  contentType: string
  size: number
  uploadedAt: string
  mediaType?: MediaType
}): void {
  ensureStorageSchema()
  const folder = input.key.split('/')[0] ?? DEFAULT_FOLDER
  getDb().prepare(`
    INSERT INTO images
      (key, backend_id, user_id, folder, original_name, content_type, size, uploaded_at, media_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      backend_id = excluded.backend_id,
      user_id = excluded.user_id,
      folder = excluded.folder,
      original_name = excluded.original_name,
      content_type = excluded.content_type,
      size = excluded.size,
      uploaded_at = excluded.uploaded_at,
      media_type = excluded.media_type
  `).run(
    input.key,
    input.backendId,
    input.userId ?? null,
    folder,
    input.originalName,
    input.contentType,
    input.size,
    input.uploadedAt,
    input.mediaType ?? 'image'
  )
}

export function deleteImageIndex(key: string): void {
  ensureStorageSchema()
  getDb().prepare('DELETE FROM images WHERE key = ?').run(key)
}

function preferIndexedImageKey(key: string): string {
  const canonical = toCanonicalImageKey(key)
  if (canonical && getImageIndexRow(canonical)) return canonical
  if (validateImageKey(key)) return key
  return key
}

async function fileExistsAtKey(key: string): Promise<boolean> {
  try {
    await fs.access(keyToFilePath(key))
    return true
  } catch {
    return false
  }
}

/** 将 SQLite 中遗留顶层目录 key 归一为 images/ 下路径，并同步磁盘文件 */
export async function reconcileLegacyImageKeys(): Promise<{
  updated: number
  removed: number
}> {
  ensureStorageSchema()
  const rows = getDb().prepare('SELECT key FROM images').all() as Array<{ key: string }>
  let updated = 0
  let removed = 0

  for (const { key } of rows) {
    if (validateImageKey(key)) continue

    const canonical = toCanonicalImageKey(key)
    if (!canonical) continue

    const canonicalRow = getImageIndexRow(canonical)
    if (canonicalRow) {
      deleteImageIndex(key)
      removed++
      continue
    }

    const canonicalExists = await fileExistsAtKey(canonical)
    const legacyExists = await fileExistsAtKey(key)

    if (canonicalExists) {
      getDb().prepare(`
        UPDATE images
        SET key = ?, folder = ?
        WHERE key = ?
      `).run(canonical, DEFAULT_FOLDER, key)
      updated++
      continue
    }

    if (legacyExists) {
      const legacyPath = keyToFilePath(key)
      const canonicalPath = keyToFilePath(canonical)
      await fs.mkdir(dirname(canonicalPath), { recursive: true })
      await fs.rename(legacyPath, canonicalPath)
      try {
        await fs.rename(legacyPath + META_SUFFIX, canonicalPath + META_SUFFIX)
      } catch {
        // no meta
      }
      getDb().prepare(`
        UPDATE images
        SET key = ?, folder = ?
        WHERE key = ?
      `).run(canonical, DEFAULT_FOLDER, key)
      updated++
    }
  }

  return { updated, removed }
}

/** 移除 SQLite 中有记录但本地磁盘无对应文件的索引行 */
export async function purgeOrphanImageIndexRows(): Promise<number> {
  ensureStorageSchema()
  const rows = getDb().prepare(`
    SELECT key, backend_id, source_deleted FROM images
  `).all() as Array<{ key: string, backend_id: string, source_deleted: number }>

  let removed = 0
  for (const row of rows) {
    // 转码成功后源文件是主动删除的，索引要保留（播放走 HLS）
    if (Number(row.source_deleted ?? 0) === 1) continue
    if (row.backend_id !== LOCAL_BACKEND_ID) continue
    if (await fileExistsAtKey(row.key)) continue
    const canonical = toCanonicalImageKey(row.key)
    if (canonical && await fileExistsAtKey(canonical)) continue
    deleteImageIndex(row.key)
    removed++
  }
  return removed
}

export function getImageIndexRow(key: string): ImageIndexRow | null {
  ensureStorageSchema()
  const row = getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    WHERE key = ?
  `).get(key) as ImageIndexRow | undefined
  return row ?? null
}

export function getImageIndexAsStored(key: string): StoredImage | null {
  const row = getImageIndexRow(key)
  return row ? rowToStoredImage(row) : null
}

/** 隐藏目录 URL（YYYY/MM/file）反查完整 key；多目录同名时优先 images */
export function findImageKeyByDatePath(datePath: string): string | null {
  if (!isHiddenImageDatePath(datePath)) return null

  ensureStorageSchema()
  const suffix = `/${datePath}`
  const rows = getDb().prepare(`
    SELECT key FROM images WHERE media_type = 'image' AND key LIKE ?
  `).all(`%${suffix}`) as Array<{ key: string }>

  if (rows.length === 0) {
    const fallback = `${DEFAULT_FOLDER}/${datePath}`
    return validateImageKey(fallback) ? fallback : null
  }
  if (rows.length === 1) return preferIndexedImageKey(rows[0]!.key)

  const exactDefault = rows.find(row => row.key === `${DEFAULT_FOLDER}/${datePath}`)
  if (exactDefault) return exactDefault.key

  const defaultFolder = rows.find(row => row.key.startsWith(`${DEFAULT_FOLDER}/`))
  return defaultFolder?.key ?? rows[0]!.key
}

/** 隐藏目录 URL（纯文件名）反查完整 key；多目录同名时优先 images */
export function findImageKeyByFilename(filename: string): string | null {
  if (!isBareImageFilename(filename)) return null

  ensureStorageSchema()
  const suffix = `/${filename}`
  const rows = getDb().prepare(`
    SELECT key FROM images WHERE media_type = 'image' AND key LIKE ?
  `).all(`%${suffix}`) as Array<{ key: string }>

  if (rows.length === 0) {
    const flatFallback = `${DEFAULT_FOLDER}/${filename}`
    return validateImageKey(flatFallback) ? flatFallback : null
  }
  if (rows.length === 1) return preferIndexedImageKey(rows[0]!.key)

  const exactDefault = rows.find(row => row.key === `${DEFAULT_FOLDER}/${filename}`)
  if (exactDefault) return exactDefault.key

  const defaultFolder = rows.find(row => row.key.startsWith(`${DEFAULT_FOLDER}/`))
  return defaultFolder?.key ?? rows[0]!.key
}

async function collectImageKeysRecursive(
  dir: string,
  keyPrefix: string
): Promise<string[]> {
  const keys: string[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const name = String(entry.name)
      if (entry.isDirectory()) {
        const childKeys = await collectImageKeysRecursive(
          join(dir, name),
          `${keyPrefix}/${name}`
        )
        keys.push(...childKeys)
      } else if (entry.isFile()) {
        if (name.endsWith(META_SUFFIX)) continue
        const key = `${keyPrefix}/${name}`
        if (validateStorageKey(key)) keys.push(key)
      }
    }
  } catch {
    return keys
  }

  return keys
}

/** 扫描本地磁盘的 images/、files/ 与 videos/ 目录 */
async function listLocalStorageKeys(): Promise<string[]> {
  const keys: string[] = []
  for (const root of [DEFAULT_FOLDER, FILE_FOLDER, VIDEO_FOLDER]) {
    const found = await collectImageKeysRecursive(join(getDataDir(), root), root)
    keys.push(...found)
  }
  return keys
}

export async function migrateLocalImagesToIndex(): Promise<number> {
  ensureDefaultBackends()
  const keys = await listLocalStorageKeys()
  let inserted = 0

  for (const key of keys) {
    // HLS 播放列表与分片属于视频的附属产物，不进索引
    if (isVideoSidecarKey(key)) continue

    const existing = getImageIndexRow(key)
    if (existing) continue

    let stat
    try {
      stat = await fs.stat(keyToFilePath(key))
    } catch {
      continue
    }

    const meta = await readLocalMeta(key)
    const uploadedAt = meta.uploadedAt ?? stat.mtime.toISOString()

    const inferredType = contentTypeFromKey(key)
    const contentType = meta.contentType && meta.contentType !== 'application/octet-stream'
      ? meta.contentType
      : inferredType

    insertImageIndex({
      key,
      backendId: LOCAL_BACKEND_ID,
      userId: meta.userId ?? null,
      originalName: meta.originalName ?? key.split('/').pop() ?? 'image',
      contentType,
      size: stat.size,
      uploadedAt,
      mediaType: mediaTypeForKey(key) as MediaType
    })
    inserted++
  }

  return inserted
}

export async function listFolders(): Promise<string[]> {
  return [DEFAULT_FOLDER]
}

export async function listFoldersForUser(
  _userFilter?: number | 'admin'
): Promise<string[]> {
  return [DEFAULT_FOLDER]
}

/** 修正存量索引中错误的 application/octet-stream */
export function repairLocalImageIndexMetadata(): number {
  ensureStorageSchema()
  const rows = getDb().prepare(`
    SELECT key, content_type FROM images WHERE content_type = 'application/octet-stream'
  `).all() as Array<{ key: string, content_type: string }>

  let repaired = 0
  const update = getDb().prepare(`
    UPDATE images SET content_type = ? WHERE key = ?
  `)

  for (const row of rows) {
    const inferred = contentTypeFromKey(row.key)
    if (inferred !== 'application/octet-stream') {
      update.run(inferred, row.key)
      repaired++
    }
  }

  return repaired
}

function buildBackendFilterSql(
  backendId: string | undefined,
  params: Array<string | number>
): string {
  if (!backendId) return ''
  params.push(backendId)
  return ' AND backend_id = ?'
}

export function getImageTotals(): { count: number, bytes: number } {
  ensureStorageSchema()
  const row = getDb().prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes
    FROM images
  `).get() as { count: number, bytes: number }
  return { count: row.count, bytes: Number(row.bytes) }
}

export function listAllImageIndexRows(): ImageIndexRow[] {
  ensureStorageSchema()
  return getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    ORDER BY key ASC
  `).all() as unknown as ImageIndexRow[]
}

export function listImageIndexRowsAfter(
  afterKey: string,
  limit: number
): ImageIndexRow[] {
  ensureStorageSchema()
  return getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    WHERE key > ?
    ORDER BY key ASC
    LIMIT ?
  `).all(afterKey, limit) as unknown as ImageIndexRow[]
}

export function listImageIndexRowsForUser(userId: number): ImageIndexRow[] {
  ensureStorageSchema()
  return getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    WHERE user_id = ?
    ORDER BY key ASC
  `).all(userId) as unknown as ImageIndexRow[]
}

export function listImageIndexRowsByBackend(backendId: string): ImageIndexRow[] {
  ensureStorageSchema()
  return getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    WHERE backend_id = ?
    ORDER BY key ASC
  `).all(backendId) as unknown as ImageIndexRow[]
}

export function updateImageBackendId(key: string, backendId: string): void {
  ensureStorageSchema()
  getDb().prepare(`
    UPDATE images SET backend_id = ? WHERE key = ?
  `).run(backendId, key)
}

/** 更新 HLS 转码状态；hlsKey / progress 传 null 时保留原值 */
export function updateImageTranscode(
  key: string,
  input: {
    status: TranscodeStatus
    hlsKey?: string | null
    progress?: number
    sourceDeleted?: boolean
    size?: number
    preset?: string | null
    error?: string | null
    startedAt?: string | null
    durationMs?: number | null
  }
): void {
  ensureStorageSchema()
  getDb().prepare(`
    UPDATE images
    SET transcode_status = ?,
        hls_key = COALESCE(?, hls_key),
        transcode_progress = COALESCE(?, transcode_progress),
        source_deleted = COALESCE(?, source_deleted),
        size = COALESCE(?, size),
        transcode_preset = COALESCE(?, transcode_preset),
        transcode_error = ?,
        transcode_started_at = COALESCE(?, transcode_started_at)
        , transcode_duration_ms = COALESCE(?, transcode_duration_ms)
    WHERE key = ?
  `).run(
    input.status,
    input.hlsKey ?? null,
    input.progress ?? null,
    input.sourceDeleted === undefined ? null : (input.sourceDeleted ? 1 : 0),
    input.size ?? null,
    input.preset ?? null,
    input.error ?? null,
    input.startedAt ?? null,
    input.durationMs ?? null,
    key
  )
}

/** 启动时恢复被中断的转码任务 */
export function listPendingTranscodeRows(): Array<{
  key: string
  preset: string | null
}> {
  ensureStorageSchema()
  const rows = getDb().prepare(`
    SELECT key, transcode_preset FROM images
    WHERE media_type = 'video' AND transcode_status IN ('pending', 'running')
    ORDER BY uploaded_at ASC
  `).all() as Array<{ key: string, transcode_preset: string | null }>
  return rows.map(row => ({ key: row.key, preset: row.transcode_preset }))
}

/** 转码已完成但仍保留源文件的视频（用于补删历史遗留） */
export function listTranscodedSourceRows(): Array<{ key: string, hlsKey: string }> {
  ensureStorageSchema()
  const rows = getDb().prepare(`
    SELECT key, hls_key FROM images
    WHERE media_type = 'video'
      AND transcode_status = 'done'
      AND source_deleted = 0
      AND hls_key IS NOT NULL
  `).all() as Array<{ key: string, hls_key: string }>
  return rows.map(row => ({ key: row.key, hlsKey: row.hls_key }))
}

/** 记录视频封面缩略图 key */
export function updateImageThumb(key: string, thumbKey: string): void {
  ensureStorageSchema()
  getDb().prepare('UPDATE images SET thumb_key = ? WHERE key = ?').run(thumbKey, key)
}

export interface MediaStats {
  uploadToday: number
  uploadYesterday: number
  uploadMonth: number
  uploadLastMonth: number
  uploadTotal: number
  storedCount: number
  uploadBytesTotal: number
  bySource: { web: number, api: number }
}

/** 按媒体类型统计（图片 / 视频 / 文件各自独立） */
export function getMediaStats(
  mediaType: MediaType,
  userFilter?: number | 'admin'
): MediaStats {
  ensureStorageSchema()
  const params: Array<string | number> = [mediaType]
  const userSql = buildUserFilterSql(userFilter, params)
  // 转码中的视频还没入库，与列表口径保持一致：统计不计入
  const transcodeSql = mediaType === 'video'
    ? ` AND transcode_status IN ('none', 'done', 'failed')`
    : ''
  const rows = getDb().prepare(`
    SELECT size, uploaded_at FROM images
    WHERE media_type = ?${transcodeSql}${userSql}
  `).all(...params) as Array<{ size: number, uploaded_at: string }>

  const startOfDay = startOfDayIsoInShanghai()
  const startOfYesterday = startOfYesterdayIsoInShanghai()
  const startOfMonth = startOfMonthIsoInShanghai()
  const startOfLastMonth = startOfLastMonthIsoInShanghai()

  let bytes = 0
  let today = 0
  let yesterday = 0
  let month = 0
  let lastMonth = 0

  for (const row of rows) {
    bytes += row.size
    if (row.uploaded_at >= startOfDay) today++
    if (row.uploaded_at >= startOfYesterday && row.uploaded_at < startOfDay) yesterday++
    if (row.uploaded_at >= startOfMonth) month++
    if (row.uploaded_at >= startOfLastMonth && row.uploaded_at < startOfMonth) lastMonth++
  }

  // 来源分布来自上传日志，按目录前缀区分类型
  const prefix = mediaType === 'video' ? 'videos/' : mediaType === 'file' ? 'files/' : 'images/'
  const sourceRows = getDb().prepare(`
    SELECT source, COUNT(*) AS count FROM activity_logs
    WHERE action = 'upload' AND key LIKE ?
    GROUP BY source
  `).all(`${prefix}%`) as Array<{ source: string, count: number }>

  const bySource = { web: 0, api: 0 }
  for (const row of sourceRows) {
    if (row.source === 'web') bySource.web = row.count
    else if (row.source === 'api') bySource.api = row.count
  }

  return {
    uploadToday: today,
    uploadYesterday: yesterday,
    uploadMonth: month,
    uploadLastMonth: lastMonth,
    uploadTotal: rows.length,
    storedCount: rows.length,
    uploadBytesTotal: bytes,
    bySource
  }
}

export async function countImages(
  userFilter?: number | 'admin',
  backendId?: string,
  tagFilter?: TagFilterInput,
  mediaType: MediaType | 'all' = 'image'
): Promise<number> {
  ensureStorageSchema()
  const params: Array<string | number> = []
  const clauses: string[] = ['1=1']

  if (mediaType !== 'all') {
    clauses.push('media_type = ?')
    params.push(mediaType)
  }

  const userSql = buildUserFilterSql(userFilter, params)
  const backendSql = buildBackendFilterSql(backendId, params)
  const tagSql = buildTagFilterSql(tagFilter, params)
  const row = getDb().prepare(`
    SELECT COUNT(*) AS count FROM images WHERE ${clauses.join(' AND ')}${userSql}${backendSql}${tagSql}
  `).get(...params) as { count: number }

  return row.count
}

function paginateSlice<T>(
  all: T[],
  limit: number,
  page?: number
): PaginatedResult<T> {
  const total = all.length
  const pageSize = limit
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const requestedPage = Math.max(1, page ?? 1)
  const safePage = Math.min(requestedPage, totalPages)
  const start = (safePage - 1) * pageSize
  const items = all.slice(start, start + pageSize)

  return { items, total, page: safePage, pageSize, totalPages }
}

function filterImageRows(
  rows: ImageIndexRow[],
  options: {
    contentType?: string
    uploadSource?: 'web' | 'api'
  }
): ImageIndexRow[] {
  let filtered = rows
  if (options.contentType) {
    filtered = filtered.filter(row => row.content_type === options.contentType)
  }
  if (options.uploadSource) {
    const sourceMap = getUploadSourcesForKeys(filtered.map(row => row.key))
    filtered = filtered.filter(row => sourceMap.get(row.key) === options.uploadSource)
  }
  return filtered
}

export async function listImages(options: {
  limit: number
  page?: number
  userFilter?: number | 'admin'
  backendId?: string
  contentType?: string
  uploadSource?: 'web' | 'api'
  tagFilter?: TagFilterInput
  mediaType?: MediaType
  /** 只返回这些转码状态的条目（视频库用来隐藏转码中的视频） */
  transcodeStatuses?: TranscodeStatus[]
}): Promise<PaginatedResult<StoredImage>> {
  ensureStorageSchema()
  const params: Array<string | number> = []
  const clauses: string[] = ['1=1']

  clauses.push('media_type = ?')
  params.push(options.mediaType ?? 'image')

  if (options.transcodeStatuses?.length) {
    clauses.push(`transcode_status IN (${options.transcodeStatuses.map(() => '?').join(', ')})`)
    params.push(...options.transcodeStatuses)
  }

  const userSql = buildUserFilterSql(options.userFilter, params)
  const backendSql = buildBackendFilterSql(options.backendId, params)
  const tagSql = buildTagFilterSql(options.tagFilter, params)
  const rows = getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    WHERE ${clauses.join(' AND ')}${userSql}${backendSql}${tagSql}
    ORDER BY uploaded_at DESC, key DESC
  `).all(...params) as unknown as ImageIndexRow[]

  const filtered = filterImageRows(rows, {
    contentType: options.contentType,
    uploadSource: options.uploadSource
  })
  const sliced = paginateSlice(filtered, options.limit, options.page)
  return {
    ...sliced,
    items: sliced.items.map(rowToStoredImage)
  }
}

export async function searchImages(options: {
  query: string
  limit: number
  page?: number
  userFilter?: number | 'admin'
  backendId?: string
  contentType?: string
  uploadSource?: 'web' | 'api'
  tagFilter?: TagFilterInput
  mediaType?: MediaType
  transcodeStatuses?: TranscodeStatus[]
}): Promise<PaginatedResult<StoredImage>> {
  ensureStorageSchema()
  const needle = options.query.trim().toLowerCase()
  const params: Array<string | number> = []
  const clauses: string[] = ['1=1']

  clauses.push('media_type = ?')
  params.push(options.mediaType ?? 'image')

  if (options.transcodeStatuses?.length) {
    clauses.push(`transcode_status IN (${options.transcodeStatuses.map(() => '?').join(', ')})`)
    params.push(...options.transcodeStatuses)
  }

  const userSql = buildUserFilterSql(options.userFilter, params)
  const backendSql = buildBackendFilterSql(options.backendId, params)
  const tagSql = buildTagFilterSql(options.tagFilter, params)
  const rows = getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    WHERE ${clauses.join(' AND ')}${userSql}${backendSql}${tagSql}
    ORDER BY uploaded_at DESC, key DESC
  `).all(...params) as unknown as ImageIndexRow[]

  const matches = rows.filter((row) => {
    if (!needle) return true
    return row.key.toLowerCase().includes(needle)
      || row.original_name.toLowerCase().includes(needle)
  })

  const filtered = filterImageRows(matches, {
    contentType: options.contentType,
    uploadSource: options.uploadSource
  })
  const sliced = paginateSlice(filtered, options.limit, options.page)
  return {
    ...sliced,
    items: sliced.items.map(rowToStoredImage)
  }
}

export async function getFolderStorageStats(
  userFilter?: number | 'admin',
  tagFilter?: TagFilterInput
): Promise<Array<{ folder: string, count: number, bytes: number }>> {
  ensureStorageSchema()
  const params: Array<string | number> = []
  const userSql = buildUserFilterSql(userFilter, params)
  const tagSql = buildTagFilterSql(tagFilter, params)

  const rows = getDb().prepare(`
    SELECT folder, COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes
    FROM images
    WHERE 1=1${userSql}${tagSql}
    GROUP BY folder
    ORDER BY bytes DESC, folder ASC
  `).all(...params) as Array<{ folder: string, count: number, bytes: number }>

  return rows
}

function startOfDayIsoInShanghai(now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  return new Date(Date.UTC(y, m, d) - 8 * 60 * 60 * 1000).toISOString()
}

function startOfMonthIsoInShanghai(now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  return new Date(Date.UTC(y, m, 1) - 8 * 60 * 60 * 1000).toISOString()
}

function startOfLastMonthIsoInShanghai(now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  return new Date(Date.UTC(y, m - 1, 1) - 8 * 60 * 60 * 1000).toISOString()
}

function startOfYesterdayIsoInShanghai(now = new Date()): string {
  const startOfDay = startOfDayIsoInShanghai(now)
  return new Date(new Date(startOfDay).getTime() - 24 * 60 * 60 * 1000).toISOString()
}

export async function getUserScopedStorageStats(
  userId: number,
  tagFilter?: TagFilterInput
): Promise<{
  storedCount: number
  uploadBytesTotal: number
  uploadToday: number
  uploadYesterday: number
  uploadMonth: number
  uploadLastMonth: number
  byFolder: Array<{ folder: string, count: number, bytes: number }>
}> {
  ensureStorageSchema()
  const startOfDay = startOfDayIsoInShanghai()
  const startOfMonth = startOfMonthIsoInShanghai()
  const startOfYesterday = startOfYesterdayIsoInShanghai()
  const startOfLastMonth = startOfLastMonthIsoInShanghai()

  const params: Array<string | number> = [userId]
  const tagSql = buildTagFilterSql(tagFilter, params)
  const rows = getDb().prepare(`
    SELECT folder, size, uploaded_at
    FROM images
    WHERE user_id = ?${tagSql}
  `).all(...params) as Array<{ folder: string, size: number, uploaded_at: string }>

  const map = new Map<string, { count: number, bytes: number }>()
  let uploadBytesTotal = 0
  let uploadToday = 0
  let uploadYesterday = 0
  let uploadMonth = 0
  let uploadLastMonth = 0

  for (const row of rows) {
    uploadBytesTotal += row.size
    if (row.uploaded_at >= startOfDay) uploadToday += 1
    if (row.uploaded_at >= startOfYesterday && row.uploaded_at < startOfDay) uploadYesterday += 1
    if (row.uploaded_at >= startOfMonth) uploadMonth += 1
    if (row.uploaded_at >= startOfLastMonth && row.uploaded_at < startOfMonth) uploadLastMonth += 1

    const current = map.get(row.folder) ?? { count: 0, bytes: 0 }
    current.count += 1
    current.bytes += row.size
    map.set(row.folder, current)
  }

  const byFolder = [...map.entries()]
    .map(([folder, stat]) => ({ folder, ...stat }))
    .sort((a, b) => b.bytes - a.bytes || a.folder.localeCompare(b.folder))

  return {
    storedCount: rows.length,
    uploadBytesTotal,
    uploadToday,
    uploadYesterday,
    uploadMonth,
    uploadLastMonth,
    byFolder
  }
}

export async function listImageKeysForAutoDelete(): Promise<StoredImage[]> {
  ensureStorageSchema()
  const rows = getDb().prepare(`
    SELECT key, backend_id, user_id, folder, media_type, original_name, content_type, size, uploaded_at, hls_key, transcode_status, transcode_progress, thumb_key, source_deleted, transcode_preset, transcode_started_at, transcode_duration_ms, transcode_error
    FROM images
    WHERE media_type = 'image'
    ORDER BY uploaded_at ASC
  `).all() as unknown as ImageIndexRow[]

  return rows.map(rowToStoredImage)
}
