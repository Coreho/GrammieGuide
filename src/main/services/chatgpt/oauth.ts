import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

export const ISSUER = 'https://auth.openai.com'
export const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`
export const RESOURCE = 'https://api.openai.com/v1'
export type OAuthCallback = { code: string; clientId: string }
export type OAuthAttempt = {
  url: string
  redirectUri: string
  verifier: string
  nonce: string
  result: Promise<OAuthCallback>
  cancel: () => void
}

/** Bind before opening the browser; only an exact, single-use callback can complete it. */
export async function startOAuth(hostId: string, clientId?: string): Promise<OAuthAttempt> {
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  let resolve!: (value: OAuthCallback) => void
  let reject!: (error: Error) => void
  const result = new Promise<OAuthCallback>((yes, no) => {
    resolve = yes
    reject = no
  })
  // The consumer attaches its handler after listener setup; cancellation may race that setup.
  void result.catch(() => {})
  let settled = false
  let redirectUri = ''
  const finish = (error?: Error, value?: OAuthCallback): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    server.close()
    if (error) reject(error)
    else resolve(value!)
  }
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    const invalid = (): void => {
      res.writeHead(400)
      res.end('Invalid sign-in callback.')
    }
    if (
      settled ||
      req.method !== 'GET' ||
      !req.url ||
      req.url.length > 8192 ||
      req.headers.host !== new URL(redirectUri).host ||
      req.headers.origin
    )
      return invalid()
    const url = new URL(req.url, redirectUri)
    if (url.pathname !== '/auth/callback' || url.origin !== new URL(redirectUri).origin)
      return invalid()
    const params = url.searchParams
    if (['state', 'code', 'client_id', 'error'].some((key) => params.getAll(key).length > 1))
      return invalid()
    const returnedState = Buffer.from(params.get('state') ?? '')
    const expectedState = Buffer.from(state)
    if (
      returnedState.length !== expectedState.length ||
      !timingSafeEqual(returnedState, expectedState)
    )
      return invalid()
    if (params.has('error')) {
      res.end('Sign-in was not completed. Return to GrammieGuide.')
      finish(new Error('Sign-in was declined or cancelled.'))
      return
    }
    const issued = params.get('client_id') ?? clientId
    const code = params.get('code')
    if (
      !code ||
      !issued ||
      !/^oaiapp_[A-Za-z0-9_-]+$/.test(issued) ||
      (clientId && issued !== clientId)
    )
      return invalid()
    res.end('Sign-in received. Return to GrammieGuide to finish checking your connection.')
    finish(undefined, { code, clientId: issued })
  })
  const timer = setTimeout(() => finish(new Error('Sign-in timed out. Try again.')), 180_000)
  timer.unref()
  try {
    await new Promise<void>((yes, no) => {
      server.once('error', no)
      server.listen(0, '127.0.0.1', yes)
    })
  } catch {
    clearTimeout(timer)
    throw new Error('Could not open the local sign-in callback.')
  }
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No local sign-in callback.')
  redirectUri = `http://127.0.0.1:${address.port}/auth/callback`
  const params = new URLSearchParams({
    client_id: clientId ?? 'dynamic_agent_client',
    ext_agent_host_id: hostId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url')
  })
  if (!clientId) params.set('agent_name_hint', 'GrammieGuide')
  return {
    url: `${ISSUER}/api/accounts/authorize?${params}`,
    redirectUri,
    verifier,
    nonce,
    result,
    cancel: () => finish(new Error('Sign-in cancelled.'))
  }
}
