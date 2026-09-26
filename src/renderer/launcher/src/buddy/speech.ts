/**
 * Buddy's voice in the renderer. Asks main for the online Edge voice and
 * plays it; if that's off or unavailable (no internet, service down), uses
 * the Windows voice through speechSynthesis instead - she always hears him,
 * and never hears or sees why one voice was used over the other.
 *
 * Only one line plays at a time: a new line (or stopSpeaking) cuts off the
 * one before, and the cut-off line's promise resolves right away.
 */

let generation = 0
let audio: HTMLAudioElement | null = null
let audioUrl: string | null = null
let finishCurrent: (() => void) | null = null

function releaseAudio(): void {
  audio?.pause()
  audio = null
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = null
}

export function stopSpeaking(): void {
  generation++
  releaseAudio()
  window.speechSynthesis?.cancel()
  finishCurrent?.()
  finishCurrent = null
}

function localVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  // Windows' own natural voices first, then any US English voice.
  return (
    english.find((v) => /aria|jenny|natural/i.test(v.name)) ??
    english.find((v) => v.lang === 'en-US') ??
    english[0] ??
    null
  )
}

function speakLocally(text: string, isCurrent: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !isCurrent()) return resolve()
    const utterance = new SpeechSynthesisUtterance(text.replace(/\p{Extended_Pictographic}/gu, ''))
    const voice = localVoice()
    if (voice) utterance.voice = voice
    utterance.rate = 0.92
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    finishCurrent = resolve
    window.speechSynthesis.speak(utterance)
  })
}

function playMp3(base64: string): Promise<void> {
  return new Promise((resolve) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
    audio = new Audio(audioUrl)
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    finishCurrent = resolve
    audio.play().catch(() => resolve())
  })
}

/** Resolves when he's finished saying it (or was cut off). */
export async function speak(text: string): Promise<void> {
  stopSpeaking()
  const mine = ++generation
  const isCurrent = (): boolean => mine === generation
  let result: Awaited<ReturnType<typeof window.launcher.buddySpeak>> | null = null
  try {
    result = await window.launcher.buddySpeak(text)
  } catch {
    result = null
  }
  if (!isCurrent()) return
  if (result?.ok) {
    await playMp3(result.audioBase64)
  } else {
    await speakLocally(text, isCurrent)
  }
  if (isCurrent()) {
    releaseAudio()
    finishCurrent = null
  }
}
