---
id: TASK-60
title: Use ChatGPT plan as Buddy's only chat provider
status: Done
assignee:
  - '@codex'
created_date: '2026-10-23 18:37'
updated_date: '2026-10-24 20:21'
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
Owner now wants ChatGPT only: remove Anthropic/OpenRouter selection, routing, API-key controls and legacy credential persistence. Keep the protected ChatGPT connection and completed-reply gate; diagnose and verify live inference without claiming sign-in/catalog access proves chat works.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Protected caregiver-only OAuth and encrypted session storage remain intact; tokens stay out of config, backups, IPC and logs.
- [x] #2 Buddy settings offer ChatGPT connection, account/model selection, completed-reply verification, usage and sign-out without other provider or API-key controls.
- [x] #3 Existing configurations migrate to ChatGPT only, remove obsolete provider credentials and models, and preserve unrelated settings/media; legacy requests and SDK paths are removed.
- [x] #4 Unit and built-app checks pass for chat behavior, facts, actions, migrations and backup privacy; live authorization and completed inference evidence are reported separately from fixtures.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Diagnose the live reply failure with redacted transport diagnostics. 2. Replace multi-provider runtime and admin controls with ChatGPT-only chat and migrate existing configurations without altering media, PIN, voice or personal facts. 3. Remove legacy SDK/key IPC and update behavior, migration, backup and built-app tests. 4. Verify live completed inference and synthetic Buddy replies where available; run lint/build/unit and relevant built-app checks, document evidence and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented official loopback OAuth with PKCE/state/nonce, JWKS identity validation, separate DPAPI-encrypted atomic credential storage, saved account registrations, serialized rotating refresh, revocation and guarded completed Responses inference. Added caregiver connection/model/proof/usage/sign-out UI and optional Buddy adapter; existing providers, prompt, facts invalidation and narrow action resolver are preserved. Schema 019 versions the provider without changing existing settings. Verification: full unit suite 1235/1235 passed, then two added protocol/persistence regression cases passed in a 48-test targeted run; lint and build passed. Thirteen built-app regression checks passed; final schema/connection/backup build rerun passed three checks. Nonce-condition mutation failed as expected and was restored. Screenshot inspected; scoped Impeccable detect returned no findings. Real owner authorization, completed live model inference and dementia response-quality evaluation remain pending; TASK-60 stays In Progress and AC4 remains unchecked until the real-account proof is recorded. Instructions: docs/buddy-chatgpt.md. No production provider was switched and no credentials were requested in chat.

Live check on 2026-10-24: owner's browser authorization completed and account-specific model discovery succeeded (GPT-6.1-Sol first in catalog). The real completed-reply proof did not succeed: the app returned its generic unavailable message and no verified model. Do not treat sign-in/catalog access as inference proof; AC4 remains unchecked and task stays In Progress. Existing provider/model/chat setting retained. Separately, owner's requested 40 Btcm MP3 files were imported using the running app's standard music import path; verified 41 tracks in the library including its existing song, and all 41 visible in the Music tab. Source files unchanged. Main-process file-picker substitution was restored after the authorized batch import.

Owner requested removal of the other providers. Removed Anthropic/OpenRouter options, models, SDK, runtime routing, API-key IPC/preload methods and credential fields. Added schema 020 migration: drop obsolete keys/models; preserve an already selected ChatGPT model and all unrelated settings. Replaced SDK-specific checks with normalized Buddy behavior and ChatGPT request-wire coverage. Diagnosed live inference: HTTP 200 streamed completed output items, but terminal response.completed contained output: []; parser now retains canonical done items until completed and still rejects failed/incomplete streams. Regression reproduced red, fixed green; inverted fallback-condition mutation failed and was restored. Validation: 1225 unit tests across 96 files passed; post-review 57 focused checks passed; lint and build passed; 14 selected built-app tests passed, with four final UI/connection checks repeated successfully; scoped Impeccable detect returned no findings and screenshot was inspected. Real owner account: GPT-6.1-Sol completed proof plus four synthetic Buddy checks (greeting, confused mother/school statement, unknown visitors, distress). Restarted current app returned another completed Buddy reply. Persisted live config verified schema 20, provider chatgpt, model gpt-6.1-sol, zero legacy key fields. Music library still has 41 tracks. No claims of clinical suitability or exhaustive model quality validation. Updated docs/buddy-chatgpt.md, README and project guidance.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Buddy now uses ChatGPT only. Existing configurations migrate without losing unrelated settings/media; legacy provider credentials and SDK paths are removed. Fixed terminal-empty-output streaming so live replies work. Verified with unit, built-app, privacy/migration and real-account completed-inference checks; restarted app uses GPT-6.1-Sol and retains all 41 songs.
<!-- SECTION:FINAL_SUMMARY:END -->
