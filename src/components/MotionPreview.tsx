import { useRef, useState } from 'react'
import { CircleDot, Hand, Pause, Play } from 'lucide-react'

type Props = { poster: string; motion: string; example?: boolean }

export function MotionPreview({ poster, motion, example = false }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)

  function stop() {
    video.current?.pause()
    setPlaying(false)
  }

  function play(muted: boolean) {
    const element = video.current
    if (!element) return
    element.muted = muted
    element.currentTime = 0
    setPlaying(true)
    setFailed(false)
    void element.play().catch((error: DOMException) => {
      if (error.name === 'AbortError') return
      setPlaying(false)
      setFailed(true)
    })
  }

  return (
    <>
      <div className={example ? 'motion-stage example-stage' : 'motion-stage'}
        onContextMenu={(event) => event.preventDefault()}>
        <img src={poster} alt={example ? 'Alpine lake at twilight' : 'Selected key photo'} draggable={false}
          className={playing ? 'motion-poster hidden-poster' : 'motion-poster'} />
        <video ref={video} src={motion} playsInline preload={example ? 'none' : 'metadata'}
          className={playing ? 'motion-video is-playing' : 'motion-video'}
          onEnded={stop} onError={() => { stop(); setFailed(true) }} aria-hidden="true" />
        <div className="preview-shade" />
        <span className="live-label"><CircleDot size={14} /> {example ? 'EXAMPLE' : 'SIMULATION'}</span>
        <div className="hold-surface" aria-hidden="true"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            // Safari permits muted playback before a touch has activated the page.
            play(event.pointerType === 'touch' && !navigator.userActivation?.isActive)
          }}
          onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} />
        <span className="hold-label"><Hand size={15} /> Hold to play</span>
        <button type="button" className="preview-play" onClick={() => playing ? stop() : play(false)}
          aria-label={playing ? 'Stop preview' : 'Play full preview'}>
          {playing ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}
        </button>
      </div>
      {failed && <p className="notice" role="status">This browser could not play the preview. The download is still available.</p>}
    </>
  )
}
