import type { ImageIndexRow } from './image-index'
import type { StorageBackend } from './storage/types'
import { hlsSegmentNames } from './transcode'

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Uint8Array))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 一个媒体记录对应的全部存储对象，包括原文件、缩略图和 HLS 附属文件。 */
export async function collectMediaAssetKeys(
  row: ImageIndexRow,
  backend: Pick<StorageBackend, 'createStream'>
): Promise<string[]> {
  const keys = new Set<string>()

  if (Number(row.source_deleted ?? 0) !== 1) {
    keys.add(row.key)
  }
  if (row.thumb_key) {
    keys.add(row.thumb_key)
  }
  if (row.hls_key) {
    keys.add(row.hls_key)
    const dir = row.hls_key.slice(0, row.hls_key.lastIndexOf('/'))
    const playlist = await streamToString(await backend.createStream(row.hls_key))
    for (const name of hlsSegmentNames(playlist)) {
      keys.add(`${dir}/${name}`)
    }
  }

  return [...keys]
}
