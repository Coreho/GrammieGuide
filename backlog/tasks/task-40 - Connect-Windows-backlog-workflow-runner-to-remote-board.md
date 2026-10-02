---
id: TASK-40
title: Connect Windows backlog workflow runner to remote board
status: Done
assignee:
  - '@codex'
created_date: '2026-10-01 21:31'
updated_date: '2026-10-01 21:49'
labels: []
dependencies: []
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Connect the existing local backlog-run workflow and progress helper to workflow.koreokorp.com. Coordinate the API contract through VPS files while another session owns board UI and server changes. Do not execute real backlog tasks during setup or verification.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Windows runner publishes GrammieGuide task availability and follows the agreed authenticated runner API.
- [x] #2 Selected task IDs, run identity and Stop are respected by the local workflow integration.
- [x] #3 Safe default prevents real task execution; simulated tests and non-executing connectivity checks pass.
- [x] #4 Local setup, operation and VPS handoff are documented without exposing credentials.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement outbound polling and durable job journal with execution disabled by default. Add strict selection and run identity to existing workflow. Isolate the Windows child tree for Stop. Test only with fixtures and harmless children; publish read-only catalog and connect disabled runner. Document operation and coordinate through VPS files.

After disabled-mode connectivity and fixture tests pass, leave a persistent enabled listener ready for the user Start click; issue no Start requests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 11 node:test tests including actual Windows Job Object orphan cleanup and compiled fake executable launch/completion/Stop. Full npm run lint and git diff --check passed. Published 32-task catalog with fresh open-PR annotations and verified authenticated disabled and enabled heartbeat on live VPS. Server jobs remained empty. Installed listener is enabled and idle; no real Claude/workflow task launched. Source, reversible installer and operation/recovery docs are tracked locally; only WINDOWS-RUNNER.md coordination file written on VPS. Model-driven Workflow invocation intentionally awaits first authorized real run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Connected the Windows backlog-run workflow to the board API with durable at-most-once delivery, selected-task enforcement, fixed run identity, progress uploads and owned process-tree Stop. Installed persistent listener ready for user Start. Verified 11 safe fixture tests, full lint, authenticated HTTPS heartbeat and 32-task catalog upload; no real jobs started. See docs/workflow-runner.md and VPS WINDOWS-RUNNER.md.
<!-- SECTION:FINAL_SUMMARY:END -->
