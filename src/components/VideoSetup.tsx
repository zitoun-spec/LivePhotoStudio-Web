import { useEffect, useRef } from 'react'
import { Clapperboard, Download, FileVideo, Music2, ScanLine, Timer, X } from 'lucide-react'
import { aspectRatio, size, time } from '../media/format'
import { limitStill } from '../media/video'
import type { VideoInfo } from '../media/video'

type Props = {
  file: File
  info: VideoInfo
  src: string
  still: number
  onReplace: () => void
  onClear: () => void
  busy: boolean
}

export function VideoSetup({ file, info, src, still, onReplace, onClear, busy }: Props) {
  const preview = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = preview.current
    if (video?.readyState) {
      video.pause()
      video.currentTime = limitStill(still, info.duration)
    }
  }, [still, info.duration])

  return (
    <section className="panel work-panel" aria-labelledby="source-heading">
      <div className="panel-heading">
        <div className="section-icon"><Clapperboard size={19} /></div>
        <h2 id="source-heading">Your video</h2>
        <button type="button" className="icon-button ml-auto" aria-label="Remove video" onClick={onClear} disabled={busy}>
          <X size={18} />
        </button>
      </div>
      {info.playable ? (
        <video ref={preview} src={src} className="source-video" controls playsInline preload="metadata"
          onLoadedMetadata={() => {
            if (preview.current) preview.current.currentTime = limitStill(still, info.duration)
          }} />
      ) : <div className="media-unavailable"><FileVideo size={28} /><p>Preview requires an encoding this browser can play. You can still convert this file.</p></div>}
      <div className="source-file">
        <div className="min-w-0"><strong>{file.name}</strong><span>{size(file.size)}</span></div>
        <button type="button" className="button button-small secondary" onClick={onReplace} disabled={busy}>Replace</button>
      </div>
      <dl className="media-facts">
        <div><dt><Timer size={16} /> Duration</dt><dd>{time(info.duration, true)}</dd></div>
        <div><dt><ScanLine size={16} /> Resolution</dt><dd>{info.width} × {info.height} <span>· {aspectRatio(info.width, info.height)}</span></dd></div>
        <div><dt><Music2 size={16} /> Audio</dt><dd>{info.audio ? 'Available' : 'No audio'}</dd></div>
      </dl>
      <a className="text-button" href={src} download={file.name}><Download size={16} /> Download original</a>
    </section>
  )
}

export function KeyPhotoControl({ duration, still, onChange, disabled }: {
  duration: number; still: number; onChange: (time: number) => void; disabled: boolean
}) {
  return (
    <div className="key-control">
      <div className="flex justify-between gap-3">
        <label htmlFor="key-time">Key photo</label>
        <output htmlFor="key-time">{time(still, true)}</output>
      </div>
      <input id="key-time" type="range" min={0} max={duration} step="any" value={still}
        disabled={disabled} aria-valuetext={time(still, true)}
        onChange={(event) => onChange(limitStill(event.currentTarget.valueAsNumber, duration))} />
      <div className="flex justify-between range-labels"><span>0:00</span><span>{time(duration, true)}</span></div>
      <p>Choose the frame that will appear as your still photo.</p>
    </div>
  )
}
