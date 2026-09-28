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
import type { BuddyCommand } from '@shared/buddy/commands'
import { speak, stopSpeaking } from './speech'

type BrainInput = {
  getPosition: () => number | undefined
  roaming: boolean
  chattiness: Chattiness
  hour: number
  weather: RemarkWeather | null
  chatOpen: boolean
  chatPhase: ChatPhase
  command: (BuddyCommand & { sequence: number }) | null
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
    let sequence = 0
    const speech = a.subscribe((state) => {
      if (sequence !== state.context.commandSequence) {
        sequence = state.context.commandSequence
        stopSpeaking()
        if (state.context.commandSpeak && state.context.bubble) void speak(state.context.bubble)
      }
    })
    const offCommand = window.launcher.onBuddyCommand((command) =>
      a.send({ type: 'COMMAND', ...command, at: initial.current.getPosition() })
    )
    setActor(a)
    return () => {
      offCommand()
      speech.unsubscribe()
      stopSpeaking()
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
    const w =
      weatherCategory && weatherTemp !== null && weatherUnit
        ? { category: weatherCategory, temp: weatherTemp, unit: weatherUnit }
        : null
    actor?.send({ type: 'SETTINGS', roaming, chattiness, hour, weather: w })
  }, [actor, roaming, chattiness, hour, weatherCategory, weatherTemp, weatherUnit])

  useEffect(() => {
    // A spoken command may outlast its gesture. Let the sentence finish,
    // unless she starts a conversation or another command takes over.
    if (chatOpen) stopSpeaking()
    actor?.send({ type: chatOpen ? 'CHAT_OPEN' : 'CHAT_CLOSE' })
  }, [actor, chatOpen])

  useEffect(() => {
    actor?.send({ type: 'CHAT_PHASE', phase: chatPhase })
  }, [actor, chatPhase])

  useEffect(() => {
    if (input.command)
      actor?.send({ type: 'COMMAND', ...input.command, at: initial.current.getPosition() })
  }, [actor, input.command])

  const send = useCallback((event: BuddyEvent) => actor?.send(event), [actor])

  return {
    activity: snapshot ? activityOf(snapshot.value) : 'resting',
    context: snapshot?.context ?? null,
    send
  }
}
