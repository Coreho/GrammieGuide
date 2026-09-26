import type { WeatherCategory } from '../ipcContract'

/**
 * What Buddy says in his speech bubble when nobody asked: a greeting when he
 * first appears, the occasional unprompted remark (only if the caregiver
 * turned chattiness on), and a goodbye when a chat closes.
 *
 * Carried over from the old app's pet mockup (docs/ai-buddy): lines are
 * pooled by time of day. Rules for adding lines: warm and short, never a
 * question she has to answer, and never a claim that might not be true
 * (no "your daughter is visiting today").
 */

export type RemarkWeather = { category: WeatherCategory; temp: number; unit: 'F' | 'C' }
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

const GREETINGS: Record<TimeOfDay, string[]> = {
  morning: ['Good morning!', 'Good morning! Nice to see you.'],
  afternoon: ['Good afternoon!', 'Hello! Nice to see you this afternoon.'],
  evening: ['Good evening!', 'Hello! Nice to see you this evening.'],
  night: ['Hello there!']
}

const REMARKS: Record<TimeOfDay | 'anytime', string[]> = {
  morning: [
    'I hope you slept well.',
    "It's a lovely morning to take things slow.",
    'A warm cup of tea sounds nice this morning.'
  ],
  afternoon: [
    'What a nice afternoon.',
    'I just did a little stretch. It felt good!',
    'A glass of water is a nice idea this afternoon.'
  ],
  evening: ["It's been a nice day.", 'The evening is a cozy time to rest.'],
  night: [],
  anytime: [
    "I'm right here if you need me.",
    "Tap on me if you'd like to chat.",
    'I like keeping you company.',
    "You're doing great today."
  ]
}

const WEATHER_REMARKS: Record<WeatherCategory, string[]> = {
  clear: ['It looks sunny outside today.'],
  cloudy: ["It's a bit cloudy outside today."],
  fog: ["It's a little foggy outside."],
  rain: ["It looks rainy outside. A good day to stay cozy."],
  snow: ["There's snow outside. It's nice and warm in here!"],
  storm: ["It's stormy outside, but we're safe and cozy in here."]
}

const FAREWELLS = ['Talk to you soon!', "I'll be right here.", 'That was nice. Bye for now!']

function pick<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!
}

export function greetingFor(hour: number, random: () => number): string {
  return pick(GREETINGS[timeOfDay(hour)], random)
}

export function farewellLine(random: () => number): string {
  return pick(FAREWELLS, random)
}

/** Avoids the last few lines he said, so the same one never comes twice in a row. */
export function pickRemark(opts: {
  hour: number
  weather: RemarkWeather | null
  recent: string[]
  random: () => number
}): string {
  const pool = [...REMARKS[timeOfDay(opts.hour)], ...REMARKS.anytime]
  if (opts.weather) {
    pool.push(...WEATHER_REMARKS[opts.weather.category])
    pool.push(`It's ${Math.round(opts.weather.temp)} degrees outside right now.`)
  }
  const fresh = pool.filter((line) => !opts.recent.includes(line))
  return pick(fresh.length > 0 ? fresh : pool, opts.random)
}
