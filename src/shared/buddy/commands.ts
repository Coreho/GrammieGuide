import { z } from 'zod'

/** Shared by the command validator and both UIs; names match the baked GLB. */
export const BUDDY_CLIPS = [
  'idle_calm',
  'idle_soft',
  'look_around',
  'sway',
  'stretch',
  'wave',
  'big_wave',
  'bow',
  'listen',
  'talk',
  'talk_point',
  'agree',
  'think',
  'shrug',
  'heart',
  'cheer',
  'fist_pump',
  'motivate',
  'dance',
  'happy_jump',
  'beckon',
  'walk_casual',
  'walk',
  'run'
] as const
export type ClipName = (typeof BUDDY_CLIPS)[number]

export const buddyCommandSchema = z
  .object({
    walk: z.boolean().optional(),
    clip: z.enum(BUDDY_CLIPS).optional(),
    text: z.string().trim().min(1).max(300).optional(),
    speak: z.boolean().optional()
  })
  .refine(
    (command) => command.walk || command.clip || command.text,
    'Choose a walk, gesture or message.'
  )
  .refine(
    (command) => !command.walk || (!command.clip && !command.text && !command.speak),
    'Send a walk separately from a gesture or message.'
  )
export type BuddyCommand = z.infer<typeof buddyCommandSchema>

export const quickMessageSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(300),
  clip: z.enum(BUDDY_CLIPS),
  speak: z.boolean()
})
