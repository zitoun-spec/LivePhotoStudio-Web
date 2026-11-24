import { useEffect, useRef } from 'react'
import { CircleHelp, X } from 'lucide-react'

export function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (open && !element?.open) element?.showModal()
    if (!open && element?.open) element.close()
  }, [open])

  return (
    <dialog ref={dialog} className="guide" onClose={onClose} aria-labelledby="guide-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="guide-content">
        <header className="flex items-center justify-between gap-4">
          <h2 id="guide-title" className="flex items-center gap-3"><CircleHelp size={22} /> iPhone guide</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close guide"><X size={20} /></button>
        </header>
        <section>
          <h3>Import into Apple Photos</h3>
          <p>Safari can download the JPEG and MOV. To add them as one Live Photo, an iPhone app must import both together as a photo and paired video through Apple’s PhotoKit.</p>
          <ol>
            <li>Download the ZIP and tap it in Files to extract it. Keep both filenames together.</li>
            <li>In an app that explicitly supports importing a Live Photo pair, select both files in the same import. HashPhotos documents file import and pairing support. This studio’s output has yet to be tested with it.</li>
            <li>Open Photos and check for a <strong>LIVE</strong> badge, then hold to check motion and sound. Apple documents the short duration of camera captures. Acceptance and full-length playback of longer imports need an iPhone test.</li>
          </ol>
          <div className="guide-links">
            <a href="https://www.hashphotos.app/guides/feature/transfer/import/files/" target="_blank" rel="noreferrer">HashPhotos file import</a>
            <a href="https://developer.apple.com/documentation/avfoundation/capturing-and-saving-live-photos" target="_blank" rel="noreferrer">Apple PhotoKit</a>
          </div>
        </section>
        <section>
          <h3>Add to Home Screen</h3>
          <p>In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. The studio can open offline after a visit. Offline conversion depends on the browser keeping the media engine in its cache.</p>
        </section>
      </div>
    </dialog>
  )
}
