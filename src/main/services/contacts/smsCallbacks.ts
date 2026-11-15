/**
 * Callback requests reach family by SMS, and US carriers deliver texts from an
 * ordinary number only under an approved A2P 10DLC campaign. Until that
 * approval lands every text would read "Sent" and never "Delivered", which is
 * worse for her than no button at all. So the feature is hidden, not removed:
 * saved contacts, timing, the caregiver's on/off choice and the credentials
 * all stay on disk, and setting this to true brings everything back as it was.
 */
export const SMS_CALLBACKS_RELEASED = false

/**
 * The one switch main consults before showing, sending or describing a callback
 * request. The e2e suites that exercise the feature with the fake SMS channel
 * opt back in with GRAMMIEGUIDE_SMS_CALLBACKS=1; outside e2e that variable is
 * ignored, so nothing on her computer can turn it on early.
 */
export function smsCallbacksAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    SMS_CALLBACKS_RELEASED ||
    (env['GRAMMIEGUIDE_E2E'] === '1' && env['GRAMMIEGUIDE_SMS_CALLBACKS'] === '1')
  )
}
