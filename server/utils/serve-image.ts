import type { H3Event } from 'h3'
import {
  FILE_CACHE_CONTROL,
  FILE_PRIVATE_CACHE_CONTROL,
  IMAGE_CACHE_CONTROL
} from './constants'
import {
  getAllowedRefererHostsRaw,
  getFileBedAccessMode,
  getFileBaseUrlConfigured,
  getImageBaseUrlConfigured,
  getVideoBaseUrlConfigured,
  getSiteBaseUrlConfigured,
  hostnameFromBaseUrl,
  isFileDomainSeparated,
  isImageDomainSeparated,
  isRefererConfigured,
  isVideoDomainSeparated
} from './env'
import { isFileAccessAuthorized } from './access'
import { buildAttachmentDisposition } from './file-bed'
import { findImageKeyByDatePath, findImageKeyByFilename } from './image-index'
import {
  validateFileKey,
  validateImageKey,
  validateStorageKey,
  validateVideoKey
} from './image-key'
import { isBareImageFilename, toStorageKeyFromPublicPath } from './image-public-path'
import { buildPublicImageUrl } from './image-response'
import { createImageStream, headImage } from './storage'
import { getBackendRowForKey } from './storage/resolver'

/**
 * 图片直链处理（/{type}/YYYY/MM/file）
 *
 * 防盗链说明：
 * - Referer 可以缺失（直接访问、部分客户端），缺失时放行
 * - Referer 可被非浏览器客户端伪造，本方案防普通网站盗链，不是身份认证
 */

const ERROR_CACHE_CONTROL = 'private, no-cache, max-age=0'

function getAllowedHosts(event: H3Event): Set<string> {
  const hosts = new Set<string>()

  const raw = getAllowedRefererHostsRaw(event)
  for (const part of raw.split(',')) {
    const trimmed = part.trim().toLowerCase()
    if (trimmed) hosts.add(trimmed)
  }

  const requestUrl = getRequestURL(event, {
    xForwardedHost: true,
    xForwardedProto: true
  })
  hosts.add(requestUrl.hostname.toLowerCase())

  // 域名分离时，后台页面会引用各资源域直链，需互相放行 Referer
  const siteHost = hostnameFromBaseUrl(getSiteBaseUrlConfigured(event))
  const imageHost = hostnameFromBaseUrl(getImageBaseUrlConfigured(event))
  const videoHost = hostnameFromBaseUrl(getVideoBaseUrlConfigured(event))
  const fileHost = hostnameFromBaseUrl(getFileBaseUrlConfigured(event))
  if (siteHost) hosts.add(siteHost)
  if (imageHost && isImageDomainSeparated(event)) hosts.add(imageHost)
  if (videoHost && isVideoDomainSeparated(event)) hosts.add(videoHost)
  if (fileHost && isFileDomainSeparated(event)) hosts.add(fileHost)

  return hosts
}

export function isRefererAllowed(referer: string | null, allowedHosts: Set<string>): boolean {
  if (!referer) return true

  try {
    const hostname = new URL(referer).hostname.toLowerCase()
    return allowedHosts.has(hostname)
  } catch {
    return false
  }
}

/** 未配置防盗链白名单时不拦截；已配置时校验 Referer（缺失 Referer 仍放行） */
export function isHotlinkBlocked(event: H3Event, referer: string | null): boolean {
  if (!isRefererConfigured(event)) return false
  return !isRefererAllowed(referer, getAllowedHosts(event))
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  size: number
): { start: number, end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null

  const [startStr, endStr] = rangeHeader.slice(6).split('-', 2)
  const start = startStr ? Number(startStr) : NaN
  const end = endStr ? Number(endStr) : size - 1

  if (!Number.isFinite(start) || start < 0 || start >= size) return null

  const safeEnd = Number.isFinite(end) ? Math.min(end, size - 1) : size - 1
  if (safeEnd < start) return null

  return { start, end: safeEnd }
}

export function requestPathToImageKey(
  pathname: string,
  options?: { hideFolder?: boolean }
): string | null {
  const raw = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (!raw) return null

  if (validateStorageKey(raw)) return raw

  // 简短链接：纯文件名须先走索引反查，不能猜成 images/文件名（与按年/月存储冲突）
  if (options?.hideFolder && isBareImageFilename(raw)) {
    const byFilename = findImageKeyByFilename(raw)
    if (byFilename && validateImageKey(byFilename)) return byFilename
    return null
  }

  const fromPublic = toStorageKeyFromPublicPath(raw)
  if (fromPublic) return fromPublic

  if (!options?.hideFolder) return null

  const byFilename = findImageKeyByFilename(raw)
  if (byFilename && validateImageKey(byFilename)) return byFilename

  const byDatePath = findImageKeyByDatePath(raw)
  if (byDatePath && validateImageKey(byDatePath)) return byDatePath

  return null
}

export async function serveImageByKey(event: H3Event, key: string) {
  const isFile = validateFileKey(key)
  const isVideo = validateVideoKey(key)
  // 文件与视频共用「文件床访问方式」开关
  const isMedia = isFile || isVideo
  const fileAccessMode = isMedia ? getFileBedAccessMode() : 'public'

  const referer = getHeader(event, 'referer') ?? null
  if (isHotlinkBlocked(event, referer)) {
    setHeader(event, 'Cache-Control', ERROR_CACHE_CONTROL)
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: hotlink protection'
    })
  }

  // Token 模式：文件直链需要 Auth-Token / ?token= / 已登录会话
  if (isMedia && fileAccessMode === 'token' && !(await isFileAccessAuthorized(event))) {
    setHeader(event, 'Cache-Control', ERROR_CACHE_CONTROL)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const stored = await headImage(key)
  if (!stored) {
    setHeader(event, 'Cache-Control', ERROR_CACHE_CONTROL)
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const backendRow = await getBackendRowForKey(key)
  // Token 模式不做对象存储直链跳转，避免绕过鉴权
  if (
    fileAccessMode === 'public'
    && backendRow.serving_mode === 'public'
    && backendRow.public_url
  ) {
    const publicUrl = buildPublicImageUrl(backendRow, key)
    return sendRedirect(event, publicUrl, 302)
  }

  const etag = `"${stored.size}-${Math.round(stored.mtimeMs)}"`

  setHeader(event, 'ETag', etag)
  setHeader(
    event,
    'Cache-Control',
    isMedia
      ? (fileAccessMode === 'token' ? FILE_PRIVATE_CACHE_CONTROL : FILE_CACHE_CONTROL)
      : IMAGE_CACHE_CONTROL
  )
  setHeader(event, 'Accept-Ranges', 'bytes')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Type', stored.contentType)

  // 文件床统一以附件形式下发，避免上传的文档在站点域名下被渲染执行
  if (isFile) {
    setHeader(event, 'Content-Disposition', buildAttachmentDisposition(stored.originalName))
  }

  // 视频走 inline 播放，跨域（图片域名）访问需要放行 CORS
  if (isVideo) {
    setHeader(event, 'Access-Control-Allow-Origin', '*')
  }

  if (stored.contentType === 'image/svg+xml') {
    setHeader(
      event,
      'Content-Security-Policy',
      'default-src \'none\'; style-src \'unsafe-inline\''
    )
  }

  const ifNoneMatch = getHeader(event, 'if-none-match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    setResponseStatus(event, 304)
    return null
  }

  const method = getMethod(event)
  if (method === 'HEAD') {
    setHeader(event, 'Content-Length', stored.size)
    return null
  }

  const range = parseRangeHeader(getHeader(event, 'range'), stored.size)

  if (range) {
    setResponseStatus(event, 206)
    setHeader(event, 'Content-Range', `bytes ${range.start}-${range.end}/${stored.size}`)
    setHeader(event, 'Content-Length', range.end - range.start + 1)
    return sendStream(event, await createImageStream(key, range))
  }

  setHeader(event, 'Content-Length', stored.size)
  return sendStream(event, await createImageStream(key))
}
