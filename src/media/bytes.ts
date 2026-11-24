export const ascii = (value: string) => new TextEncoder().encode(value)
export const utf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
export const zero = (size: number) => new Uint8Array(size)
export const view = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

export function join(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0))
  let position = 0
  for (const part of parts) {
    out.set(part, position)
    position += part.byteLength
  }
  return out
}

export function u16(...values: number[]) {
  const out = zero(values.length * 2)
  values.forEach((value, index) => view(out).setUint16(index * 2, value))
  return out
}

export function u32(...values: number[]) {
  const out = zero(values.length * 4)
  values.forEach((value, index) => view(out).setUint32(index * 4, value))
  return out
}

export function box(type: string | number, ...parts: Uint8Array[]) {
  const size = 8 + parts.reduce((total, part) => total + part.byteLength, 0)
  if (size > 0xffffffff) throw new Error('A QuickTime metadata atom is too large.')
  return join(u32(size), typeof type === 'string' ? ascii(type) : u32(type), ...parts)
}

export async function readBytes(blob: Blob, start: number, end: number) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer())
}
