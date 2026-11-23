import { useEffect, useRef, useState } from 'react'
import type { Result } from '../media/convert'
import type { Progress } from '../media/progress'
import { initialStill, readVideoInfo, validateSelection } from '../media/video'
import type { VideoInfo } from '../media/video'

function describeError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value)
  if (/out of memory|memory access|allocation|array buffer|arraybuffer|runtimeerror|cannot enlarge/i.test(message)) {
    return 'The browser ran out of memory. Download the original or try it in a desktop browser with more available memory.'
  }
  if (/failed to fetch|loading dynamically imported|import scripts/i.test(message)) {
    return 'The local media engine could not load. Check your connection, then reload the studio.'
  }
  return message
}

export function useStudio() {
  const [file, setFile] = useState<File>()
  const [info, setInfo] = useState<VideoInfo>()
  const [still, setStill] = useState(0)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState<Progress>()
  const [result, setResult] = useState<Result>()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const operation = useRef<AbortController>(undefined)

  useEffect(() => () => operation.current?.abort(), [])

  function start() {
    operation.current?.abort()
    const controller = new AbortController()
    operation.current = controller
    return controller
  }

  function clear() {
    operation.current?.abort()
    setFile(undefined)
    setInfo(undefined)
    setStill(0)
    setReading(false)
    setProgress(undefined)
    setResult(undefined)
    setError('')
    setStatus('')
  }

  async function select(selected: File) {
    try {
      validateSelection(selected)
    } catch (reason) {
      setError(describeError(reason))
      return
    }
    const { signal } = start()
    setFile(selected)
    setInfo(undefined)
    setResult(undefined)
    setProgress(undefined)
    setError('')
    setStatus('')
    setReading(true)
    try {
      const details = await readVideoInfo(selected, signal)
      if (signal.aborted) return
      setInfo(details)
      setStill(initialStill(details.duration))
    } catch (reason) {
      if (!signal.aborted) setError(describeError(reason))
    } finally {
      if (!signal.aborted) setReading(false)
    }
  }

  function cancel() {
    operation.current?.abort()
    setProgress(undefined)
    setReading(false)
    setStatus('Processing canceled. Your original video is available below.')
  }

  async function convert() {
    if (!file || !info || progress) return
    const { signal } = start()
    setError('')
    setStatus('')
    setProgress({ phase: 0 })
    try {
      const { convertFullVideo } = await import('../media/convert')
      signal.throwIfAborted()
      const output = await convertFullVideo(file, info, still, signal, (next) => {
        if (!signal.aborted) setProgress(next)
      })
      if (!signal.aborted) setResult(output)
    } catch (reason) {
      if (!signal.aborted) setError(describeError(reason))
    } finally {
      if (!signal.aborted) setProgress(undefined)
    }
  }

  return { file, info, still, setStill, reading, progress, result, error, status, clear, select, cancel, convert }
}
