import { z } from 'zod'
import type { AudioDecision } from './audioPolicy'

export const audioEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('musicPlay') }),
  z.object({ type: z.literal('musicPause') }),
  z.object({ type: z.literal('musicStop') }),
  z.object({
    type: z.literal('start'),
    id: z.string().uuid(),
    source: z.enum(['buddyVoice', 'narration', 'listening', 'chat'])
  }),
  z.object({ type: z.literal('end'), id: z.string().uuid() })
])
export type ClientAudioEvent = z.infer<typeof audioEventSchema>
export interface AudioUpdate {
  revision: number
  decision: AudioDecision
  stop: string[]
}
