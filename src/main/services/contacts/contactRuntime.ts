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
  const poll = async (): Promise<void> => {
    if (polling) return
    polling = true
    try {
      await service!.poll()
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
