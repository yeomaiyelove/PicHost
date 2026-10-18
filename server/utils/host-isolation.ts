import type { H3Event } from 'h3'
import {
  getImageBaseUrlConfigured,
  getSiteBaseUrlConfigured,
  getVideoBaseUrlConfigured,
  getFileBaseUrlConfigured,
  hostnameFromBaseUrl,
  isFileDomainSeparated,
  isImageDomainSeparated,
  isDomainSeparationActive,
  isHideFolderInUrl,
  isVideoDomainSeparated
} from './env'
import { validateFileKey, validateImageKey, validateStorageKey, validateVideoKey } from './image-key'
import { requestPathToImageKey } from './serve-image'

const DEV_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

function getIsolationRequestHost(event: H3Event): string {
  const requestUrl = getRequestURL(event, {
    xForwardedHost: true,
    xForwardedProto: true
  })
  return requestUrl.hostname.toLowerCase()
}

function isDevLocalHost(host: string): boolean {
  return process.env.NODE_ENV === 'development' && DEV_LOCAL_HOSTS.has(host)
}

function configuredHostOrNull(loader: () => string | null): string | null {
  try {
    return loader()
  } catch {
    return null
  }
}

export function getConfiguredSiteHost(event: H3Event): string | null {
  return hostnameFromBaseUrl(getSiteBaseUrlConfigured(event))
}

export function getConfiguredImageHost(event: H3Event): string | null {
  if (!isImageDomainSeparated(event)) return null
  return hostnameFromBaseUrl(getImageBaseUrlConfigured(event))
}

export function getConfiguredVideoHost(event: H3Event): string | null {
  if (!isVideoDomainSeparated(event)) return null
  return hostnameFromBaseUrl(getVideoBaseUrlConfigured(event))
}

export function getConfiguredFileHost(event: H3Event): string | null {
  if (!isFileDomainSeparated(event)) return null
  return hostnameFromBaseUrl(getFileBaseUrlConfigured(event))
}

/** 域名分离开启时，拒绝未配置的 Host（开发环境 localhost 例外） */
export function shouldBlockUnknownHostRequest(
  event: H3Event,
  options?: {
    requestHost?: string
    separationActive?: boolean
    siteHost?: string | null
    imageHost?: string | null
    videoHost?: string | null
    fileHost?: string | null
  }
): boolean {
  const separationActive = options?.separationActive ?? isDomainSeparationActive(event)
  if (!separationActive) return false

  const siteHost = options?.siteHost ?? getConfiguredSiteHost(event)
  const imageHost = options?.imageHost ?? getConfiguredImageHost(event)
  const videoHost = options?.videoHost
    ?? configuredHostOrNull(() => getConfiguredVideoHost(event))
  const fileHost = options?.fileHost
    ?? configuredHostOrNull(() => getConfiguredFileHost(event))
  if (!siteHost || !imageHost) return false

  const requestHost = (options?.requestHost ?? getIsolationRequestHost(event)).toLowerCase()
  if (
    requestHost === siteHost
    || requestHost === imageHost
    || (videoHost && requestHost === videoHost)
    || (fileHost && requestHost === fileHost)
  ) return false
  if (isDevLocalHost(requestHost)) return false

  return true
}

function requestKey(
  event: H3Event,
  options?: {
    pathname?: string
    hideFolder?: boolean
  }
): string | null {
  const pathname = options?.pathname ?? getRequestURL(event, {
    xForwardedHost: true,
    xForwardedProto: true
  }).pathname
  return requestPathToImageKey(pathname, {
    hideFolder: options?.hideFolder ?? isHideFolderInUrl(event)
  })
}

function mediaKindForKey(key: string | null): 'image' | 'video' | 'file' | null {
  if (!key || !validateStorageKey(key)) return null
  if (validateImageKey(key)) return 'image'
  if (validateVideoKey(key)) return 'video'
  if (validateFileKey(key)) return 'file'
  return null
}

export function shouldBlockImageHostRequest(
  event: H3Event,
  options?: {
    method?: string
    pathname?: string
    requestHost?: string
    separationActive?: boolean
    imageHost?: string | null
    siteHost?: string | null
    videoHost?: string | null
    fileHost?: string | null
    hideFolder?: boolean
  }
): boolean {
  const separationActive = options?.separationActive ?? isDomainSeparationActive(event)
  if (!separationActive) return false

  const imageHost = options?.imageHost ?? getConfiguredImageHost(event)
  if (!imageHost) return false

  const requestHost = (options?.requestHost ?? getIsolationRequestHost(event)).toLowerCase()
  if (requestHost !== imageHost) return false
  const siteHost = options?.siteHost ?? configuredHostOrNull(() => getConfiguredSiteHost(event))
  if (siteHost === imageHost) return false

  const method = (options?.method ?? getMethod(event)).toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return true

  const kind = mediaKindForKey(requestKey(event, options))
  if (kind === 'image') return false
  const videoHost = options?.videoHost
    ?? configuredHostOrNull(() => getConfiguredVideoHost(event))
  const fileHost = options?.fileHost
    ?? configuredHostOrNull(() => getConfiguredFileHost(event))
  if (kind === 'video' && (!videoHost || videoHost === imageHost)) return false
  if (kind === 'file' && (!fileHost || fileHost === imageHost)) return false
  return true
}

function shouldBlockMediaHostRequest(
  event: H3Event,
  expectedKind: 'video' | 'file',
  configuredHost: string | null,
  options?: {
    method?: string
    pathname?: string
    requestHost?: string
    separationActive?: boolean
    hideFolder?: boolean
  }
): boolean {
  const separationActive = options?.separationActive ?? isDomainSeparationActive(event)
  if (!separationActive || !configuredHost) return false
  const siteHost = configuredHostOrNull(() => getConfiguredSiteHost(event))
  if (siteHost === configuredHost) return false
  const requestHost = (options?.requestHost ?? getIsolationRequestHost(event)).toLowerCase()
  if (requestHost !== configuredHost) return false
  const method = (options?.method ?? getMethod(event)).toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return true
  return mediaKindForKey(requestKey(event, options)) !== expectedKind
}

export function shouldBlockVideoHostRequest(
  event: H3Event,
  options?: {
    method?: string
    pathname?: string
    requestHost?: string
    separationActive?: boolean
    videoHost?: string | null
    hideFolder?: boolean
  }
): boolean {
  return shouldBlockMediaHostRequest(
    event,
    'video',
    options?.videoHost ?? getConfiguredVideoHost(event),
    options
  )
}

export function shouldBlockFileHostRequest(
  event: H3Event,
  options?: {
    method?: string
    pathname?: string
    requestHost?: string
    separationActive?: boolean
    fileHost?: string | null
    hideFolder?: boolean
  }
): boolean {
  return shouldBlockMediaHostRequest(
    event,
    'file',
    options?.fileHost ?? getConfiguredFileHost(event),
    options
  )
}

/** 网站域禁止直接访问任何媒体路径（仅对应媒体域可 GET/HEAD） */
export function shouldBlockSiteHostImageRequest(
  event: H3Event,
  options?: {
    method?: string
    pathname?: string
    requestHost?: string
    separationActive?: boolean
    siteHost?: string | null
    imageHost?: string | null
    videoHost?: string | null
    fileHost?: string | null
    hideFolder?: boolean
  }
): boolean {
  const separationActive = options?.separationActive ?? isDomainSeparationActive(event)
  if (!separationActive) return false

  const siteHost = options?.siteHost ?? getConfiguredSiteHost(event)
  if (!siteHost) return false

  const requestHost = (options?.requestHost ?? getIsolationRequestHost(event)).toLowerCase()
  if (requestHost !== siteHost) return false

  const method = (options?.method ?? getMethod(event)).toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return false

  const kind = mediaKindForKey(requestKey(event, options))
  if (!kind) return false
  if (kind === 'image') {
    const imageHost = options?.imageHost
      ?? configuredHostOrNull(() => getConfiguredImageHost(event))
    return imageHost !== siteHost
  }
  if (kind === 'video') {
    const imageHost = options?.imageHost
      ?? configuredHostOrNull(() => getConfiguredImageHost(event))
    const videoHost = options?.videoHost
      ?? configuredHostOrNull(() => getConfiguredVideoHost(event))
    return (videoHost || imageHost) !== siteHost
  }
  const imageHost = options?.imageHost
    ?? configuredHostOrNull(() => getConfiguredImageHost(event))
  const fileHost = options?.fileHost
    ?? configuredHostOrNull(() => getConfiguredFileHost(event))
  return (fileHost || imageHost) !== siteHost
}
