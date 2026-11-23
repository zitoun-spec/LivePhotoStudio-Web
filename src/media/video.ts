import { inspectQuickTime } from './quicktime'

const containerExtension = /\.(mp4|m4v|mov|qt|webm|mkv|avi|mpeg|mpg|3gp|mts|m2ts|ogv)$/i

export type VideoInfo = {
  duration: number
  width: number
  height: number
  audio: boolean
  playable: boolean
}

export function validateSelection(file: File) {
  if (!file.size) throw new Error('This file is empty. Choose a video from Photos or Files.')
  if (!file.type.startsWith('video/') && !containerExtension.test(file.name)) {
    throw new Error('Choose a video file, such as an MP4 or MOV.')
  }
}

function attachVideo(url: string) {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.playsInline = true
  video.muted = true
  video.src = url
  return video
}

function detachVideo(video: HTMLVideoElement) {
  video.pause()
  video.removeAttribute('src')
  video.load()
}

function waitForMedia(
  video: HTMLVideoElement, event: string, signal: AbortSignal, ready: () => boolean,
) {
  signal.throwIfAborted()
  if (ready()) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener(event, success)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const success = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('The browser could not decode this video.'))
    }
    const aborted = () => {
      cleanup()
      reject(signal.reason)
    }
    const timer = window.setTimeout(failed, 12_000)
    video.addEventListener(event, success, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    if (video.error) failed()
  })
}

async function browserInfo(url: string, signal: AbortSignal) {
  const video = attachVideo(url)
  try {
    await waitForMedia(video, 'loadedmetadata', signal, () => video.readyState >= 1)
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error('The browser could not read a finite video duration.')
    }
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight }
  } finally {
    detachVideo(video)
  }
}

export async function readVideoInfo(file: File, signal: AbortSignal): Promise<VideoInfo> {
  validateSelection(file)
  const url = URL.createObjectURL(file)
  const [browser, container] = await Promise.all([
    browserInfo(url, signal).catch(() => undefined).finally(() => URL.revokeObjectURL(url)),
    inspectQuickTime(file).catch(() => undefined),
  ])
  signal.throwIfAborted()
  const video = container?.videos[0]
  if (container && video && (browser || (video.width && video.height))) {
    return {
      duration: browser?.duration ?? container.duration,
      width: browser?.width ?? video.width,
      height: browser?.height ?? video.height,
      audio: container.audios.length > 0,
      playable: Boolean(browser),
    }
  }

  const { withEngine, primaryAudio, primaryVideo } = await import('./engine')
  return withEngine(file, signal, async (engine) => {
    const probe = await engine.inspect()
    const stream = primaryVideo(probe)
    const audio = primaryAudio(probe)
    const duration = browser?.duration ?? Number(probe.format.duration ?? stream?.duration)
    if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0) {
      throw new Error('This file has no readable video track with a finite duration.')
    }
    const rotation = Number(stream.side_data_list?.[0]?.rotation ?? stream.tags?.rotate ?? 0)
    const portrait = Math.abs(rotation % 180) === 90
    return {
      duration,
      width: browser?.width ?? (portrait ? stream.height : stream.width),
      height: browser?.height ?? (portrait ? stream.width : stream.height),
      audio: Boolean(audio),
      playable: Boolean(browser),
    }
  })
}

export function initialStill(duration: number) {
  return duration / 2
}

export function limitStill(seconds: number, duration: number) {
  // The exact endpoint has no following frame to decode. At most 1 ms is offset.
  return Math.max(0, Math.min(seconds, duration - 0.001))
}

export async function canvasJpeg(blob: Blob, seconds: number, signal: AbortSignal) {
  const url = URL.createObjectURL(blob)
  const video = attachVideo(url)
  const canvas = document.createElement('canvas')
  try {
    await waitForMedia(video, 'loadedmetadata', signal, () => video.readyState >= 1)
    video.currentTime = limitStill(seconds, video.duration)
    await waitForMedia(video, 'seeked', signal, () => !video.seeking)
    await waitForMedia(video, 'loadeddata', signal, () => video.readyState >= 2)
    signal.throwIfAborted()
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx || !canvas.width || !canvas.height) throw new Error('The selected frame cannot be drawn.')
    ctx.drawImage(video, 0, 0)
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))
    signal.throwIfAborted()
    if (!image) throw new Error('The browser could not encode the selected frame.')
    return image
  } finally {
    canvas.width = 0
    canvas.height = 0
    detachVideo(video)
    URL.revokeObjectURL(url)
  }
}
