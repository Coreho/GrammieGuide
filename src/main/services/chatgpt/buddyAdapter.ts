import type Anthropic from '@anthropic-ai/sdk'
import { BUDDY_SYSTEM_PROMPT } from '../ai/buddyPrompt'
import { BUDDY_ACTION_TOOLS } from '../ai/buddyActions'
import { getChatGptSession } from './runtime'
import type { PlanCompletion } from './transport'

export function chatGptBuddyReply(
  model: string,
  messages: Anthropic.MessageParam[]
): Promise<PlanCompletion> {
  // The same four narrow actions go through the existing main-process resolver.
  // No browser, shell, external URL, or general-purpose tool is exposed.
  const tools = [
    {
      type: 'namespace',
      name: 'buddy',
      description: 'Approved GrammieGuide actions.',
      tools: BUDDY_ACTION_TOOLS.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: { ...tool.input_schema, required: tool.input_schema.required ?? [] },
        strict: true
      }))
    }
  ]
  return getChatGptSession().complete(
    model,
    BUDDY_SYSTEM_PROMPT,
    messages.map((message) => {
      if (typeof message.content !== 'string')
        throw new Error('Only sanitized text history is supported.')
      return { role: message.role, content: message.content }
    }),
    tools
  )
}
