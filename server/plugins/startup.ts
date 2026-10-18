import { getDataDir } from '../utils/data-dir'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAutoDeleteCleanup } from '../utils/auto-delete'
import { migrateLocalImagesToIndex, purgeOrphanImageIndexRows, reconcileLegacyImageKeys, repairLocalImageIndexMetadata } from '../utils/image-index'
import { ensureDefaultBackends } from '../utils/storage-backends'
import { cleanupLocalAtomicTempFiles } from '../utils/storage/local'
import { cleanupExpiredSiteSyncArtifacts } from '../utils/site-sync/artifacts'
import { recoverInterruptedBackupJobs } from '../utils/backup/jobs'
import { cleanupExpiredSiteSyncChunkSessions } from '../utils/site-sync/chunks'
import {
  cleanupTranscodedSources,
  killOrphanFfmpeg,
  purgeOrphanVideoAssets,
  resumePendingTranscodes
} from '../utils/transcode'
import { logException, logInfo } from '../utils/logger'

export default defineNitroPlugin(() => {
  const port = process.env.NITRO_PORT || process.env.PORT || '6892'
  logInfo('PicHost starting', {
    port,
    dataDir: getDataDir(),
    nodeEnv: process.env.NODE_ENV || 'development',
    imageBaseUrl: process.env.IMAGE_BASE_URL || '(request origin)',
    storageBackend: process.env.STORAGE_BACKEND || 'db',
    logLevel: process.env.LOG_LEVEL || 'info'
  })

  ensureDefaultBackends()

  try {
    const interrupted = recoverInterruptedBackupJobs()
    if (interrupted > 0) {
      logInfo('已将异常退出时未完成的任务标记为失败', { interrupted })
    }
  } catch (error) {
    logException('恢复异常退出的备份任务失败', error)
  }

  void (async () => {
    try {
      const removed = await cleanupLocalAtomicTempFiles()
      if (removed > 0) {
        logInfo('清理过期的原子写入临时文件', { removed })
      }
    } catch (error) {
      logException('清理原子写入临时文件失败', error)
    }
  })()

  void (async () => {
    try {
      const removed = await cleanupExpiredSiteSyncChunkSessions()
      if (removed > 0) {
        logInfo('清理过期站点同步分块', { removed })
      }
    } catch (error) {
      logException('清理站点同步分块失败', error)
    }
  })()

  void (async () => {
    try {
      const result = await cleanupExpiredSiteSyncArtifacts()
      if (result.jobs > 0) {
        logInfo('清理过期站点同步残留', result)
      }
    } catch (error) {
      logException('清理站点同步残留失败', error)
    }
  })()

  /** 清理上次异常退出留下的转码临时目录 */
  void (async () => {
    try {
      const entries = await fs.readdir(tmpdir(), { withFileTypes: true })
      for (const entry of entries) {
        if (
          !entry.isDirectory()
          || !entry.name.startsWith('pichost-hls-')
          || entry.name.startsWith('pichost-hls-download-')
        ) continue
        await fs.rm(join(tmpdir(), entry.name), { recursive: true, force: true })
          .catch(() => {})
      }
    } catch {
      // 清理失败不影响启动
    }
  })()

  void (async () => {
    const dataDir = getDataDir()
    try {
      logInfo('开始同步存储索引：扫描本地磁盘', {
        path: `${dataDir}/images/, ${dataDir}/files/, ${dataDir}/videos/`
      })

      const inserted = await migrateLocalImagesToIndex()
      if (inserted > 0) {
        logInfo('磁盘扫描完成：已补全缺失索引', { inserted })
      } else {
        logInfo('磁盘扫描完成：索引与磁盘一致，无需补全')
      }

      logInfo('开始归一化遗留图片路径（如 blog/ → images/blog/）')
      const reconciled = await reconcileLegacyImageKeys()
      if (reconciled.updated > 0 || reconciled.removed > 0) {
        logInfo('遗留路径归一化完成', reconciled)
      } else {
        logInfo('遗留路径归一化完成：无需调整')
      }

      logInfo('开始校验索引与磁盘一致性，清理无文件的孤儿记录')
      const purged = await purgeOrphanImageIndexRows()
      if (purged > 0) {
        logInfo('孤儿索引清理完成', { removed: purged })
      } else {
        logInfo('孤儿索引清理完成：未发现孤儿记录')
      }

      logInfo('开始修复存量 Content-Type 元数据')
      const repaired = repairLocalImageIndexMetadata()
      if (repaired > 0) {
        logInfo('Content-Type 修复完成', { repaired })
      } else {
        logInfo('Content-Type 修复完成：无需修复')
      }

      logInfo('图片索引同步结束')

      logInfo('开始恢复未完成的视频转码任务')
      await killOrphanFfmpeg()
      const purgedAssets = await purgeOrphanVideoAssets()
      if (purgedAssets > 0) {
        logInfo('清理无主的视频附属文件', { removed: purgedAssets })
      }
      const removedSources = await cleanupTranscodedSources()
      if (removedSources > 0) {
        logInfo('清理转码完成后的源视频', { removed: removedSources })
      }
      resumePendingTranscodes()
    } catch (error) {
      logException('图片索引同步失败', error)
    }
  })()

  void (async () => {
    try {
      logInfo('开始执行启动时自动删除检查')
      const result = await runAutoDeleteCleanup()
      if (result.skipped) {
        logInfo('自动删除检查完成：策略未启用')
      } else if (result.deleted > 0 || result.failed > 0) {
        logInfo('自动删除检查完成', { ...result })
      } else {
        logInfo('自动删除检查完成：无到期图片')
      }
    } catch (error) {
      logException('启动时自动删除失败', error)
    }
  })()
})
