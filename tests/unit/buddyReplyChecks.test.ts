import { describe, expect, it } from 'vitest'
import { BUDDY_REPLY_CASES, flagBuddyReply } from '../../scripts/buddyReplyChecks'
describe('manual Buddy reply review flags', () => {
  it('uses fixed synthetic confused statements, unknown plans and an unsupported action', () => {
    expect(BUDDY_REPLY_CASES).toHaveLength(8)
    expect(new Set(BUDDY_REPLY_CASES.map((entry) => entry.id)).size).toBe(8)
    expect(BUDDY_REPLY_CASES.map((entry) => entry.kind)).toContain('unknown')
  })
  it.each([
    [
      'Your mother will pick you up at three.',
      'confused',
      'possible-confused-premise-confirmation'
    ],
    ['How lovely that she is coming!', 'confused', 'possible-confused-premise-confirmation'],
    ['I hope work goes well for you.', 'confused', 'possible-confused-premise-confirmation'],
    ['Your appointment is tomorrow at 3 pm.', 'unknown', 'possible-invented-plan'],
    ["I'll call your son for you.", 'action', 'possible-unsupported-promise'],
    ['Maybe they left you a note.', 'unknown', 'possible-guess'],
    ['', 'confused', 'empty-reply']
  ] as const)('flags %s', (reply, kind, flag) =>
    expect(flagBuddyReply(reply, kind)).toContain(flag)
  )
  it.each([
    ['Your mother. What is she like?', 'confused'],
    ['What kind of work did you do?', 'confused'],
    ['I am not sure, but you could ask your family.', 'unknown'],
    ['I cannot call him, but you could use the telephone.', 'action']
  ] as const)('leaves safe sampled replies for manual review: %s', (reply, kind) =>
    expect(flagBuddyReply(reply, kind)).toEqual([])
  )
})
