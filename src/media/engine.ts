import { FFmpeg } from '@ffmpeg/ffmpeg'
import type { FFFSType, LogEvent } from '@ffmpeg/ffmpeg'
import core from '@ffmpeg/core?url&no-inline'
import wasm from '@ffmpeg/core/wasm?url&no-inline'

export type Stream = {
  codec_type: string
  codec_name?: string
  duration?: string
  nb_frames?: string
  width?: number
  height?: number
  channels?: number
  disposition?: { attached_pic?: number }
  side_data_list?: { rotation?: number }[]
  tags?: { rotate?: string }
}

export type Probe = { format: { duration?: string }; streams: Stream[] }
export const primaryVideo = (probe: Probe) =>
  probe.streams.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic)
export const primaryAudio = (probe: Probe) => probe.streams.find((stream) => stream.codec_type === 'audio')

const input = '/input/source'
const idleLimit = 120_000
const wasmLimit = 2_147_483_648

export function checkSize(file: Blob) {
  if (!file.size) throw new Error('This video is empty. Choose another file.')
  if (file.size >= wasmLimit) {
    throw new Error('This file exceeds the 2 GB limit of the browser’s video engine. You can still download the original.')
  }
}

class Engine {
  readonly ffmpeg = new FFmpeg()
  constructor(private readonly signal: AbortSignal) {}

  async open(file: Blob) {
    await this.watch(
      () => this.ffmpeg.load({ coreURL: new URL(core, location.href).href, wasmURL: new URL(wasm, location.href).href }),
      'The local video engine could not start. Check your connection, then reload the studio.',
    )
    await this.ffmpeg.createDir('/input')
    const mounted = await this.ffmpeg.mount('WORKERFS' as FFFSType, { blobs: [{ name: 'source', data: file }] }, '/input')
    if (!mounted) throw new Error('This browser could not open the video in the local media worker.')
  }

  async inspect() {
    await this.watch(() => this.ffmpeg.ffprobe([
      '-v', 'error', '-show_format', '-show_streams', '-of', 'json', '-o', 'probe.json', input,
    ]), 'Reading the media tracks timed out. Try saving the source as MP4 or MOV.')
    try {
      // The 0.12.10 core can report -1 even after writing a complete probe.
      const probe: Probe = JSON.parse(String(await this.ffmpeg.readFile('probe.json', 'utf8')))
      if (Array.isArray(probe.streams) && probe.streams.length && probe.format) return probe
    } catch (error) {
      this.signal.throwIfAborted()
      throw new Error('The media engine could not read this video. Try an intact MP4 or MOV file.', { cause: error })
    }
    throw new Error('The media engine could not read this video. Try an intact MP4 or MOV file.')
  }

  async render(video: Stream, audio: Stream | undefined, playable: boolean, onTime: (seconds: number) => void) {
    const copyVideo = playable && (video.codec_name === 'h264' || video.codec_name === 'hevc')
    const copyAudio = audio?.codec_name === 'aac'
    const args = [
      '-i', input, '-map', '0:V:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_metadata:s', '-1',
      '-map_chapters', '-1',
      ...(copyVideo ? ['-c:v', 'copy'] : [
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-fps_mode', 'passthrough',
      ]),
      ...(video.codec_name === 'hevc' && copyVideo ? ['-tag:v', 'hvc1'] : []),
      ...(copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
      '-progress', 'pipe:1', '-f', 'mov', 'video.mov',
    ]
    let lastError = ''
    const onLog = ({ message }: LogEvent) => {
      const match = message.match(/out_time_us=(\d+)/)
      if (match) onTime(Number(match[1]) / 1_000_000)
      if (/error|memory|invalid|failed/i.test(message)) lastError = message
    }
    this.ffmpeg.on('log', onLog)
    try {
      const status = await this.watch(() => this.ffmpeg.exec(args),
        'The video engine stopped responding. Try the same file on a desktop browser with more available memory.')
      if (status !== 0) {
        if (/memory|allocation|array buffer/i.test(lastError)) throw new Error(lastError)
        throw new Error('The media engine could not write a compatible MOV. Download the original or try a different video.')
      }
    } finally {
      this.ffmpeg.off('log', onLog)
    }
    const blob = await this.blob('video.mov', 'video/quicktime')
    await this.ffmpeg.deleteFile('video.mov')
    return blob
  }

  async extractFrame(seconds: number) {
    const status = await this.watch(() => this.ffmpeg.exec([
      '-ss', String(seconds), '-i', input, '-map', '0:V:0', '-frames:v', '1',
      '-q:v', '2', '-update', '1', 'frame.jpg',
    ]), 'The video engine could not reach the selected key frame.')
    if (status !== 0) throw new Error('The media engine could not extract the selected key frame.')
    return this.blob('frame.jpg', 'image/jpeg')
  }

  private async blob(path: string, type: string) {
    const data = await this.ffmpeg.readFile(path)
    if (typeof data === 'string' || !data.byteLength) throw new Error('The media output is empty.')
    // ffmpeg.wasm transfers an independent ArrayBuffer from the worker.
    return new Blob([data as Uint8Array<ArrayBuffer>], { type })
  }

  private async watch<T>(action: () => Promise<T>, timeoutMessage: string) {
    this.signal.throwIfAborted()
    let timeout = 0
    let timedOut = false
    const activity = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => {
        timedOut = true
        this.ffmpeg.terminate()
      }, idleLimit)
    }
    this.ffmpeg.on('log', activity)
    this.ffmpeg.on('progress', activity)
    activity()
    try {
      return await action()
    } catch (error) {
      this.signal.throwIfAborted()
      if (timedOut) throw new Error(timeoutMessage, { cause: error })
      throw error
    } finally {
      window.clearTimeout(timeout)
      this.ffmpeg.off('log', activity)
      this.ffmpeg.off('progress', activity)
    }
  }
}

export async function withEngine<T>(file: Blob, signal: AbortSignal, work: (engine: Engine) => Promise<T>) {
  checkSize(file)
  signal.throwIfAborted()
  const engine = new Engine(signal)
  const terminate = () => engine.ffmpeg.terminate()
  signal.addEventListener('abort', terminate, { once: true })
  try {
    await engine.open(file)
    return await work(engine)
  } finally {
    signal.removeEventListener('abort', terminate)
    terminate()
  }
}
