import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readJpegIdentifier, tagJpeg } from '../src/media/jpeg'
import { inspectQuickTime, readMoviePair, tagMovie } from '../src/media/quicktime'

const id = 'CA4B8B55-824E-4C9D-9057-A9628F1664AD'
let directory: string

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
}

function ffprobe(path: string) {
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-show_format', '-show_streams', '-show_packets', '-select_streams', 'd',
    '-of', 'json', path,
  ], { encoding: 'utf8' }))
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'live-photo-'))
})
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('QuickTime and Apple EXIF metadata', () => {
  it.each([3, 10, 30, 60, 120])('preserves all %is of a video with audio', async (seconds) => {
    const input = join(directory, seconds + '.mov')
    const output = join(directory, seconds + '-paired.mov')
    const photo = join(directory, seconds + '.jpg')
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=96x160:rate=12',
      '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=44100',
      '-t', String(seconds), '-c:v', 'libx264', '-c:a', 'aac', input])
    const source = new Blob([await readFile(input)])
    const still = seconds / 2
    ffmpeg(['-ss', String(still), '-i', input, '-frames:v', '1', '-update', '1', photo])
    const jpeg = await tagJpeg(new Blob([await readFile(photo)]), id)
    expect(await readJpegIdentifier(jpeg)).toBe(id)

    const result = await tagMovie(source, id, still)
    const pair = await readMoviePair(result)
    const original = await inspectQuickTime(source)
    expect(pair.identifier).toBe(id)
    expect(pair.stillTime).toBeCloseTo(still, 3)
    expect(pair.duration).toBeCloseTo(original.duration, 3)
    expect(pair.video.samples).toBe(seconds * 12)
    expect([pair.video.width, pair.video.height]).toEqual([96, 160])
    expect(pair.audio[0]?.samples).toBe(original.audios[0]?.samples)
    expect(pair.audio[0]?.duration).toBeCloseTo(seconds, 3)

    // Check the byte layout with FFmpeg's demuxer, independently of our parser.
    await writeFile(output, new Uint8Array(await result.arrayBuffer()))
    const probe = ffprobe(output)
    expect(probe.format.tags['com.apple.quicktime.content.identifier']).toBe(id)
    expect(probe.streams[0].codec_tag_string).toBe('mebx')
    expect(Number(probe.packets[0].pts_time)).toBeCloseTo(still, 3)
    expect(probe.packets[0].size).toBe('9')
  }, 30_000)

  it('rejects invalid inputs', async () => {
    await expect(tagJpeg(new Blob(['bad']), id)).rejects.toThrow('JPEG')
    await expect(tagMovie(new Blob(['bad']), id, 0)).rejects.toThrow('QuickTime')
  })
})
