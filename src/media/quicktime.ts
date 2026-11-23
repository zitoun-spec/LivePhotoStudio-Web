import { ascii, box, readBytes, u16, u32, utf8, view, zero } from './bytes'

const contentKey = 'com.apple.quicktime.content.identifier'
const stillKey = 'com.apple.quicktime.still-image-time'

type Atom = { type: string; start: number; data: number; end: number }

function atomAt(bytes: Uint8Array, offset: number, end: number, base = 0): Atom {
  if (bytes.length - offset < 8) throw new Error('A QuickTime atom header is incomplete.')
  const header = view(bytes)
  const size32 = header.getUint32(offset)
  const extended = size32 === 1
  const start = base + offset
  const data = start + (extended ? 16 : 8)
  const size = extended ? Number(header.getBigUint64(offset + 8)) : size32 || end - start
  if (!Number.isSafeInteger(size) || start + size > end || start + size < data) {
    throw new Error('A QuickTime atom has an invalid size.')
  }
  return { type: utf8(bytes.subarray(offset + 4, offset + 8)), start, data, end: start + size }
}

function atoms(bytes: Uint8Array, start = 0, end = bytes.length) {
  const result: Atom[] = []
  for (let offset = start; offset < end;) {
    const atom = atomAt(bytes, offset, end)
    result.push(atom)
    offset = atom.end
  }
  return result
}

function child(bytes: Uint8Array, parent: Atom, type: string, skip = 0) {
  return atoms(bytes, parent.data + skip, parent.end).find((atom) => atom.type === type)
}

function needed(atom: Atom | undefined, type: string) {
  if (!atom) throw new Error('The QuickTime file is missing the ' + type + ' atom.')
  return atom
}

async function movie(blob: Blob) {
  for (let offset = 0; offset < blob.size;) {
    const header = await readBytes(blob, offset, offset + 16)
    const atom = atomAt(header, 0, blob.size, offset)
    if (atom.type === 'moov') {
      const bytes = await readBytes(blob, atom.start, atom.end)
      return { bytes, root: atomAt(bytes, 0, bytes.length), position: atom }
    }
    offset = atom.end
  }
  throw new Error('The video has no readable QuickTime movie header.')
}

function clock(bytes: Uint8Array, atom: Atom) {
  const reader = view(bytes)
  const wide = bytes[atom.data] === 1
  const scaleOffset = atom.data + (wide ? 20 : 12)
  return {
    scale: reader.getUint32(scaleOffset),
    ticks: wide ? Number(reader.getBigUint64(scaleOffset + 4)) : reader.getUint32(scaleOffset + 4),
  }
}

function readTracks(bytes: Uint8Array, root: Atom, scale: number) {
  const reader = view(bytes)
  return atoms(bytes, root.data, root.end).filter(({ type }) => type === 'trak').map((track) => {
    const header = needed(child(bytes, track, 'tkhd'), 'tkhd')
    const wide = bytes[header.data] === 1
    const id = reader.getUint32(header.data + (wide ? 20 : 12))
    const duration = (wide ? Number(reader.getBigUint64(header.data + 28))
      : reader.getUint32(header.data + 20)) / scale
    const media = needed(child(bytes, track, 'mdia'), 'mdia')
    const handler = needed(child(bytes, media, 'hdlr'), 'hdlr')
    const kind = utf8(bytes.subarray(handler.data + 8, handler.data + 12))
    const minf = needed(child(bytes, media, 'minf'), 'minf')
    const table = needed(child(bytes, minf, 'stbl'), 'stbl')
    const description = needed(child(bytes, table, 'stsd'), 'stsd')
    const entry = atoms(bytes, description.data + 8, description.end)[0]
    const sizes = child(bytes, table, 'stsz') ?? child(bytes, table, 'stz2')
    const samples = sizes ? reader.getUint32(sizes.data + 8) : undefined
    const width = reader.getUint32(header.end - 8) / 65536
    const height = reader.getUint32(header.end - 4) / 65536
    const matrix = header.data + (wide ? 52 : 40)
    const rotated = Math.abs(reader.getInt32(matrix + 4)) > Math.abs(reader.getInt32(matrix))
    const enabled = (bytes[header.data + 3] & 1) !== 0
    return { track, id, duration, kind, enabled, table, entry, samples,
      width: rotated ? height : width, height: rotated ? width : height }
  })
}

export async function inspectQuickTime(blob: Blob) {
  const { bytes, root } = await movie(blob)
  const header = clock(bytes, needed(child(bytes, root, 'mvhd'), 'mvhd'))
  if (!header.scale || header.ticks <= 0) throw new Error('The video has no finite QuickTime duration.')
  const tracks = readTracks(bytes, root, header.scale)
  const videos = tracks.filter((track) => track.kind === 'vide' && track.samples !== 0)
  const audios = tracks.filter((track) => track.kind === 'soun' && track.samples !== 0)
  return { duration: header.ticks / header.scale, videos, audios }
}

export async function reusableMovie(blob: Blob) {
  const allowed = new Set(['ftyp', 'wide', 'mdat', 'free', 'skip', 'moov'])
  const first = await readBytes(blob, 0, 12)
  if (utf8(first.subarray(4)) !== 'ftypqt  ' || blob.size >= 0xffffffff - 8) return
  let media = false
  let movieHeaders = 0
  for (let offset = 0; offset < blob.size;) {
    const header = await readBytes(blob, offset, offset + 16)
    const atom = atomAt(header, 0, blob.size, offset)
    // Open-ended mdat would swallow the new metadata appended below.
    if (!allowed.has(atom.type) || view(header).getUint32(0) === 0) return
    if (atom.type === 'mdat') media = true
    if (atom.type === 'moov') movieHeaders += 1
    offset = atom.end
  }
  if (!media || movieHeaders !== 1) return

  const { bytes, root } = await movie(blob)
  if (child(bytes, root, 'mvex')) return
  const header = clock(bytes, needed(child(bytes, root, 'mvhd'), 'mvhd'))
  if (!header.scale || !header.ticks) return
  const tracks = readTracks(bytes, root, header.scale)
  const video = tracks.find((track) => track.kind === 'vide')
  const audio = tracks.find((track) => track.kind === 'soun')
  if (!video?.entry || !video.samples || !video.enabled || video.duration <= 0
    || !['avc1', 'hvc1'].includes(video.entry.type)
    || (audio && (!audio.samples || !audio.enabled || audio.entry?.type !== 'mp4a'))
    || tracks.length !== (audio ? 2 : 1)) return

  for (const item of tracks) {
    const media = needed(child(bytes, item.track, 'mdia'), 'mdia')
    const info = needed(child(bytes, media, 'minf'), 'minf')
    const reference = needed(child(bytes, needed(child(bytes, info, 'dinf'), 'dinf'), 'dref'), 'dref')
    const entries = atoms(bytes, reference.data + 8, reference.end)
    // Only self-contained files whose sample table uses one local data reference.
    if (entries.length !== 1 || view(bytes).getUint32(entries[0].data) !== 1) return
    const description = needed(child(bytes, item.table, 'stsd'), 'stsd')
    if (view(bytes).getUint32(description.data + 4) !== 1
      || view(bytes).getUint16(needed(item.entry, 'sample description').data + 6) !== 1) return
  }
  return { video, audio, duration: header.ticks / header.scale }
}

function pascal(name: string) {
  const bytes = ascii(name)
  return Uint8Array.of(bytes.length, ...bytes)
}

function movieIdentifier(id: string) {
  return box('meta',
    box('hdlr', zero(8), ascii('mdta'), zero(14)),
    box('keys', u32(0, 1), box('mdta', ascii(contentKey))),
    box('ilst', box(1, box('data', u32(1, 0), ascii(id)))),
  )
}

function metadataTrack(id: number, videoId: number, marker: number, scale: number, offset: number) {
  const matrix = u32(65536, 0, 0, 0, 65536, 0, 0, 0, 0x40000000)
  const edit = marker > 0 ? u32(0, 2, marker, -1, 65536, 1, 0, 65536) : u32(0, 1, 1, 0, 65536)
  const keys = box('keys', box(1, box('keyd', ascii('mdta' + stillKey)), box('dtyp', u32(0, 65))))
  const sampleEntry = box('mebx', zero(6), u16(1), keys)
  return box('trak',
    box('tkhd', u32(15, 0, 0, id, 0, marker + 1), zero(16), matrix, zero(8)),
    box('edts', box('elst', edit)),
    box('tref', box('cdsc', u32(videoId))),
    box('mdia',
      box('mdhd', u32(0, 0, 0, scale, 1, 0)),
      box('hdlr', u32(0), ascii('mhlrmeta'), zero(12), pascal('Core Media Metadata')),
      box('minf',
        box('gmhd', box('gmin', u32(0), u16(0x40, 0x8000, 0x8000, 0x8000, 0, 0))),
        box('hdlr', u32(0), ascii('dhlralis'), zero(12), pascal('Core Media Data Handler')),
        box('dinf', box('dref', u32(0, 1), box('alis', u32(1)))),
        box('stbl',
          box('stsd', u32(0, 1), sampleEntry),
          box('stts', u32(0, 1, 1, 1)),
          box('stsc', u32(0, 1, 1, 1, 1)),
          box('stsz', u32(0, 9, 1)),
          box('stco', u32(0, 1, offset)),
        ),
      ),
    ),
  )
}

export async function tagMovie(blob: Blob, id: string, stillSeconds: number) {
  const { bytes, root, position } = await movie(blob)
  const appendAt = position.end === blob.size ? position.start : blob.size
  if (appendAt > 0xffffffff - 8) {
    throw new Error('The converted MOV has an unsupported QuickTime layout.')
  }
  const header = needed(child(bytes, root, 'mvhd'), 'mvhd')
  const { scale, ticks } = clock(bytes, header)
  const tracks = readTracks(bytes, root, scale)
  const video = tracks.find(({ kind }) => kind === 'vide')
  if (!video || !scale || !ticks) throw new Error('The converted MOV is missing its video track.')
  const lastVideoTick = Math.min(ticks, Math.round(video.duration * scale)) - 1
  const marker = Math.max(0, Math.min(lastVideoTick, Math.round(stillSeconds * scale)))
  if (marker >= 0xffffffff) throw new Error('The selected time exceeds the QuickTime timing table.')
  const trackId = Math.max(...tracks.map(({ id: trackId }) => trackId)) + 1
  view(bytes).setUint32(header.end - 4, trackId + 1)

  // Signed int8 zero is the marker used in the AVFoundation reference output.
  const sample = box('mdat', box(1, zero(1)))
  const parts = atoms(bytes, root.data, root.end)
    .filter(({ type }) => type !== 'meta' && type !== 'udta')
    .map((atom) => atom.type === 'trak'
      ? box('trak', ...atoms(bytes, atom.data, atom.end)
        .filter(({ type }) => type !== 'meta' && type !== 'udta')
        .map(({ start, end }) => bytes.subarray(start, end)))
      : bytes.subarray(atom.start, atom.end))
  const tagged = box('moov', ...parts, metadataTrack(trackId, video.id, marker, scale, appendAt + 8),
    movieIdentifier(id))
  // A front-loaded moov becomes padding of the same size, preserving every media offset.
  const prefix = position.end === blob.size
    ? [blob.slice(0, position.start)]
    : [blob.slice(0, position.start), box('free', zero(position.end - position.start - 8)),
      blob.slice(position.end)]
  return new Blob([...prefix, sample, tagged], { type: 'video/quicktime' })
}

export async function readMoviePair(blob: Blob) {
  const { bytes, root, position } = await movie(blob)
  const header = clock(bytes, needed(child(bytes, root, 'mvhd'), 'mvhd'))
  const tracks = readTracks(bytes, root, header.scale)
  const video = tracks.find(({ kind }) => kind === 'vide')
  const audio = tracks.filter(({ kind }) => kind === 'soun')
  const meta = needed(child(bytes, root, 'meta'), 'meta')
  const keys = needed(child(bytes, meta, 'keys'), 'keys')
  const list = needed(child(bytes, meta, 'ilst'), 'ilst')
  const metadataHandler = needed(child(bytes, meta, 'hdlr'), 'hdlr')
  const key = atoms(bytes, keys.data + 8, keys.end)[0]
  const item = needed(child(bytes, list, '\0\0\0\x01'), 'content identifier item')
  const data = needed(child(bytes, item, 'data'), 'identifier data')
  const identifier = utf8(bytes.subarray(data.data + 8, data.end))
  const reader = view(bytes)
  if (key?.type !== 'mdta' || utf8(bytes.subarray(key.data, key.end)) !== contentKey
    || utf8(bytes.subarray(metadataHandler.data + 8, metadataHandler.data + 12)) !== 'mdta'
    || reader.getUint32(data.data) !== 1 || !video) {
    throw new Error('The MOV content identifier is invalid.')
  }

  const timed = tracks.find(({ kind, entry }) => kind === 'meta' && entry?.type === 'mebx')
  if (!timed?.entry) throw new Error('The MOV still-image-time track is missing.')
  const track = timed.track
  const timedKeys = needed(child(bytes, timed.entry, 'keys', 8), 'timed keys')
  const timedKey = needed(child(bytes, timedKeys, '\0\0\0\x01'), 'local timed key')
  const declaration = needed(child(bytes, timedKey, 'keyd'), 'keyd')
  const type = needed(child(bytes, timedKey, 'dtyp'), 'dtyp')
  const reference = needed(child(bytes, needed(child(bytes, track, 'tref'), 'tref'), 'cdsc'), 'cdsc')
  const edits = needed(child(bytes, needed(child(bytes, track, 'edts'), 'edts'), 'elst'), 'elst')
  const offsets = needed(child(bytes, timed.table, 'stco'), 'stco')
  const times = needed(child(bytes, timed.table, 'stts'), 'stts')
  const sizes = needed(child(bytes, timed.table, 'stsz'), 'stsz')
  const sampleOffset = reader.getUint32(offsets.data + 8)
  const count = reader.getUint32(edits.data + 4)
  const stillTime = count === 2 ? reader.getUint32(edits.data + 8) / header.scale : 0
  const lastEdit = edits.data + (count === 2 ? 20 : 8)
  if (sampleOffset + 9 > position.start || sampleOffset < 8
    || utf8(bytes.subarray(declaration.data, declaration.end)) !== 'mdta' + stillKey
    || reader.getUint32(type.data + 4) !== 65
    || reader.getUint32(reference.data) !== video.id
    || !timed.enabled || timed.samples !== 1 || reader.getUint32(sizes.data + 4) !== 9
    || reader.getUint32(times.data + 4) !== 1 || reader.getUint32(times.data + 8) !== 1
    || reader.getUint32(times.data + 12) !== 1
    || (count !== 1 && count !== 2) || (count === 2 && reader.getInt32(edits.data + 12) !== -1)
    || reader.getUint32(lastEdit) !== 1 || reader.getUint32(lastEdit + 4) !== 0
    || stillTime >= video.duration) {
    throw new Error('The MOV still-image-time track is invalid.')
  }
  const sample = await readBytes(blob, sampleOffset, sampleOffset + 9)
  if (view(sample).getUint32(0) !== 9 || view(sample).getUint32(4) !== 1 || sample[8] !== 0) {
    throw new Error('The MOV still-image-time sample is invalid.')
  }
  return { identifier, stillTime, duration: header.ticks / header.scale, video, audio }
}
