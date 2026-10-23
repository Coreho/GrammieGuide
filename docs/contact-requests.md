# Saved family callback requests (TASK-33)

This is the main-process foundation for the family callback flow. There is no
Home contact button or credential setup yet (TASK-22), no status dashboard UI
(TASK-25), and no caregiver SMS test panel (TASK-54). TASK-17's live delivery/YES
proof remains outstanding. No live messages were sent while implementing this.

`startContactRequests(userData, getTwilioConfig)` creates one service, recovers
saved work and polls every ten seconds without delaying Home. The current
bootstrap uses the default unconfigured getter, so no network SMS operation can
succeed until TASK-22 supplies the credential source. That task should pass a
main-only getter returning Account SID, API key SID/secret and sender, optionally
a Messaging Service SID. Keep credentials in that task's dedicated secret
storage; never add them to public config or the request journal.

Main-process callers use `getContactRequests().request(options)`. Options contain
the purpose (`real` or `test`), one preferred contact and an optional distinct
fallback (stable IDs and E.164 numbers), expiry of 1 minute to 24 hours, and a
fallback wait of at least one second and less than expiry. TASK-22 must validate
the caregiver's settings, enforce the caller's authorization, and derive these
options from saved configuration rather than accepting phone numbers from Home.
There is deliberately no renderer send channel in this task.

## Status and retry rules

- Intent is flushed to an atomic disk journal **before** each external send.
  Submission returns an outbound SID, which is saved before it is considered
  trackable. A submission alone leaves status `sending`.
- `delivered` requires the provider's delivered status. Queued, accepted, sending
  and sent statuses do not establish delivery. A failed poll preserves a prior
  confirmed delivery; otherwise the fallback deadline makes a pending attempt
  `unknown`. Confirmed failed/undelivered/canceled messages become `failed`.
- `answered` requires a new, timestamped inbound `YES` (case insensitive, trimmed)
  from the attempted number to the actual outbound sender. Its provider SID is
  saved and cannot acknowledge another retained request. It does not establish
  that a callback will happen. An acknowledgement does not fabricate a delivery
  receipt when the provider has not reported one.
- The fallback is attempted once after confirmed failure or the fallback wait,
  including when delivery is unknown or delivered but unanswered. Both attempts
  keep being checked, so a preferred contact's late YES after fallback is retained.
- Every send attempt is made at most once locally. A crash or lost POST result
  before the SID is durable becomes `unknown`; it is never blindly resent or
  matched by guessing which outbound SMS was ours. Disk failures disable that
  service instance until restart. Corrupt history is preserved and fails closed.
- Expiry stops polling and automatic fallback. Replies observed during a poll
  must have provider timestamps strictly after the attempt and before expiry;
  expired requests do not resume. A recorded answer remains in history.
- Repeated taps return the current request for its entire configured lifetime,
  even if answered or failed. A new request is permitted at expiry, with a new ID.
  Real and test requests have distinct state; overlapping contacts cannot be used
  by both while either request's tap guard is active.

Plain YES has no embedded request ID: correlation uses phone numbers, provider
timestamps and consumed reply SIDs. It cannot establish which message someone
intended to answer if they delay replying until after a later request has begun.
This is a limitation of decision-02's chosen protocol, not proof of human intent.
The kiosk clock must be correct for expiry and timestamp checks.

## Storage and caregiver access

`userData/contact-requests.json` retains the latest 1,000 requests. New requests
may evict only old requests whose tap guards have expired. The file contains
contact-number snapshots, provider IDs, statuses and timestamps, but no SMS text
or credentials. It stays outside general settings backups. Invalid or oversized
history is not reset to empty; that could produce duplicate family notifications.

`contacts:list`, exposed as `window.admin.listContactRequests()`, requires the
main-process admin unlock. It returns redacted summaries with request/contact
IDs, purpose, statuses and times. It exposes no phone numbers, SMS text or
provider IDs. TASK-25 can consume this API. Startup history failures log only the
generic `contact-history-unavailable` event, once per app run.

## Verification

Unit tests exercise duplicate taps, pre-send disk failure, accepted-before-SID-save
failure, restart, uncertain POSTs, offline polling, delivery vs acknowledgement,
fallback, late replies, reply reuse, expiry boundaries, real/test isolation,
bounded history and private summaries. Disk tests use real temporary files and
verify corrupt history stays untouched. Twilio adapter tests use fake HTTP
responses; all operations have a ten-second deadline, response size limits and
bounded pagination, and POST is never retried. The adapter follows the
[Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource).

`tests/e2e/contact-requests.spec.ts` starts the built Electron app with a journal
representing a lost submission, verifies recovery to unknown without a second
attempt, and exercises the real preload/IPC caregiver gate and private summaries.
The wrong-phone acknowledgement condition was inverted temporarily; the stale
and wrong-number reply test failed as expected, then the source was restored.

Run `npm test`, `npm run build`, `npm run lint`, and then
`npx playwright test tests/e2e/contact-requests.spec.ts`. These checks do not replace
TASK-17's live channel proof or TASK-54's eventual caregiver test.
