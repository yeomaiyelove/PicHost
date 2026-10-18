export type ApiDocMethod = 'GET' | 'POST' | 'DELETE'
export type ApiDocCategory = 'image' | 'video' | 'file' | 'extension' | 'system'
export type ApiParamLocation = 'form-data' | 'query' | 'header' | 'body'

export interface ApiDocParam {
  name: string
  type: string
  location: ApiParamLocation
  required: boolean
  descriptionKey: string
}

export interface ApiDocEndpoint {
  id: string
  category: ApiDocCategory
  method: ApiDocMethod
  path: string
  titleKey: string
  descKey: string
  params: ApiDocParam[]
  requiresAuth: boolean
  curl: string
  responseExample: string
}

interface ApiDocsContext {
  baseUrl: string
  authHeader: string
}

function authFlag(authHeader: string) {
  return `-H 'Auth-Token: ${authHeader}'`
}

export function buildApiDocs(ctx: ApiDocsContext): ApiDocEndpoint[] {
  const { baseUrl, authHeader } = ctx
  const auth = authFlag(authHeader)

  return [
    {
      id: 'upload',
      category: 'image',
      method: 'POST',
      path: '/api/images/upload',
      titleKey: 'api.docs.upload.title',
      descKey: 'api.docs.upload.desc',
      requiresAuth: true,
      params: [
        {
          name: 'image',
          type: 'file',
          location: 'form-data',
          required: true,
          descriptionKey: 'api.params.upload.image'
        },
        {
          name: 'file',
          type: 'file',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.upload.file'
        },
        {
          name: 'files',
          type: 'file',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.upload.files'
        },
        {
          name: 'token',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.upload.token'
        },
        {
          name: 'tagNames',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.upload.tagNames'
        }
      ],
      curl: `curl -X POST "${baseUrl}/api/images/upload" \\
  ${auth} \\
  -F "image=@./demo.png" \\
  -F 'tagNames=["博客","截图"]'`,
      responseExample: `{
  "success": true,
  "items": [
    {
      "key": "images/2026/08/abc123.webp",
      "url": "https://pic.example.com/abc123.webp",
      "originalName": "demo.png",
      "contentType": "image/webp",
      "size": 12345,
      "uploadedAt": "2026-08-01T12:00:00.000Z",
      "markdown": "![demo.png](https://pic.example.com/abc123.webp)",
      "html": "<img src=\\"https://pic.example.com/abc123.webp\\" alt=\\"demo.png\\">"
    }
  ],
  "errors": []
}`
    },
    {
      id: 'list',
      category: 'image',
      method: 'GET',
      path: '/api/images',
      titleKey: 'api.docs.list.title',
      descKey: 'api.docs.list.desc',
      requiresAuth: true,
      params: [
        {
          name: 'limit',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.list.limit'
        },
        {
          name: 'page',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.list.page'
        },
        {
          name: 'backendId',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.backendId'
        }
      ],
      curl: `curl "${baseUrl}/api/images?limit=20&page=1" \\
  ${auth}`,
      responseExample: `{
  "items": [
    {
      "key": "images/2026/08/abc123.webp",
      "url": "https://pic.example.com/abc123.webp",
      "originalName": "demo.png",
      "contentType": "image/webp",
      "size": 12345,
      "uploadedAt": "2026-08-01T12:00:00.000Z",
      "markdown": "![demo.png](https://pic.example.com/abc123.webp)",
      "html": "<img src=\\"https://pic.example.com/abc123.webp\\" alt=\\"demo.png\\">"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}`
    },
    {
      id: 'search',
      category: 'image',
      method: 'GET',
      path: '/api/images/search',
      titleKey: 'api.docs.search.title',
      descKey: 'api.docs.search.desc',
      requiresAuth: true,
      params: [
        {
          name: 'q',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.search.q'
        },
        {
          name: 'limit',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.list.limit'
        },
        {
          name: 'page',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.list.page'
        },
        {
          name: 'backendId',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.backendId'
        }
      ],
      curl: `curl "${baseUrl}/api/images/search?q=demo&limit=20&page=1" \\
  ${auth}`,
      responseExample: `{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 0
}`
    },
    {
      id: 'delete',
      category: 'image',
      method: 'DELETE',
      path: '/api/images',
      titleKey: 'api.docs.delete.title',
      descKey: 'api.docs.delete.desc',
      requiresAuth: true,
      params: [
        {
          name: 'key',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.delete.key'
        }
      ],
      curl: `curl -X DELETE "${baseUrl}/api/images?key=images/2026/08/xxxx.webp" \\
  ${auth}`,
      responseExample: `{
  "success": true
}`
    },
    {
      id: 'batchDelete',
      category: 'image',
      method: 'POST',
      path: '/api/images/batch-delete',
      titleKey: 'api.docs.batchDelete.title',
      descKey: 'api.docs.batchDelete.desc',
      requiresAuth: true,
      params: [
        {
          name: 'keys',
          type: 'string[]',
          location: 'body',
          required: true,
          descriptionKey: 'api.params.batchDelete.keys'
        }
      ],
      curl: `curl -X POST "${baseUrl}/api/images/batch-delete" \\
  ${auth} \\
  -H "Content-Type: application/json" \\
  -d '{"keys":["images/2026/08/a.webp","images/2026/08/b.webp"]}'`,
      responseExample: `{
  "success": true,
  "deleted": ["images/2026/08/a.webp"],
  "failed": []
}`
    },
    {
      id: 'videoUpload',
      category: 'video',
      method: 'POST',
      path: '/api/videos/upload',
      titleKey: 'api.docs.videoUpload.title',
      descKey: 'api.docs.videoUpload.desc',
      requiresAuth: true,
      params: [
        {
          name: 'video',
          type: 'file',
          location: 'form-data',
          required: true,
          descriptionKey: 'api.params.videoUpload.video'
        },
        {
          name: 'file',
          type: 'file',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.videoUpload.file'
        },
        {
          name: 'files',
          type: 'file',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.videoUpload.files'
        },
        {
          name: 'transcode',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.videoUpload.transcode'
        },
        {
          name: 'transcodePreset',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.videoUpload.transcodePreset'
        },
        {
          name: 'transcodeBitratePercent',
          type: 'number',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.videoUpload.transcodeBitratePercent'
        },
        {
          name: 'token',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.videoUpload.token'
        },
        {
          name: 'tagNames',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.upload.tagNames'
        }
      ],
      curl: `curl -X POST "${baseUrl}/api/videos/upload" \\
  ${auth} \\
  -F "video=@./demo.mp4" \\
  -F "transcode=1" \\
  -F "transcodePreset=compress" \\
  -F "transcodeBitratePercent=80" \\
  -F 'tagNames=["博客","视频"]'`,
      responseExample: `{
  "success": true,
  "items": [
    {
      "key": "videos/2026/10/abc123.mp4",
      "url": "https://pic.example.com/videos/2026/10/abc123.mp4",
      "originalName": "demo.mp4",
      "contentType": "video/mp4",
      "size": 10485760,
      "uploadedAt": "2026-10-17T03:00:00.000Z",
      "markdown": "[demo.mp4](https://pic.example.com/videos/2026/10/abc123.mp4)",
      "thumbUrl": "https://pic.example.com/videos/2026/10/abc123.webp",
      "tags": [
        { "id": 3, "name": "博客", "color": "#22c55e" },
        { "id": 8, "name": "视频", "color": "#3b82f6" }
      ]
    }
  ],
  "errors": [],
  "accessMode": "public"
}`
    },
    {
      id: 'videoList',
      category: 'video',
      method: 'GET',
      path: '/api/files',
      titleKey: 'api.docs.videoList.title',
      descKey: 'api.docs.videoList.desc',
      requiresAuth: true,
      params: [
        {
          name: 'kind',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.mediaList.kindVideo'
        },
        {
          name: 'page',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.page'
        },
        {
          name: 'limit',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.limit'
        },
        {
          name: 'q',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.q'
        },
        {
          name: 'processing',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.processing'
        },
        {
          name: 'backendId',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.backendId'
        },
        {
          name: 'uploadSource',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.uploadSource'
        },
        {
          name: 'tagIds',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagIds'
        },
        {
          name: 'tagMode',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagMode'
        },
        {
          name: 'untagged',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.untagged'
        }
      ],
      curl: `curl "${baseUrl}/api/files?kind=video&page=1&limit=20" \\
  ${auth}`,
      responseExample: `{
  "items": [
    {
      "key": "videos/2026/10/abc123.mp4",
      "url": "https://pic.example.com/videos/2026/10/abc123.mp4",
      "originalName": "demo.mp4",
      "contentType": "video/mp4",
      "size": 3580000,
      "uploadedAt": "2026-10-17T03:00:00.000Z",
      "transcodeStatus": "done",
      "transcodeProgress": 100,
      "transcodePreset": "veryfast",
      "sourceDeleted": true,
      "thumbUrl": "https://pic.example.com/videos/2026/10/abc123.webp",
      "hlsUrl": "https://pic.example.com/videos/2026/10/abc123/index.m3u8",
      "hlsKey": "videos/2026/10/abc123/index.m3u8"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1,
  "accessMode": "public"
}`
    },
    {
      id: 'videoDelete',
      category: 'video',
      method: 'DELETE',
      path: '/api/files',
      titleKey: 'api.docs.videoDelete.title',
      descKey: 'api.docs.videoDelete.desc',
      requiresAuth: true,
      params: [
        {
          name: 'key',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.videoDelete.key'
        }
      ],
      curl: `curl -X DELETE "${baseUrl}/api/files?key=videos/2026/10/abc123.mp4" \\
  ${auth}`,
      responseExample: `{
  "success": true
}`
    },
    {
      id: 'videoSearch',
      category: 'video',
      method: 'GET',
      path: '/api/videos/search',
      titleKey: 'api.docs.videoSearch.title',
      descKey: 'api.docs.videoSearch.desc',
      requiresAuth: true,
      params: [
        {
          name: 'q',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.mediaSearch.q'
        },
        {
          name: 'page',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.page'
        },
        {
          name: 'limit',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.limit'
        },
        {
          name: 'backendId',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.backendId'
        },
        {
          name: 'uploadSource',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.uploadSource'
        },
        {
          name: 'tagIds',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagIds'
        },
        {
          name: 'tagMode',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagMode'
        },
        {
          name: 'untagged',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.untagged'
        },
        {
          name: 'processing',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.processing'
        }
      ],
      curl: `curl "${baseUrl}/api/videos/search?q=demo&page=1&limit=20" \\
  ${auth}`,
      responseExample: `{
  "items": [
    {
      "key": "videos/2026/10/demo.mp4",
      "originalName": "demo.mp4",
      "contentType": "video/mp4",
      "size": 10485760,
      "transcodeStatus": "done",
      "thumbUrl": "https://pic.example.com/videos/2026/10/demo.webp",
      "hlsUrl": "https://pic.example.com/videos/2026/10/demo/index.m3u8"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1,
  "accessMode": "public"
}`
    },
    {
      id: 'videoBatchDelete',
      category: 'video',
      method: 'POST',
      path: '/api/files/batch-delete',
      titleKey: 'api.docs.videoBatchDelete.title',
      descKey: 'api.docs.videoBatchDelete.desc',
      requiresAuth: true,
      params: [
        {
          name: 'keys',
          type: 'string[]',
          location: 'body',
          required: true,
          descriptionKey: 'api.params.videoBatchDelete.keys'
        }
      ],
      curl: `curl -X POST "${baseUrl}/api/files/batch-delete" \\
  ${auth} \\
  -H "Content-Type: application/json" \\
  -d '{"keys":["videos/2026/10/a.mp4","videos/2026/10/b.mp4"]}'`,
      responseExample: `{
  "success": true,
  "deleted": [
    "videos/2026/10/a.mp4",
    "videos/2026/10/b.mp4"
  ],
  "failed": []
}`
    },
    {
      id: 'fileUpload',
      category: 'file',
      method: 'POST',
      path: '/api/files/upload',
      titleKey: 'api.docs.fileUpload.title',
      descKey: 'api.docs.fileUpload.desc',
      requiresAuth: true,
      params: [
        {
          name: 'file',
          type: 'file',
          location: 'form-data',
          required: true,
          descriptionKey: 'api.params.fileUpload.file'
        },
        {
          name: 'files',
          type: 'file',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.fileUpload.files'
        },
        {
          name: 'token',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.fileUpload.token'
        },
        {
          name: 'tagNames',
          type: 'string',
          location: 'form-data',
          required: false,
          descriptionKey: 'api.params.upload.tagNames'
        }
      ],
      curl: `curl -X POST "${baseUrl}/api/files/upload" \\
  ${auth} \\
  -F "file=@./report.pdf" \\
  -F 'tagNames=["文档","归档"]'`,
      responseExample: `{
  "success": true,
  "items": [
    {
      "key": "files/2026/10/abc123.pdf",
      "url": "https://pic.example.com/files/2026/10/abc123.pdf",
      "originalName": "report.pdf",
      "contentType": "application/pdf",
      "size": 5242880,
      "uploadedAt": "2026-10-17T03:00:00.000Z",
      "markdown": "[report.pdf](https://pic.example.com/files/2026/10/abc123.pdf)",
      "tags": [
        { "id": 4, "name": "文档", "color": "#f59e0b" },
        { "id": 9, "name": "归档", "color": "#64748b" }
      ]
    }
  ],
  "errors": [],
  "accessMode": "public"
}`
    },
    {
      id: 'fileList',
      category: 'file',
      method: 'GET',
      path: '/api/files',
      titleKey: 'api.docs.fileList.title',
      descKey: 'api.docs.fileList.desc',
      requiresAuth: true,
      params: [
        {
          name: 'kind',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.mediaList.kindFile'
        },
        {
          name: 'page',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.page'
        },
        {
          name: 'limit',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.limit'
        },
        {
          name: 'q',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.q'
        },
        {
          name: 'backendId',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.backendId'
        },
        {
          name: 'uploadSource',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.uploadSource'
        },
        {
          name: 'tagIds',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagIds'
        },
        {
          name: 'tagMode',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagMode'
        },
        {
          name: 'untagged',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.untagged'
        }
      ],
      curl: `curl "${baseUrl}/api/files?kind=file&page=1&limit=20" \\
  ${auth}`,
      responseExample: `{
  "items": [
    {
      "key": "files/2026/10/abc123.pdf",
      "url": "https://pic.example.com/files/2026/10/abc123.pdf",
      "originalName": "report.pdf",
      "contentType": "application/pdf",
      "size": 5242880,
      "uploadedAt": "2026-10-17T03:00:00.000Z",
      "markdown": "[report.pdf](https://pic.example.com/files/2026/10/abc123.pdf)"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1,
  "accessMode": "public"
}`
    },
    {
      id: 'fileDelete',
      category: 'file',
      method: 'DELETE',
      path: '/api/files',
      titleKey: 'api.docs.fileDelete.title',
      descKey: 'api.docs.fileDelete.desc',
      requiresAuth: true,
      params: [
        {
          name: 'key',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.fileDelete.key'
        }
      ],
      curl: `curl -X DELETE "${baseUrl}/api/files?key=files/2026/10/abc123.pdf" \\
  ${auth}`,
      responseExample: `{
  "success": true
}`
    },
    {
      id: 'fileBatchDelete',
      category: 'file',
      method: 'POST',
      path: '/api/files/batch-delete',
      titleKey: 'api.docs.fileBatchDelete.title',
      descKey: 'api.docs.fileBatchDelete.desc',
      requiresAuth: true,
      params: [
        {
          name: 'keys',
          type: 'string[]',
          location: 'body',
          required: true,
          descriptionKey: 'api.params.fileBatchDelete.keys'
        }
      ],
      curl: `curl -X POST "${baseUrl}/api/files/batch-delete" \\
  ${auth} \\
  -H "Content-Type: application/json" \\
  -d '{"keys":["files/2026/10/a.pdf","files/2026/10/b.zip"]}'`,
      responseExample: `{
  "success": true,
  "deleted": [
    "files/2026/10/a.pdf",
    "files/2026/10/b.zip"
  ],
  "failed": []
}`
    },
    {
      id: 'fileSearch',
      category: 'file',
      method: 'GET',
      path: '/api/files/search',
      titleKey: 'api.docs.fileSearch.title',
      descKey: 'api.docs.fileSearch.desc',
      requiresAuth: true,
      params: [
        {
          name: 'kind',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.mediaList.kindFile'
        },
        {
          name: 'q',
          type: 'string',
          location: 'query',
          required: true,
          descriptionKey: 'api.params.mediaSearch.q'
        },
        {
          name: 'page',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.page'
        },
        {
          name: 'limit',
          type: 'number',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.limit'
        },
        {
          name: 'backendId',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.backendId'
        },
        {
          name: 'uploadSource',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.uploadSource'
        },
        {
          name: 'tagIds',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagIds'
        },
        {
          name: 'tagMode',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.tagMode'
        },
        {
          name: 'untagged',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.mediaList.untagged'
        }
      ],
      curl: `curl "${baseUrl}/api/files/search?kind=file&q=report&page=1&limit=20" \\
  ${auth}`,
      responseExample: `{
  "items": [
    {
      "key": "files/2026/10/report.pdf",
      "url": "https://pic.example.com/files/2026/10/report.pdf",
      "originalName": "report.pdf",
      "contentType": "application/pdf",
      "size": 5242880,
      "uploadedAt": "2026-10-17T03:00:00.000Z",
      "markdown": "[report.pdf](https://pic.example.com/files/2026/10/report.pdf)"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1,
  "accessMode": "public"
}`
    },
    {
      id: 'twikoo',
      category: 'extension',
      method: 'POST',
      path: '/api/index.php',
      titleKey: 'api.docs.twikoo.title',
      descKey: 'api.docs.twikoo.desc',
      requiresAuth: false,
      params: [
        {
          name: 'image',
          type: 'file',
          location: 'form-data',
          required: true,
          descriptionKey: 'api.params.twikoo.image'
        },
        {
          name: 'token',
          type: 'string',
          location: 'form-data',
          required: true,
          descriptionKey: 'api.params.twikoo.token'
        }
      ],
      curl: `curl -X POST "${baseUrl}/api/index.php" \\
  -F "token=${authHeader}" \\
  -F "image=@./demo.png"`,
      responseExample: `{
  "result": "success",
  "code": 200,
  "url": "https://pic.example.com/abc123.webp"
}`
    },
    {
      id: 'config',
      category: 'system',
      method: 'GET',
      path: '/api/auth/config',
      titleKey: 'api.docs.config.title',
      descKey: 'api.docs.config.desc',
      requiresAuth: false,
      params: [],
      curl: `curl "${baseUrl}/api/auth/config"`,
      responseExample: `{
  "initialized": true,
  "allowRegistration": false,
  "legacyMode": false,
  "adminSecretConfigured": false,
  "apiUploadTokenConfigured": true
}`
    },
    {
      id: 'count',
      category: 'system',
      method: 'GET',
      path: '/api/images/count',
      titleKey: 'api.docs.count.title',
      descKey: 'api.docs.count.desc',
      requiresAuth: true,
      params: [
        {
          name: 'backendId',
          type: 'string',
          location: 'query',
          required: false,
          descriptionKey: 'api.params.backendId'
        }
      ],
      curl: `curl "${baseUrl}/api/images/count" \\
  ${auth}`,
      responseExample: `{
  "total": 42
}`
    }
  ]
}
