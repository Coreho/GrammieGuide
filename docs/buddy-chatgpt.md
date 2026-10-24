# Buddy with a ChatGPT plan

Buddy uses **ChatGPT only**, through the official local-app **Sign in with
ChatGPT** flow. There are no Anthropic/OpenRouter options or API-key controls.
Eligible requests use the connected account's ChatGPT plan usage; eligibility,
plan limits and app limits still apply.

## Connect on the computer running GrammieGuide

1. Open the caregiver panel with **Ctrl+Shift+A**, unlock it, and choose **Buddy**.
2. Under **Use your ChatGPT plan**, select **Continue with ChatGPT**. Complete
   authorization in the system browser. You can cancel in the caregiver panel.
3. Dismiss the first-connection plan confirmation with **Got it**.
4. Select **Load ChatGPT models**, choose a model, and select **Test ChatGPT reply**.
   This sends a fixed greeting request, not a private conversation.
5. After **Completed reply verified**, choose **Use this model for Buddy**.

Chat does not become ready merely because sign-in or model discovery succeeds.
Changing the ChatGPT model requires another successful reply test. When switching
accounts, load that account's models and verify a reply. Identical email addresses
can represent separate account/workspace registrations; the numbered entries stay
separate.

**Manage usage** opens [ChatGPT usage settings](https://chatgpt.com/settings/usage).
Plus usage has a shared five-hour allowance across connected apps; GrammieGuide
does not receive its own separate allowance. A usage-limit failure pauses Buddy's
plan requests until a new reply test succeeds, or the caregiver chooses another
saved ChatGPT account. The app never silently switches to paid API usage.

**Sign out of ChatGPT** attempts to revoke the renewable session, then removes
the local tokens. Offline sign-out reports that remote revocation was not
confirmed; disconnect the app in ChatGPT settings when online. The host identifier
and account registration are retained for reconnection. Other saved accounts keep
their sessions. When disconnected, Buddy keeps his friendly presence and local
Home actions; general conversation needs a verified ChatGPT connection.

## Upgrading an existing setup

Schema migration 020 changes old provider choices to ChatGPT, removes obsolete
API keys and clears old provider-specific model IDs. A previously selected ChatGPT
model stays selected. Voice, facts, PIN, contacts, tiles and media are preserved.
Old backups migrate through the same rules; they cannot restore the removed
providers or keys. Historical backup files themselves are not modified.

## Privacy and behavior

Tokens are stored only in the Electron main process and an encrypted
`chatgpt-credentials.enc` file under Electron's user-data folder. Windows DPAPI
binds encryption to the Windows user; it does not protect against other software
running as that same user. Encryption must be available, with no plaintext
fallback. Tokens are excluded from renderer IPC, normal config, activity logs,
and settings backups. Moving a settings backup to another device requires a new
ChatGPT connection there. Do not copy the credential file between Windows users.

Buddy uses the existing short, dementia-friendly instructions and current personal
facts, with the same stale-fact checks and narrow action validation. The model can
propose only the approved Home actions. Partial streamed replies are discarded;
only a completed response can produce a reply or action. ChatGPT audio is not used:
the existing Edge/Windows voice and Windows speech recognizer remain in place.

A successful greeting proves connectivity and permission for that model at that
moment. **It does not prove suitability for someone living with dementia.** Before
using it with her, compare actual responses to confused statements, repeated
questions, distress, and unknown family plans. Turn off Buddy chat if the replies
are unsuitable for her.

## Verification status

Automated unit checks cover loopback callback validation, signed ID-token
verification, encrypted persistence, identity-only permission, rotating refreshes,
bounded Responses streams, completed-inference gating, account identity mismatch,
usage limits, sign-out, stale context, action validation, privacy, and caregiver IPC.
Built-app checks use a controlled provider to exercise the connection panel and
Buddy's main-process adapter. They do not contact a real ChatGPT account.

On 2026-10-24 the owner's real browser authorization and model discovery succeeded.
GPT-6.1-Sol completed the greeting test and four synthetic Buddy conversations
(greeting, a confused statement, unknown visitors and distress). The restarted
schema-20 app also returned a completed Buddy reply. The original stream-reader
failure was fixed by retaining finished output items until `response.completed`.

These checks demonstrate live connectivity for this account/model at that time.
They do not validate response quality for every situation, future eligibility,
billing behavior or suitability for the person using the kiosk. Check the replies
with her before relying on chat. The caregiver's **Test ChatGPT reply** can repeat
the live connection check.

## Protocol references

- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts, refresh, and revocation](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and completed inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview restrictions](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Plan-use UI guidance](https://developers.openai.com/siwc/ui-ux-guidelines)
