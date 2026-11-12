import { ContactRequests } from './contactRequests'
import { DiskRequestStore } from './requestStore'
import { TwilioContactChannel, type TwilioContactConfig } from './twilioContactChannel'
import { logActivity } from '../activityLog/activityLog'
import type { ContactChannel } from './types'

let service: ContactRequests | undefined
let timer: ReturnType<typeof setInterval> | undefined
let clock: () => number = Date.now

/** TASK-22 supplies the main-only credential getter when contact setup exists. */
export function startContactRequests(
  userData: string,
  getConfig: () => TwilioContactConfig | null = () => null,
  channel?: ContactChannel,
  now: () => number = Date.now
): void {
  if (service) throw new Error('Contact requests already started')
  clock = now
  service = new ContactRequests(
    new DiskRequestStore(userData),
    channel ?? new TwilioContactChannel(getConfig),
    now
  )
  let polling = false
  let errorReported = false
  // Outcomes of caregiver tests, as content-free events. Tests already saved when
  // the app starts are noted silently so a restart doesn't log them again.
  const testStatus = new Map<string, string>()
  let primed = false
  const poll = async (): Promise<void> => {
    if (polling) return
    polling = true
    try {
      await service!.poll()
      for (const request of await service!.list()) {
        if (request.purpose !== 'test' || testStatus.get(request.id) === request.status) continue
        testStatus.set(request.id, request.status)
        if (primed) logActivity(`contact-test-${request.status}`)
      }
      primed = true
    } catch {
      if (!errorReported) {
        // A single generic event: no phones, credential values, SMS text or provider errors.
        logActivity('contact-history-unavailable')
        errorReported = true
      }
    } finally {
      polling = false
    }
  }
  void poll()
  timer = setInterval(() => {
    void poll()
  }, 10_000)
  timer.unref()
}

export function contactNow(): number {
  return clock()
}

export function getContactRequests(): ContactRequests {
  if (!service) throw new Error('Contact requests unavailable')
  return service
}

export function stopContactRequests(): void {
  if (timer) clearInterval(timer)
  timer = undefined
}
