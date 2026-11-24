import { useId, useRef, useState } from 'react'
import {
  BadgeCheck, CircleHelp, Clapperboard, Clock3, Download, FileVideo, Film, Fingerprint,
  Info, LoaderCircle, ShieldCheck, Sparkles, Upload, Volume2, X,
} from 'lucide-react'
import { Guide } from './components/Guide'
import { MotionPreview } from './components/MotionPreview'
import { ResultPanel } from './components/ResultPanel'
import { KeyPhotoControl, VideoSetup } from './components/VideoSetup'
import { useObjectUrl } from './hooks/useObjectUrl'
import { useStudio } from './hooks/useStudio'
import { phases } from './media/progress'
import { size, time } from './media/format'

const base = import.meta.env.BASE_URL

export default function App() {
  const studio = useStudio()
  const importInput = useRef<HTMLInputElement>(null)
  const [guide, setGuide] = useState(false)
  const [dragged, setDragged] = useState(false)
  const dragDepth = useRef(0)
  const fileId = useId()
  const url = useObjectUrl(studio.file)
  const busy = Boolean(studio.progress || studio.reading)
  const showSetup = Boolean(studio.file && studio.info && url)

  function pick() {
    if (!busy) importInput.current?.click()
  }

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="wordmark"><img src={base + 'icon.svg'} width={39} height={39} alt="" />
            <span>Live Photo <span className="wordmark-light">Studio</span></span></div>
          <button type="button" className="button button-small nav-button" onClick={() => setGuide(true)}>
            <CircleHelp size={17} /> <span>iPhone guide</span>
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="intro">
          <div>
            <h1>Live Photo <span>Studio</span></h1>
            <p>Turn your entire video into a Live Photo.</p>
          </div>
          <span className="privacy-label"><ShieldCheck size={15} /> Processed on device</span>
        </div>

        <input id={fileId} ref={importInput} type="file" accept="video/*,.mov,.mp4,.m4v,.webm,.mkv,.avi,.3gp,.qt,.mts,.m2ts,.mpg,.mpeg,.ogv"
          className="sr-only" aria-label="Choose a video file" tabIndex={-1}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (selected) void studio.select(selected)
          }} />

        {studio.error && <div role="alert" className="alert"><Info size={19} /><span>{studio.error}</span></div>}
        {studio.status && <div role="status" className="notice studio-notice"><Info size={17} />{studio.status}</div>}

        {studio.result && studio.file ? (
          <ResultPanel result={studio.result} original={studio.file} onReset={studio.clear} onGuide={() => setGuide(true)} />
        ) : (
          <div className="studio-grid">
            {showSetup && studio.file && studio.info && url ? (
              <VideoSetup file={studio.file} info={studio.info} src={url} still={studio.still}
                onReplace={pick} onClear={studio.clear} busy={busy} />
            ) : (
              <section className="panel import-panel" aria-labelledby="import-heading">
                <div className="panel-heading">
                  <div className="section-icon"><Upload size={19} /></div>
                  <h2 id="import-heading">Import a video</h2>
                  {studio.file && !busy && <button type="button" className="icon-button ml-auto"
                    aria-label="Remove video" onClick={studio.clear}><X size={18} /></button>}
                </div>
                <div className={dragged ? 'dropzone is-dragged' : 'dropzone'}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    if (busy || !event.dataTransfer.types.includes('Files')) return
                    dragDepth.current += 1
                    setDragged(true)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    dragDepth.current = Math.max(0, dragDepth.current - 1)
                    if (!dragDepth.current) setDragged(false)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    dragDepth.current = 0
                    setDragged(false)
                    const file = event.dataTransfer.files[0]
                    if (file && !busy) void studio.select(file)
                  }}>
                  <div className="drop-icon">
                    {studio.reading ? <LoaderCircle size={32} className="spinner" /> : <FileVideo size={33} strokeWidth={1.6} />}
                  </div>
                  <h3>{studio.reading ? 'Reading video…' : 'Drop a video here'}</h3>
                  <p>{studio.reading ? studio.file?.name : 'or select a video from Photos or Files'}</p>
                  {studio.reading ? <button type="button" className="button secondary" onClick={studio.cancel}>Cancel</button>
                    : <button type="button" className="button primary" onClick={pick}><Upload size={19} /> Import Video</button>}
                  <span className="formats">MP4, MOV and other video formats</span>
                </div>
                {studio.file && url && !studio.reading &&
                  <a className="text-button mt-4" href={url} download={studio.file.name}><Download size={16} /> Download original</a>}
              </section>
            )}

            {studio.info && studio.file ? (
              <section className="panel settings-panel" aria-labelledby="settings-heading">
                <div className="panel-heading">
                  <div className="section-icon"><Sparkles size={19} /></div>
                  <h2 id="settings-heading">Conversion settings</h2>
                </div>
                <KeyPhotoControl duration={studio.info.duration} still={studio.still} onChange={studio.setStill}
                  disabled={busy} />
                <div className="full-video">
                  <Film size={21} />
                  <div><strong>Use Full Video</strong><p>Keep all {time(studio.info.duration, true)} of your video.</p></div>
                  <span className="on-state"><BadgeCheck size={15} /> On</span>
                </div>
                {studio.file.size > 150 * 1024 ** 2 && (
                  <div className="notice"><Info size={18} /><span>{size(studio.file.size)} source. Large files can exceed available memory in mobile Safari.</span></div>
                )}
                {studio.progress ? (
                  <div className="progress-panel" aria-live="polite" aria-busy="true">
                    <div className="progress-heading"><LoaderCircle className="spinner" size={19} />
                      <strong>{phases[studio.progress.phase]}</strong>
                    </div>
                    {studio.progress.seconds !== undefined ? (
                      <>
                        <progress aria-label="Video timeline processed" max={studio.info.duration} value={studio.progress.seconds} />
                        <p>{time(studio.progress.seconds, true)} of {time(studio.info.duration, true)} processed</p>
                      </>
                    ) : <progress aria-label="Conversion in progress" />}
                    <button className="button secondary w-full mt-3" type="button" onClick={studio.cancel}>Cancel</button>
                  </div>
                ) : (
                  <button className="button primary w-full convert-button" type="button" onClick={() => void studio.convert()}>
                    <Sparkles size={19} /> Convert to Live Photo
                  </button>
                )}
              </section>
            ) : (
              <section className="panel preview-panel" aria-labelledby="preview-heading">
                <div className="panel-heading">
                  <div className="section-icon"><Clapperboard size={19} /></div>
                  <h2 id="preview-heading">Live Photo preview</h2>
                </div>
                <MotionPreview poster={base + 'demo.webp'} motion={base + 'demo.mp4'} example />
                <p className="panel-note">Try the example to preview the hold-to-play effect.</p>
              </section>
            )}
          </div>
        )}

        {!studio.file && (
          <div className="capabilities">
            <div><span className="capability-icon violet"><Clock3 size={19} /></span>
              <div><strong>Full video length</strong><p>Every frame stays in the MOV.</p></div></div>
            <div><span className="capability-icon blue"><Volume2 size={19} /></span>
              <div><strong>Original sound</strong><p>The first audio track is kept.</p></div></div>
            <div><span className="capability-icon violet"><Fingerprint size={19} /></span>
              <div><strong>Private by design</strong><p>Your media is never uploaded.</p></div></div>
          </div>
        )}
        <footer className="app-footer"><span>Live Photo Studio</span>
          <button type="button" onClick={() => setGuide(true)}>Add to Home Screen</button></footer>
      </main>
      <Guide open={guide} onClose={() => setGuide(false)} />
    </>
  )
}
