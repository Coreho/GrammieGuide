# Windows workflow runner

The Windows runner connects the saved Claude `backlog-run` workflow to
https://workflow.koreokorp.com using outbound HTTPS polling every three seconds.
It reuses the token in `~/.claude/workflow-tools/board-remote.json`; no inbound port,
new account, or credentials in the repository are needed.

Source lives in `scripts/workflow-runner/`. Install from the GrammieGuide checkout:

```powershell
node scripts/workflow-runner/install.cjs
node "$env:USERPROFILE\.claude\workflow-tools\board-runner.cjs" --check
```

Installation copies the runner and Windows supervisor into `~/.claude/workflow-tools/`,
backs up and patches the existing workflow/progress helper, and creates
`board-runner.json` **with execution disabled** if it does not exist. Reinstallation
preserves existing configuration and does not start the listener. The patch fails
on unexpected source changes instead of silently editing a different workflow.

The saved `backlog-run-codex` and `backlog-run-codex-lite` wrappers forward the new
arguments too. The lite one has Codex build every task, using Opus 5.5 only to pick tasks
and to review Codex at medium effort, which saves the owner's Claude usage. To use either,
change both `workflow` and `workflowFile` in the local config, then restart the listener
with `--publish-catalog`. The board only offers runs that match the runner's workflow.

## Connect and operate

```powershell
# Single authenticated connection check; always disables execution for this process.
# Publishes a read-only task catalog, with current open PRs unavailable for selection.
node "$env:USERPROFILE\.claude\workflow-tools\board-runner.cjs" --once --publish-catalog

# Persistent foreground listener (Ctrl+C stops its owned active run, then exits).
node "$env:USERPROFILE\.claude\workflow-tools\board-runner.cjs" --publish-catalog
```

A new idle instance must wait at least 20 seconds after the previous heartbeat to
reuse the same runner ID. Concurrent listeners are rejected by a local PID lock and
by the server. `--check` reads local tasks/open PRs without registering a heartbeat.
`--check` and `--recover` must be used alone; combining either with another option
is rejected.

PowerShell and the GitHub CLI are launched by absolute path, because Windows looks
in the working directory (the repository) before PATH for a bare program name.
PowerShell comes from the Windows system folder. `gh.exe` is taken from the first
absolute PATH entry that has it, or from an optional absolute `ghExe` in
`board-runner.json`.

Set `executionEnabled` in the local `board-runner.json` to `true` and restart the
listener to accept a board Start click. Set its name to `GrammieGuide Windows` when
enabled. Set it to `false` and restart to connect without accepting work. The board
shows “Connected · execution disabled” in that mode and rejects Start server-side.
Configuration is read at startup; changing the file alone does not affect a running
process. Installation does not add a Windows scheduled task or startup entry.

On the board, select the `grammie-windows-catalog` snapshot (or an earlier matching
run), select task IDs, and click Start. The runner checks current local To Do tasks
and open PRs again. The workflow then performs its existing origin/dependency,
overlap, usage, test and readiness checks. Selection never overrides a blocker.
Catalog export uses current PR titles/branch names to identify task IDs; the full
workflow still audits open PR files. Refresh the catalog by restarting with
`--publish-catalog`; it is a snapshot, not a continuous Backlog watcher.

The runner sends **only validated selected IDs** into a fixed, locally configured
workflow. It ignores network-supplied shell commands, paths, titles and prompt text.
Claude is told to start the saved workflow by **name**, not `scriptPath`: the
Workflow tool rejects a script path outside the working directory, even one added
with `--add-dir`. So `workflowFile` must be `~/.claude/workflows/<workflow>.js`,
and a launch is refused if the repository has its own `.claude/workflows/` copy
that could be loaded instead of the patched one.
Each job uses `board-<job UUID>` as its run tag and writes beneath
`~/GrammieGuide-runs/board-<job UUID>/`. The workflow filters picker output in code;
the progress helper pins the tag and directory using the child environment.

Claude runs with the existing local permission settings and `--permission-prompts
none`: operations that still require a human fail rather than bypassing permissions.
Notification/artifact uploads are disabled for board-triggered jobs; the existing
direct VPS snapshot upload remains active. A zero CLI exit alone is insufficient:
the runner also requires a matching terminal progress record before reporting done.
“Done” means the workflow finished; individual tasks can still be skipped, stuck,
or draft PRs. Inspect their outcomes on the board.

## Stop, logs, and recovery

Stop terminates only that job's Windows supervisor. Before launching Claude, the
supervisor puts itself in a Windows Job Object with kill-on-close and no breakaway.
Its descendants inherit membership, including those whose parent later exits.
The supervisor also watches the runner process and exits if its owner dies.
The runner reports stopped only after the owned supervisor exits, and updates
unfinished progress rows. Worktrees/branches remain for inspection; Stop does not
promise a graceful commit or draft PR. See Microsoft's
[Job Object documentation](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Local files:

- `~/.claude/workflow-tools/board-runner.json`: trusted configuration; references the
  existing token file without copying its token.
- `~/.claude/workflow-tools/board-runner-state/journal.json`: instance ID, claimed job
  IDs, launch intent, owned PID, and pending terminal acknowledgment.
- `~/.claude/workflow-tools/board-runner-state/runner.lock`: current listener PID.
- `~/.claude/workflow-tools/board-runner-state/runner.stdout.log` and
  `runner.stderr.log`: logs when started hidden during setup.
- Per-run `workflow-prompt.txt`, `claude-output.json`, `claude-stderr.log`,
  `progress.json`, and `PROGRESS.md`.

Network failures retry with the same instance/job identity. A claimed job is never
relaunched after duplicate delivery. Terminal reports persist until acknowledged.
Each journal write is flushed to disk before it replaces the previous journal.
Windows doesn't let Node force the rename itself through, so a power cut at that
moment can still leave the previous journal; the job dies in the same power cut.
An unresolved journal blocks a restart, including the ambiguous window between
recording launch intent and saving the child PID. Do not delete the journal to
force a restart.

After inspecting that the owned process has exited, reconcile a pending job:

```powershell
node "$env:USERPROFILE\.claude\workflow-tools\board-runner.cjs" --recover
```

Recovery reports a terminal outcome using the persisted owning instance ID, then
exits. It clears the journal only after the board confirms the report (`ok: true`);
any other reply leaves the journal as it was. It refuses if the child PID is still
alive or a launch has an unknown PID.
Those cases need local inspection, never broad process-name killing. Wait 20 seconds
before starting a fresh listener. If a terminal snapshot upload fails, the job's
terminal API report remains authoritative; inspect the local progress file/logs.

## Verification and coordination

```powershell
node --test scripts/workflow-runner/board-runner.test.cjs
npm run lint
```

Tests cover disabled mode, duplicate Start, lost acknowledgments, completion during
polling, Stop ordering, journal recovery guard, `--recover` (refusals, unconfirmed
board replies, clearing a confirmed job), exclusive options, PATH lookup, input validation, strict workflow
selection, pinned progress identity, actual Windows descendant isolation, and
launch/terminal progress using a harmless compiled fixture executable. They do not
launch Claude or execute real Backlog tasks.

The first three board runs (TASK-17, TASK-13, TASK-34) built nothing. The first
hit the plan's usage limit, and the other two were refused by the Workflow tool's
`scriptPath` check. Each was correctly reported as failed, not done. A headless
probe then confirmed that a saved workflow started by name runs, and that
`claude --print` waits for it to finish before exiting. The fourth run (TASK-34) then went all the way from Start to finish in
about six minutes. It passed preflight, skipped TASK-34 for overlapping open PRs #7
and #16, and reported done. The catalog comes from the local checkout's Backlog, so
keep that checkout on an up-to-date `main`, or the board lists finished tasks.

The VPS session owns board UI/server code. Its API contract and this runner's handoff
are `/opt/stacks/workflow-board/RUNNER-API.md` and `WINDOWS-RUNNER.md`. API identity is
`grammie-windows`, repository `GrammieGuide`, workflow `backlog-run`. Only coordination
Markdown files are written on the VPS by this local integration session.
