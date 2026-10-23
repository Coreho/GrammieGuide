# Buddy with a ChatGPT plan

Buddy can optionally use the official local-app **Sign in with ChatGPT** flow.
The existing Anthropic and OpenRouter providers remain available. This is a
separate choice from an OpenAI API key: eligible requests use the connected
ChatGPT account's plan usage. Account eligibility and app limits still apply.

## Connect on the computer running GrammieGuide

1. Open the caregiver panel with **Ctrl+Shift+A**, unlock it, and choose **Buddy**.
2. Under **Use your ChatGPT plan**, select **Continue with ChatGPT**. Complete
   authorization in the system browser. You can cancel in the caregiver panel.
3. Dismiss the first-connection plan confirmation with **Got it**.
4. Select **Load ChatGPT models**, choose a model, and select **Test ChatGPT reply**.
   This sends a fixed greeting request, not a private conversation.
5. After **Completed reply verified**, choose **Use ChatGPT for Buddy**.

The provider does not change merely because sign-in or model discovery succeeds.
Changing the ChatGPT model requires another successful reply test. When switching
accounts, load that account's models and verify a reply. Identical email addresses
can represent separate account/workspace registrations; the numbered entries stay
separate.

**Manage usage** opens [ChatGPT usage settings](https://chatgpt.com/settings/usage).
Plus usage has a shared five-hour allowance across connected apps; GrammieGuide
does not receive its own separate allowance. A usage-limit failure pauses Buddy's
plan requests until a new reply test succeeds, or the caregiver chooses another
saved account/provider. The app never silently switches to paid API usage.

**Sign out of ChatGPT** attempts to revoke the renewable session, then removes
the local tokens. Offline sign-out reports that remote revocation was not
confirmed; disconnect the app in ChatGPT settings when online. The host identifier
and account registration are retained for reconnection. Other saved accounts keep
their sessions. Choose Anthropic or OpenRouter in **Who answers Buddy** to switch
back; their API keys are kept separately.

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
questions, distress, and unknown family plans. Keep the previously tested provider
available if the responses are unsuitable.

## Verification status

Automated unit checks cover loopback callback validation, signed ID-token
verification, encrypted persistence, identity-only permission, rotating refreshes,
bounded Responses streams, completed-inference gating, account identity mismatch,
usage limits, sign-out, stale context, action validation, privacy, and caregiver IPC.
Built-app checks use a controlled provider to exercise the connection panel and
Buddy's main-process adapter. They do not contact a real ChatGPT account.

**Owner's real browser authorization and completed model reply remain to be run.**
No eligibility, live billing behavior, or dementia-response quality is claimed from
the automated fixture. The caregiver's **Test ChatGPT reply** is the live check.

## Protocol references

- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts, refresh, and revocation](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and completed inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview restrictions](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Plan-use UI guidance](https://developers.openai.com/siwc/ui-ux-guidelines)
