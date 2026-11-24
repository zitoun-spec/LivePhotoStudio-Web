import { useEffect, useRef, useState } from 'react'
import { Archive, BadgeCheck, Clapperboard, Download, Image, ListRestart, Music2, Share, Timer } from 'lucide-react'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { MotionPreview } from './MotionPreview'
import { size, time } from '../media/format'
import type { Result } from '../media/convert'

type Props = { result: Result; original: File; onReset: () => void; onGuide: () => void }

export function ResultPanel({ result, original, onReset, onGuide }: Props) {
  const [zip, setZip] = useState<Blob>()
  const [zipping, setZipping] = useState(false)
  const [message, setMessage] = useState('')
  const zipOperation = useRef<AbortController>(undefined)
  const photo = useObjectUrl(result.photo)
  const motion = useObjectUrl(result.motion)
  const source = useObjectUrl(original)
  const zipUrl = useObjectUrl(zip)

  useEffect(() => () => zipOperation.current?.abort(), [])

  const canShare = Boolean(navigator.canShare && navigator.canShare({
    files: [new File([result.photo], result.name + '.jpg', { type: 'image/jpeg' }),
      new File([result.motion], result.name + '.mov', { type: 'video/quicktime' })],
  }))

  async function prepareZip() {
    const op = new AbortController()
    zipOperation.current = op
    setZipping(true)
    setMessage('')
    try {
      const { zipPair } = await import('../media/downloads')
      const archive = await zipPair(result, op.signal)
      if (!op.signal.aborted) {
        setZip(archive)
        setMessage('ZIP ready to download.')
      }
    } catch {
      if (!op.signal.aborted) setMessage('The ZIP could not be prepared. Download the two files individually.')
    } finally {
      if (!op.signal.aborted) setZipping(false)
    }
  }

  function share() {
    const files = [
      new File([result.photo], result.name + '.jpg', { type: 'image/jpeg' }),
      new File([result.motion], result.name + '.mov', { type: 'video/quicktime' }),
    ]
    void navigator.share({ files }).catch((error: DOMException) => {
      if (error.name !== 'AbortError') setMessage('Sharing is unavailable. Download the files to continue.')
    })
  }

  return (
    <div className="studio-grid">
      <section className="panel" aria-labelledby="result-preview">
        <div className="panel-heading">
          <div className="section-icon"><Clapperboard size={19} /></div>
          <h2 id="result-preview">Live Photo preview</h2>
        </div>
        {photo && motion && <MotionPreview poster={photo} motion={motion} />}
        <dl className="media-facts result-facts">
          <div><dt><Timer size={16} /> Full duration</dt><dd>{time(result.duration, true)}</dd></div>
          <div><dt><Image size={16} /> Key photo</dt><dd>{time(result.stillTime, true)}</dd></div>
          <div><dt><Music2 size={16} /> Audio</dt><dd>{result.audio ? 'First track included' : 'No audio'}</dd></div>
        </dl>
        <p className="panel-note">Browser preview simulation. {result.audio && 'Tap play for sound. '}Apple Photos playback depends on iOS.</p>
      </section>

      <section className="panel export-panel" aria-labelledby="download-heading">
        <div className="panel-heading">
          <div className="section-icon"><Download size={19} /></div>
          <h2 id="download-heading">Download Live Photo pair</h2>
        </div>
        <div className="verified"><BadgeCheck size={20} /><div><strong>File pair verified</strong>
          <p>Matching Apple IDs, key photo timing and full video duration. Apple Photos import awaits an iPhone test.</p></div>
        </div>
        <div className="download-list">
          <a href={photo} className="download-row" download={result.name + '.jpg'}>
            <Image size={19} /><span>Key photo <small>JPEG · {size(result.photo.size)}</small></span><Download size={17} />
          </a>
          <a href={motion} className="download-row" download={result.name + '.mov'}>
            <Clapperboard size={19} /><span>Full video <small>MOV · {size(result.motion.size)}</small></span><Download size={17} />
          </a>
          <a href={source} className="download-row" download={original.name}>
            <ListRestart size={19} /><span>Original video <small>{size(original.size)}</small></span><Download size={17} />
          </a>
        </div>
        {zipUrl ? (
          <a className="button primary w-full" download={result.name + '.zip'} href={zipUrl}><Download size={19} /> Download ZIP</a>
        ) : (
          <button className="button primary w-full" type="button" onClick={() => void prepareZip()} disabled={zipping}>
            <Archive size={19} /> {zipping ? 'Preparing ZIP…' : 'Prepare ZIP'}
          </button>
        )}
        <p className="panel-note" role="status">{message}</p>
        <div className="result-actions">
          <button className="text-button" type="button" onClick={onGuide}>iPhone import guide</button>
          {canShare && <button className="text-button" type="button" onClick={share}><Share size={16} /> Share files</button>}
        </div>
        <button className="button secondary w-full mt-4" type="button" onClick={onReset}>Convert Another Video</button>
      </section>
    </div>
  )
}
