import { z } from 'zod'

export const whatsAppCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('start'),
      contactId: z.enum(['preferred', 'fallback']),
      mode: z.enum(['voice', 'video'])
    })
    .strict(),
  ...(['answer', 'decline', 'end'] as const).map((type) =>
    z.object({ type: z.literal(type), callId: z.string().min(1).max(100) }).strict()
  )
])

export type WhatsAppCommand = z.infer<typeof whatsAppCommandSchema>
export type WhatsAppAction = 'voice' | 'video' | 'answer' | 'decline' | 'end'
export type WhatsAppConnection = 'unavailable' | 'not-linked' | 'ready' | 'disconnected'
export const whatsAppVideoBoundsSchema = z
  .object({
    x: z.number().int().nonnegative().max(16384),
    y: z.number().int().nonnegative().max(16384),
    width: z.number().int().min(1).max(16384),
    height: z.number().int().min(1).max(16384)
  })
  .strict()
  .nullable()
export type WhatsAppVideoBounds = z.infer<typeof whatsAppVideoBoundsSchema>
export interface WhatsAppSetupState {
  open: boolean
  phase: 'closed' | 'loading' | 'link-required' | 'linked' | 'unavailable'
}
export type WhatsAppPhase =
  'starting' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ending' | 'unknown'
export interface WhatsAppContact {
  id: 'preferred' | 'fallback'
  name: string
  photoId?: string
}
export interface WhatsAppCallState {
  connection: WhatsAppConnection
  /** These are saved display identities only; phone numbers stay in main. */
  contacts: WhatsAppContact[]
  call: {
    /** Local opaque ID. Never the provider's call ID. */
    id: string
    contact: WhatsAppContact | null
    mode: 'voice' | 'video'
    phase: WhatsAppPhase
  } | null
  pending: WhatsAppCommand['type'] | null
  availableActions: WhatsAppAction[]
}
export type WhatsAppCommandResult = {
  /** Acknowledges the control operation; inspect state for the observed call outcome. */
  ok: boolean
  problem?:
    'invalid-command' | 'unavailable' | 'busy' | 'not-allowed' | 'stale-call' | 'unconfirmed'
  state: WhatsAppCallState
}
