import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUDDY_SYSTEM_PROMPT } from '../../src/main/services/ai/buddyPrompt'

describe('BUDDY_SYSTEM_PROMPT', () => {
  it('validates feelings without arguing or confirming confused statements', () => {
    expect(BUDDY_SYSTEM_PROMPT).toContain(
      'If she says something that is confused or not true, do not correct or argue.'
    )
    expect(BUDDY_SYSTEM_PROMPT).toContain('Respond kindly to the feeling behind it.')
    expect(BUDDY_SYSTEM_PROMPT).toContain('Never confirm a false or confused statement as true.')
    expect(BUDDY_SYSTEM_PROMPT).not.toContain('go along with the conversation')
  })

  it('forbids invented facts about people and plans', () => {
    expect(BUDDY_SYSTEM_PROMPT).toContain(
      'Never invent facts about her family or other people, or about plans, visits or appointments.'
    )
  })

  it('responds warmly to unknown plans or people without guessing', () => {
    expect(BUDDY_SYSTEM_PROMPT).toContain(
      'If she asks about plans or people you have no information about, answer warmly without guessing.'
    )
    expect(BUDDY_SYSTEM_PROMPT).toContain(
      'You can say, "I am not sure, but you could ask your family."'
    )
  })

  it('keeps the rule against pretending or promising actions Buddy cannot take', () => {
    expect(BUDDY_SYSTEM_PROMPT).toContain(
      'Never pretend to be a real person, and never promise to do things you cannot do, like call someone, send a message or come over.'
    )
  })

  it('stays a single constant string without interpolation or template placeholders', () => {
    expect(typeof BUDDY_SYSTEM_PROMPT).toBe('string')
    expect(BUDDY_SYSTEM_PROMPT.length).toBeGreaterThan(0)
    expect(BUDDY_SYSTEM_PROMPT).not.toMatch(/\$\{|\{\{[\s\S]*?\}\}/)

    // Check the source too: interpolation disappears from the string at runtime.
    const source = readFileSync(
      new URL('../../src/main/services/ai/buddyPrompt.ts', import.meta.url),
      'utf8'
    )
    expect(source).toMatch(
      /^\s*(?:\/\*[\s\S]*?\*\/\s*)?export const BUDDY_SYSTEM_PROMPT = `[^`]*`\s*;?\s*$/
    )
    expect(source).not.toContain('${')
  })
})
