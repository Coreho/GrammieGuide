import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  isIdleDimBlocked,
  shouldDimHome,
  type IdleDimBlockers,
  type IdleDimSettings
} from '@shared/idleDim'
import { audioSnapshot, subscribeAudio } from '../../../audio/audioBridge'

const TICK_MS = 1_000
const WAKE_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const
/** Stopping her music is never a wake-up tap: Stop works on the first touch, dimmed or not. */
const PASS_THROUGH = '[data-music-stop]'

/** Whether the audio coordinator holds sound for something in use (a voice, listening, narration, a chat). */
export function useAudioHold(): boolean {
  return useSyncExternalStore(subscribeAudio, () => audioSnapshot().decision.hasHold)
}

/**
 * Optional gentle dimming of Home (TASK-53). The first genuine tap, key or
 * scroll while dimmed only brightens the screen: it is swallowed before Home
 * sees it, so it can't open a tile, start a chat or count as a confused tap.
 * State lives in memory, so a restart or Home recovery always starts bright.
 */
export function useIdleDim(
  settings: IdleDimSettings | undefined,
  blockers: IdleDimBlockers
): boolean {
  const [dimmed, setDimmed] = useState(false)
  const lastActivity = useRef(Date.now())
  // Read by window listeners registered once, so they never see stale values.
  const live = useRef({ dimmed: false, settings, blockers })
  const enabled = Boolean(settings?.enabled)
  const blocked = isIdleDimBlocked(blockers)

  useEffect(() => {
    live.current.settings = settings
    live.current.blockers = blockers
  })

  useEffect(() => {
    let swallowClick = false
    let swallowKeyUp: string | null = null
    let clickTimer: ReturnType<typeof setTimeout> | undefined
    const swallow = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }
    const onInput = (event: Event): void => {
      lastActivity.current = Date.now()
      if (!live.current.dimmed) return
      live.current.dimmed = false
      setDimmed(false)
      if ((event.target as Element | null)?.closest?.(PASS_THROUGH)) return
      swallow(event)
      // The press is gone; its click (or a key's keyup activation) must follow it.
      if (event.type === 'keydown') swallowKeyUp = (event as KeyboardEvent).key
      else if (event.type !== 'wheel') {
        swallowClick = true
        clearTimeout(clickTimer)
        clickTimer = setTimeout(() => (swallowClick = false), 1_000)
      }
    }
    const onClick = (event: Event): void => {
      if (!swallowClick) return
      swallowClick = false
      swallow(event)
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (swallowKeyUp !== event.key) return
      swallowKeyUp = null
      swallow(event)
    }
    for (const type of WAKE_EVENTS)
      window.addEventListener(type, onInput, { capture: true, passive: false })
    window.addEventListener('click', onClick, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      for (const type of WAKE_EVENTS) window.removeEventListener(type, onInput, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keyup', onKeyUp, true)
      clearTimeout(clickTimer)
    }
  }, [])

  // Something in use, or the setting switched off: bright at once, and the idle time restarts.
  useEffect(() => {
    if (enabled && !blocked) return
    lastActivity.current = Date.now()
    live.current.dimmed = false
    setDimmed(false)
  }, [enabled, blocked])

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      const { settings: current, blockers: now } = live.current
      if (!current || live.current.dimmed) return
      // Time spent watching, listening or chatting is use, not idleness.
      if (isIdleDimBlocked(now)) lastActivity.current = Date.now()
      else if (shouldDimHome(current, lastActivity.current, Date.now(), now)) {
        live.current.dimmed = true
        setDimmed(true)
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [enabled])

  return dimmed
}
