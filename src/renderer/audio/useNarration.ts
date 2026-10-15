import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_NARRATION_MS } from '@shared/media/narration'
import { holdAudio } from './audioBridge'

/** One managed voice in either window. Paging, locking and late play promises all end its hold. */
export function useNarration(url: string | undefined): {
  playing: boolean
  error: boolean
  play: () => Promise<void>
  stop: () => void
} {
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  const active = useRef<{ stop: () => void } | null>(null)
  const stop = useCallback(() => active.current?.stop(), [])
  const play = useCallback(async () => {
    stop()
    if (!url) return
    setError(false)
    const audio = new Audio(url)
    audio.dataset.narrationPlayer = ''
    audio.hidden = true
    document.body.appendChild(audio)
    let ended = false
    const resources: { release?: () => void; timer?: ReturnType<typeof setTimeout> } = {}
    const session = {
      stop: () => {
        if (ended) return
        ended = true
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        audio.remove()
        clearTimeout(resources.timer)
        resources.release?.()
        if (active.current === session) {
          active.current = null
          setPlaying(false)
        }
      }
    }
    active.current = session
    // Reserve before awaiting IPC, so a second tap or leaving can cancel this attempt.
    setPlaying(true)
    audio.onended = session.stop
    audio.onerror = () => {
      if (!ended) setError(true)
      session.stop()
    }
    const lease = await holdAudio('narration', session.stop)
    resources.release = lease.release
    if (ended || !lease.allowed) {
      session.stop()
      lease.release()
      return
    }
    resources.timer = setTimeout(session.stop, MAX_NARRATION_MS)
    try {
      await audio.play()
      if (ended) audio.pause()
    } catch {
      if (!ended) setError(true)
      session.stop()
    }
  }, [url, stop])
  useEffect(() => {
    setError(false)
    return stop
  }, [url, stop])
  return { playing, error, play, stop }
}
