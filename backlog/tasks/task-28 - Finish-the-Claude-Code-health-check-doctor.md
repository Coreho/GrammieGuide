---
id: TASK-28
title: Finish the Claude Code health check (/doctor)
status: To Do
assignee: []
created_date: '2026-09-29 08:27'
labels: []
dependencies: []
priority: medium
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A `/doctor` run on 2026-09-29 was paused after its first check. Done: Claude Code 2.1.284 is a native install at `~/.local/bin` (which is on PATH), with no leftover npm or `~/.claude/local` copies. Not done: settings, agent and skill file checks; unused skills, MCP servers and plugins (many plugin skills are installed, such as twilio-developer-kit, data, design, operations and figma); trimming and lazy-loading the checked-in CLAUDE.md; slow hooks (the supermemory SessionStart and UserPromptSubmit hooks, and the readme-reminder Stop hook); version currency; auto mode as the default; and frequently denied read-only commands. Also noticed: the user rule `~/.claude/rules/context7.md` requires Context7, but the session only offered Context7's sign-in tools, so the rule could not be followed. This is mostly about the owner's Claude Code setup rather than app code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The /doctor checks run to completion and the report is shown to the owner
- [ ] #2 Changes are applied only after the owner confirms them; edits to checked-in files are left uncommitted for review
- [ ] #3 Context7 is either signed in, or the rule that requires it is adjusted
<!-- AC:END -->
