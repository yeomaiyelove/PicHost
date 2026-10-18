/** 常见文件床类型的扩展名推断（仅在索引缺失元数据时使用） */
const EXTRA_TYPES: Record<string, string> = {
  'pdf': 'application/pdf',
  'zip': 'application/zip',
  '7z': 'application/x-7z-compressed',
  'rar': 'application/vnd.rar',
  'gz': 'application/gzip',
  'tar': 'application/x-tar',
  'txt': 'text/plain; charset=utf-8',
  'md': 'text/markdown; charset=utf-8',
  'json': 'application/json',
  'csv': 'text/csv; charset=utf-8',
  'mp3': 'audio/mpeg',
  'mp4': 'video/mp4',
  'm4v': 'video/x-m4v',
  'webm': 'video/webm',
  'mov': 'video/quicktime',
  'mkv': 'video/x-matroska',
  'avi': 'video/x-msvideo',
  'flv': 'video/x-flv',
  'wmv': 'video/x-ms-wmv',
  'mpg': 'video/mpeg',
  'mpeg': 'video/mpeg',
  'ts': 'video/mp2t',
  'm3u8': 'application/vnd.apple.mpegurl',
  'apk': 'application/vnd.android.package-archive'
}

export function contentTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'ico':
      return 'image/x-icon'
    default:
      return (ext && EXTRA_TYPES[ext]) || 'application/octet-stream'
  }
}
