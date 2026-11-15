import { localDate, type PersonalFact } from '../buddy/personalFacts'

/**
 * TASK-79: the Today card's words, shared by Home, admin's Home preview and
 * Buddy, so all three always say the same thing.
 *
 * Plans are the caregiver's dated `plan` entries for Buddy (TASK-24), so there
 * is one place to write them down. A saved plan is what the caregiver recorded,
 * not a promise: lines say "written down", never "will happen", and cancelled
 * or past plans never show. Statements only; nothing she must answer.
 */

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night'

/**
 * Natural dementia-orientation windows: 5-11 morning, 12-16 afternoon, 17-20
 * evening, 21-4 night (so waking at 2 AM says "night", not "morning").
 */
export function dayPeriod(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

/** "Saturday afternoon, November 15": the words Home's date row shows. */
export function dayWords(now: Date): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  return `${weekday} ${dayPeriod(now.getHours())}, ${monthDay}`
}

/** The calendar day after `date` (YYYY-MM-DD), without time-zone or DST surprises. */
export function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

/** Plans the caregiver saved for exactly `date`, in the order she saved them. */
export function plansOn(facts: readonly PersonalFact[], date: string): string[] {
  return facts
    .filter((fact) => fact.kind === 'plan' && !fact.cancelled && fact.date === date)
    .map((fact) => fact.text.trim())
    .filter(Boolean)
}

export interface TodayCardSettings {
  enabled: boolean
  showTomorrow: boolean
}

export interface TodayCardLines {
  today: string[]
  /** Null when the caregiver switched the tomorrow line off. */
  tomorrow: string[] | null
}

export function todayCardLines(
  facts: readonly PersonalFact[],
  now: Date,
  timeZone: string,
  settings: Pick<TodayCardSettings, 'showTomorrow'>
): TodayCardLines {
  const today = localDate(now, timeZone)
  return {
    today: plansOn(facts, today),
    tomorrow: settings.showTomorrow ? plansOn(facts, nextDate(today)) : null
  }
}

export const NOTHING_TODAY = 'Nothing written down for today.'
export const NOTHING_TOMORROW = 'Nothing written down.'

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/** A list read aloud: "Sarah visits at 3, and lunch with Ann." */
function spokenList(items: string[]): string {
  const clean = items.map((item) => item.replace(/[.!?]+$/, ''))
  if (clean.length === 1) return sentence(clean[0]!)
  return sentence(`${clean.slice(0, -1).join(', ')}, and ${clean.at(-1)!}`)
}

export type TodayRequest = 'day' | 'plans'

const ASK = /^(?:please |can you tell me |could you tell me |tell me |do you know )+/

const DAY = [
  /^what day is (?:it|today)(?: today)?$/,
  /^what's the day(?: today)?$/,
  /^what is the day(?: today)?$/,
  /^what(?:'s| is) (?:the )?date(?: today)?$/,
  /^what(?:'s| is) today's date$/,
  /^what(?:'s| is) today$/,
  /^what day of the week is it$/,
  // After "can you tell me": "what day it is", "what the date is".
  /^what day it is(?: today)?$/,
  /^what (?:the date|today's date) is$/
]

const PLANS = [
  /^what(?:'s| is) (?:on|happening|planned)(?: for)? today$/,
  /^what(?:'s| is) the plan(?: for)? today$/,
  /^what am i doing today$/,
  /^what are we doing today$/,
  /^is (?:there )?anything (?:on|happening|planned)(?: for)? today$/,
  /^do i have anything(?: on| planned)? today$/,
  /^what do i have (?:on )?today$/,
  /^what(?:'s| is) on the card$/,
  /^read (?:me )?(?:the )?today card$/,
  /^what(?:'s| is) today's plan$/
]

/**
 * A whole explicit question about the day or today's plans, recognized before
 * any model, network or key, like Buddy's gestures. "I can't remember what day
 * Tom visited" stays conversation, because the whole message must match.
 */
export function explicitTodayRequest(value: string): TodayRequest | null {
  const text = value
    .toLowerCase()
    .replace(/’/g, "'")
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:hey |oh )?buddy,? /, '')
    .replace(/,? buddy$/, '')
    .replace(ASK, '')
    .replace(/(?: please| again)+$/, '')
    .replace(/,$/, '')
    .trim()
  if (DAY.some((pattern) => pattern.test(text))) return 'day'
  if (PLANS.some((pattern) => pattern.test(text))) return 'plans'
  return null
}

/**
 * Buddy's fixed reply, built only from what the card shows. With the card
 * off he still tells her the day (the header always shows it), and leaves
 * plans to the caregiver-approved chat path.
 */
export function todayReply(
  request: TodayRequest,
  opts: {
    now: Date
    timeZone: string
    facts: readonly PersonalFact[]
    settings: TodayCardSettings
  }
): string | null {
  const day = `It's ${dayWords(opts.now)}.`
  if (request === 'day') return day
  if (!opts.settings.enabled) return null
  const lines = todayCardLines(opts.facts, opts.now, opts.timeZone, opts.settings)
  const parts = [day]
  parts.push(
    lines.today.length ? `Written down for today: ${spokenList(lines.today)}` : NOTHING_TODAY
  )
  if (lines.tomorrow?.length) parts.push(`For tomorrow: ${spokenList(lines.tomorrow)}`)
  return parts.join(' ')
}
