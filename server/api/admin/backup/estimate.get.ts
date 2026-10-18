import { requireAdminAuth } from '../../../utils/access'
import { getBackupExportEstimate } from '../../../utils/backup/stats'
import { getBackupsDir, isSafeBackupFilename } from '../../../utils/backup/paths'
import { listAllBackupJobsForUser } from '../../../utils/backup/jobs'
import { basename, join } from 'node:path'
import { promises as fs } from 'node:fs'

export default defineEventHandler(async (event) => {
  const user = await requireAdminAuth(event)
  const estimate = await getBackupExportEstimate()
  const allowedArchives = new Set(
    listAllBackupJobsForUser(user.id).flatMap((job) => {
      const names: string[] = []
      if (job.outputPath) names.push(basename(job.outputPath))
      if (typeof job.payload.archivePath === 'string') {
        names.push(basename(job.payload.archivePath))
      }
      return names
    })
  )

  const packages = await (async () => {
    try {
      await fs.mkdir(getBackupsDir(), { recursive: true })
      const entries = await fs.readdir(getBackupsDir(), { withFileTypes: true })
      const items = await Promise.all(
        entries
          .filter(entry => entry.isFile() && isSafeBackupFilename(entry.name))
          .filter(entry => allowedArchives.has(entry.name))
          .map(async (entry) => {
            const full = join(getBackupsDir(), entry.name)
            const fileStat = await fs.stat(full)
            return {
              name: entry.name,
              bytes: fileStat.size,
              modifiedAt: fileStat.mtime.toISOString()
            }
          })
      )
      items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
      return items
    } catch {
      return []
    }
  })()

  return {
    estimate,
    backupsDir: getBackupsDir(),
    packages
  }
})
