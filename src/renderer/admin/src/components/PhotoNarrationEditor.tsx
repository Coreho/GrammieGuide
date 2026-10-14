import { useEffect, useRef, useState } from 'react'
import type { Photo } from '@shared/media/photoTypes'
import { MAX_NARRATION_BYTES, MAX_NARRATION_MS } from '@shared/media/narration'
import { holdAudio } from '../../../audio/audioBridge'
import { useNarration } from '../../../audio/useNarration'

export function PhotoNarrationEditor({
  photo,
  disabled,
  onChanged,
  onRecording
}: {
  photo: Photo
  disabled: boolean
  onChanged: (narration: Photo['narration'] | null) => void
  onRecording: (active: boolean) => void
}) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const capture = useRef<{ stop: () => void; cancel: () => void } | null>(null)
  const mounted = useRef(false)
  const playback = useNarration(photo.narration?.url)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      capture.current?.cancel()
    }
  }, [])

  async function change(work: () => Promise<Photo['narration'] | null>): Promise<void> {
    playback.stop()
    setBusy(true)
    setError('')
    setStatus('')
    onRecording(true)
    try {
      const result = await work()
      if (mounted.current) {
        onChanged(result)
        setStatus('Story saved.')
      }
    } catch {
      if (mounted.current)
        setError(
          'Could not save the story. Use readable audio under five minutes and 20 MB, then try again.'
        )
    } finally {
      if (mounted.current) {
        setBusy(false)
        onRecording(false)
      }
    }
  }

  async function record(): Promise<void> {
    playback.stop()
    setBusy(true)
    setError('')
    setStatus('Getting the microphone ready…')
    onRecording(true)
    let canceled = false
    let stream: MediaStream | undefined
    let recorder: MediaRecorder | undefined
    let release: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const clean = (): void => {
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
      release?.()
      if (capture.current === session) capture.current = null
      if (mounted.current) {
        setRecording(false)
        setBusy(false)
        onRecording(false)
      }
    }
    const session = {
      stop: () => {
        if (recorder?.state === 'recording') recorder.stop()
      },
      cancel: () => {
        canceled = true
        session.stop()
        clean()
      }
    }
    capture.current = session
    try {
      const lease = await holdAudio('listening', session.cancel)
      release = lease.release
      if (canceled || !lease.allowed || !mounted.current) {
        clean()
        return
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (canceled || !mounted.current) {
        clean()
        return
      }
      recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 64_000
      })
      const chunks: Blob[] = []
      let size = 0
      recorder.ondataavailable = (event) => {
        size += event.data.size
        if (size > MAX_NARRATION_BYTES) {
          session.cancel()
          if (mounted.current) {
            setStatus('')
            setError('The recording is too large. Please record a shorter story.')
          }
        } else chunks.push(event.data)
      }
      recorder.onerror = () => {
        session.cancel()
        if (mounted.current) {
          setBusy(false)
          setError('The recording stopped. Please try again.')
        }
      }
      recorder.onstop = () => {
        clean()
        if (canceled || !mounted.current) return
        const blob = new Blob(chunks, { type: 'audio/webm' })
        void change(async () =>
          window.admin.recordNarration({
            id: photo.id,
            bytes: new Uint8Array(await blob.arrayBuffer())
          })
        )
      }
      recorder.start(1000)
      setRecording(true)
      setBusy(false)
      setStatus('Recording… Stop when you have finished. Maximum five minutes.')
      timer = setTimeout(session.stop, MAX_NARRATION_MS)
    } catch {
      clean()
      if (mounted.current) {
        setBusy(false)
        setError(
          'The microphone is unavailable. Check Windows microphone access or attach an audio file.'
        )
      }
    }
  }

  return (
    <section className="photo-narration" aria-label="Recorded story">
      <h3>Recorded story</h3>
      <p>Add a familiar voice. Recording stops when you leave this tab or lock admin.</p>
      <div className="photo-actions">
        {recording ? (
          <button
            onClick={() => {
              setBusy(true)
              capture.current?.stop()
            }}
          >
            Stop recording
          </button>
        ) : (
          <button disabled={disabled || busy} onClick={() => void record()}>
            {photo.narration ? 'Re-record story' : 'Record story'}
          </button>
        )}
        <button
          disabled={disabled || busy || recording}
          onClick={() => void change(() => window.admin.attachNarration(photo.id))}
        >
          Attach audio file…
        </button>
        {photo.narration && (
          <>
            <button
              disabled={disabled || busy || recording}
              onClick={() => (playback.playing ? playback.stop() : void playback.play())}
            >
              {playback.playing ? 'Stop preview' : 'Play story'}
            </button>
            <button
              disabled={disabled || busy || recording}
              onClick={() => {
                if (window.confirm('Remove this recorded story? The photo is kept.'))
                  void change(() => window.admin.removeNarration(photo.id))
              }}
            >
              Delete story
            </button>
          </>
        )}
      </div>
      {photo.narration && (
        <label className="photo-visibility">
          <input
            type="checkbox"
            checked={photo.narration.autoPlay}
            disabled={disabled || busy || recording}
            onChange={(event) =>
              void change(() => window.admin.setNarrationAutoPlay(photo.id, event.target.checked))
            }
          />
          Play story automatically when this photo opens
        </label>
      )}
      <p role="status">{status}</p>
      {(error || playback.error) && (
        <p role="alert">
          {error || 'This story could not be played. Try attaching another audio file.'}
        </p>
      )}
    </section>
  )
}
