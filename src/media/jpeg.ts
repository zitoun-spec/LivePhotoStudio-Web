import exifr from 'exifr'
import { ascii, join, readBytes, u16, u32, utf8, view, zero } from './bytes'

const appleHeader = join(ascii('Apple iOS'), zero(1), u16(1), ascii('MM'))

function ifdEntry(tag: number, type: number, count: number, dataOffset: number) {
  return join(u16(tag, type), u32(count, dataOffset))
}

/** Creates an EXIF APP1 segment for a freshly encoded JPEG (Canvas or FFmpeg). */
export async function tagJpeg(jpeg: Blob, id: string) {
  const signature = new Uint8Array(await jpeg.slice(0, 2).arrayBuffer())
  if (signature[0] !== 0xff || signature[1] !== 0xd8) {
    throw new Error('The selected frame could not be encoded as JPEG.')
  }

  // Apple MakerNote offsets use the start of the MakerNote as their base.
  const value = join(ascii(id), zero(1))
  const makerNote = join(appleHeader, u16(1), ifdEntry(17, 2, value.length, 32), u32(0), value)
  const tiff = join(
    ascii('MM'), u16(42), u32(8),
    u16(1), ifdEntry(0x8769, 4, 1, 26), u32(0),
    u16(1), ifdEntry(0x927c, 7, makerNote.length, 44), u32(0),
    makerNote,
  )
  const exif = join(ascii('Exif\0\0'), tiff)
  // Keep a leading JFIF APP0 segment first, when present.
  const head = new Uint8Array(await jpeg.slice(2, 6).arrayBuffer())
  const insertAt = head.length === 4 && head[0] === 0xff && head[1] === 0xe0
    ? 4 + view(head).getUint16(2)
    : 2
  if (insertAt >= jpeg.size) throw new Error('The generated JPEG header is incomplete.')
  return new Blob([
    jpeg.slice(0, insertAt), u16(0xffe1, exif.length + 2), exif, jpeg.slice(insertAt),
  ], { type: 'image/jpeg' })
}

export async function readJpegIdentifier(jpeg: Blob) {
  const header = await readBytes(jpeg, 0, 65536)
  const metadata = await exifr.parse(header, { tiff: true, exif: true, makerNote: true, translateKeys: false })
  const note: Uint8Array | undefined = metadata?.makerNote
  if (!note || note.length < 32 || utf8(note.slice(0, 14)) !== utf8(appleHeader)) return
  const bytes = view(note)
  const entries = bytes.getUint16(14)
  for (let index = 0; index < entries; index += 1) {
    const position = 16 + index * 12
    if (position + 12 > note.length) return
    if (bytes.getUint16(position) !== 17 || bytes.getUint16(position + 2) !== 2) continue
    const length = bytes.getUint32(position + 4)
    const offset = bytes.getUint32(position + 8)
    if (length !== 37 || offset + length > note.length || note[offset + length - 1] !== 0) return
    return utf8(note.subarray(offset, offset + length - 1))
  }
}
