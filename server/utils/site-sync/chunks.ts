import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { getDataDir } from '../data-dir'
import { findUserByUsername } from '../db'
import { getBackendById } from '../storage/resolver'
import { putLocalFileAtomic } from '../storage/local'
import type { StoredImageMeta } from '../storage/types'
import { recordSiteSyncArtifact } from './artifacts'

export const SITE_SYNC_CHUNK_SIZE = 4 * 1024 * 1024
const CHUNK_ROOT = '.pichost-tmp/site-sync-chunks'

export interface SiteSyncChunkMetadata {
  jobId: string
  mediaKey: string
  key: string
  totalSize: number
  totalChunks: number
  ownerUsername: string | null
  originalName: string
  uploadedAt: string
  contentType: string
  mediaType: StoredImageMeta['mediaType']
  conflictMode: 'skip' | 'overwrite'
  backendId: string
  updatedAt: string
}

interface StoredSession extends SiteSyncChunkMetadata {
  created: boolean
}

function uploadIdFor(jobId: string, key: string): string {
  return createHash('sha256')
    .update(jobId)
    .update('\0')
    .update(key)
    .digest('hex')
}

function sessionDir(uploadId: string): string {
  return join(getDataDir(), CHUNK_ROOT, uploadId)
}

function metadataPath(uploadId: string): string {
  return join(sessionDir(uploadId), 'session.json')
}

function chunkPath(uploadId: string, index: number): string {
  return join(sessionDir(uploadId), `chunk-${String(index).padStart(6, '0')}.part`)
}

async function readSession(uploadId: string): Promise<StoredSession | null> {
  try {
    const raw = await fs.readFile(metadataPath(uploadId), 'utf8')
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

async function writeSession(
  uploadId: string,
  session: StoredSession
): Promise<void> {
  const path = metadataPath(uploadId)
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temp, JSON.stringify(session))
  await fs.rename(temp, path)
}

export async function getSiteSyncChunkStatus(input: {
  jobId: string
  key: string
}): Promise<{
  exists: boolean
  complete: boolean
  received: number[]
  totalChunks: number
  totalSize: number
}> {
  const uploadId = uploadIdFor(input.jobId, input.key)
  const session = await readSession(uploadId)
  if (!session) {
    return {
      exists: false,
      complete: false,
      received: [],
      totalChunks: 0,
      totalSize: 0
    }
  }
  const received: number[] = []
  for (let index = 0; index < session.totalChunks; index++) {
    try {
      const stat = await fs.stat(chunkPath(uploadId, index))
      if (stat.isFile()) received.push(index)
    } catch {
      // Missing chunks are exactly what the caller needs to send.
    }
  }
  return {
    exists: true,
    complete: received.length === session.totalChunks,
    received,
    totalChunks: session.totalChunks,
    totalSize: session.totalSize
  }
}

async function ensureSession(
  metadata: SiteSyncChunkMetadata
): Promise<{ uploadId: string, session: StoredSession }> {
  const uploadId = uploadIdFor(metadata.jobId, metadata.key)
  const existing = await readSession(uploadId)
  if (existing) {
    if (
      existing.totalSize !== metadata.totalSize
      || existing.totalChunks !== metadata.totalChunks
      || existing.mediaKey !== metadata.mediaKey
    ) {
      throw new Error('分块上传会话参数不一致')
    }
    return { uploadId, session: existing }
  }

  const backend = await getBackendById(metadata.backendId)
  if (!backend) throw new Error('分块上传存储后端不存在')
  const session: StoredSession = {
    ...metadata,
    created: !await backend.head(metadata.key),
    updatedAt: new Date().toISOString()
  }
  await fs.mkdir(sessionDir(uploadId), { recursive: true })
  await writeSession(uploadId, session)
  return { uploadId, session }
}

async function writeFileAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temp, bytes)
  await fs.rename(temp, path)
}

export async function writeSiteSyncChunk(input: {
  metadata: SiteSyncChunkMetadata
  index: number
  bytes: Uint8Array
}): Promise<{
  received: number
  totalChunks: number
  complete: boolean
}> {
  const { uploadId, session } = await ensureSession(input.metadata)
  if (
    !Number.isInteger(input.index)
    || input.index < 0
    || input.index >= session.totalChunks
  ) {
    throw new Error('分块序号无效')
  }
  const start = input.index * SITE_SYNC_CHUNK_SIZE
  const expectedSize = Math.min(
    SITE_SYNC_CHUNK_SIZE,
    session.totalSize - start
  )
  if (input.bytes.length !== expectedSize) {
    throw new Error(`分块大小不一致：预期 ${expectedSize}，实际 ${input.bytes.length}`)
  }

  await writeFileAtomic(chunkPath(uploadId, input.index), input.bytes)
  session.updatedAt = new Date().toISOString()
  await writeSession(uploadId, session)
  let received = 0
  for (let index = 0; index < session.totalChunks; index++) {
    try {
      await fs.access(chunkPath(uploadId, index))
      received++
    } catch {
      // Keep counting.
    }
  }
  return {
    received,
    totalChunks: session.totalChunks,
    complete: received === session.totalChunks
  }
}

async function concatenateChunks(
  uploadId: string,
  session: StoredSession
): Promise<string> {
  const outputPath = join(sessionDir(uploadId), 'assembled.part')
  const output = await fs.open(outputPath, 'w')
  try {
    for (let index = 0; index < session.totalChunks; index++) {
      const input = await fs.open(chunkPath(uploadId, index), 'r')
      try {
        const stat = await input.stat()
        let offset = 0
        while (offset < stat.size) {
          const length = Math.min(1024 * 1024, stat.size - offset)
          const buffer = Buffer.allocUnsafe(length)
          const { bytesRead } = await input.read(buffer, 0, length, offset)
          if (!bytesRead) break
          await output.write(buffer, 0, bytesRead)
          offset += bytesRead
        }
      } finally {
        await input.close()
      }
    }
    await output.sync()
  } finally {
    await output.close()
  }
  return outputPath
}

export async function finalizeSiteSyncChunk(input: {
  jobId: string
  key: string
}): Promise<{ success: true, skipped: boolean }> {
  const uploadId = uploadIdFor(input.jobId, input.key)
  const session = await readSession(uploadId)
  if (!session) throw new Error('分块上传会话不存在')
  const status = await getSiteSyncChunkStatus(input)
  if (!status.complete) {
    throw new Error(`分块尚未上传完成：${status.received.length}/${session.totalChunks}`)
  }

  const backend = await getBackendById(session.backendId)
  if (!backend) throw new Error('分块上传存储后端不存在')
  const existing = await backend.head(session.key)
  if (session.conflictMode === 'skip' && existing) {
    await fs.rm(sessionDir(uploadId), { recursive: true, force: true })
    return { success: true, skipped: true }
  }

  const assembledPath = await concatenateChunks(uploadId, session)
  const stat = await fs.stat(assembledPath)
  if (stat.size !== session.totalSize) {
    throw new Error(`组装文件大小不一致：预期 ${session.totalSize}，实际 ${stat.size}`)
  }

  recordSiteSyncArtifact({
    jobId: session.jobId,
    mediaKey: session.mediaKey,
    key: session.key,
    backendId: session.backendId,
    created: session.created
  })

  const owner = session.ownerUsername
    ? findUserByUsername(session.ownerUsername)
    : null
  const meta: StoredImageMeta = {
    originalName: session.originalName,
    uploadedAt: session.uploadedAt,
    contentType: session.contentType,
    size: session.totalSize,
    userId: owner?.id ?? null,
    mediaType: session.mediaType
  }
  if (backend.type === 'local') {
    await putLocalFileAtomic(session.key, assembledPath)
  } else {
    const chunks: Buffer[] = []
    for (let index = 0; index < session.totalChunks; index++) {
      chunks.push(await fs.readFile(chunkPath(uploadId, index)))
    }
    await backend.put(session.key, Buffer.concat(chunks), meta)
  }
  await fs.rm(sessionDir(uploadId), { recursive: true, force: true })
  return { success: true, skipped: false }
}

export async function cleanupSiteSyncChunkSessions(
  jobId: string
): Promise<number> {
  const root = join(getDataDir(), CHUNK_ROOT)
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }
  let removed = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const session = await readSession(entry.name)
    if (session?.jobId !== jobId) continue
    await fs.rm(sessionDir(entry.name), { recursive: true, force: true })
    removed++
  }
  return removed
}

export async function cleanupExpiredSiteSyncChunkSessions(
  maxAgeMs = 24 * 60 * 60 * 1000
): Promise<number> {
  const root = join(getDataDir(), CHUNK_ROOT)
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }
  const cutoff = Date.now() - maxAgeMs
  let removed = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const session = await readSession(entry.name)
    if (!session || new Date(session.updatedAt).getTime() > cutoff) continue
    await fs.rm(sessionDir(entry.name), { recursive: true, force: true })
    removed++
  }
  return removed
}

export async function hasSiteSyncChunkSession(
  jobId: string,
  key: string
): Promise<boolean> {
  return Boolean(await readSession(uploadIdFor(jobId, key)))
}

export function isSiteSyncChunkMetadata(
  value: unknown
): value is SiteSyncChunkMetadata {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.jobId === 'string'
    && typeof item.mediaKey === 'string'
    && typeof item.key === 'string'
    && Number.isInteger(item.totalSize)
    && Number(item.totalSize) > 0
    && Number.isInteger(item.totalChunks)
    && Number(item.totalChunks) > 0
    && typeof item.originalName === 'string'
    && typeof item.uploadedAt === 'string'
    && typeof item.contentType === 'string'
    && (item.mediaType === 'image'
      || item.mediaType === 'video'
      || item.mediaType === 'file')
    && (item.conflictMode === 'skip' || item.conflictMode === 'overwrite')
    && typeof item.backendId === 'string'
}
