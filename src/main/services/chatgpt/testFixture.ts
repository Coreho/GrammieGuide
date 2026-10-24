import { ChatGptSession } from './session'
import type { CredentialStore } from './credentials'

/** Explicit built-app fixture. Never enabled by a saved config or renderer. */
export function createChatGptFixture(store: CredentialStore): {
  session: ChatGptSession
  completeAuthorization: () => Promise<void>
  fail: (enabled: boolean) => void
  request: () => unknown
} {
  let authorization: string | undefined
  let failure = false
  let lastRequest: unknown
  const session = new ChatGptSession({
    store,
    open: async (url) => {
      authorization = url
    },
    verify: async () => ({
      iss: 'https://auth.openai.com',
      sub: 'fixture-account',
      email: 'fixture@example.invalid'
    }),
    fetch: async (url, init) => {
      if (String(url).endsWith('/token'))
        return Response.json({
          access_token: 'fixture-access',
          refresh_token: 'fixture-refresh',
          id_token: 'fixture-id',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
        })
      if (String(url).endsWith('/models'))
        return Response.json({
          models: [{ slug: 'fixture-model', display_name: 'Fixture model', visibility: 'list' }]
        })
      if (String(url).endsWith('/revoke')) return new Response('', { status: 200 })
      if (!String(url).endsWith('/responses')) throw new Error('Unexpected fixture endpoint')
      lastRequest = JSON.parse(String(init?.body))
      if (failure)
        return new Response(
          `data: ${JSON.stringify({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } })}\n\n`
        )
      const item = {
        type: 'message',
        content: [{ type: 'output_text', text: 'Hello from Buddy.' }]
      }
      return new Response(
        `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item })}\n\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [] } })}\n\n`
      )
    }
  })
  return {
    session,
    request: () => lastRequest,
    fail: (enabled) => {
      failure = enabled
    },
    completeAuthorization: async () => {
      if (!authorization) throw new Error('No pending fixture authorization')
      const auth = new URL(authorization)
      authorization = undefined
      const callback = new URL(auth.searchParams.get('redirect_uri')!)
      callback.search = new URLSearchParams({
        code: 'fixture-code',
        state: auth.searchParams.get('state')!,
        client_id:
          auth.searchParams.get('client_id') === 'dynamic_agent_client'
            ? 'oaiapp_fixture'
            : auth.searchParams.get('client_id')!
      }).toString()
      await fetch(callback)
    }
  }
}
