export type BuddyMessage = { role: 'user' | 'assistant'; content: string }
export type BuddyCompletion = {
  text: string
  tools: { name: string; input: unknown }[]
  refused: boolean
}
