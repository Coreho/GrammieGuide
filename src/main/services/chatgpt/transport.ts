import { z } from 'zod'
import type { ChatGptModel } from '@shared/buddy/chatGpt'

export class PlanError extends Error {
  constructor(public code: string) {
    super('ChatGPT request failed')
  }
}
const safeCodes = new Set([
  'subscription_sharing_user_not_eligible',
  'subscription_sharing_usage_limit_exceeded',
  'subscription_sharing_usage_unavailable',
  'subscription_sharing_unsupported_capability'
])
export function errorCode(value: unknown, fallback = 'unavailable'): string {
  if (
    value &&
    typeof value === 'object' &&
    'error' in value &&
    ['invalid_grant', 'invalid_token', 'invalid_client'].includes(String(value.error))
  )
    return 'unauthorized'
  const parsed = z
    .object({
      code: z.string().optional(),
      error: z.object({ code: z.string().optional() }).optional()
    })
    .safeParse(value)
  const code = parsed.success ? (parsed.data.error?.code ?? parsed.data.code) : undefined
  return code && safeCodes.has(code) ? code : fallback
}
export function planErrorMessage(error: unknown): string {
  const code = error instanceof PlanError ? error.code : ''
  if (code === 'subscription_sharing_usage_limit_exceeded')
    return 'ChatGPT usage limit reached. Open Manage usage to review your plan or app limit.'
  if (code === 'subscription_sharing_user_not_eligible')
    return 'This ChatGPT account is not eligible for plan usage in this app.'
  if (code === 'subscription_sharing_unsupported_capability')
    return 'ChatGPT rejected a request capability. Update GrammieGuide before trying again.'
  if (code === 'unauthorized') return 'ChatGPT needs you to sign in again.'
  if (code === 'forbidden')
    return 'ChatGPT did not permit this request. Check account eligibility and usage settings.'
  if (code === 'permission')
    return 'Signed in, but ChatGPT plan usage was not granted. Continue with ChatGPT to authorize plan usage.'
  return 'ChatGPT could not complete the request. Try again later.'
}
export async function readBounded(response: Response, limit = 2_000_000): Promise<string> {
  if (!response.body) throw new PlanError('unavailable')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = '',
    size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) return text + decoder.decode()
      size += next.value.byteLength
      if (size > limit) throw new PlanError('unavailable')
      text += decoder.decode(next.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
export async function checkedJson(response: Response): Promise<unknown> {
  const value: unknown = JSON.parse(await readBounded(response))
  if (!response.ok)
    throw new PlanError(
      errorCode(
        value,
        response.status === 401
          ? 'unauthorized'
          : response.status === 403
            ? 'forbidden'
            : 'unavailable'
      )
    )
  return value
}
export function catalog(value: unknown): ChatGptModel[] {
  const result = z
    .object({
      models: z.array(
        z.object({
          slug: z.string().min(1).max(200),
          display_name: z.string().max(200),
          visibility: z.string()
        })
      )
    })
    .parse(value)
  return result.models
    .filter((model) => model.visibility === 'list')
    .map((model) => ({ id: model.slug, label: model.display_name }))
}

const outputSchema = z.object({
  status: z.literal('completed'),
  output: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('message'),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() }))
      }),
      z.object({
        type: z.literal('function_call'),
        name: z.string(),
        arguments: z.string(),
        namespace: z.string().optional()
      }),
      z.object({ type: z.literal('reasoning') })
    ])
  )
})
export type PlanCompletion = {
  text: string
  tools: { name: string; input: unknown }[]
  refused: boolean
}

/** Deltas are provisional. Only the completed event's output may reach Buddy. */
export async function completedResponse(response: Response): Promise<PlanCompletion> {
  if (!response.ok) {
    await checkedJson(response)
    throw new PlanError('unavailable')
  }
  // A bounded read also handles arbitrary UTF-8 / SSE chunk boundaries without
  // ever releasing partial claims or actions to the renderer.
  const stream = await readBounded(response)
  let completed: unknown
  const finishedItems = new Map<number, unknown>()
  for (const frame of stream.replace(/\r\n/g, '\n').split('\n\n')) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data || data === '[DONE]') continue
    const event = JSON.parse(data)
    if (event.type === 'response.output_item.done') {
      if (
        completed ||
        !Number.isInteger(event.output_index) ||
        event.output_index < 0 ||
        finishedItems.has(event.output_index)
      )
        throw new PlanError('unavailable')
      finishedItems.set(event.output_index, event.item)
    }
    if (event.type === 'response.failed') throw new PlanError(errorCode(event.response?.error))
    if (event.type === 'error' || event.type === 'response.incomplete')
      throw new PlanError(errorCode(event))
    if (event.type === 'response.completed') {
      if (completed) throw new PlanError('unavailable')
      completed = event.response
    }
  }
  const value = outputSchema.parse(completed)
  // Some live plan streams omit output from the terminal response. Done items
  // carry the canonical content, but remain provisional until response.completed.
  if (!value.output.length && finishedItems.size) {
    const ordered = [...finishedItems].sort(([a], [b]) => a - b)
    if (ordered.some(([index], expected) => index !== expected)) throw new PlanError('unavailable')
    value.output = outputSchema.shape.output.parse(ordered.map(([, item]) => item))
  }
  const result: PlanCompletion = { text: '', tools: [], refused: false }
  for (const item of value.output) {
    if (item.type === 'message')
      for (const part of item.content) {
        if (part.type === 'refusal') result.refused = true
        else if (part.type === 'output_text') result.text += part.text ?? ''
      }
    if (item.type === 'function_call') {
      if (item.namespace !== 'buddy') throw new PlanError('unavailable')
      result.tools.push({ name: item.name, input: JSON.parse(item.arguments) })
    }
  }
  result.text = result.text.trim()
  return result
}
