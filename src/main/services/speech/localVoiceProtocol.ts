/** Messages between localVoice.ts (main) and localVoiceWorker.ts (its utility process). */
export type VoiceWorkerRequest = { id: number; text: string; voice: string; speed: number }

export type VoiceWorkerReply =
  /** The model has loaded; lines are synthesized from now on. */
  | { type: 'ready' }
  /** The model could not load (missing or damaged files): it won't on a retry either. */
  | { type: 'failed' }
  | { type: 'audio'; id: number; wav: Uint8Array }
  | { type: 'error'; id: number }
