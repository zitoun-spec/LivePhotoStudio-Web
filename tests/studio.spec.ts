import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { BlobReader, ZipReader } from '@zip.js/zip.js'
import { readJpegIdentifier } from '../src/media/jpeg'
import { readMoviePair } from '../src/media/quicktime'

let directory: string

function makeVideo(seconds: number, options: { silent?: boolean; webm?: boolean; rotated?: boolean } = {}) {
  const { silent, webm, rotated } = options
  const path = join(directory, seconds + (rotated ? '-rotated' : '') + (webm ? '.webm' : '.mp4'))
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
    'testsrc2=size=160x96:rate=12',
    ...(silent ? [] : ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100']),
    '-t', String(seconds), '-threads', '1',
    ...(webm ? ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'] : ['-c:v', 'libx264', '-c:a', 'aac']),
    path])
  if (!rotated) return path
  const portrait = join(directory, 'portrait.mov')
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-display_rotation:v:0', '90', '-i', path, '-c', 'copy',
    '-movflags', '+faststart', portrait])
  return portrait
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'live-photo-browser-'))
})
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('file picker, invalid selection, demo, iPhone guide and responsive layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page).toHaveTitle('Live Photo Studio')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live Photo Studio')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'iPhone guide' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close guide' }).click()
  await page.getByRole('button', { name: 'Play full preview' }).click()
  await expect.poll(() => page.locator('.motion-video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Stop preview' }).click()
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import Video' }).click(),
  ])
  await chooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('test') })
  await expect(page.getByRole('alert')).toHaveText('Choose a video file, such as an MP4 or MOV.')
  await page.getByLabel('Choose a video file').setInputFiles({
    name: 'invalid.mp4', mimeType: 'video/mp4', buffer: Buffer.from('this is not a video'),
  })
  await expect(page.getByRole('alert')).toContainText('could not read this video', { timeout: 35_000 })
  await expect(page.getByRole('link', { name: 'Download original' })).toBeVisible()
})

for (const seconds of [3, 10, 30, 60, 120]) {
  test('produces all ' + seconds + ' seconds and audio in the browser', async ({ page }) => {
    const source = makeVideo(seconds)
    await page.goto('./')
    await page.getByLabel('Choose a video file').setInputFiles(source)
    await expect(page.getByRole('heading', { name: 'Your video' })).toBeVisible()
    await expect(page.getByText('Available', { exact: true })).toBeVisible()
    await expect(page.getByText('160 × 96')).toBeVisible()
    const slider = page.getByRole('slider', { name: 'Key photo' })
    await expect(slider).toHaveValue(String(seconds / 2))
    if (seconds === 10) {
      await slider.focus()
      await slider.press('Home')
      await expect(slider).toHaveValue('0')
    }
    await page.getByRole('button', { name: 'Convert to Live Photo' }).click()
    await expect(page.getByText('File pair verified')).toBeVisible({ timeout: 65_000 })
    await expect(page.getByText('First track included')).toBeVisible()

    const [movDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /Full video MOV/ }).click(),
    ])
    const movPath = await movDownload.path()
    expect(movDownload.suggestedFilename()).toMatch(/\.mov$/)
    const movie = await readMoviePair(new Blob([await readFile(movPath!)]))
    expect(movie.duration).toBeCloseTo(seconds, 2)
    expect(movie.video.samples).toBe(seconds * 12)
    expect(movie.audio.length).toBe(1)
    expect(movie.stillTime).toBeCloseTo(seconds === 10 ? 0 : seconds / 2, 2)
    if (seconds !== 3) return

    const [jpgDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /Key photo JPEG/ }).click(),
    ])
    expect(jpgDownload.suggestedFilename()).toMatch(/\.jpg$/)
    const jpg = new Blob([await readFile((await jpgDownload.path())!)])
    expect(await readJpegIdentifier(jpg)).toBe(movie.identifier)

    await page.getByRole('button', { name: 'Play full preview' }).click()
    await expect.poll(() => page.locator('.motion-video').evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Prepare ZIP' }).click()
    const [zipDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download ZIP' }).click(),
    ])
    const archive = new ZipReader(new BlobReader(new Blob([await readFile((await zipDownload.path())!)])))
    try {
      expect((await archive.getEntries()).map((entry) => entry.filename).sort()).toEqual([
        jpgDownload.suggestedFilename(), movDownload.suggestedFilename(),
      ])
    } finally {
      await archive.close()
    }
    const [original] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /Original video/ }).click(),
    ])
    expect(await readFile((await original.path())!)).toEqual(await readFile(source))
    await page.getByRole('button', { name: 'Convert Another Video' }).click()
    await expect(page.getByRole('button', { name: 'Import Video' })).toBeVisible()
  })
}

test('cancels the media worker and allows a retry', async ({ page }) => {
  const source = makeVideo(2)
  await page.route('**/*.wasm', () => {})
  await page.goto('./')
  await page.getByLabel('Choose a video file').setInputFiles(source)
  await expect(page.getByRole('heading', { name: 'Your video' })).toBeVisible()
  const request = page.waitForRequest((req) => req.url().endsWith('.wasm'))
  await page.getByRole('button', { name: 'Convert to Live Photo' }).click()
  await request
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Processing canceled.', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download original' })).toBeVisible()
  await page.unroute('**/*.wasm')
  await page.getByRole('button', { name: 'Convert to Live Photo' }).click()
  await expect(page.getByText('File pair verified')).toBeVisible({ timeout: 65_000 })
})

test('transcodes WebM and handles input without audio', async ({ page }) => {
  const source = makeVideo(4, { silent: true, webm: true })
  await page.goto('./')
  await page.getByLabel('Choose a video file').setInputFiles(source)
  await expect(page.getByText('No audio', { exact: true })).toBeVisible({ timeout: 35_000 })
  await page.getByRole('button', { name: 'Convert to Live Photo' }).click()
  await expect(page.getByText('File pair verified')).toBeVisible({ timeout: 65_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /Full video MOV/ }).click(),
  ])
  const pair = await readMoviePair(new Blob([await readFile((await download.path())!)]))
  expect(pair.duration).toBeCloseTo(4, 2)
  expect(pair.video.entry?.type).toBe('avc1')
  expect(pair.video.samples).toBe(48)
  expect(pair.audio).toHaveLength(0)
})

test('preserves rotated MOV tracks without loading WebAssembly', async ({ page }) => {
  await page.route('**/*.wasm', (route) => route.abort())
  const source = makeVideo(3, { rotated: true })
  await page.goto('./')
  await page.getByLabel('Choose a video file').setInputFiles(source)
  await expect(page.getByText('96 × 160')).toBeVisible()
  await page.getByRole('button', { name: 'Convert to Live Photo' }).click()
  await expect(page.getByText('File pair verified')).toBeVisible({ timeout: 65_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /Full video MOV/ }).click(),
  ])
  const pair = await readMoviePair(new Blob([await readFile((await download.path())!)]))
  expect([pair.video.width, pair.video.height]).toEqual([96, 160])
})

test('keeps the first audio track from a video with multiple tracks', async ({ page }) => {
  const path = join(directory, 'multiple-audio.mp4')
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', makeVideo(3), '-f', 'lavfi', '-i', 'sine=frequency=1200:sample_rate=48000',
    '-map', '0:v', '-map', '0:a', '-map', '1:a', '-t', '3', '-c:v', 'copy', '-c:a', 'aac', path])
  await page.goto('./')
  await page.getByLabel('Choose a video file').setInputFiles(path)
  await page.getByRole('button', { name: 'Convert to Live Photo' }).click()
  await expect(page.getByText('File pair verified')).toBeVisible({ timeout: 35_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /Full video MOV/ }).click(),
  ])
  const media = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_streams',
    '-of', 'json', (await download.path())!], { encoding: 'utf8' }))
  expect(media.streams).toHaveLength(1)
  expect(media.streams[0].sample_rate).toBe('44100')
})
