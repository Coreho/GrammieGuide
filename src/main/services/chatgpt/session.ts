import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import { z } from 'zod'
import type { ChatGptState, ChatGptModel } from '@shared/buddy/chatGpt'
import { CredentialStore, type ChatGptCredentials, type ChatGptProfile } from './credentials'
import { ISSUER, RESOURCE, TOKEN_ENDPOINT, startOAuth, type OAuthAttempt } from './oauth'
import {
  catalog,
  checkedJson,
  completedResponse,
  readBounded,
  PlanError,
  planErrorMessage,
  type PlanCompletion
} from './transport'

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().positive().max(86400),
  scope: z.string(),
  earliest_refresh_at: z.union([z.string(), z.number()]).optional()
})
const keys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), {
  timeoutDuration: 10000
})
export async function verifyIdentity(
  token: string,
  clientId: string,
  nonce?: string,
  verificationKey: JWTVerifyGetKey = keys
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, verificationKey, {
    issuer: ISSUER,
    audience: clientId,
    requiredClaims: ['sub', 'exp', ...(nonce ? ['nonce'] : [])]
  })
  if (!payload.sub || (nonce && payload.nonce !== nonce)) throw new PlanError('unauthorized')
  return payload
}
type SessionOptions = {
  store: Pick<CredentialStore, 'load' | 'save'>
  open: (url: string) => Promise<void>
  fetch?: typeof fetch
  verify?: typeof verifyIdentity
  oauth?: typeof startOAuth
}

/** Owns all credentials. Only state() returns renderer-visible data. */
export class ChatGptSession {
  private data: ChatGptCredentials
  private pending?: OAuthAttempt
  private loginGeneration = 0
  private generation = 0
  private models = new Map<string, ChatGptModel[]>()
  private refreshes = new Map<string, Promise<void>>()
  private controllers = new Set<AbortController>()
  private message = 'Connect your ChatGPT account, then test a completed reply.'
  private poisoned = false
  private signingOut = false
  private planPaused = false
  constructor(private options: SessionOptions) {
    this.data = options.store.load()
  }
  state(): ChatGptState {
    const active = this.active()
    return {
      pending: Boolean(this.pending),
      profiles: this.data.profiles.map((p) => ({
        id: p.clientId,
        label: p.email ?? (p.subject ? 'ChatGPT account' : 'Incomplete registration'),
        connected: Boolean(p.refresh)
      })),
      activeId: this.data.activeId,
      models: this.models.get(this.data.activeId ?? '') ?? [],
      verifiedModel:
        !this.planPaused && !this.poisoned && active?.refresh ? active.verifiedModel : undefined,
      needsWelcome: Boolean(active?.access && this.allowed(active) && !active.welcomed),
      message: this.message
    }
  }
  private active(): ChatGptProfile | undefined {
    return this.data.profiles.find((p) => p.clientId === this.data.activeId)
  }
  private save(next: ChatGptCredentials): void {
    // A failed rotating-token write must never leave an old refresh token usable.
    try {
      this.options.store.save(next)
      this.data = next
    } catch {
      this.poisoned = true
      throw new PlanError('unavailable')
    }
  }
  private allowed(profile: ChatGptProfile): boolean {
    return (
      profile.scopes.includes('chatgpt.tokens.use.direct') &&
      profile.scopes.includes('resource.invoke')
    )
  }
  private async request(url: string, init: RequestInit): Promise<Response> {
    if (this.poisoned) throw new PlanError('unavailable')
    const controller = new AbortController()
    this.controllers.add(controller)
    // Keep the timeout alive through body consumption, not merely until headers.
    const timeout = setTimeout(() => controller.abort(), 30_000)
    timeout.unref()
    try {
      const result = await (this.options.fetch ?? fetch)(url, {
        ...init,
        redirect: 'error',
        signal: controller.signal
      })
      // Bound the entire body before handing it to JSON/SSE consumers.
      const body = await readBounded(result)
      return new Response(body, { status: result.status, headers: result.headers })
    } finally {
      clearTimeout(timeout)
      this.controllers.delete(controller)
    }
  }
  cancelLogin(): void {
    ++this.loginGeneration
    this.pending?.cancel()
    this.pending = undefined
    this.message = 'Sign-in cancelled. Your existing ChatGPT connection is unchanged.'
  }
  async connect(clientId?: string): Promise<ChatGptState> {
    if (this.signingOut) throw new PlanError('unavailable')
    this.cancelLogin()
    const selected = clientId ? this.data.profiles.find((p) => p.clientId === clientId) : undefined
    if (clientId && !selected) throw new Error('Choose a saved account or add a new one.')
    const generation = this.loginGeneration
    const attempt = await (this.options.oauth ?? startOAuth)(this.data.hostId, clientId)
    if (generation !== this.loginGeneration) {
      attempt.cancel()
      return this.state()
    }
    this.pending = attempt
    this.message =
      'Complete sign-in in your browser, then test a reply before choosing a model for Buddy.'
    void this.finishSignIn(attempt, generation, selected)
    try {
      await this.options.open(attempt.url)
    } catch {
      this.cancelLogin()
      this.message = 'Could not open the browser. Try Continue with ChatGPT again.'
    }
    return this.state()
  }
  private async finishSignIn(
    attempt: OAuthAttempt,
    generation: number,
    selected?: ChatGptProfile
  ): Promise<void> {
    try {
      const callback = await attempt.result
      if (generation !== this.loginGeneration) return
      // Retain a newly issued registration before exchanging its single-use code.
      if (!selected) {
        if (this.data.profiles.some((p) => p.clientId === callback.clientId))
          throw new PlanError('unauthorized')
        this.save({
          ...this.data,
          profiles: [
            ...this.data.profiles,
            { clientId: callback.clientId, scopes: [], welcomed: false }
          ]
        })
      }
      const value = tokensSchema.parse(
        await checkedJson(
          await this.request(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: callback.clientId,
              code: callback.code,
              code_verifier: attempt.verifier,
              redirect_uri: attempt.redirectUri,
              resource: RESOURCE
            }).toString()
          })
        )
      )
      if (!value.id_token || !value.refresh_token) throw new PlanError('unauthorized')
      const identity = await (this.options.verify ?? verifyIdentity)(
        value.id_token,
        callback.clientId,
        attempt.nonce
      )
      if (generation !== this.loginGeneration) return
      if (
        selected?.subject &&
        (identity.sub !== selected.subject || identity.iss !== selected.issuer)
      )
        throw new PlanError('unauthorized')
      const profile: ChatGptProfile = {
        clientId: callback.clientId,
        issuer: identity.iss,
        subject: identity.sub,
        email: typeof identity.email === 'string' ? identity.email : undefined,
        access: value.access_token,
        refresh: value.refresh_token,
        idToken: value.id_token,
        expires: Date.now() + value.expires_in * 1000,
        scopes: value.scope.split(/\s+/),
        welcomed: selected?.welcomed ?? false
      }
      this.invalidate()
      this.planPaused = false
      this.save({
        ...this.data,
        activeId: profile.clientId,
        profiles: this.data.profiles.map((p) => (p.clientId === profile.clientId ? profile : p))
      })
      this.models.delete(profile.clientId)
      this.message = this.allowed(profile)
        ? 'Signed in. Load models and test a completed reply before choosing ChatGPT for Buddy.'
        : planErrorMessage(new PlanError('permission'))
    } catch (error) {
      if (generation === this.loginGeneration) this.message = planErrorMessage(error)
    } finally {
      if (generation === this.loginGeneration) this.pending = undefined
    }
  }
  private invalidate(): void {
    ++this.generation
    for (const controller of this.controllers) controller.abort()
  }
  select(id: string): ChatGptState {
    if (this.signingOut) throw new PlanError('unavailable')
    if (!this.data.profiles.some((p) => p.clientId === id))
      throw new Error('Choose a saved ChatGPT account.')
    this.cancelLogin()
    this.invalidate()
    this.save({ ...this.data, activeId: id })
    this.planPaused = false
    this.message = 'Account selected. Load models to check its current choices.'
    return this.state()
  }
  private async access(profile: ChatGptProfile): Promise<string> {
    if (!profile.access || !profile.refresh) throw new PlanError('unauthorized')
    if (!this.allowed(profile)) throw new PlanError('permission')
    if ((profile.expires ?? 0) > Date.now() + 60_000) return profile.access
    let pending = this.refreshes.get(profile.clientId)
    if (!pending) {
      const generation = this.generation
      pending = (async (): Promise<void> => {
        const value = tokensSchema.parse(
          await checkedJson(
            await this.request(TOKEN_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: profile.clientId,
                refresh_token: profile.refresh!,
                resource: RESOURCE
              }).toString()
            })
          )
        )
        if (value.id_token) {
          const identity = await (this.options.verify ?? verifyIdentity)(
            value.id_token,
            profile.clientId
          )
          if (identity.sub !== profile.subject || identity.iss !== profile.issuer)
            throw new PlanError('unauthorized')
        }
        // The server retired the old refresh token when it answered, so keep the new
        // one even after an account switch, or that account would need reconnecting.
        // Only a sign-out or a newer sign-in outranks it, and those change what's stored.
        const stored = this.data.profiles.find((p) => p.clientId === profile.clientId)
        if (stored && !this.signingOut && stored.refresh === profile.refresh) {
          const updated = {
            ...stored,
            access: value.access_token,
            refresh: value.refresh_token ?? stored.refresh,
            idToken: value.id_token ?? stored.idToken,
            expires: Date.now() + value.expires_in * 1000,
            scopes: value.scope.split(/\s+/)
          }
          this.save({
            ...this.data,
            profiles: this.data.profiles.map((p) => (p.clientId === profile.clientId ? updated : p))
          })
        }
        if (generation !== this.generation) throw new PlanError('unavailable')
      })().finally(() => {
        this.refreshes.delete(profile.clientId)
      })
      this.refreshes.set(profile.clientId, pending)
    }
    await pending
    const refreshed = this.data.profiles.find((p) => p.clientId === profile.clientId)!
    if (!this.allowed(refreshed)) throw new PlanError('permission')
    return refreshed.access!
  }
  private async authorized(path: string, init: RequestInit = {}): Promise<Response> {
    if (this.signingOut) throw new PlanError('unavailable')
    const profile = this.active()
    if (!profile) throw new PlanError('unauthorized')
    const generation = this.generation
    const access = await this.access(profile)
    if (generation !== this.generation) throw new PlanError('unavailable')
    const response = await this.request(`${RESOURCE}/${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${access}` }
    })
    if (generation !== this.generation) throw new PlanError('unavailable')
    return response
  }
  async loadModels(): Promise<ChatGptState> {
    try {
      const generation = this.generation,
        id = this.data.activeId
      const choices = catalog(await checkedJson(await this.authorized('models')))
      if (generation !== this.generation || !id) return this.state()
      this.models.set(id, choices)
      this.message = choices.length
        ? 'Choose a model and test a reply. A model list alone does not confirm plan access.'
        : 'No visible models are available for this account.'
    } catch (error) {
      this.message = planErrorMessage(error)
    }
    return this.state()
  }
  async complete(
    model: string,
    instructions: string,
    input: { role: string; content: string }[],
    tools?: unknown[],
    proof = false
  ): Promise<PlanCompletion> {
    try {
      if (this.planPaused && !proof)
        throw new PlanError('subscription_sharing_usage_limit_exceeded')
      const generation = this.generation
      if (!this.models.has(this.data.activeId ?? '')) await this.loadModels()
      if (
        generation !== this.generation ||
        !this.models.get(this.data.activeId ?? '')?.some((m) => m.id === model) ||
        (!proof && this.active()?.verifiedModel !== model)
      )
        throw new PlanError('unavailable')
      const result = await completedResponse(
        await this.authorized('responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            instructions,
            input,
            store: false,
            stream: true,
            ...(tools ? { tools, parallel_tool_calls: false } : {})
          })
        })
      )
      if (generation !== this.generation) throw new PlanError('unavailable')
      return result
    } catch (error) {
      if (error instanceof PlanError && error.code === 'subscription_sharing_usage_limit_exceeded')
        this.planPaused = true
      this.message = planErrorMessage(error)
      throw error
    }
  }
  async test(model: string): Promise<ChatGptState> {
    const generation = this.generation
    try {
      const result = await this.complete(
        model,
        'Reply with the requested short text.',
        [{ role: 'user', content: 'Say exactly: Hello from Buddy.' }],
        undefined,
        true
      )
      if (!result.text || result.refused || result.tools.length || generation !== this.generation)
        throw new PlanError('unavailable')
      this.save({
        ...this.data,
        profiles: this.data.profiles.map((p) =>
          p.clientId === this.data.activeId ? { ...p, verifiedModel: model } : p
        )
      })
      this.planPaused = false
      this.message = 'Completed reply verified. You can now use this model for Buddy.'
    } catch (error) {
      this.message = planErrorMessage(error)
    }
    return this.state()
  }
  welcome(): ChatGptState {
    this.save({
      ...this.data,
      profiles: this.data.profiles.map((p) =>
        p.clientId === this.data.activeId ? { ...p, welcomed: true } : p
      )
    })
    return this.state()
  }
  async signOut(): Promise<ChatGptState> {
    if (this.signingOut) throw new PlanError('unavailable')
    this.cancelLogin()
    this.invalidate()
    const profile = this.active()
    if (!profile) return this.state()
    this.signingOut = true
    let revoked = false
    if (profile.refresh)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await this.request(`${ISSUER}/api/accounts/oauth/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              token: profile.refresh,
              token_type_hint: 'refresh_token',
              client_id: profile.clientId
            }).toString()
          })
          revoked = response.status === 200
          if (revoked || response.status < 500) break
        } catch {
          /* Local sign-out remains possible while offline; report unconfirmed revocation. */
        }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250))
      }
    const cleared: ChatGptProfile = {
      clientId: profile.clientId,
      issuer: profile.issuer,
      subject: profile.subject,
      email: profile.email,
      scopes: [],
      welcomed: profile.welcomed
    }
    try {
      this.invalidate()
      this.save({
        ...this.data,
        profiles: this.data.profiles.map((p) => (p.clientId === profile.clientId ? cleared : p))
      })
    } finally {
      this.signingOut = false
    }
    this.models.delete(profile.clientId)
    this.message = revoked
      ? 'Signed out and ChatGPT authorization revoked.'
      : 'Signed out locally. Revocation could not be confirmed; review this app in Manage usage.'
    return this.state()
  }
}
