export type MediaType = 'image' | 'video' | 'file'

/** 图库 / 视频库 / 文件库共用的统计数据结构 */
export interface LibraryStatsData {
  uploadToday: number
  uploadYesterday: number
  uploadMonth: number
  uploadLastMonth: number
  uploadTotal: number
  storedCount: number
  uploadBytesTotal: number
  bySource: {
    web: number
    api: number
  }
  storageUsage: {
    usedBytes: number
    totalBytes: number | null
    percent: number | null
  }
}
