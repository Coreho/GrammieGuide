import { describe, expect, it, vi } from 'vitest'
import {
  dayPeriod,
  dayWords,
  explicitTodayRequest,
  nextDate,
  NOTHING_TODAY,
  plansOn,
  todayCardLines,
  todayReply
} from '../../src/shared/today/today'
import { buddyChat } from '../../src/main/services/ai/buddyChatService'
import { PersonalHistory, type PersonalFact } from '../../src/shared/buddy/personalFacts'
import { configSchema, defaultConfig } from '../../src/shared/configSchema'

const TZ = 'America/New_York'
// Sunday 15 November 2026, 2:30 PM in New York.
const NOW = new Date('2026-11-15T19:30:00Z')

let n = 0
function plan(date: string, text: string, cancelled = false): PersonalFact {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    kind: 'plan',
    text,
    date,
    cancelled
  }
}
const family: PersonalFact = {
  id: '00000000-0000-4000-8000-999999999999',
  kind: 'family',
  text: 'Sarah is her daughter'
}

describe('the day and part of the day', () => {
  it('uses the orientation windows, with small hours as night', () => {
    expect([4, 5, 11, 12, 16, 17, 20, 21, 0].map(dayPeriod)).toEqual([
      'night',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
      'night'
    ])
  })

  it('words the day the way the date row does', () => {
    expect(dayWords(new Date(2026, 10, 15, 14, 30))).toBe('Sunday afternoon, November 15')
  })

  it('finds tomorrow across month and year ends and DST changes', () => {
    expect(nextDate('2026-11-30')).toBe('2026-12-01')
    expect(nextDate('2026-12-31')).toBe('2027-01-01')
    expect(nextDate('2028-02-28')).toBe('2028-02-29')
    expect(nextDate('2026-03-08')).toBe('2026-03-09')
  })
})

describe('which plans the card shows', () => {
  const facts = [
    family,
    plan('2026-11-14', 'Hair appointment'),
    plan('2026-11-15', 'Sarah visits at 3'),
    plan('2026-11-15', 'Doctor at 10', true),
    plan('2026-11-15', 'Lunch with Ann'),
    plan('2026-11-16', 'Tom phones in the evening'),
    plan('2026-11-20', 'Church supper')
  ]

  it('shows only today, not cancelled, past or later plans', () => {
    expect(plansOn(facts, '2026-11-15')).toEqual(['Sarah visits at 3', 'Lunch with Ann'])
    expect(todayCardLines(facts, NOW, TZ, { showTomorrow: true })).toEqual({
      today: ['Sarah visits at 3', 'Lunch with Ann'],
      tomorrow: ['Tom phones in the evening']
    })
  })

  it('leaves the tomorrow line out when the caregiver switched it off', () => {
    expect(todayCardLines(facts, NOW, TZ, { showTomorrow: false }).tomorrow).toBeNull()
  })

  it('follows her local date, not UTC', () => {
    // 11:30 PM on the 15th in New York is already the 16th in UTC.
    const late = new Date('2026-11-16T04:30:00Z')
    expect(todayCardLines(facts, late, TZ, { showTomorrow: true }).today).toEqual([
      'Sarah visits at 3',
      'Lunch with Ann'
    ])
  })
})

describe('Buddy reading the card', () => {
  it('recognizes whole questions about the day or the plans, and nothing else', () => {
    expect(explicitTodayRequest('What day is it?')).toBe('day')
    expect(explicitTodayRequest('Buddy, what day is it today')).toBe('day')
    expect(explicitTodayRequest("what's the date")).toBe('day')
    expect(explicitTodayRequest('Can you tell me what day it is')).toBe('day')
    expect(explicitTodayRequest('Do you know what the date is?')).toBe('day')
    expect(explicitTodayRequest("What's on today?")).toBe('plans')
    expect(explicitTodayRequest('what am I doing today')).toBe('plans')
    expect(explicitTodayRequest('Do I have anything today?')).toBe('plans')
    expect(explicitTodayRequest("I can't remember what day Tom came")).toBeNull()
    expect(explicitTodayRequest('what day did Sarah visit')).toBeNull()
  })

  it('answers only from what the card shows', () => {
    const facts = [plan('2026-11-15', 'Sarah visits at 3'), plan('2026-11-16', 'Tom phones')]
    const at = new Date(2026, 10, 15, 14, 30)
    const settings = { enabled: true, showTomorrow: true }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(todayReply('day', { now: at, timeZone: tz, facts, settings })).toBe(
      "It's Sunday afternoon, November 15."
    )
    expect(todayReply('plans', { now: at, timeZone: tz, facts, settings })).toBe(
      "It's Sunday afternoon, November 15. Written down for today: Sarah visits at 3. For tomorrow: Tom phones."
    )
    expect(todayReply('plans', { now: at, timeZone: tz, facts: [], settings })).toBe(
      `It's Sunday afternoon, November 15. ${NOTHING_TODAY}`
    )
    // With the card off he still knows the day, but leaves plans to chat.
    expect(
      todayReply('plans', {
        now: at,
        timeZone: tz,
        facts,
        settings: { enabled: false, showTomorrow: true }
      })
    ).toBeNull()
  })

  it('answers in chat without a model, a key or the network', async () => {
    const generate = vi.fn()
    const log = vi.fn()
    const at = new Date(2026, 10, 15, 14, 30)
    const result = await buddyChat([{ role: 'user', text: "What's on today?" }], {
      chatEnabled: true,
      log,
      personal: {
        facts: () => [plan('2026-11-15', 'Sarah visits at 3')],
        history: new PersonalHistory(),
        now: () => at
      },
      todayCard: () => ({ enabled: true, showTomorrow: false })
    })
    expect(result).toEqual({
      ok: true,
      reply: "It's Sunday afternoon, November 15. Written down for today: Sarah visits at 3."
    })
    expect(generate).not.toHaveBeenCalled()
    // Content-free: the log names the kind of question only.
    expect(log).toHaveBeenCalledWith('buddy-today-plans')
    expect(JSON.stringify(log.mock.calls)).not.toContain('Sarah')
  })
})

describe('the setting', () => {
  it('is off for existing and new installs, and old saved configs need no migration', () => {
    expect(defaultConfig().display.todayCard).toEqual({ enabled: false, showTomorrow: true })
    const saved = JSON.parse(JSON.stringify(defaultConfig()))
    delete saved.display.todayCard
    expect(configSchema.parse(saved).display.todayCard).toEqual({
      enabled: false,
      showTomorrow: true
    })
  })
})
