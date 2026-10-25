import { z } from 'zod'

export const providerCallStateSchema = z
  .object({
    /** Monotonic across every observation from this adapter instance, including command replies. */
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    connection: z.enum(['unavailable', 'not-linked', 'ready', 'disconnected']),
    /** Set by main only after destroying the local call renderer. */
    localSessionClosed: z.boolean().optional(),
    capabilities: z
      .object({
        voice: z.boolean(),
        video: z.boolean(),
        answer: z.boolean(),
        decline: z.boolean(),
        end: z.boolean()
      })
      .strict(),
    /** null means positively observed idle, never "could not inspect the call". */
    call: z
      .object({
        id: z.string().min(1).max(256),
        phone: z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/)
          .nullable(),
        mode: z.enum(['voice', 'video']),
        phase: z.enum(['outgoing', 'incoming', 'connecting', 'connected', 'ending'])
      })
      .strict()
      .nullable()
  })
  .strict()
  .refine((state) => state.connection === 'ready' || state.call === null)

export type ProviderCallState = z.infer<typeof providerCallStateSchema>
export type ProviderCallCommand =
  | { type: 'start'; phone: string; mode: 'voice' | 'video' }
  | { type: 'answer' | 'decline' | 'end'; callId: string }

/**
 * Main-process transport boundary derived from REA's activation, EndCall and call-state findings.
 * Implementations must control a session hosted INSIDE GrammieGuide. A URI launch into the
 * Windows app cannot implement this contract: acceptance says nothing about call state or hang-up.
 * Never import WhatsApp's private DLLs into the kiosk or pass its session material through IPC.
 */
export interface WhatsAppAdapter {
  readonly location: 'embedded'
  read(signal: AbortSignal): Promise<unknown>
  /** Resolve only with a newer observed snapshot; a click/URI acknowledgement is insufficient. */
  execute(command: ProviderCallCommand, signal: AbortSignal): Promise<unknown>
  /** Notify that read() can obtain a new snapshot; no provider data goes directly to a renderer. */
  subscribe(changed: () => void): () => void
}

/** Static REA establishes internal methods, not a callable in-app transport. Fail closed. */
export function unverifiedWhatsAppAdapter(): WhatsAppAdapter {
  return {
    location: 'embedded',
    read: async (): Promise<ProviderCallState> => ({
      revision: 0,
      connection: 'unavailable',
      capabilities: { voice: false, video: false, answer: false, decline: false, end: false },
      call: null
    }),
    execute: async () => {
      throw new Error('Embedded WhatsApp transport is not verified')
    },
    subscribe: () => () => {}
  }
}
