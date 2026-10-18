import { basename } from 'node:path'
import { File as BufferFile } from 'node:buffer'
import {
  Agent,
  FormData as UndiciFormData,
  fetch as undiciFetch
} from 'undici'
import type { Readable } from 'node:stream'
import { contentTypeFromKey } from '../content-type'
import {
  getImageIndexRow,
  listAllImageIndexRows,
  type ImageIndexRow
} from '../image-index'
import {
  findUserByUsername,
  getPrimaryAdminUserId,
  listUserIdUsernameMap
} from '../db'
import { collectMediaAssetKeys } from '../media-assets'
import {
  getActiveBackend,
  getBackendForKey
} from '../storage/resolver'
import type { StorageBackend } from '../storage/types'
import {
  getBackupJob,
  markJobDone,
  markJobFailed,
  updateBackupJob
} from '../backup/jobs'
import {
  createJobCancelledError,
  getJobAbortSignal,
  isJobCancellationRequested,
  isJobCancelledError,
  throwIfJobCancellationRequested
} from '../backup/cancel-state'
import { applySiteSyncMedia } from './apply'
import {
  completeSiteSyncMediaArtifacts,
  recordSiteSyncArtifact
} from './artifacts'
import {
  SITE_SYNC_CHUNK_SIZE,
  type SiteSyncChunkMetadata
} from './chunks'
import { toSiteSyncMediaTransferWithTags } from './manifest'
import type {
  SiteSyncDirection,
  SiteSyncInventory,
  SiteSyncMediaBundle,
  SiteSyncMediaPage,
  SiteSyncUsers
} from './protocol'

export interface SiteSyncOptions {
  targetBaseUrl: string
  conflictMode: 'skip' | 'overwrite'
  direction: SiteSyncDirection
  /** 同步内容：全站或某一类媒体 */
  scope?: SiteSyncScope
  /** 指定资源（与 scope 互斥，限定同一类型） */
  keys?: string[]
}

export type SiteSyncScope = 'all' | 'image' | 'video' | 'file'

const tokens = (globalThis as typeof globalThis & {
  __pichostSiteSyncTokens?: Map<string, string>
}).__pichostSiteSyncTokens ?? new Map<string, string>()
;(globalThis as typeof globalThis & {
  __pichostSiteSyncTokens?: Map<string, string>
}).__pichostSiteSyncTokens = tokens

export function registerSiteSyncToken(jobId: string, token: string): void {
  tokens.set(jobId, token)
}

const SITE_SYNC_CONNECT_TIMEOUT_MS = 3 * 1000
const SITE_SYNC_RESPONSE_IDLE_TIMEOUT_MS = 3 * 1000
const SITE_SYNC_CHUNK_RESPONSE_TIMEOUT_MS = 15 * 1000

interface SiteSyncAgents {
  upload: Agent
  object: Agent
}

const agents = (globalThis as typeof globalThis & {
  __pichostSiteSyncAgents?: SiteSyncAgents
}).__pichostSiteSyncAgents ?? {
  upload: new Agent({
    connect: { timeout: SITE_SYNC_CONNECT_TIMEOUT_MS },
    headersTimeout: SITE_SYNC_CHUNK_RESPONSE_TIMEOUT_MS,
    bodyTimeout: SITE_SYNC_RESPONSE_IDLE_TIMEOUT_MS
  }),
  object: new Agent({
    connect: { timeout: SITE_SYNC_CONNECT_TIMEOUT_MS },
    headersTimeout: SITE_SYNC_RESPONSE_IDLE_TIMEOUT_MS,
    bodyTimeout: SITE_SYNC_RESPONSE_IDLE_TIMEOUT_MS
  })
}
;(globalThis as typeof globalThis & {
  __pichostSiteSyncAgents?: SiteSyncAgents
}).__pichostSiteSyncAgents = agents

async function streamToBuffer(
  stream: Readable,
  signal?: AbortSignal
): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    if (signal?.aborted) {
      stream.destroy(createJobCancelledError())
      throw createJobCancelledError()
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function targetUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

async function responseError(response: {
  status: number
  json: () => Promise<unknown>
}): Promise<Error> {
  const payload = await response.json().catch(() => null) as {
    message?: string
    statusMessage?: string
  } | null
  return new Error(payload?.message || payload?.statusMessage || `目标站点返回 ${response.status}`)
}

function parseResponseErrorText(
  text: string,
  status: number
): Error {
  try {
    const payload = JSON.parse(text) as {
      message?: string
      statusMessage?: string
    }
    return new Error(
      payload.message
      || payload.statusMessage
      || `目标站点返回 ${status}`
    )
  } catch {
    return new Error(`目标站点返回 ${status}`)
  }
}

const SITE_SYNC_MAX_ATTEMPTS = 3

export interface SiteSyncRetryStatus {
  attempt: number
  maxAttempts: number
  phase: 'attempt' | 'countdown' | 'active' | 'retry'
  delayMs?: number
  remainingMs?: number
  error?: Error
}

function formatRetryStatus(
  step: string,
  status: SiteSyncRetryStatus
): string {
  if (status.phase === 'attempt') {
    return `${step}（第 ${status.attempt}/${status.maxAttempts} 次）`
  }
  if (status.phase === 'countdown') {
    const seconds = Math.max(
      1,
      Math.ceil((status.remainingMs ?? 0) / 1000)
    )
    return `${step}（第 ${status.attempt}/${status.maxAttempts} 次）· 连接倒计时 ${seconds}s`
  }
  if (status.phase === 'active') {
    return step.startsWith('上传对象')
      ? `${step} · 已连接，上传中`
      : `${step} · 连接已建立，等待响应`
  }
  if ((status.delayMs ?? 0) < 1000) {
    return `${step}第 ${status.attempt}/${status.maxAttempts} 次无响应，即将重试：${status.error?.message ?? '连接失败'}`
  }
  const seconds = Math.max(1, Math.round((status.delayMs ?? 0) / 1000))
  return `${step}第 ${status.attempt}/${status.maxAttempts} 次失败，${seconds} 秒后重试：${status.error?.message ?? '连接失败'}`
}

function normalizeSiteSyncError(error: Error): Error {
  if (/timeout/i.test(error.name) || /timed out|idle for too long/i.test(error.message)) {
    return new Error('目标站点在 3 秒内未响应')
  }
  if (error instanceof TypeError && /fetch failed|terminated/i.test(error.message)) {
    return new Error('目标站点无法连接')
  }
  return error
}

export async function retrySiteSyncOperation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  onStatus?: (status: SiteSyncRetryStatus) => void
): Promise<T> {
  if (signal?.aborted) throw createJobCancelledError()
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= SITE_SYNC_MAX_ATTEMPTS; attempt++) {
    let countdownTimer: ReturnType<typeof setInterval> | null = null
    try {
      onStatus?.({
        attempt,
        maxAttempts: SITE_SYNC_MAX_ATTEMPTS,
        phase: 'attempt'
      })
      if (onStatus) {
        let remainingMs = SITE_SYNC_CONNECT_TIMEOUT_MS
        onStatus({
          attempt,
          maxAttempts: SITE_SYNC_MAX_ATTEMPTS,
          phase: 'countdown',
          remainingMs
        })
        countdownTimer = setInterval(() => {
          remainingMs -= 1000
          if (remainingMs <= 0) {
            if (countdownTimer) clearInterval(countdownTimer)
            countdownTimer = null
            onStatus({
              attempt,
              maxAttempts: SITE_SYNC_MAX_ATTEMPTS,
              phase: 'active',
              remainingMs: 0
            })
            return
          }
          onStatus({
            attempt,
            maxAttempts: SITE_SYNC_MAX_ATTEMPTS,
            phase: 'countdown',
            remainingMs
          })
        }, 1000)
      }
      return await operation()
    } catch (error) {
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = null
      if (signal?.aborted) throw createJobCancelledError()
      lastError = error instanceof Error ? error : new Error('两站点同步失败')
      if (attempt < SITE_SYNC_MAX_ATTEMPTS) {
        const delayMs = 0
        onStatus?.({
          attempt,
          maxAttempts: SITE_SYNC_MAX_ATTEMPTS,
          phase: 'retry',
          delayMs,
          error: normalizeSiteSyncError(lastError)
        })
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timer)
            reject(createJobCancelledError())
          }
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
          }, delayMs)
          signal?.addEventListener('abort', onAbort, { once: true })
        })
      }
    } finally {
      if (countdownTimer) clearInterval(countdownTimer)
    }
  }
  throw lastError
    ? normalizeSiteSyncError(lastError)
    : new Error('两站点同步失败')
}

async function fetchSiteSyncJsonOnce<T>(
  url: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const connectionController = new AbortController()
  const onAbort = () => connectionController.abort(createJobCancelledError())
  init?.signal?.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => {
    connectionController.abort(new DOMException(
      'Target connection or TLS handshake timed out',
      'TimeoutError'
    ))
  }, SITE_SYNC_CONNECT_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Auth-Token': token,
        ...(init?.headers ?? {})
      },
      signal: init?.signal
        ? AbortSignal.any([init.signal, connectionController.signal])
        : connectionController.signal
    })
    clearTimeout(timeout)

    if (!response.body) {
      const text = await response.text()
      if (!response.ok) throw parseResponseErrorText(text, response.status)
      return JSON.parse(text) as T
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    try {
      while (true) {
        const chunk = await readChunkWithIdleTimeout(
          reader,
          init?.signal ?? undefined
        )
        if (chunk.done) break
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
    } finally {
      reader.releaseLock()
    }
    if (!response.ok) throw parseResponseErrorText(text, response.status)
    return JSON.parse(text) as T
  } finally {
    clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', onAbort)
  }
}

async function readChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal?.aborted) {
    await reader.cancel().catch(() => {})
    throw createJobCancelledError()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      void reader.cancel().catch(() => {})
      reject(createJobCancelledError())
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      void reader.cancel().catch(() => {})
      reject(new DOMException(
        'Target response body was idle for too long',
        'TimeoutError'
      ))
    }, SITE_SYNC_RESPONSE_IDLE_TIMEOUT_MS)
    signal?.addEventListener('abort', onAbort, { once: true })

    reader.read().then(
      (result) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      },
      (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
    )
  })
}

export async function fetchSiteSyncJson<T>(
  url: string,
  token: string,
  init?: RequestInit,
  signal?: AbortSignal,
  onStatus?: (status: SiteSyncRetryStatus) => void
): Promise<T> {
  return retrySiteSyncOperation(
    () => fetchSiteSyncJsonOnce<T>(url, token, {
      ...init,
      signal
    }),
    signal,
    onStatus
  )
}

async function uploadSiteSyncChunk(input: {
  jobId: string
  targetBaseUrl: string
  token: string
  metadata: SiteSyncChunkMetadata
  index: number
  bytes: Uint8Array
  uploadedChunks: number
  onProgress?: (message: string) => void
}): Promise<{
  received: number
  totalChunks: number
  complete: boolean
}> {
  const controller = new AbortController()
  const jobSignal = getJobAbortSignal(input.jobId)
  const onAbort = () => controller.abort(createJobCancelledError())
  jobSignal.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(
      'Chunk upload made no progress for 15 seconds',
      'TimeoutError'
    ))
  }, SITE_SYNC_CHUNK_RESPONSE_TIMEOUT_MS)
  const startedAt = Date.now()
  const fileName = basename(input.metadata.key)
  const updateUploadTime = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000)
    input.onProgress?.(
      `上传对象 ${fileName} · 已连接，上传中 · 已上传 ${input.uploadedChunks}/${input.metadata.totalChunks} 块 · 等待 ${seconds}s`
    )
  }
  updateUploadTime()
  const ticker = setInterval(updateUploadTime, 1000)

  try {
    const encoded = Buffer.from(JSON.stringify(input.metadata))
      .toString('base64url')
    const response = await undiciFetch(
      targetUrl(input.targetBaseUrl, '/api/site-sync/chunk'),
      {
        method: 'POST',
        body: input.bytes,
        headers: {
          'Auth-Token': input.token,
          'Content-Type': 'application/octet-stream',
          'X-PicHost-Chunk-Metadata': encoded,
          'X-PicHost-Chunk-Index': String(input.index)
        },
        signal: AbortSignal.any([jobSignal, controller.signal]),
        dispatcher: agents.upload
      }
    )
    if (!response.ok) throw await responseError(response)
    return await response.json() as {
      received: number
      totalChunks: number
      complete: boolean
    }
  } finally {
    clearTimeout(timeout)
    clearInterval(ticker)
    jobSignal.removeEventListener('abort', onAbort)
  }
}

async function uploadObject(
  jobId: string,
  options: SiteSyncOptions,
  token: string,
  backend: StorageBackend,
  row: ImageIndexRow,
  ownerUsername: string | null,
  key: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const stored = await backend.head(key)
  if (!stored) throw new Error(`源文件不存在：${key}`)
  const isPrimary = key === row.key
  const originalName = isPrimary ? row.original_name : basename(key)
  const contentType = isPrimary ? row.content_type : contentTypeFromKey(key)
  const mediaType = isPrimary
    ? row.media_type
    : key.startsWith('videos/')
      ? 'video'
      : key.startsWith('files/')
        ? 'file'
        : 'image'

  if (stored.size > SITE_SYNC_CHUNK_SIZE) {
    const totalChunks = Math.ceil(stored.size / SITE_SYNC_CHUNK_SIZE)
    const metadata: SiteSyncChunkMetadata = {
      jobId,
      mediaKey: row.key,
      key,
      totalSize: stored.size,
      totalChunks,
      ownerUsername,
      originalName,
      uploadedAt: row.uploaded_at,
      contentType,
      mediaType,
      conflictMode: options.conflictMode,
      backendId: backend.id,
      updatedAt: new Date().toISOString()
    }
    const status = await fetchSiteSyncJson<{
      received: number[]
      totalChunks: number
    }>(
      targetUrl(
        options.targetBaseUrl,
        `/api/site-sync/chunk-status?jobId=${encodeURIComponent(jobId)}&key=${encodeURIComponent(key)}`
      ),
      token,
      undefined,
      getJobAbortSignal(jobId),
      (onStatus) => {
        onProgress?.(
          formatRetryStatus(`检查对象 ${basename(key)} 分块进度`, onStatus)
        )
      }
    )
    const received = new Set(status.received)
    for (let index = 0; index < totalChunks; index++) {
      if (received.has(index)) continue
      throwIfJobCancellationRequested(jobId)
      const start = index * SITE_SYNC_CHUNK_SIZE
      const end = Math.min(stored.size, start + SITE_SYNC_CHUNK_SIZE) - 1
      const bytes = await streamToBuffer(
        await backend.createStream(key, { start, end }),
        getJobAbortSignal(jobId)
      )
      const result = await uploadSiteSyncChunk({
        jobId,
        targetBaseUrl: options.targetBaseUrl,
        token,
        metadata,
        index,
        bytes,
        uploadedChunks: received.size,
        onProgress
      })
      received.add(index)
      onProgress?.(
        `上传对象 ${basename(key)} · 已连接，上传中 · 已上传 ${result.received}/${result.totalChunks} 块`
      )
    }
    await fetchSiteSyncJsonOnce<{ success: boolean }>(
      targetUrl(options.targetBaseUrl, '/api/site-sync/chunk-finalize'),
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, key }),
        signal: getJobAbortSignal(jobId)
      }
    )
    return
  }

  const bytes = await streamToBuffer(
    await backend.createStream(key),
    getJobAbortSignal(jobId)
  )
  throwIfJobCancellationRequested(jobId)
  const form = new UndiciFormData()
  form.append('jobId', jobId)
  form.append('mediaKey', row.key)
  form.append('key', key)
  form.append('conflictMode', options.conflictMode)
  form.append('ownerUsername', ownerUsername ?? '')
  form.append('originalName', originalName)
  form.append('uploadedAt', row.uploaded_at)
  form.append('contentType', contentType)
  form.append(
    'file',
    new BufferFile(
      [new Uint8Array(bytes)],
      basename(key),
      { type: contentType }
    )
  )

  const response = await undiciFetch(
    targetUrl(options.targetBaseUrl, '/api/site-sync/object'),
    {
      method: 'POST',
      body: form,
      headers: { 'Auth-Token': token },
      signal: getJobAbortSignal(jobId),
      dispatcher: agents.upload
    }
  )
  if (!response.ok) throw await responseError(response)
  await response.json().catch(() => null)
}

async function downloadSiteSyncObject(
  jobId: string,
  options: SiteSyncOptions,
  token: string,
  key: string
): Promise<Buffer> {
  const response = await undiciFetch(
    targetUrl(
      options.targetBaseUrl,
      `/api/site-sync/object?key=${encodeURIComponent(key)}`
    ),
    {
      headers: {
        'Auth-Token': token
      },
      signal: getJobAbortSignal(jobId),
      dispatcher: agents.object
    }
  )
  if (!response.ok) throw await responseError(response)
  return Buffer.from(await response.arrayBuffer())
}

async function runSiteSyncPull(
  jobId: string,
  options: SiteSyncOptions,
  token: string
): Promise<void> {
  const job = getBackupJob(jobId)
  const jobSignal = getJobAbortSignal(jobId)
  const checkpoint = job?.payload ?? {}
  let lastMediaKey = typeof checkpoint.lastMediaKey === 'string'
    ? checkpoint.lastMediaKey
    : ''
  let scanned = Number(checkpoint.scanned ?? 0)
  let added = Number(checkpoint.added ?? 0)
  let skipped = Number(checkpoint.skipped ?? 0)
  let filesSynced = Number(checkpoint.filesSynced ?? 0)
  let totalFiles = Number(checkpoint.totalFiles ?? 0)
  let totalMedia = Number(checkpoint.totalMedia ?? job?.total ?? 0)
  const failedKeys = new Set(
    Array.isArray(checkpoint.failedKeys)
      ? checkpoint.failedKeys.filter((key): key is string => typeof key === 'string')
      : []
  )

  const saveCheckpoint = (message: string, cancelled = false) => {
    updateBackupJob(jobId, {
      progress: scanned,
      total: totalMedia,
      message,
      payload: {
        targetBaseUrl: options.targetBaseUrl,
        conflictMode: options.conflictMode,
        direction: 'pull',
        cancelled,
        lastMediaKey,
        scanned,
        added,
        skipped,
        failed: failedKeys.size,
        filesSynced,
        totalFiles,
        totalMedia,
        failedKeys: [...failedKeys],
        resumable: true
      }
    })
  }
  const progressMessage = (suffix = '') => (
    `扫描 ${scanned}/${totalMedia || scanned} · 新增 ${added} · 跳过 ${skipped} · 失败 ${failedKeys.size}${suffix}`
  )
  const updateLiveStatus = (step: string, status?: SiteSyncRetryStatus) => {
    const detail = status ? formatRetryStatus(step, status) : step
    try {
      updateBackupJob(jobId, {
        message: progressMessage(` · ${detail}`)
      })
    } catch {
      // Progress messages must never fail the sync itself.
    }
  }
  const failAndCheckpoint = (error: unknown) => {
    const cancelled = isJobCancellationRequested(jobId)
      || isJobCancelledError(error)
    const message = cancelled
      ? progressMessage(' · 已取消，已保存断点')
      : progressMessage(' · 已保存断点')
    saveCheckpoint(message, cancelled)
    markJobFailed(
      jobId,
      cancelled
        ? '任务已取消'
        : error instanceof Error
          ? error.message
          : '从目标站点拉取失败',
      message
    )
  }

  try {
    const targetUsers = new Set(
      (await fetchSiteSyncJson<SiteSyncUsers>(
        targetUrl(options.targetBaseUrl, '/api/site-sync/users'),
        token,
        undefined,
        jobSignal,
        status => updateLiveStatus('连接目标站点', status)
      )).users
    )

    const backend = await retrySiteSyncOperation(
      () => getActiveBackend(),
      jobSignal
    )
    const actorUserId = job?.userId ?? getPrimaryAdminUserId() ?? 0
    const readMediaPage = (path: string) => fetchSiteSyncJson<SiteSyncMediaPage>(
      targetUrl(options.targetBaseUrl, path),
      token,
      undefined,
      jobSignal,
      status => updateLiveStatus('读取远程媒体清单', status)
    )

    const processBundleOnce = async (
      bundle: SiteSyncMediaBundle,
      isRetry: boolean,
      setStep: (step: string) => void
    ): Promise<'added' | 'skipped'> => {
      const { media, assets } = bundle
      throwIfJobCancellationRequested(jobId)
      setStep(`准备同步媒体 ${media.key}`)
      if (media.ownerUsername && !targetUsers.has(media.ownerUsername)) {
        throw new Error(`当前站点缺少同名用户：${media.ownerUsername}`)
      }
      if (
        !isRetry
        && options.conflictMode === 'skip'
        && getImageIndexRow(media.key)
      ) {
        completeSiteSyncMediaArtifacts(jobId, media.key)
        return 'skipped'
      }

      const owner = media.ownerUsername
        ? findUserByUsername(media.ownerUsername)
        : null
      for (const asset of assets) {
        throwIfJobCancellationRequested(jobId)
        setStep(`下载对象 ${basename(asset.key)}`)
        const existedBefore = Boolean(await backend.head(asset.key))
        if (options.conflictMode === 'skip' && existedBefore) {
          continue
        }
        const bytes = await downloadSiteSyncObject(
          jobId,
          options,
          token,
          asset.key
        )
        throwIfJobCancellationRequested(jobId)
        if (bytes.length !== asset.size) {
          throw new Error(
            `同步对象大小不一致：${asset.key}，预期 ${asset.size}，实际 ${bytes.length}`
          )
        }
        setStep(`写入对象 ${basename(asset.key)}`)
        const isPrimary = asset.key === media.key
        recordSiteSyncArtifact({
          jobId,
          mediaKey: media.key,
          key: asset.key,
          backendId: backend.id,
          created: !existedBefore
        })
        await backend.put(asset.key, new Uint8Array(bytes), {
          originalName: isPrimary ? media.originalName : basename(asset.key),
          uploadedAt: media.uploadedAt,
          contentType: isPrimary
            ? media.contentType
            : contentTypeFromKey(asset.key),
          size: bytes.length,
          userId: owner?.id ?? null,
          mediaType: isPrimary
            ? media.mediaType
            : asset.key.startsWith('videos/')
              ? 'video'
              : asset.key.startsWith('files/')
                ? 'file'
                : 'image'
        })
        throwIfJobCancellationRequested(jobId)
      }

      setStep(`写入媒体记录 ${media.key}`)
      await applySiteSyncMedia(media, 'overwrite', actorUserId)
      completeSiteSyncMediaArtifacts(jobId, media.key)
      return 'added'
    }
    const processBundle = (bundle: SiteSyncMediaBundle, isRetry: boolean) => {
      let step = `同步媒体 ${bundle.media.key}`
      return retrySiteSyncOperation(
        () => processBundleOnce(
          bundle,
          isRetry,
          (value) => {
            step = value
            updateLiveStatus(value)
          }
        ),
        jobSignal,
        status => updateLiveStatus(step, status)
      )
    }
    const recordOutcome = (outcome: 'added' | 'skipped', fileCount: number) => {
      if (outcome === 'added') added += 1
      else skipped += 1
      filesSynced += fileCount
      totalFiles = Math.max(totalFiles, filesSynced)
    }

    for (const key of [...failedKeys]) {
      try {
        const page = await readMediaPage(
          `/api/site-sync/media?key=${encodeURIComponent(key)}`
        )
        const bundle = page.items[0]
        if (!bundle) throw new Error(`目标媒体不存在：${key}`)
        const outcome = await processBundle(bundle, true)
        recordOutcome(outcome, bundle.assets.length)
        failedKeys.delete(key)
        if (key > lastMediaKey) lastMediaKey = key
        saveCheckpoint(progressMessage())
      } catch (error) {
        failedKeys.add(key)
        failAndCheckpoint(error)
        return
      }
    }

    let cursor = lastMediaKey
    let lastCheckpointAt = 0
    while (true) {
      let page: SiteSyncMediaPage
      try {
        page = await readMediaPage(
          `/api/site-sync/media?limit=50${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`
        )
      } catch (error) {
        failAndCheckpoint(error)
        return
      }
      totalMedia = Math.max(totalMedia, page.totalMedia)

      for (const bundle of page.items) {
        scanned += 1
        try {
          const outcome = await processBundle(bundle, false)
          recordOutcome(outcome, bundle.assets.length)
          failedKeys.delete(bundle.media.key)
        } catch (error) {
          failedKeys.add(bundle.media.key)
          lastMediaKey = bundle.media.key
          failAndCheckpoint(error)
          return
        }

        lastMediaKey = bundle.media.key
        const now = Date.now()
        if (
          now - lastCheckpointAt >= 1000
          || scanned === totalMedia
          || !page.nextCursor
        ) {
          saveCheckpoint(progressMessage())
          lastCheckpointAt = now
        }
      }

      if (!page.nextCursor) break
      cursor = page.nextCursor
    }

    if (failedKeys.size) {
      markJobFailed(
        jobId,
        `${failedKeys.size} 条媒体拉取失败`,
        progressMessage()
      )
      saveCheckpoint(progressMessage())
      return
    }

    throwIfJobCancellationRequested(jobId)
    totalFiles = filesSynced
    markJobDone(jobId, {
      message: `扫描 ${scanned}/${totalMedia || scanned} · 新增 ${added} · 跳过 ${skipped} · 失败 0`,
      payload: {
        targetBaseUrl: options.targetBaseUrl,
        conflictMode: options.conflictMode,
        direction: 'pull',
        lastMediaKey,
        scanned,
        added,
        skipped,
        failed: 0,
        filesSynced,
        totalFiles,
        totalMedia: totalMedia || scanned,
        failedKeys: [],
        resumable: false
      }
    })
  } catch (error) {
    failAndCheckpoint(error)
  }
}

export async function runSiteSyncJob(
  jobId: string,
  options: SiteSyncOptions
): Promise<void> {
  const token = tokens.get(jobId)
  if (!token) throw new Error('同步 Token 不可用，请重新发起任务')
  const jobSignal = getJobAbortSignal(jobId)

  try {
    if (options.direction === 'pull') {
      await runSiteSyncPull(jobId, options, token)
      return
    }

    const inventory = await fetchSiteSyncJson<SiteSyncInventory>(
      targetUrl(options.targetBaseUrl, '/api/site-sync/inventory'),
      token,
      undefined,
      jobSignal,
      (status) => {
        try {
          updateBackupJob(jobId, {
            message: formatRetryStatus('连接目标站点', status)
          })
        } catch {
          // Keep the sync running even if a progress update cannot be stored.
        }
      }
    )
    const targetUsers = new Set(inventory.users)
    const targetMedia = new Set(inventory.mediaKeys)
    const targetObjects = new Map(inventory.objects.map(item => [item.key, item.size]))
    const allRows = listAllImageIndexRows()
    const wantedKeys = new Set(options.keys ?? [])
    const rows = allRows.filter((row) => {
      if (wantedKeys.size) return wantedKeys.has(row.key)
      const scope = options.scope ?? 'all'
      return scope === 'all' || row.media_type === scope
    })
    const ownerMap = listUserIdUsernameMap()
    const job = getBackupJob(jobId)
    const checkpoint = job?.payload ?? {}
    let lastMediaKey = typeof checkpoint.lastMediaKey === 'string'
      ? checkpoint.lastMediaKey
      : ''
    let scanned = Number(checkpoint.scanned ?? 0)
    let added = Number(checkpoint.added ?? 0)
    let skipped = Number(checkpoint.skipped ?? 0)
    let filesSynced = Number(checkpoint.filesSynced ?? 0)
    const failedKeys = new Set(
      Array.isArray(checkpoint.failedKeys)
        ? checkpoint.failedKeys.filter((key): key is string => typeof key === 'string')
        : []
    )

    const missingUsers = [...new Set(
      rows
        .map(row => row.user_id == null ? null : ownerMap.get(row.user_id))
        .filter((name): name is string => Boolean(name))
    )].filter(name => !targetUsers.has(name))
    if (missingUsers.length) {
      throw new Error(`目标站点缺少同名用户：${missingUsers.join('、')}`)
    }

    const plans: Array<{
      row: ImageIndexRow
      ownerUsername: string | null
      backend: StorageBackend
      keys: string[]
    }> = []
    let totalFiles = 0
    updateBackupJob(jobId, {
      total: rows.length,
      progress: scanned,
      message: '正在统计同步文件…'
    })

    for (const row of rows) {
      throwIfJobCancellationRequested(jobId)
      const backend = await getBackendForKey(row.key)
      let assetKeys: string[]
      try {
        assetKeys = await collectMediaAssetKeys(row, backend)
      } catch {
        assetKeys = [
          ...(!Number(row.source_deleted ?? 0) ? [row.key] : []),
          ...(row.thumb_key ? [row.thumb_key] : []),
          ...(row.hls_key ? [row.hls_key] : [])
        ]
      }
      const keys = [...new Set(assetKeys)]
      totalFiles += keys.length
      plans.push({
        row,
        ownerUsername: row.user_id == null ? null : ownerMap.get(row.user_id) ?? null,
        backend,
        keys
      })
    }

    const saveCheckpoint = (message: string, cancelled = false) => {
      updateBackupJob(jobId, {
        progress: scanned,
        total: rows.length,
        message,
        payload: {
          targetBaseUrl: options.targetBaseUrl,
          conflictMode: options.conflictMode,
          direction: 'push',
          cancelled,
          lastMediaKey,
          scanned,
          added,
          skipped,
          failed: failedKeys.size,
          filesSynced,
          totalFiles,
          failedKeys: [...failedKeys],
          resumable: true
        }
      })
    }
    const updateLiveStatus = (step: string, status?: SiteSyncRetryStatus) => {
      const detail = status ? formatRetryStatus(step, status) : step
      try {
        updateBackupJob(jobId, {
          message: `扫描 ${scanned}/${rows.length} · 新增 ${added} · 跳过 ${skipped} · 失败 ${failedKeys.size} · ${detail}`
        })
      } catch {
        // Progress messages must never fail the sync itself.
      }
    }

    plans.sort((a, b) => (
      a.row.key < b.row.key
        ? -1
        : a.row.key > b.row.key
          ? 1
          : 0
    ))
    lastMediaKey = lastMediaKey || ''
    let lastCheckpointAt = 0
    const processPlanOnce = async (
      plan: typeof plans[number],
      isRetry: boolean,
      setStep: (step: string) => void
    ) => {
      const { row, ownerUsername, backend, keys } = plan
      throwIfJobCancellationRequested(jobId)
      setStep(`准备同步媒体 ${row.key}`)
      if (
        !isRetry
        && options.conflictMode === 'skip'
        && targetMedia.has(row.key)
      ) {
        setStep(`提交已存在的媒体 ${row.key}`)
        await fetchSiteSyncJsonOnce<{ success: boolean }>(
          targetUrl(options.targetBaseUrl, '/api/site-sync/complete'),
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, mediaKey: row.key }),
            signal: getJobAbortSignal(jobId)
          }
        )
        skipped += 1
        filesSynced = Math.min(totalFiles, filesSynced + keys.length)
        failedKeys.delete(row.key)
        return
      }

      for (const key of keys) {
        throwIfJobCancellationRequested(jobId)
        setStep(`上传对象 ${basename(key)}`)
        const stored = await backend.head(key)
        if (!stored) throw new Error(`源文件不存在：${key}`)
        if (
          options.conflictMode === 'skip'
          && targetObjects.get(key) === stored.size
        ) {
          continue
        }
        await uploadObject(
          jobId,
          options,
          token,
          backend,
          row,
          ownerUsername,
          key,
          message => setStep(message)
        )
      }

      throwIfJobCancellationRequested(jobId)
      setStep(`写入媒体记录 ${row.key}`)
      await fetchSiteSyncJsonOnce<{ success: boolean }>(
        targetUrl(options.targetBaseUrl, '/api/site-sync/media'),
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            media: toSiteSyncMediaTransferWithTags(row, ownerUsername),
            conflictMode: options.conflictMode
          }),
          signal: getJobAbortSignal(jobId)
        }
      )

      failedKeys.delete(row.key)
      added += 1
      filesSynced = Math.min(totalFiles, filesSynced + keys.length)
    }
    const processPlan = (
      plan: typeof plans[number],
      isRetry: boolean
    ) => {
      let step = `同步媒体 ${plan.row.key}`
      return retrySiteSyncOperation(
        () => processPlanOnce(
          plan,
          isRetry,
          (value) => {
            step = value
            updateLiveStatus(value)
          }
        ),
        jobSignal,
        status => updateLiveStatus(step, status)
      )
    }

    const retryPlans = plans.filter(plan => failedKeys.has(plan.row.key))
    for (const plan of retryPlans) {
      try {
        await processPlan(plan, true)
        lastMediaKey = plan.row.key
      } catch (error) {
        failedKeys.add(plan.row.key)
        const cancelled = isJobCancellationRequested(jobId)
          || isJobCancelledError(error)
        const message = `扫描 ${scanned}/${rows.length} · 新增 ${added} · 跳过 ${skipped} · 失败 ${failedKeys.size} · ${cancelled ? '已取消，' : ''}已保存断点`
        saveCheckpoint(message, cancelled)
        markJobFailed(
          jobId,
          cancelled
            ? '任务已取消'
            : error instanceof Error
              ? `${error.message} · 已保存断点`
              : '连续 3 次重试失败，已保存断点',
          message
        )
        return
      }
    }

    for (const plan of plans) {
      if (plan.row.key <= lastMediaKey) continue
      scanned += 1
      try {
        await processPlan(plan, false)
      } catch (error) {
        failedKeys.add(plan.row.key)
        lastMediaKey = plan.row.key
        const cancelled = isJobCancellationRequested(jobId)
          || isJobCancelledError(error)
        const message = `扫描 ${scanned}/${rows.length} · 新增 ${added} · 跳过 ${skipped} · 失败 ${failedKeys.size} · ${cancelled ? '已取消，' : ''}已保存断点`
        saveCheckpoint(message, cancelled)
        markJobFailed(
          jobId,
          cancelled
            ? '任务已取消'
            : error instanceof Error
              ? `${error.message} · 已保存断点`
              : '连续 3 次重试失败，已保存断点',
          message
        )
        return
      }
      lastMediaKey = plan.row.key
      const now = Date.now()
      if (now - lastCheckpointAt >= 1000 || scanned === rows.length || failedKeys.size) {
        saveCheckpoint(
          `扫描 ${scanned}/${rows.length} · 新增 ${added} · 跳过 ${skipped} · 失败 ${failedKeys.size}`
        )
        lastCheckpointAt = now
      }
    }

    if (failedKeys.size) {
      markJobFailed(
        jobId,
        `${failedKeys.size} 条媒体同步失败`,
        `扫描 ${scanned}/${rows.length} · 新增 ${added} · 跳过 ${skipped} · 失败 ${failedKeys.size}`
      )
      saveCheckpoint(
        `扫描 ${scanned}/${rows.length} · 新增 ${added} · 跳过 ${skipped} · 失败 ${failedKeys.size}`
      )
      return
    }

    throwIfJobCancellationRequested(jobId)
    markJobDone(jobId, {
      message: `扫描 ${rows.length}/${rows.length} · 新增 ${added} · 跳过 ${skipped} · 失败 0`,
      payload: {
        targetBaseUrl: options.targetBaseUrl,
        conflictMode: options.conflictMode,
        direction: 'push',
        lastMediaKey,
        scanned: rows.length,
        added,
        skipped,
        failed: 0,
        filesSynced: totalFiles,
        totalFiles,
        failedKeys: [],
        resumable: false
      }
    })
  } catch (error) {
    if (isJobCancellationRequested(jobId) || isJobCancelledError(error)) {
      markJobFailed(jobId, '任务已取消', '任务已取消')
      return
    }
    const message = error instanceof Error ? error.message : '两站点同步失败'
    markJobFailed(jobId, message)
    throw error
  } finally {
    tokens.delete(jobId)
  }
}
