import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createActor, type Actor } from 'xstate'
import {
  buddyMachine,
  activityOf,
  type BuddyActivity,
  type BuddyContext,
  type BuddyEvent,
  type ChatPhase,
  type Chattiness
} from '@shared/buddy/buddyMachine'
import type { RemarkWeather } from '@shared/buddy/remarks'

type BrainInput = {
  roaming: boolean
  chattiness: Chattiness
  hour: number
  weather: RemarkWeather | null
  chatOpen: boolean
  chatPhase: ChatPhase
}

/**
 * Runs Buddy's behavior machine for as long as his floor is on screen and
 * feeds it what the rest of the app knows (settings, the clock, the
 * weather, the chat panel). The actor is created inside an effect, not in
 * render, because StrictMode mounts twice in dev and a stopped xstate actor
 * can't be restarted.
 */
export function useBuddyBrain(input: BrainInput): {
  activity: BuddyActivity
  context: BuddyContext | null
  send: (event: BuddyEvent) => void
} {
  const [actor, setActor] = useState<Actor<typeof buddyMachine> | null>(null)
  const initial = useRef(input)

  useEffect(() => {
    const { roaming, chattiness, hour, weather } = initial.current
    const a = createActor(buddyMachine, { input: { roaming, chattiness, hour, weather } })
    a.start()
    setActor(a)
    return () => {
      a.stop()
    }
  }, [])

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!actor) return () => undefined
      const sub = actor.subscribe(onChange)
      return () => sub.unsubscribe()
    },
    [actor]
  )
  const snapshot = useSyncExternalStore(subscribe, () => actor?.getSnapshot() ?? null)

  const { roaming, chattiness, hour, weather, chatOpen, chatPhase } = input
  const weatherCategory = weather?.category
  const weatherTemp = weather ? Math.round(weather.temp) : null
  const weatherUnit = weather?.unit

  useEffect(() => {
    const w = weatherCategory && weatherTemp !== null && weatherUnit ? { category: weatherCategory, temp: weatherTemp, unit: weatherUnit } : null
    actor?.send({ type: 'SETTINGS', roaming, chattiness, hour, weather: w })
  }, [actor, roaming, chattiness, hour, weatherCategory, weatherTemp, weatherUnit])

  useEffect(() => {
    actor?.send({ type: chatOpen ? 'CHAT_OPEN' : 'CHAT_CLOSE' })
  }, [actor, chatOpen])

  useEffect(() => {
    actor?.send({ type: 'CHAT_PHASE', phase: chatPhase })
  }, [actor, chatPhase])

  const send = useCallback((event: BuddyEvent) => actor?.send(event), [actor])

  return {
    activity: snapshot ? activityOf(snapshot.value) : 'resting',
    context: snapshot?.context ?? null,
    send
  }
}
