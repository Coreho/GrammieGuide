import { describe, expect, it } from 'vitest'
import {
  buddyActionSchema,
  explicitBuddyAction,
  actionFromTool
} from '../../src/shared/buddy/actions'

describe('Buddy’s fixed action boundary', () => {
  it.each(['playMusic', 'showPhotos', 'goHome'])('accepts only the fixed action %s', (action) => {
    expect(buddyActionSchema.safeParse(action).success).toBe(true)
  })
  it.each(['callFamily', 'openUrl', { action: 'playMusic', url: 'https://evil.test' }, null])(
    'rejects arbitrary actions %j',
    (action) => {
      expect(buddyActionSchema.safeParse(action).success).toBe(false)
    }
  )
  it.each([
    ['Please play my music.', 'playMusic'],
    ['Can you show my pictures?', 'showPhotos'],
    ['go home', 'goHome'],
    ['Play some music', 'playMusic'],
    ['show me my photos', 'showPhotos']
  ])('recognizes the explicit request %s', (text, action) => {
    expect(explicitBuddyAction(text)).toBe(action)
  })
  it.each([
    'Do not play my music',
    'I used to play my music',
    'go home and delete files',
    'Tell me about music',
    'play music at https://evil.test'
  ])('does not execute a mention or compound request: %s', (text) => {
    expect(explicitBuddyAction(text)).toBeNull()
  })
  it('validates model tool names and their empty input independently of text', () => {
    expect(actionFromTool('play_my_music', {})).toBe('playMusic')
    expect(actionFromTool('show_my_pictures', {})).toBe('showPhotos')
    expect(actionFromTool('go_home', {})).toBe('goHome')
    expect(actionFromTool('open_url', {})).toBeNull()
    expect(actionFromTool('play_my_music', { url: 'https://evil.test' })).toBeNull()
    expect(actionFromTool('play_my_music', [])).toBeNull()
  })
})
