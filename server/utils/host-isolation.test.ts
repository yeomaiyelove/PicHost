import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import {
  shouldBlockFileHostRequest,
  shouldBlockImageHostRequest,
  shouldBlockSiteHostImageRequest,
  shouldBlockUnknownHostRequest,
  shouldBlockVideoHostRequest
} from './host-isolation'

function mockEvent(): H3Event {
  return {
    node: { req: {}, res: {} },
    context: {}
  } as H3Event
}

describe('shouldBlockImageHostRequest', () => {
  const imageHost = 'image.example.com'
  const siteHost = 'admin.example.com'

  it('does not block when separation is inactive', () => {
    const event = mockEvent()
    expect(shouldBlockImageHostRequest(event, {
      separationActive: false,
      requestHost: imageHost,
      method: 'GET',
      pathname: '/settings'
    })).toBe(false)
  })

  it('blocks non-image paths on image host', () => {
    const event = mockEvent()
    expect(shouldBlockImageHostRequest(event, {
      separationActive: true,
      imageHost,
      videoHost: 'video.example.com',
      requestHost: imageHost,
      method: 'GET',
      pathname: '/settings',
      hideFolder: false
    })).toBe(true)
  })

  it('allows video paths on image host when no video domain is configured', () => {
    const event = mockEvent()
    expect(shouldBlockImageHostRequest(event, {
      separationActive: true,
      imageHost,
      videoHost: null,
      fileHost: null,
      requestHost: imageHost,
      method: 'GET',
      pathname: '/videos/2026/08/demo.mp4'
    })).toBe(false)
  })

  it('allows image paths on image host', () => {
    const event = mockEvent()
    expect(shouldBlockImageHostRequest(event, {
      separationActive: true,
      imageHost,
      videoHost: 'video.example.com',
      requestHost: imageHost,
      method: 'GET',
      pathname: '/images/2026/08/demo.webp',
      hideFolder: false
    })).toBe(false)
  })

  it('blocks POST on image host even for image paths', () => {
    const event = mockEvent()
    expect(shouldBlockImageHostRequest(event, {
      separationActive: true,
      imageHost,
      requestHost: imageHost,
      method: 'POST',
      pathname: '/images/2026/08/demo.webp'
    })).toBe(true)
  })

  it('blocks video paths on the image host', () => {
    const event = mockEvent()
    expect(shouldBlockImageHostRequest(event, {
      separationActive: true,
      imageHost,
      videoHost: 'video.example.com',
      requestHost: imageHost,
      method: 'GET',
      pathname: '/videos/2026/08/demo.mp4'
    })).toBe(true)
  })

  it('allows admin and all media paths when one host serves every role', () => {
    const event = mockEvent()
    for (const pathname of [
      '/settings',
      '/images/2026/08/demo.webp',
      '/videos/2026/08/demo.mp4',
      '/files/2026/08/demo.pdf'
    ]) {
      expect(shouldBlockImageHostRequest(event, {
        separationActive: true,
        siteHost: imageHost,
        imageHost,
        videoHost: imageHost,
        fileHost: imageHost,
        requestHost: imageHost,
        method: 'GET',
        pathname
      })).toBe(false)
    }
  })

  it('does not block site host admin paths', () => {
    const event = mockEvent()
    expect(shouldBlockImageHostRequest(event, {
      separationActive: true,
      imageHost,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/api/images'
    })).toBe(false)
  })
})

describe('video and file media hosts', () => {
  const videoHost = 'video.example.com'
  const fileHost = 'file.example.com'

  it('allows only video paths on the video host', () => {
    const event = mockEvent()
    expect(shouldBlockVideoHostRequest(event, {
      separationActive: true,
      videoHost,
      requestHost: videoHost,
      method: 'GET',
      pathname: '/videos/2026/08/demo.mp4'
    })).toBe(false)
    expect(shouldBlockVideoHostRequest(event, {
      separationActive: true,
      videoHost,
      requestHost: videoHost,
      method: 'GET',
      pathname: '/images/2026/08/demo.webp'
    })).toBe(true)
  })

  it('allows only file paths on the file host', () => {
    const event = mockEvent()
    expect(shouldBlockFileHostRequest(event, {
      separationActive: true,
      fileHost,
      requestHost: fileHost,
      method: 'GET',
      pathname: '/files/2026/08/demo.pdf'
    })).toBe(false)
    expect(shouldBlockFileHostRequest(event, {
      separationActive: true,
      fileHost,
      requestHost: fileHost,
      method: 'GET',
      pathname: '/videos/2026/08/demo.mp4'
    })).toBe(true)
  })
})

describe('shouldBlockSiteHostImageRequest', () => {
  const imageHost = 'image.example.com'
  const siteHost = 'admin.example.com'

  it('does not block when separation is inactive', () => {
    const event = mockEvent()
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: false,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/images/2026/08/demo.webp'
    })).toBe(false)
  })

  it('blocks image paths on site host', () => {
    const event = mockEvent()
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: true,
      siteHost,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/images/2026/08/demo.webp',
      hideFolder: false
    })).toBe(true)
  })

  it('blocks public image paths on site host', () => {
    const event = mockEvent()
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: true,
      siteHost,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/2026/08/demo.webp',
      hideFolder: false
    })).toBe(true)
  })

  it('blocks legacy date short paths on site host', () => {
    const event = mockEvent()
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: true,
      siteHost,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/2026/08/demo.webp',
      hideFolder: true
    })).toBe(true)
  })

  it('allows admin paths on site host', () => {
    const event = mockEvent()
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: true,
      siteHost,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/',
      hideFolder: false
    })).toBe(false)
  })

  it('does not block image paths on image host', () => {
    const event = mockEvent()
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: true,
      siteHost,
      requestHost: imageHost,
      method: 'GET',
      pathname: '/images/2026/08/demo.webp'
    })).toBe(false)
  })

  it('blocks video and file paths on the site host', () => {
    const event = mockEvent()
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: true,
      siteHost,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/videos/2026/08/demo.mp4'
    })).toBe(true)
    expect(shouldBlockSiteHostImageRequest(event, {
      separationActive: true,
      siteHost,
      requestHost: siteHost,
      method: 'GET',
      pathname: '/files/2026/08/demo.pdf'
    })).toBe(true)
  })

  it('allows media paths when all roles share the same host', () => {
    const event = mockEvent()
    for (const pathname of [
      '/images/2026/08/demo.webp',
      '/videos/2026/08/demo.mp4',
      '/files/2026/08/demo.pdf'
    ]) {
      expect(shouldBlockSiteHostImageRequest(event, {
        separationActive: true,
        siteHost,
        imageHost: siteHost,
        videoHost: siteHost,
        fileHost: siteHost,
        requestHost: siteHost,
        method: 'GET',
        pathname
      })).toBe(false)
    }
  })
})

describe('shouldBlockUnknownHostRequest', () => {
  const imageHost = 'image.example.com'
  const siteHost = 'admin.example.com'

  it('does not block when separation is inactive', () => {
    const event = mockEvent()
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: false,
      requestHost: 'pages.dev',
      siteHost,
      imageHost
    })).toBe(false)
  })

  it('blocks unconfigured third host when separation is active', () => {
    const event = mockEvent()
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: true,
      requestHost: 'pages.dev',
      siteHost,
      imageHost
    })).toBe(true)
  })

  it('blocks admin paths on image host when host is unconfigured', () => {
    const event = mockEvent()
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: true,
      requestHost: 'old-img.example.com',
      siteHost,
      imageHost
    })).toBe(true)
  })

  it('allows configured site host', () => {
    const event = mockEvent()
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: true,
      requestHost: siteHost,
      siteHost,
      imageHost
    })).toBe(false)
  })

  it('allows configured image host', () => {
    const event = mockEvent()
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: true,
      requestHost: imageHost,
      siteHost,
      imageHost
    })).toBe(false)
  })

  it('allows configured video and file hosts', () => {
    const event = mockEvent()
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: true,
      requestHost: 'video.example.com',
      siteHost,
      imageHost,
      videoHost: 'video.example.com',
      fileHost: 'file.example.com'
    })).toBe(false)
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: true,
      requestHost: 'file.example.com',
      siteHost,
      imageHost,
      videoHost: 'video.example.com',
      fileHost: 'file.example.com'
    })).toBe(false)
  })

  it('allows localhost in development', () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const event = mockEvent()
    expect(shouldBlockUnknownHostRequest(event, {
      separationActive: true,
      requestHost: 'localhost',
      siteHost,
      imageHost
    })).toBe(false)
    process.env.NODE_ENV = previous
  })
})
