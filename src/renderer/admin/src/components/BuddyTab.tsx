import { useEffect, useRef, useState } from 'react'
import { holdAudio } from '../../../audio/audioBridge'
import { useConfigStore } from '../state/useConfigStore'
import { BuddyCommands } from './BuddyCommands'
import { BuddyFacts } from './BuddyFacts'
import { ChatGptConnection } from './ChatGptConnection'

// Edge neural voices. Aria first: it's the voice the old app used, so it's the one she knows.
const VOICES: { id: string; label: string }[] = [
  { id: 'en-US-AriaNeural', label: "Aria - warm, clear (the old launcher's voice)" },
  { id: 'en-US-JennyNeural', label: 'Jenny - friendly, soft' },
  { id: 'en-US-EmmaNeural', label: 'Emma - cheerful' },
  { id: 'en-US-AndrewNeural', label: 'Andrew - warm, male' },
  { id: 'en-US-GuyNeural', label: 'Guy - calm, male' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia - British' }
]

const PREVIEW_LINE = "Hi there! It's so nice to see you today."

export function BuddyTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [voiceStatus, setVoiceStatus] = useState('')
  const previewGeneration = useRef(0)
  const stopPreview = useRef<() => void>(() => {})
  useEffect(
    () => () => {
      previewGeneration.current++
      stopPreview.current()
    },
    []
  )

  if (!config) return null
  const { buddy } = config
  const voices = VOICES.some((v) => v.id === buddy.ttsVoice)
    ? VOICES
    : [...VOICES, { id: buddy.ttsVoice, label: buddy.ttsVoice }]
  const saveBuddy = (patch: Partial<typeof buddy>): void =>
    void save({ buddy: { ...buddy, ...patch } })

  const previewVoice = async (): Promise<void> => {
    stopPreview.current()
    const generation = ++previewGeneration.current
    setVoiceStatus('Playing…')
    const result = await window.admin.previewVoice(PREVIEW_LINE, buddy.ttsVoice)
    if (generation !== previewGeneration.current) return
    if (!result.ok) {
      setVoiceStatus(
        result.reason === 'disabled'
          ? 'The online voice is switched off, so Buddy uses the Windows voice instead.'
          : "Couldn't reach the online voice right now (no internet?). Buddy falls back to the Windows voice."
      )
      return
    }
    const hold = await holdAudio('buddyVoice', () => {
      if (generation === previewGeneration.current) stopPreview.current()
    })
    if (!hold.allowed || generation !== previewGeneration.current) {
      hold.release()
      if (generation === previewGeneration.current) setVoiceStatus('')
      return
    }
    const bytes = Uint8Array.from(atob(result.audioBase64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: result.mime }))
    const audio = new Audio(url)
    let ended = false
    const finish = (): void => {
      if (ended) return
      ended = true
      audio.pause()
      URL.revokeObjectURL(url)
      hold.release()
      if (generation === previewGeneration.current) setVoiceStatus('')
    }
    stopPreview.current = finish
    audio.onended = finish
    audio.onerror = finish
    await audio.play().catch(finish)
  }

  return (
    <div>
      <h2>Buddy (AI companion)</h2>
      <label>
        <input
          type="checkbox"
          checked={buddy.chatEnabled}
          onChange={(e) => saveBuddy({ chatEnabled: e.target.checked })}
        />
        Allow Buddy chat
      </label>
      <p>
        Turn this off if chatting confuses or upsets her. Buddy stays on Home with friendly tap
        reactions. Changes take effect right away, including closing an open chat.
      </p>
      <ChatGptConnection />
      <h3>On the Home screen</h3>
      <label>
        When she taps Buddy{' '}
        <select
          value={buddy.tapAction}
          onChange={(e) => saveBuddy({ tapAction: e.target.value as typeof buddy.tapAction })}
        >
          <option value="reaction">
            {buddy.chatEnabled
              ? "A friendly reaction, then a Let's chat button"
              : 'A friendly reaction'}
          </option>
          <option value="chat">
            {buddy.chatEnabled ? 'Open chat right away' : 'A friendly reaction (chat is off)'}
          </option>
        </select>
      </label>
      <br />
      <label>
        How Buddy moves{' '}
        <select
          value={buddy.motion}
          onChange={(e) => saveBuddy({ motion: e.target.value as typeof buddy.motion })}
        >
          <option value="still">Stays put (with his usual gestures)</option>
          <option value="roam">Walks now and then</option>
          <option value="reduced">Reduced motion (fewer, gentler gestures)</option>
        </select>
      </label>
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        Choose by watching what she enjoys and what distracts her. Reduced motion keeps him in place
        with no fidgeting on his own. Changes take effect right away. He never walks over the tiles
        or wanders on his own between 9 PM and 6 AM. You can still ask him to walk or play any
        gesture yourself.
      </p>
      <h3>Voice</h3>
      <label>
        <input
          type="checkbox"
          checked={buddy.voiceEnabled}
          onChange={(e) => saveBuddy({ voiceEnabled: e.target.checked })}
        />
        Read Buddy&apos;s replies out loud
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={buddy.cloudTtsEnabled}
          onChange={(e) => saveBuddy({ cloudTtsEnabled: e.target.checked })}
        />
        Use the natural online voice (needs internet; otherwise the Windows voice is used)
      </label>
      <br />
      <select value={buddy.ttsVoice} onChange={(e) => saveBuddy({ ttsVoice: e.target.value })}>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>{' '}
      <button onClick={() => void previewVoice()}>Try this voice</button>
      {voiceStatus && <p>{voiceStatus}</p>}
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        She can also talk to Buddy instead of typing (the Talk button in the chat), using this
        computer&apos;s microphone. The button only appears when a microphone is found.
      </p>
      <h3>Chattiness</h3>
      <p>
        Whether Buddy ever speaks up on his own, in a speech bubble (never out loud). Off means
        Buddy only talks when tapped.
      </p>
      <select
        value={buddy.chattiness}
        onChange={(e) =>
          save({ buddy: { ...buddy, chattiness: e.target.value as typeof buddy.chattiness } })
        }
      >
        <option value="off">Off (recommended)</option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
      </select>
      <BuddyFacts />
      <BuddyCommands />
    </div>
  )
}
