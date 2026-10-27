import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { get } from 'node:http'
import {
  CredentialStore,
  type ChatGptCredentials
} from '../../src/main/services/chatgpt/credentials'
import { ISSUER, RESOURCE, startOAuth } from '../../src/main/services/chatgpt/oauth'
import { ChatGptSession, verifyIdentity } from '../../src/main/services/chatgpt/session'
import {
  catalog,
  completedResponse,
  planErrorMessage,
  PlanError
} from '../../src/main/services/chatgpt/transport'

const scopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const active: ChatGptCredentials = {
  hostId: 'urn:uuid:test',
  activeId: 'oaiapp_test',
  profiles: [
    {
      clientId: 'oaiapp_test',
      issuer: ISSUER,
      subject: 'subject-1',
      email: 'caregiver@example.invalid',
      access: 'private-access',
      refresh: 'private-refresh',
      idToken: 'private-id',
      scopes: scopes.split(' '),
      expires: Date.now() + 3600000,
      welcomed: false
    }
  ]
}
const models = {
  models: [
    { slug: 'account-model', display_name: 'Account Model', visibility: 'list' },
    { slug: 'hidden', display_name: 'Hidden', visibility: 'hidden' }
  ]
}
function event(type: string, response: unknown): string {
  return `data: ${JSON.stringify({ type, response })}\n\n`
}
function reply(text = 'Hello from Buddy.'): Response {
  return new Response(
    event('response.completed', {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text }] }]
    })
  )
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status })
}
function fixture(initial = active): {
  session: ChatGptSession
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>
  saved: () => ChatGptCredentials
} {
  let saved = structuredClone(initial)
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) => (String(url).endsWith('/models') ? json(models) : reply()))
  const session = new ChatGptSession({
    store: {
      load: () => saved,
      save: (next) => {
        saved = structuredClone(next)
      }
    },
    open: async () => {},
    fetch: fetcher,
    verify: async () => ({ iss: ISSUER, sub: 'subject-1', email: 'caregiver@example.invalid' })
  })
  return { session, fetcher, saved: () => saved }
}
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  vi.useRealTimers()
})

describe('loopback OAuth', () => {
  it('binds 127.0.0.1, sends fresh state/nonce/PKCE, and accepts only an exact single-use callback', async () => {
    const attempt = await startOAuth('urn:uuid:stable')
    cleanup.push(attempt.cancel)
    const url = new URL(attempt.url)
    expect(url.origin).toBe(ISSUER)
    expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client')
    expect(url.searchParams.get('agent_name_hint')).toBe('GrammieGuide')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).not.toBe(attempt.verifier)
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(attempt.verifier).digest('base64url')
    )
    expect(new URL(attempt.redirectUri).hostname).toBe('127.0.0.1')
    expect(new URL(attempt.redirectUri).pathname).toBe('/auth/callback')
    const callback = new URL(attempt.redirectUri)
    callback.search = new URLSearchParams({
      state: 'bad',
      code: 'once',
      client_id: 'oaiapp_new'
    }).toString()
    expect((await fetch(callback)).status).toBe(400)
    callback.searchParams.set('state', url.searchParams.get('state')!)
    callback.searchParams.append('code', 'duplicate')
    expect((await fetch(callback)).status).toBe(400)
    callback.searchParams.delete('code')
    callback.searchParams.set('code', 'once')
    const wrongHost = await new Promise<number>((resolve, reject) => {
      get(callback, { headers: { Host: 'localhost' } }, (response) => {
        response.resume()
        resolve(response.statusCode!)
      }).on('error', reject)
    })
    expect(wrongHost).toBe(400)
    expect((await fetch(callback)).status).toBe(200)
    await expect(attempt.result).resolves.toEqual({ code: 'once', clientId: 'oaiapp_new' })
  })
  it('reuses the issued client and host but rejects another registration', async () => {
    const attempt = await startOAuth('urn:uuid:stable', 'oaiapp_saved')
    cleanup.push(attempt.cancel)
    const auth = new URL(attempt.url)
    expect(auth.searchParams.has('agent_name_hint')).toBe(false)
    expect(auth.searchParams.get('ext_agent_host_id')).toBe('urn:uuid:stable')
    const callback = new URL(attempt.redirectUri)
    callback.search = new URLSearchParams({
      state: auth.searchParams.get('state')!,
      code: 'once',
      client_id: 'oaiapp_other'
    }).toString()
    expect((await fetch(callback)).status).toBe(400)
    callback.searchParams.delete('client_id')
    expect((await fetch(callback)).status).toBe(200)
    await expect(attempt.result).resolves.toEqual({ code: 'once', clientId: 'oaiapp_saved' })
  })
  it('cancels without an exchange and validates state even on denial', async () => {
    const attempt = await startOAuth('urn:uuid:stable')
    cleanup.push(attempt.cancel)
    const callback = new URL(attempt.redirectUri)
    callback.search = 'error=access_denied&state=bad'
    expect((await fetch(callback)).status).toBe(400)
    attempt.cancel()
    await expect(attempt.result).rejects.toThrow('cancelled')
  })
})

describe('identity and protected credentials', () => {
  it('verifies signature, issuer, audience, expiration and nonce', async () => {
    const pair = await generateKeyPair('RS256')
    const jwk = await exportJWK(pair.publicKey)
    const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test' }] })
    const token = async (
      issuer = ISSUER,
      audience = 'oaiapp_test',
      nonce = 'nonce',
      expiration = '5m'
    ): Promise<string> =>
      new SignJWT({ nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject('subject-1')
        .setExpirationTime(expiration)
        .sign(pair.privateKey)
    await expect(
      verifyIdentity(await token(), 'oaiapp_test', 'nonce', keys)
    ).resolves.toMatchObject({ sub: 'subject-1' })
    for (const invalid of [
      await token('https://attacker.invalid'),
      await token(ISSUER, 'oaiapp_other'),
      await token(ISSUER, 'oaiapp_test', 'wrong'),
      await token(ISSUER, 'oaiapp_test', 'nonce', '0s')
    ])
      await expect(verifyIdentity(invalid, 'oaiapp_test', 'nonce', keys)).rejects.toThrow()
    const other = await generateKeyPair('RS256')
    const forged = await new SignJWT({ nonce: 'nonce' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience('oaiapp_test')
      .setSubject('subject-1')
      .setExpirationTime('5m')
      .sign(other.privateKey)
    await expect(verifyIdentity(forged, 'oaiapp_test', 'nonce', keys)).rejects.toThrow()
  })
  it('round-trips encrypted credentials and keeps a durable host ID before registration', () => {
    const folder = mkdtempSync(join(tmpdir(), 'grammie-chatgpt-'))
    cleanup.push(() => rmSync(folder, { recursive: true, force: true }))
    const key = randomBytes(32)
    const store = new CredentialStore(join(folder, 'private.enc'), {
      encrypt: (text) => {
        const iv = randomBytes(12),
          cipher = createCipheriv('aes-256-gcm', key, iv)
        const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
        return Buffer.concat([iv, cipher.getAuthTag(), body])
      },
      decrypt: (buffer) => {
        const cipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12))
        cipher.setAuthTag(buffer.subarray(12, 28))
        return Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString('utf8')
      }
    })
    const first = store.load()
    expect(store.load().hostId).toBe(first.hostId)
    store.save(active)
    expect(store.load()).toEqual(active)
    expect(readFileSync(join(folder, 'private.enc')).includes(Buffer.from('private-refresh'))).toBe(
      false
    )
    expect(() =>
      new CredentialStore(join(folder, 'private.enc'), {
        encrypt: () => {
          throw Error('locked')
        },
        decrypt: () => {
          throw Error('locked')
        }
      }).load()
    ).toThrow('locked')
  })
})

describe('plan response boundary', () => {
  it('retains finished output items when the completed terminal event has an empty output list', async () => {
    const item = {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Hello from Buddy.' }]
    }
    const done = `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item })}\n\n`
    const terminal = event('response.completed', { status: 'completed', output: [] })
    await expect(completedResponse(new Response(done + terminal))).resolves.toMatchObject({
      text: 'Hello from Buddy.'
    })
    await expect(completedResponse(new Response(done))).rejects.toThrow()
    await expect(
      completedResponse(new Response(done + event('response.failed', {})))
    ).rejects.toThrow()
  })
  it('uses the visible account catalog in server order', () => {
    expect(catalog(models)).toEqual([{ id: 'account-model', label: 'Account Model' }])
  })
  it('requires response.completed and never releases provisional text', async () => {
    const delta = 'data: {"type":"response.output_text.delta","delta":"premature claim"}\n\n'
    await expect(completedResponse(new Response(delta))).rejects.toThrow()
    await expect(
      completedResponse(
        new Response(
          delta +
            event('response.failed', {
              error: { code: 'subscription_sharing_usage_limit_exceeded' }
            })
        )
      )
    ).rejects.toMatchObject({ code: 'subscription_sharing_usage_limit_exceeded' })
    await expect(
      completedResponse(new Response(delta + event('response.incomplete', {})))
    ).rejects.toThrow()
    await expect(completedResponse(reply('Safe completed reply'))).resolves.toEqual({
      text: 'Safe completed reply',
      tools: [],
      refused: false
    })
  })
  it('handles UTF-8 and SSE across arbitrary network chunks', async () => {
    const bytes = new TextEncoder().encode(await reply('Hello 🐈').text())
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      }
    })
    await expect(completedResponse(new Response(body))).resolves.toMatchObject({ text: 'Hello 🐈' })
  })
  it('rejects foreign tools, malformed arguments, oversized streams and terminal failures after completion', async () => {
    const tool = (namespace: string, args: string): Response =>
      new Response(
        event('response.completed', {
          status: 'completed',
          output: [{ type: 'function_call', namespace, name: 'go_home', arguments: args }]
        })
      )
    await expect(completedResponse(tool('buddy', '{}'))).resolves.toMatchObject({
      tools: [{ name: 'go_home', input: {} }]
    })
    await expect(completedResponse(tool('shell', '{}'))).rejects.toThrow()
    await expect(completedResponse(tool('buddy', 'broken'))).rejects.toThrow()
    await expect(completedResponse(new Response('x'.repeat(2_000_001)))).rejects.toThrow()
    await expect(
      completedResponse(
        new Response(
          (await reply().text()) +
            event('response.failed', { error: { code: 'subscription_sharing_usage_unavailable' } })
        )
      )
    ).rejects.toThrow()
  })
  it('never echoes arbitrary provider error content to the caregiver', () => {
    expect(planErrorMessage(Error('private token and chat'))).not.toContain('private')
    expect(planErrorMessage(new PlanError('subscription_sharing_usage_limit_exceeded'))).toContain(
      'Manage usage'
    )
  })
})

describe('renewable session and proof', () => {
  it('retains an issued registration after invalid_grant so retry reuses it', async () => {
    let saved = structuredClone(active),
      authorization = ''
    const session = new ChatGptSession({
      store: {
        load: () => saved,
        save: (next) => {
          saved = structuredClone(next)
        }
      },
      open: async (url) => {
        authorization = url
      },
      fetch: async () => json({ error: 'invalid_grant' }, 400)
    })
    cleanup.push(() => session.cancelLogin())
    await session.connect()
    const auth = new URL(authorization),
      callback = new URL(auth.searchParams.get('redirect_uri')!)
    callback.search = new URLSearchParams({
      state: auth.searchParams.get('state')!,
      code: 'expired',
      client_id: 'oaiapp_retry'
    }).toString()
    await fetch(callback)
    await vi.waitFor(() => expect(session.state().pending).toBe(false))
    expect(session.state().activeId).toBe('oaiapp_test')
    expect(saved.profiles.find((p) => p.clientId === 'oaiapp_retry')?.refresh).toBeUndefined()
    await session.connect('oaiapp_retry')
    const retry = new URL(authorization)
    expect(retry.searchParams.get('client_id')).toBe('oaiapp_retry')
    expect(retry.searchParams.has('agent_name_hint')).toBe(false)
    expect(retry.searchParams.get('ext_agent_host_id')).toBe(active.hostId)
  })
  it('stops using a rotating session when encrypted persistence fails', async () => {
    const initial = structuredClone(active)
    initial.profiles[0]!.expires = Date.now() - 1
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        access_token: 'rotated',
        refresh_token: 'replacement',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: scopes
      })
    )
    const session = new ChatGptSession({
      store: {
        load: () => initial,
        save: () => {
          throw Error('disk unavailable')
        }
      },
      open: async () => {},
      fetch: fetcher
    })
    await session.loadModels()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await session.loadModels()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(session.state().verifiedModel).toBeUndefined()
  })
  it('exchanges only an issued registration, validates nonce, and keeps the selected account until identity validation', async () => {
    let saved = structuredClone(active),
      authorization = ''
    const verify = vi
      .fn<typeof verifyIdentity>()
      .mockResolvedValue({ iss: ISSUER, sub: 'new-subject', email: 'same@example.invalid' })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        id_token: 'signed-id',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: scopes
      })
    )
    const session = new ChatGptSession({
      store: {
        load: () => saved,
        save: (next) => {
          saved = structuredClone(next)
        }
      },
      open: async (url) => {
        authorization = url
      },
      fetch: fetcher,
      verify
    })
    cleanup.push(() => session.cancelLogin())
    await session.connect()
    expect(session.state().activeId).toBe('oaiapp_test')
    const auth = new URL(authorization),
      callback = new URL(auth.searchParams.get('redirect_uri')!)
    callback.search = new URLSearchParams({
      state: auth.searchParams.get('state')!,
      code: 'once',
      client_id: 'oaiapp_new'
    }).toString()
    await fetch(callback)
    await vi.waitFor(() => expect(session.state().pending).toBe(false))
    expect(session.state().activeId).toBe('oaiapp_new')
    expect(saved.profiles).toHaveLength(2)
    expect(verify).toHaveBeenCalledWith('signed-id', 'oaiapp_new', auth.searchParams.get('nonce'))
    const body = new URLSearchParams(fetcher.mock.calls[0]![1]!.body as string)
    expect(body.get('client_id')).toBe('oaiapp_new')
    expect(body.get('redirect_uri')).toBe(auth.searchParams.get('redirect_uri'))
    expect(body.has('client_secret')).toBe(false)
  })
  it('rejects a different verified identity on returning sign-in without overwriting the existing session', async () => {
    let saved = structuredClone(active),
      authorization = ''
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        access_token: 'attacker-access',
        refresh_token: 'attacker-refresh',
        id_token: 'other-id',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: scopes
      })
    )
    const session = new ChatGptSession({
      store: {
        load: () => saved,
        save: (next) => {
          saved = structuredClone(next)
        }
      },
      open: async (url) => {
        authorization = url
      },
      fetch: fetcher,
      verify: async () => ({ iss: ISSUER, sub: 'different-subject' })
    })
    cleanup.push(() => session.cancelLogin())
    await session.connect('oaiapp_test')
    const auth = new URL(authorization),
      callback = new URL(auth.searchParams.get('redirect_uri')!)
    callback.search = new URLSearchParams({
      state: auth.searchParams.get('state')!,
      code: 'once'
    }).toString()
    await fetch(callback)
    await vi.waitFor(() => expect(session.state().pending).toBe(false))
    expect(saved.profiles[0]!.access).toBe('private-access')
    expect(session.state().message).toContain('sign in again')
  })
  it('cancels browser authorization without changing the active account', async () => {
    const { session, fetcher, saved } = fixture()
    await session.connect()
    session.cancelLogin()
    expect(session.state().pending).toBe(false)
    expect(saved()).toEqual(active)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps tokens out of state and requires an actual completed proof before Buddy inference', async () => {
    const { session, fetcher } = fixture()
    expect(JSON.stringify(session.state())).not.toMatch(/private-access|private-refresh|private-id/)
    await session.loadModels()
    await expect(
      session.complete('account-model', 'Buddy prompt', [{ role: 'user', content: 'Hi' }])
    ).rejects.toThrow()
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/responses'))).toHaveLength(0)
    const state = await session.test('account-model')
    expect(state.verifiedModel).toBe('account-model')
    await expect(
      session.complete('account-model', 'Buddy prompt', [{ role: 'user', content: 'Hi' }])
    ).resolves.toMatchObject({ text: 'Hello from Buddy.' })
    const request = fetcher.mock.calls.find(([url]) => String(url).endsWith('/responses'))!
    expect(String(request[0])).toBe(`${RESOURCE}/responses`)
    expect(JSON.parse(request[1]!.body as string)).toMatchObject({
      store: false,
      stream: true,
      input: [{ role: 'user' }]
    })
    expect(request[1]!.body).not.toMatch(/max_output_tokens|temperature|previous_response_id/)
    expect(session.welcome().needsWelcome).toBe(false)
  })
  it('does not mark catalog access, deltas or failed proof as completed inference', async () => {
    const { session, fetcher } = fixture()
    await session.loadModels()
    expect(session.state().verifiedModel).toBeUndefined()
    fetcher.mockResolvedValueOnce(
      new Response('data: {"type":"response.output_text.delta","delta":"Hello"}\n\n')
    )
    expect((await session.test('account-model')).verifiedModel).toBeUndefined()
    expect((await session.test('not-in-catalog')).verifiedModel).toBeUndefined()
  })
  it('serializes near-expiry refresh and writes the entire replacement token set', async () => {
    const initial = structuredClone(active)
    initial.profiles[0]!.expires = Date.now() - 1
    const { session, fetcher, saved } = fixture(initial)
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/token')
        ? json({
            access_token: 'rotated-access',
            refresh_token: 'rotated-refresh',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: scopes
          })
        : json(models)
    )
    await Promise.all([session.loadModels(), session.loadModels()])
    const calls = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/token'))
    expect(calls).toHaveLength(1)
    const form = new URLSearchParams(calls[0]![1]!.body as string)
    expect(form.get('client_id')).toBe('oaiapp_test')
    expect(form.has('scope')).toBe(false)
    expect(saved().profiles[0]).toMatchObject({
      access: 'rotated-access',
      refresh: 'rotated-refresh'
    })
  })
  it('does not infer with identity-only permission', async () => {
    const initial = structuredClone(active)
    initial.profiles[0]!.scopes = ['openid', 'email']
    const { session, fetcher } = fixture(initial)
    expect((await session.loadModels()).message).toContain('not granted')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('clears only the selected session and retains host/registration mapping after revocation', async () => {
    const { session, fetcher, saved } = fixture()
    fetcher.mockResolvedValueOnce(new Response('', { status: 200 }))
    expect((await session.signOut()).message).toContain('revoked')
    expect(saved().hostId).toBe(active.hostId)
    expect(saved().profiles[0]).toMatchObject({ clientId: 'oaiapp_test', subject: 'subject-1' })
    expect(JSON.stringify(saved())).not.toMatch(/private-access|private-refresh|private-id/)
    expect(String(fetcher.mock.calls[0]![0])).toBe(`${ISSUER}/api/accounts/oauth/revoke`)
  })
  it('reports unconfirmed remote revocation while still clearing local tokens', async () => {
    const { session, fetcher, saved } = fixture()
    fetcher.mockRejectedValue(Error('offline'))
    expect((await session.signOut()).message).toContain('could not be confirmed')
    expect(saved().profiles[0]!.refresh).toBeUndefined()
  })
  it('discards in-flight inference after sign-out and pauses plan usage on a limit', async () => {
    const { session, fetcher } = fixture()
    await session.test('account-model')
    fetcher.mockResolvedValueOnce(
      new Response(
        event('response.failed', { error: { code: 'subscription_sharing_usage_limit_exceeded' } })
      )
    )
    await expect(session.complete('account-model', '', [])).rejects.toThrow()
    const calls = fetcher.mock.calls.length
    await expect(session.complete('account-model', '', [])).rejects.toThrow()
    expect(fetcher.mock.calls).toHaveLength(calls)
    await session.test('account-model')
    let release!: (value: Response) => void
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const pending = session.complete('account-model', '', [])
    await vi.waitFor(() => expect(release).toBeDefined())
    fetcher.mockResolvedValueOnce(new Response('', { status: 200 }))
    await session.signOut()
    release(reply('stale reply'))
    await expect(pending).rejects.toThrow()
  })
})
