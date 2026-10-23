---
id: TASK-60
title: Use a ChatGPT subscription as an optional Buddy provider
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-23 18:37'
updated_date: '2026-10-23 18:59'
labels: []
dependencies: []
references:
  - 'https://developers.openai.com/siwc/token-sharing-open-source/sign-in'
priority: medium
type: feature
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver wants Buddy to use an existing ChatGPT Plus subscription. Current Buddy supports Anthropic and OpenRouter only. Use the official local-app Sign in with ChatGPT plan-usage flow, beginning with real sign-in and completed inference proof, while retaining the existing provider and dementia-friendly behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Caregiver-only browser OAuth validates state, PKCE, nonce, issuer, audience and account identity; tokens stay encrypted in main and out of config, backups, IPC and logs.
- [x] #2 Connection UI supports sign-in, cancellation, model discovery, completed-reply proof, usage management and sign-out with honest limits/reauthentication errors.
- [x] #3 ChatGPT is an optional provider using the approved Responses streaming endpoint and discovered models, while preserving Buddy prompt, personal facts, approved actions and existing providers.
- [ ] #4 Fake-provider unit and built-app checks cover OAuth/error/privacy behavior and Buddy integration; real account sign-in and a completed reply are recorded separately from mocked verification.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build and test secure local OAuth/session storage and a minimal caregiver connection/proof panel from current official docs.
2. Run the browser sign-in and one completed inference proof with the owner; do not claim account access from catalog/sign-in alone.
3. Add the optional Responses-backed Buddy adapter using existing message sanitation, facts invalidation and action validation, with discovered model selection and clear usage/sign-out controls.
4. Verify with fake-provider tests and built-app UI checks, run build/lint/full unit suite, document remaining live checks, and commit focused increments.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented official loopback OAuth with PKCE/state/nonce, JWKS identity validation, separate DPAPI-encrypted atomic credential storage, saved account registrations, serialized rotating refresh, revocation and guarded completed Responses inference. Added caregiver connection/model/proof/usage/sign-out UI and optional Buddy adapter; existing providers, prompt, facts invalidation and narrow action resolver are preserved. Schema 019 versions the provider without changing existing settings. Verification: full unit suite 1235/1235 passed, then two added protocol/persistence regression cases passed in a 48-test targeted run; lint and build passed. Thirteen built-app regression checks passed; final schema/connection/backup build rerun passed three checks. Nonce-condition mutation failed as expected and was restored. Screenshot inspected; scoped Impeccable detect returned no findings. Real owner authorization, completed live model inference and dementia response-quality evaluation remain pending; TASK-60 stays In Progress and AC4 remains unchecked until the real-account proof is recorded. Instructions: docs/buddy-chatgpt.md. No production provider was switched and no credentials were requested in chat.
<!-- SECTION:NOTES:END -->
