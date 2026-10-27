import { describe, it, expect } from 'vitest'
import {
  personalFactSchema,
  currentFacts,
  localDate,
  PersonalHistory
} from '../../src/shared/buddy/personalFacts'
import type { PersonalFact } from '../../src/shared/buddy/personalFacts'
import { migration } from '../../src/main/config/migrations/017-buddy-personal-facts'

const fact: PersonalFact = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'plan',
  text: 'Sarah visits',
  date: '2026-10-20',
  cancelled: false
}
describe('caregiver facts', () => {
  it('migrates existing Buddy settings without replacing saved values', () => {
    const previous = { schemaVersion: 16, buddy: { model: 'saved-model', voiceEnabled: false } }
    expect(migration.migrate(previous)).toEqual({
      schemaVersion: 17,
      buddy: { ...previous.buddy, personalFacts: [] }
    })
    expect(migration.migrate({ buddy: { personalFacts: [fact] } })).toEqual({
      schemaVersion: 17,
      buddy: { personalFacts: [fact] }
    })
    expect(previous.schemaVersion).toBe(16)
  })
  it('requires real dates for plans and bounds saved text', () => {
    expect(personalFactSchema.safeParse({ ...fact, date: '2026-02-30' }).success).toBe(false)
    expect(personalFactSchema.safeParse({ ...fact, date: undefined }).success).toBe(false)
    expect(personalFactSchema.safeParse({ ...fact, text: 'x'.repeat(501) }).success).toBe(false)
  })
  it('expires at local midnight, including across UTC and daylight-saving boundaries', () => {
    expect(localDate(new Date('2026-10-21T03:59:59Z'), 'America/New_York')).toBe('2026-10-20')
    expect(currentFacts([fact], new Date('2026-10-21T03:59:59Z'), 'America/New_York')).toEqual([
      fact
    ])
    expect(currentFacts([fact], new Date('2026-10-21T04:00:00Z'), 'America/New_York')).toEqual([])
    expect(localDate(new Date('2026-11-02T04:59:59Z'), 'America/New_York')).toBe('2026-11-01')
    expect(
      currentFacts(
        [{ ...fact, cancelled: true }],
        new Date('2026-10-20T12:00:00Z'),
        'America/New_York'
      )
    ).toEqual([])
  })
  it('keeps deleted facts out of subsequent API history without clearing her screen', () => {
    const history = new PersonalHistory()
    const turns = [{ role: 'user' as const, text: 'Who is visiting?' }]
    expect(history.prepare(turns, [fact])).toEqual(turns)
    const next = [
      ...turns,
      { role: 'assistant' as const, text: 'Sarah visits' },
      { role: 'user' as const, text: 'Today?' }
    ]
    expect(history.prepare(next, [])).toEqual(next.slice(-1))
    const later = [
      ...next,
      { role: 'assistant' as const, text: 'I am not sure.' },
      { role: 'user' as const, text: 'Hello' }
    ]
    expect(history.prepare(later, [])).toEqual(later.slice(2))
    expect(next).toHaveLength(3)
    expect(history.prepare([{ role: 'user', text: 'A new chat' }], [])).toHaveLength(1)
  })
})
