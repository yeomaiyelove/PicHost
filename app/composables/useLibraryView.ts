const STORAGE_KEY = 'pichost.library-view'
export type LibraryViewKind = 'image' | 'video' | 'file'

export type LibraryViewMode = 'grid' | 'list'

function storageKeyFor(kind: LibraryViewKind): string {
  return `${STORAGE_KEY}.${kind}`
}

/**
 * 图库 / 视频库 / 文件库各自的显示方式。
 * 三个库分别记住（互不影响），且页面切换后保持，不用重新点。
 */
export function useLibraryView(kind: LibraryViewKind = 'image') {
  const viewMode = useState<LibraryViewMode>(`library-view-mode-${kind}`, () => 'grid')
  const loaded = useState(`library-view-loaded-${kind}`, () => false)

  if (import.meta.client && !loaded.value) {
    try {
      const stored = localStorage.getItem(storageKeyFor(kind))
      if (stored === 'grid' || stored === 'list') {
        viewMode.value = stored
      }
    } catch {
      // 读取失败保持默认
    }
    loaded.value = true
  }

  watch(viewMode, (value) => {
    if (!import.meta.client) return
    try {
      localStorage.setItem(storageKeyFor(kind), value)
    } catch {
      // 写入失败不影响使用
    }
  })

  return { viewMode }
}
