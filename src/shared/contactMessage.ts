import type { HomeContactState } from './contacts'

const TELEPHONE = 'Please use your telephone to call family, or tell someone nearby.'
/** No optimistic success text: delivery and a matching YES are distinct observations. */
export function contactMessage(
  state: HomeContactState | null,
  busy: boolean,
  now: number
): { title: string; detail: string; photoUrl?: string } {
  if (busy)
    return {
      title: 'Sending…',
      detail: 'Please wait a moment.',
      photoUrl: state?.contact?.photoUrl
    }
  if (!state || state.problem)
    return { title: "We couldn't confirm your request.", detail: TELEPHONE }
  const request = state.request
  if (!request) return { title: 'No request has been confirmed.', detail: TELEPHONE }
  const answered = request.attempts.find((attempt) => attempt.status === 'answered')
  if (answered)
    return {
      title: `${answered.name ?? 'Your family'} saw your request.`,
      detail: 'You can go back to Home.',
      photoUrl: answered.photoUrl
    }
  const latest = request.attempts.at(-1)
  if (!latest) return { title: "We couldn't confirm your request.", detail: TELEPHONE }
  if (now >= request.expiresAt || request.status === 'expired')
    return { title: 'No reply was confirmed.', detail: TELEPHONE, photoUrl: latest.photoUrl }
  const waited = now - latest.startedAt >= (request.fallbackAfterMs ?? 120_000)
  if (latest.status === 'delivered')
    return waited
      ? { title: 'No reply confirmed yet.', detail: TELEPHONE, photoUrl: latest.photoUrl }
      : {
          title: `Request delivered to ${latest.name ?? 'your family'}.`,
          detail: "We're waiting to hear back.",
          photoUrl: latest.photoUrl
        }
  if (latest.status === 'unknown' || latest.status === 'failed' || waited)
    return {
      title: "We couldn't confirm this request.",
      detail: TELEPHONE,
      photoUrl: latest.photoUrl
    }
  return request.attempts.length > 1
    ? {
        title: `Asking ${latest.name ?? 'family'} to call…`,
        detail: "We haven't had a reply to the first request.",
        photoUrl: latest.photoUrl
      }
    : { title: 'Sending…', detail: 'Please wait a moment.', photoUrl: latest.photoUrl }
}
