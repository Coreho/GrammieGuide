import type { ActivityEvent } from '@shared/ipcContract'

/**
 * Caregiver-visible activity log. Kept in memory for M2 (the old app
 * persisted this to electron-store, capped at 1000 entries) - persistence
 * can be added in a later pass without changing the IPC surface.
 */
const MAX_EVENTS = 1000
const events: ActivityEvent[] = []

export function logActivity(type: string, detail?: string): ActivityEvent {
  const event: ActivityEvent = { ts: new Date().toISOString(), type, detail }
  events.push(event)
  if (events.length > MAX_EVENTS) events.shift()
  return event
}

export function getActivityLog(limit = 100): ActivityEvent[] {
  return events.slice(-limit)
}
