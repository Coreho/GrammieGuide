import { useEffect, useRef, useState } from 'react'
import type { ChatGptState } from '@shared/buddy/chatGpt'
import { useConfigStore } from '../state/useConfigStore'

export function ChatGptConnection() {
  const [state, setState] = useState<ChatGptState>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState('')
  const welcomeDialog = useRef<HTMLDialogElement>(null)
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  useEffect(() => {
    if (state?.needsWelcome) welcomeDialog.current?.showModal()
  }, [state?.needsWelcome])
  useEffect(() => {
    let active = true
    const poll = async (): Promise<void> => {
      try {
        const next = await window.admin.chatGptState()
        if (active) setState(next)
      } catch {
        if (active)
          setError(
            'ChatGPT connection settings are unavailable. Reopen the unlocked caregiver panel.'
          )
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 1500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  const run = async (action: () => Promise<ChatGptState>): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      setState(await action())
    } catch {
      setError(
        'Could not complete this connection change. Reopen the caregiver panel and try again.'
      )
    } finally {
      setBusy(false)
    }
  }
  const selectedModel =
    (state?.models.some((choice) => choice.id === model) ? model : '') ||
    state?.models.find((choice) => choice.id === state.verifiedModel)?.id ||
    state?.models[0]?.id ||
    ''
  const canUse = Boolean(
    state?.verifiedModel && state.verifiedModel === selectedModel && !state.pending && !busy
  )
  return (
    <section aria-label="ChatGPT connection">
      <h3>Use your ChatGPT plan</h3>
      <p>
        Connect your ChatGPT account to use eligible plan usage for Buddy. Plan and app limits
        apply. Check that Buddy&apos;s replies are suitable for her before leaving chat switched on.
      </p>
      {state && (
        <>
          {state.profiles.length > 0 && (
            <label>
              ChatGPT account{' '}
              <select
                value={state.activeId ?? ''}
                disabled={busy || state.pending}
                onChange={(event) => {
                  setModel('')
                  void run(() => window.admin.chatGptSelect(event.target.value))
                }}
              >
                <option value="" disabled>
                  Choose an account
                </option>
                {state.profiles.map((profile, index) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label} ({index + 1}){profile.connected ? '' : ' — signed out'}
                  </option>
                ))}
              </select>
            </label>
          )}{' '}
          <button
            disabled={busy || state.pending}
            onClick={() => void run(() => window.admin.chatGptConnect(state.activeId))}
          >
            Continue with ChatGPT
          </button>{' '}
          {state.profiles.length > 0 && (
            <button
              disabled={busy || state.pending}
              onClick={() => void run(() => window.admin.chatGptConnect())}
            >
              Add another ChatGPT account
            </button>
          )}{' '}
          {state.pending && (
            <button onClick={() => void run(() => window.admin.chatGptCancel())}>
              Cancel sign-in
            </button>
          )}
          <p role="status">{state.message}</p>
          {state.needsWelcome && (
            <dialog
              ref={welcomeDialog}
              aria-labelledby="chatgpt-welcome"
              onCancel={(event) => event.preventDefault()}
              style={{ maxWidth: 460, padding: 24, borderRadius: 12 }}
            >
              <h4 id="chatgpt-welcome">You&apos;re using your ChatGPT plan</h4>
              <p>
                Eligible requests in GrammieGuide use your ChatGPT plan. Review or change limits in
                ChatGPT usage settings.
              </p>
              <button disabled={busy} onClick={() => void run(() => window.admin.chatGptWelcome())}>
                Got it
              </button>
            </dialog>
          )}
          <button
            disabled={busy || state.pending || !state.activeId}
            onClick={() => void run(() => window.admin.chatGptModels())}
          >
            Load ChatGPT models
          </button>{' '}
          {state.models.length > 0 && (
            <>
              <label>
                ChatGPT model{' '}
                <select
                  value={selectedModel}
                  disabled={busy || state.pending}
                  onChange={(event) => setModel(event.target.value)}
                >
                  {state.models.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>{' '}
              <button
                disabled={busy || state.pending}
                onClick={() => void run(() => window.admin.chatGptTest(selectedModel))}
              >
                {busy ? 'Checking…' : 'Test ChatGPT reply'}
              </button>{' '}
              <button
                disabled={!canUse}
                onClick={() => {
                  if (config && canUse)
                    void save({
                      buddy: { ...config.buddy, provider: 'chatgpt', model: selectedModel }
                    })
                }}
              >
                Use this model for Buddy
              </button>
            </>
          )}
          {config?.buddy.model && state.verifiedModel === config.buddy.model && (
            <p>Using ChatGPT plan</p>
          )}
          <p>
            <button
              onClick={() =>
                void window.admin
                  .chatGptUsage()
                  .catch(() => setError('Could not open ChatGPT usage settings.'))
              }
            >
              Manage usage
            </button>{' '}
            <button
              disabled={busy || !state.activeId}
              onClick={() => void run(() => window.admin.chatGptSignOut())}
            >
              Sign out of ChatGPT
            </button>
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
