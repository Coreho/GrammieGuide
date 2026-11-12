import { testSettled, type ContactRequestSummary, type ContactTestState } from './contacts'

export type TestStepState = 'yes' | 'no' | 'waiting' | 'not-reached'
export interface ContactTestReport {
  /** Who was texted and when. */
  heading: string
  /** Sent, delivered and seen are separate observations and are never merged. */
  steps: { label: string; state: TestStepState; text: string }[]
  /** Still holds the tap guard: keep reading it, and no new test can start yet. */
  open: boolean
  note: string
}

const PROBLEMS: Record<NonNullable<ContactTestState['problem']>, string> = {
  'not-configured':
    'No test was sent. Save at least one person and the SMS credentials first, then try again.',
  'help-request-active':
    'No test was sent. She has a callback request open right now, and a test text could confuse the person answering it. Try again after it ends.',
  'test-active':
    'No new text was sent. The test below is still open; wait for it to finish before sending another.',
  unavailable:
    'The test could not be started or read. Nothing was sent again. Close and reopen Contacts, then check below before trying once more.'
}

/** Words for a refusal or failure. Never suggests that someone is coming. */
export function contactTestProblem(state: ContactTestState): string | null {
  return state.problem ? PROBLEMS[state.problem] : null
}

/**
 * The caregiver's reading of one test. Queued, sent, timed out and unknown never
 * read as delivered or seen: each line needs its own evidence.
 */
export function describeContactTest(
  test: ContactRequestSummary,
  now: number,
  time: (ms: number) => string
): ContactTestReport {
  const attempt = test.attempts[0]
  const name = attempt?.name ?? 'the contact'
  const heading = `Test text to ${name}, started ${time(test.createdAt)}`
  if (!attempt)
    return {
      heading,
      steps: [],
      open: false,
      note: 'This test has no saved result. Nothing is sent again automatically.'
    }
  const ended = now >= test.expiresAt || test.status === 'expired'
  const answered = attempt.answeredAt !== undefined
  const delivered = attempt.deliveredAt !== undefined
  const refused = attempt.status === 'failed' && !attempt.submitted
  const undelivered = attempt.status === 'failed' && attempt.submitted && !delivered
  const uncertain = !attempt.submitted && !refused && attempt.status !== 'sending'

  const sent = attempt.submitted
    ? { state: 'yes' as const, text: 'Twilio accepted the text.' }
    : refused
      ? {
          state: 'no' as const,
          text: 'Twilio refused the text, so nothing was sent. Check the Account SID, API key, secret and sender number. The error log in the Twilio console gives the reason.'
        }
      : uncertain
        ? {
            state: 'no' as const,
            text: 'Twilio could not be reached, or its answer was lost. The text may or may not have gone, and it is not sent again.'
          }
        : { state: 'waiting' as const, text: 'Sending the text to Twilio…' }

  const delivery = delivered
    ? { state: 'yes' as const, text: `Delivered to the phone at ${time(attempt.deliveredAt!)}.` }
    : !attempt.submitted
      ? { state: 'not-reached' as const, text: 'Not reached.' }
      : undelivered
        ? {
            state: 'no' as const,
            text: 'The carrier reported the text was not delivered. Check the phone number and that the sender is registered.'
          }
        : ended
          ? { state: 'no' as const, text: 'Delivery was never confirmed before the test ended.' }
          : attempt.status === 'unknown'
            ? {
                state: 'waiting' as const,
                text: 'No delivery report yet. Still checking until the test ends.'
              }
            : { state: 'waiting' as const, text: 'Waiting for the carrier to confirm delivery…' }

  const reply = answered
    ? { state: 'yes' as const, text: `${name} replied YES at ${time(attempt.answeredAt!)}.` }
    : !attempt.submitted || undelivered
      ? { state: 'not-reached' as const, text: 'Not reached.' }
      : ended
        ? { state: 'no' as const, text: 'No YES reply arrived before the test ended.' }
        : {
            state: 'waiting' as const,
            text: `Waiting for ${name} to reply YES. Only the word YES, sent after this test began, counts.`
          }

  const open = !ended && !testSettled(test)
  const note = answered
    ? 'The whole path works: a text went out, reached the phone and a YES came back.'
    : open && !uncertain
      ? `This test ends at ${time(test.expiresAt)}. You can leave this page; nothing is sent again.`
      : refused || undelivered
        ? 'You can fix the settings and send another test now.'
        : now < test.expiresAt
          ? `Another test can be sent after ${time(test.expiresAt)}.`
          : 'This test has ended. You can send another.'

  return {
    heading,
    steps: [
      { label: 'Sent', ...sent },
      { label: 'Delivered', ...delivery },
      { label: 'Seen', ...reply }
    ],
    open,
    note
  }
}
