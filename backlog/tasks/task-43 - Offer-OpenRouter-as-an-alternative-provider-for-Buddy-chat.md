---
id: TASK-43
title: Offer OpenRouter as an alternative provider for Buddy chat
status: In Progress
assignee: []
created_date: '2026-10-05 07:46'
updated_date: '2026-10-05 07:56'
labels: []
milestone: m-9
dependencies: []
priority: medium
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy chat is billed through Anthropic today. A caregiver who already pays through OpenRouter has no way to use that account: admin has one hardcoded Anthropic API key field and the client points at the Anthropic host. This adds a provider choice without changing the default, so an existing setup - and the endpoint the TASK-11 prompt was tuned against - is untouched.

Two providers need no second client and no second prompt: OpenRouter serves the Anthropic Messages format, so the same SDK, the same frozen system prompt and the same error types apply. Only the base URL and the attribution headers differ.

The safety constraint is the reason this is offerable at all. Left to itself OpenRouter also serves Claude from Amazon Bedrock and Google Vertex, which would move her conversations off Anthropic and off the endpoint the prompt was verified against. Every request is therefore pinned to Anthropic, with fallbacks refused and data collection denied. The accepted trade is that an Anthropic outage gives a calm try-again-later line instead of a different company model answering as Buddy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Anthropic stays the default, so a config saved before this feature still chats through Anthropic and needs no migration
- [ ] #2 The caregiver can choose who answers Buddy chat in admin and the choice is stored in config
- [ ] #3 Each provider keeps its own API key: the field stays write-only, neither key ever reaches a renderer, and saving other Buddy settings carries both keys forward
- [ ] #4 An OpenRouter request is sent to openrouter.ai using the OpenRouter key and never the Anthropic key, and switching back uses the Anthropic key and leaves no OpenRouter routing behind
- [ ] #5 Every OpenRouter request is pinned to Anthropic with no fallback and no data collection
- [ ] #6 Model choices are per provider because ids are provider-specific; switching provider lands on a model that provider accepts, and a saved model the new provider does not offer is still shown rather than silently rewritten
- [ ] #7 Effort is sent only to models that accept it, under either provider id format
- [ ] #8 Unit tests cover the provider data, key-per-provider IPC routing and both keys surviving mergeAdminPatch; an e2e test proves the OpenRouter URL, the routing pin, the unchanged prompt and that neither key reaches a renderer
- [ ] #9 A check in the real app with a real OpenRouter key confirms a reply comes back
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/buddy/providers.ts: pure provider data and helpers - the two provider ids, the default, per-provider model lists, the OpenRouter base URL, attribution headers, routing preferences, and the effort check that looks past a vendor/ prefix.
2. configSchema: buddy.provider (defaulting to anthropic) and buddy.openrouterApiKey, both stripped from PublicConfig; mergeAdminPatch carries both keys forward.
3. buddyChatClient.ts replaces anthropicClient.ts as the only place a key becomes a client; caches per provider+key and only the base URL and headers differ.
4. buddyIpc picks the key and the client for the selected provider; buddyChatService adds the routing body only for OpenRouter.
5. admin:hasApiKey / admin:setApiKey become provider-scoped, an unknown provider falls back to Anthropic rather than writing to neither key, and activity log lines name the provider.
6. BuddyTab gains a provider select, a per-provider key field and hint, an explanation of the pin and its trade-off, and a model list that keeps an unrecognised saved model visible.
7. Tests: shared unit tests over the provider data, key-per-provider routing in buddyIpc, both keys in mergeAdminPatch, a pre-OpenRouter config migrating to Anthropic, and an e2e spec that stubs fetch in main to assert the OpenRouter URL, the routing pin, the identical frozen prompt and key isolation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Work was started on main and is uncommitted, so this task exists to get it reviewed and landed rather than to plan it. Typecheck passes on the working tree; unit, lint, build and e2e have not been run against it yet.

Committed to feat/buddy-chat-provider as two commits: a bookkeeping commit for the already-merged TASK-01/03/12/16/29 notes, then the feature. Verified on this branch: typecheck clean, lint clean, unit 41 files / 688 tests passed, build clean, full e2e 77 passed (6.1m). The new buddy-prompt-wiring.spec.ts stubs fetch in main to assert the OpenRouter URL, the routing pin, the identical frozen prompt and that neither key reaches a renderer; it also closes the gap TASK-11 left, which was that nothing had checked the real request carried the no-inventing rules.

Still open: AC 9 needs a real OpenRouter key, which only the owner has. Until then the task stays In Progress and no acceptance criterion is checked on the claim that a live reply comes back.
<!-- SECTION:NOTES:END -->
