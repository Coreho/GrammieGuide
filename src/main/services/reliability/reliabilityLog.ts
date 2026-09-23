import type { ReliabilityEvent } from '@shared/ipcContract'

/**
 * Structured, admin-visible reliability event log. Replaces the old app's
 * pattern of `console.warn(...)` on failure (index.js's volume/wifi
 * handlers, watchdog.js's registration) which nobody but a developer
 * attached to the process could ever see.
 */
const MAX_EVENTS = 500
const events: ReliabilityEvent[] = []

export function logReliabilityEvent(event: Omit<ReliabilityEvent, 'ts'>): ReliabilityEvent {
  const full: ReliabilityEvent = { ts: new Date().toISOString(), ...event }
  events.push(full)
  if (events.length > MAX_EVENTS) events.shift()
  return full
}

export function getReliabilityLog(limit = 100): ReliabilityEvent[] {
  return events.slice(-limit)
}

export function clearReliabilityLog(): void {
  events.length = 0
}
