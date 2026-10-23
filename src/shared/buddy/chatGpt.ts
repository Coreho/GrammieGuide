export type ChatGptModel = { id: string; label: string }
/** Deliberately contains no credentials, authorization URL, or chat content. */
export type ChatGptState = {
  pending: boolean
  profiles: { id: string; label: string; connected: boolean }[]
  activeId?: string
  models: ChatGptModel[]
  verifiedModel?: string
  needsWelcome: boolean
  message: string
}
