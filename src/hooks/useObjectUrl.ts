import { useEffect, useState } from 'react'

export function useObjectUrl(blob?: Blob) {
  const [entry, setEntry] = useState<{ blob: Blob; url: string }>()
  useEffect(() => {
    if (!blob) {
      setEntry(undefined)
      return
    }
    const url = URL.createObjectURL(blob)
    setEntry({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return blob && entry?.blob === blob ? entry.url : undefined
}
