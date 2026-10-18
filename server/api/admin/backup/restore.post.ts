import type { H3Event } from 'h3'
import { requireAdminAuth } from '../../../utils/access'
import { createApiError } from '../../../utils/api-error'
import { serializeBackupJob } from '../../../utils/backup/api'
import { previewFullRestore } from '../../../utils/backup/full-restore'
import { startFullRestoreJob } from '../../../utils/backup/runner'
import { listAllBackupJobsForUser } from '../../../utils/backup/jobs'
import {
  BACKUP_ARCHIVE_EXT,
  getBackupsDir,
  getBackupStagingDir,
  isSafeBackupFilename
} from '../../../utils/backup/paths'
import { createWriteStream, promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

interface RestoreBody {
  archiveName?: string
  conflictMode?: 'skip' | 'overwrite'
  dryRun?: boolean
}

async function streamUploadToFile(event: H3Event, archivePath: string): Promise<void> {
  await fs.mkdir(dirname(archivePath), { recursive: true })
  try {
    await pipeline(event.node.req, createWriteStream(archivePath))
    const stat = await fs.stat(archivePath)
    if (stat.size === 0) {
      throw new Error('备份文件为空')
    }
  } catch (error) {
    await fs.rm(archivePath, { force: true }).catch(() => {})
    throw error
  }
}

async function resolveRestoreInput(event: H3Event, userId: number): Promise<{
  archivePath: string
  body: RestoreBody
  cleanup?: () => Promise<void>
}> {
  const contentType = getHeader(event, 'content-type') ?? ''

  if (contentType.includes('application/octet-stream')) {
    const dryRun = getHeader(event, 'x-pichost-dry-run') === 'true'
    const conflictMode = getHeader(event, 'x-pichost-conflict-mode') === 'skip'
      ? 'skip'
      : 'overwrite'

    if (dryRun) {
      const tempDir = getBackupStagingDir(`upload-preview-${Date.now()}`)
      await fs.mkdir(tempDir, { recursive: true })
      const archivePath = join(tempDir, 'package.phost.tar.gz')
      await streamUploadToFile(event, archivePath)
      return {
        archivePath,
        body: { conflictMode, dryRun: true },
        cleanup: async () => {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
      }
    }

    await fs.mkdir(getBackupsDir(), { recursive: true })
    const archivePath = join(
      getBackupsDir(),
      `upload-${Date.now()}${BACKUP_ARCHIVE_EXT}`
    )
    await streamUploadToFile(event, archivePath)
    return {
      archivePath,
      body: { conflictMode, dryRun: false }
    }
  }

  if (contentType.includes('multipart/form-data')) {
    const form = await readMultipartFormData(event)
    const filePart = form?.find(part => part.name === 'file' && part.data?.length)
    if (!filePart?.data) {
      createApiError(event, 'INVALID_REQUEST', '请上传备份文件', 400)
    }

    const conflictField = form?.find(part => part.name === 'conflictMode')?.data?.toString('utf8')
    const dryRunField = form?.find(part => part.name === 'dryRun')?.data?.toString('utf8')
    const dryRun = dryRunField === 'true'

    if (dryRun) {
      const tempDir = getBackupStagingDir(`upload-preview-${Date.now()}`)
      await fs.mkdir(tempDir, { recursive: true })
      const archivePath = join(tempDir, 'package.phost.tar.gz')
      await fs.writeFile(archivePath, filePart.data)
      return {
        archivePath,
        body: {
          conflictMode: conflictField === 'skip' ? 'skip' : 'overwrite',
          dryRun: true
        },
        cleanup: async () => {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
      }
    }

    await fs.mkdir(getBackupsDir(), { recursive: true })
    const safeName = `upload-${Date.now()}${BACKUP_ARCHIVE_EXT}`
    const archivePath = join(getBackupsDir(), safeName)
    await fs.writeFile(archivePath, filePart.data)
    return {
      archivePath,
      body: {
        conflictMode: conflictField === 'skip' ? 'skip' : 'overwrite',
        dryRun: false
      }
    }
  }

  const body = await readBody<RestoreBody>(event)
  if (!body?.archiveName || !isSafeBackupFilename(body.archiveName)) {
    createApiError(event, 'INVALID_REQUEST', '请选择有效的备份文件', 400)
  }
  const allowedArchives = new Set(
    listAllBackupJobsForUser(userId).flatMap((job) => {
      const names: string[] = []
      if (job.outputPath) names.push(basename(job.outputPath))
      if (typeof job.payload.archivePath === 'string') {
        names.push(basename(job.payload.archivePath))
      }
      return names
    })
  )
  if (!allowedArchives.has(body.archiveName)) {
    createApiError(event, 'INVALID_REQUEST', '备份文件不存在', 404)
  }
  const archivePath = join(getBackupsDir(), body.archiveName)
  try {
    await fs.access(archivePath)
  } catch {
    createApiError(event, 'INVALID_REQUEST', '备份文件不存在', 400)
  }
  return { archivePath, body }
}

export default defineEventHandler(async (event) => {
  const user = await requireAdminAuth(event)

  const { archivePath, body, cleanup } = await resolveRestoreInput(event, user.id)

  const conflictMode = body.conflictMode === 'skip' ? 'skip' : 'overwrite'

  if (body.dryRun) {
    try {
      const preview = await previewFullRestore(archivePath)
      return { preview }
    } finally {
      await cleanup?.()
    }
  }

  try {
    const job = startFullRestoreJob(archivePath, conflictMode, user.id)
    return { job: serializeBackupJob(job) }
  } catch (error) {
    if (error instanceof Error && error.message === 'BACKUP_JOB_RUNNING') {
      createApiError(event, 'CONFLICT', '已有备份或迁移任务正在运行', 409)
    }
    throw error
  }
})
