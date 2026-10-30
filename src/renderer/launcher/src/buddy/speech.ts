/**
 * Buddy's voice in the renderer. Asks main for the line as audio (the
 * online Edge voice, or the voice on this computer) and plays it; if neither
 * is available, uses the Windows voice through speechSynthesis instead - she
 * always hears him, and never hears or sees why one voice was used.
 *
 * A long line is said in pieces (speechChunks), each made while the one
 * before plays, so a long reply doesn't start with a long silence.
 *
 * Only one line plays at a time: a new line (or stopSpeaking) cuts off the
 * one before, and the cut-off line's promise resolves right away.
 */

import { speechChunks } from '@shared/buddy/speechChunks'
import { holdAudio } from '../../../audio/audioBridge'

let generation = 0
let releaseHold: (() => void) | null = null
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
  releaseHold?.()
  releaseHold = null
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

function playAudio(base64: string, mime: string): Promise<void> {
  return new Promise((resolve) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    audioUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
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
  const hold = await holdAudio('buddyVoice', () => {
    if (isCurrent()) stopSpeaking()
  })
  if (!isCurrent() || !hold.allowed) {
    hold.release()
    return
  }
  releaseHold = hold.release
  const fetchAudio = (
    piece: string
  ): Promise<Awaited<ReturnType<typeof window.launcher.buddySpeak>> | null> =>
    window.launcher.buddySpeak(piece).catch(() => null)
  try {
    const pieces = speechChunks(text)
    let next = pieces.length ? fetchAudio(pieces[0]!) : null
    for (let i = 0; i < pieces.length; i++) {
      const result = await next
      if (!isCurrent()) return
      // The next piece is made while this one plays.
      next = i + 1 < pieces.length ? fetchAudio(pieces[i + 1]!) : null
      if (result?.ok) await playAudio(result.audioBase64, result.mime)
      else await speakLocally(pieces[i]!, isCurrent)
      if (!isCurrent()) return
      releaseAudio()
    }
  } finally {
    // Even a malformed audio result must not leave an invisible hold behind.
    hold.release()
    if (isCurrent()) {
      releaseHold = null
      releaseAudio()
      finishCurrent = null
    }
  }
}
