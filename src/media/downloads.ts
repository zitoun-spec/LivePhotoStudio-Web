import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import type { Result } from './convert'

export async function zipPair(result: Result, signal?: AbortSignal) {
  // JPEG and MOV are already compressed. The ZIP writer streams both Blobs.
  const zip = new ZipWriter(new BlobWriter('application/zip'))
  try {
    await zip.add(result.name + '.jpg', new BlobReader(result.photo), { level: 0, signal })
    await zip.add(result.name + '.mov', new BlobReader(result.motion), { level: 0, signal })
    return await zip.close()
  } catch (error) {
    await zip.close().catch(() => undefined)
    throw error
  }
}
