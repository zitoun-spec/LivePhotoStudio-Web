import { readJpegIdentifier, tagJpeg } from './jpeg'
import { inspectQuickTime, readMoviePair, reusableMovie, tagMovie } from './quicktime'
import { canvasJpeg, limitStill } from './video'
import type { VideoInfo } from './video'
import type { Progress } from './progress'

export type Result = {
  photo: Blob
  motion: Blob
  name: string
  duration: number
  stillTime: number
  audio: boolean
}

export async function convertFullVideo(
  file: File,
  info: VideoInfo,
  stillTime: number,
  signal: AbortSignal,
  onProgress: (progress: Progress) => void,
): Promise<Result> {
  const finalize = async (
    blob: Blob, frame: Blob, selected: number, duration: number, audio: boolean,
  ): Promise<Result> => {
    signal.throwIfAborted()
    onProgress({ phase: 3 })
    const id = crypto.randomUUID().toUpperCase()
    const [photo, motion] = await Promise.all([tagJpeg(frame, id), tagMovie(blob, id, selected)])
    signal.throwIfAborted()

    onProgress({ phase: 4 })
    const [photoId, pair] = await Promise.all([readJpegIdentifier(photo), readMoviePair(motion)])
    if (photoId !== id || pair.identifier !== id || Math.abs(pair.stillTime - selected) > 0.005
      || pair.duration !== duration || Boolean(pair.audio.length) !== audio) {
      throw new Error('The pairing metadata could not be verified. The original is available to download.')
    }
    signal.throwIfAborted()

    onProgress({ phase: 5 })
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').trim() || 'Live Photo'
    return { photo, motion, name: name + ' - Live', duration: pair.duration, stillTime: pair.stillTime,
      audio }
  }

  onProgress({ phase: 0 })
  if (info.playable && (file.type === 'video/quicktime' || /\.mov$/i.test(file.name))) {
    const original = await reusableMovie(file).catch(() => undefined)
    signal.throwIfAborted()
    if (original) {
      onProgress({ phase: 2 })
      const selected = limitStill(stillTime, original.video.duration)
      const frame = await canvasJpeg(file, selected, signal).catch(() => undefined)
      signal.throwIfAborted()
      if (frame) return finalize(file, frame, selected, original.duration, Boolean(original.audio))
      onProgress({ phase: 0 })
    }
  }

  const { primaryAudio, primaryVideo, withEngine } = await import('./engine')
  return withEngine(file, signal, async (engine) => {
    const probe = await engine.inspect()
    const video = primaryVideo(probe)
    const audio = primaryAudio(probe)
    if (!video) throw new Error('The file does not contain a usable video track.')
    const sourceDuration = Number(probe.format.duration) || info.duration
    const sourceVideoDuration = Number(video.duration) || info.duration
    const sourceFrames = Number(video.nb_frames) || 0
    const tolerance = Math.max(0.05, sourceFrames ? sourceVideoDuration / sourceFrames + 0.005 : 0.1)

    onProgress({ phase: 1 })
    const blob = await engine.render(video, audio, info.playable, (seconds) =>
      onProgress({ phase: 1, seconds: Math.min(seconds, info.duration) }))
    signal.throwIfAborted()
    const rendered = await inspectQuickTime(blob)
    const renderedVideo = rendered.videos[0]
    if (!renderedVideo || Math.abs(rendered.duration - sourceDuration) > tolerance
      || (Number(video.duration) && renderedVideo.duration < sourceVideoDuration - tolerance)
      || (sourceFrames && renderedVideo.samples !== sourceFrames)) {
      throw new Error('The MOV did not preserve the full video timeline or frame count. The original is available to download.')
    }
    if (audio && (rendered.audios.length !== 1
      || (Number(audio.duration) && rendered.audios[0].duration < Number(audio.duration) - tolerance))) {
      throw new Error('The MOV did not preserve the first audio track. The original is available to download.')
    }

    onProgress({ phase: 2 })
    const selected = limitStill(stillTime, renderedVideo.duration)
    const frame = await canvasJpeg(blob, selected, signal).catch(() => {
      signal.throwIfAborted()
      // FFmpeg seeks to the next available frame. Retry just inside the last frame at the endpoint.
      const frameInterval = sourceFrames ? sourceVideoDuration / sourceFrames : 1 / 30
      return engine.extractFrame(Math.min(selected, Math.max(0, renderedVideo.duration - frameInterval)))
    })
    return finalize(blob, frame, selected, rendered.duration, Boolean(rendered.audios.length))
  })
}
