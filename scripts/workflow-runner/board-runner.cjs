#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn, execFileSync } = require('node:child_process')

const TERMINAL = new Set(['done', 'failed', 'stopped'])
const ID = /^[\w.-]{1,100}$/
const TASK = /^TASK-\d+(?:\.\d+)*$/
// The saved workflows a board Start may launch. All three run backlog-run's patched engine;
// the lite one has Codex build every task to save the owner's Claude usage.
const WORKFLOWS = ['backlog-run', 'backlog-run-codex', 'backlog-run-codex-lite']
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  // Flush before the rename. Otherwise a power cut can leave the renamed journal empty or
  // stale, losing a recorded launch intent so the board's redelivery could start it again.
  const fd = fs.openSync(tmp, 'w', 0o600)
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
}
// Windows looks in the working directory (the repo) before PATH for a bare program name,
// so a stray gh.exe or powershell.exe there would run instead of the real one, outside
// the Job Object. Helpers are therefore launched by absolute path only.
const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
)
function onPath(name, searchPath = process.env.PATH || '') {
  for (const dir of searchPath.split(path.delimiter)) {
    const file = path.join(dir, name)
    if (path.isAbsolute(dir) && fs.existsSync(file)) return file
  }
  throw new Error(`${name} not found on PATH`)
}
function validate(command, cfg) {
  if (!command || !ID.test(command.id || '')) throw new Error('Invalid job ID')
  if (command.action !== 'start' || command.repo !== cfg.repo || command.workflow !== cfg.workflow)
    throw new Error('Job does not match the configured repository/workflow')
  if (
    !Array.isArray(command.taskIds) ||
    !command.taskIds.length ||
    command.taskIds.length > 100 ||
    command.taskIds.some((id) => typeof id !== 'string' || !TASK.test(id)) ||
    new Set(command.taskIds).size !== command.taskIds.length
  )
    throw new Error('Invalid selected task IDs')
}
function workflowArgs(command, cfg) {
  validate(command, cfg)
  return {
    taskIds: command.taskIds,
    focus: command.taskIds.join(' '),
    maxTasks: command.taskIds.length,
    runTag: `board-${command.id}`,
    runDir: path.join(cfg.runsDir, `board-${command.id}`).replace(/\\/g, '/'),
    concurrency: cfg.concurrency || 2,
    board: 'off',
    notify: false
  }
}
function workflowPrompt(command, cfg) {
  const args = workflowArgs(command, cfg)
  // By name, not scriptPath: the Workflow tool refuses a scriptPath outside the working
  // directory even with --add-dir, so the first two board runs never started.
  return `Run the saved ${cfg.workflow} workflow using the Workflow tool with name ${JSON.stringify(cfg.workflow)} (no scriptPath) and args as this exact structured JSON object:\n${JSON.stringify(args)}\nInvoke it once. Do not implement tasks yourself or substitute another workflow. Preserve all preflight, dependency, permission and usage checks. If Workflow is unavailable or fails, report failure and stop.\n`
}
function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code !== 'ESRCH'
  }
}

// This is intentionally independent of fetch/process launch so fault cases can be tested
// without launching an agent or claiming anything from the real board.
class Runner {
  constructor(cfg, deps) {
    this.cfg = cfg
    this.deps = deps
    this.state = deps.load() || { instanceId: crypto.randomUUID(), jobs: {}, currentId: null }
    this.child = null
    this.closed = false
    if (this.state.currentId)
      throw new Error(
        'Unresolved job journal. Use --recover after the owned process has exited; never replay it.'
      )
    this.state.instanceId = crypto.randomUUID()
    this.save()
  }
  save() {
    this.deps.save(this.state)
  }
  current() {
    return this.state.jobs[this.state.currentId] || null
  }
  async poll() {
    const job = this.current()
    const report = job && {
      id: job.id,
      status: job.status,
      message: job.message,
      runTag: job.runTag
    }
    const response = await this.deps.poll({
      runnerId: this.cfg.runnerId,
      instanceId: this.state.instanceId,
      repo: this.cfg.repo,
      workflow: this.cfg.workflow,
      name: this.cfg.name,
      acceptingJobs: this.cfg.executionEnabled === true && !this.closed,
      current: report
    })
    if (!response || response.ok !== true) throw new Error('Invalid poll response')
    // Clear only the exact terminal report acknowledged by this request. A child may
    // finish while the request is in flight; that newer terminal report still needs ACK.
    if (report && TERMINAL.has(report.status)) {
      this.state.currentId = null
      this.save()
    }
    if (response.command) await this.command(response.command)
  }
  async command(command) {
    if (command.action === 'stop') {
      if (this.current()?.id === command.id && this.child) await this.stop()
      return
    }
    if (!ID.test(command.id || '')) throw new Error('Invalid command ID')
    const old = this.state.jobs[command.id]
    if (old) {
      if (!this.state.currentId) {
        this.state.currentId = old.id
        this.save()
      }
      return // duplicate delivery or retry after terminal ACK: never spawn again
    }
    if (this.current()) throw new Error('Board offered a second job while busy')
    const job = {
      id: command.id,
      status: 'running',
      message: 'Validating selected tasks',
      runTag: `board-${command.id}`,
      taskIds: command.taskIds,
      launchAttempted: false
    }
    this.state.jobs[job.id] = job
    this.state.currentId = job.id
    this.save()
    try {
      validate(command, this.cfg)
      if (!this.cfg.executionEnabled || this.closed)
        throw new Error('Execution disabled locally; no agent was launched')
      this.deps.preflight(command)
      // Persist intent BEFORE spawning. An interrupted spawn is ambiguous and requires
      // recovery; automatically replaying it could duplicate PRs and task work.
      job.launchAttempted = true
      this.save()
      this.child = this.deps.launch(command)
      job.pid = this.child.pid
      job.message = `Running selected tasks: ${command.taskIds.join(', ')}`
      this.save()
      this.child.done
        .then((result) => {
          const status = job.stopRequested ? 'stopped' : result.status
          Object.assign(job, {
            status,
            message: job.stopRequested ? 'Owned process tree exited after Stop' : result.message
          })
          this.child = null
          this.save()
        })
        .catch((error) => {
          Object.assign(job, { status: 'failed', message: error.message })
          this.child = null
          this.save()
        })
    } catch (error) {
      Object.assign(job, { status: 'failed', message: error.message })
      this.save()
    }
  }
  async stop() {
    const child = this.child
    if (!child) return
    const job = this.current()
    job.stopRequested = true
    job.message = 'Stopping owned Windows process tree'
    this.save()
    await child.stop()
    // done resolves only after the supervisor exits AND its inherited pipes close.
    await child.done
  }
}

function config(file) {
  const cfg = read(file)
  if (
    !ID.test(cfg.runnerId || '') ||
    cfg.repo !== 'GrammieGuide' ||
    !WORKFLOWS.includes(cfg.workflow)
  )
    throw new Error('Invalid local runner configuration')
  for (const key of [
    'repoDir',
    'runsDir',
    'stateDir',
    'workflowFile',
    'remoteConfig',
    'claudeExe',
    'backlogCli',
    'progressHelper'
  ])
    if (!path.isAbsolute(cfg[key] || '')) throw new Error(`Local ${key} must be an absolute path`)
  if (cfg.ghExe !== undefined && !path.isAbsolute(cfg.ghExe))
    throw new Error('Local ghExe must be an absolute path')
  const remote = read(cfg.remoteConfig)
  const url = new URL(remote.url)
  if (
    url.origin !== 'https://workflow.koreokorp.com' ||
    url.pathname !== '/api/snapshot' ||
    !remote.token
  )
    throw new Error('Expected configured HTTPS board snapshot endpoint and token')
  return { ...cfg, remote }
}
async function request(cfg, endpoint, body) {
  const response = await fetch(new URL(endpoint, cfg.remote.url), {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.remote.token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok)
    throw new Error(
      `Board HTTP ${response.status}${response.status === 409 ? ': conflicting runner instance/job; inspect journal' : ''}`
    )
  return response.json()
}
function catalog(cfg) {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [cfg.backlogCli, 'task', 'list', '--json', '--status', 'To Do'],
      {
        cwd: cfg.repoDir,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 8 * 1024 * 1024
      }
    )
  )
  if (result.schemaVersion !== 1 || !Array.isArray(result.tasks) || result.nextSkip != null)
    throw new Error('Unsupported or incomplete Backlog export')
  const prs = JSON.parse(
    execFileSync(
      cfg.ghExe || onPath('gh.exe'),
      ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'title,url,headRefName'],
      { cwd: cfg.repoDir, windowsHide: true, encoding: 'utf8', timeout: 30000 }
    )
  )
  if (!Array.isArray(prs) || prs.length >= 100)
    throw new Error('Open PR lookup was incomplete; refresh after inspection')
  const taken = new Map()
  for (const pr of prs) {
    for (const id of `${pr.title} ${pr.headRefName}`.toUpperCase().match(/\bTASK-\d+(?:\.\d+)*/g) ||
      [])
      taken.set(id, pr.url)
  }
  return result.tasks
    .filter((task) => TASK.test(task.id))
    .map((task) => ({
      id: task.id,
      title: task.title,
      stage: taken.has(task.id) ? 'pr-open' : 'queued',
      pr: taken.get(task.id) || '',
      note: taken.has(task.id)
        ? 'Open PR; unavailable for another run.'
        : 'Local To Do catalog; workflow will recheck origin, dependencies, blockers and open PRs before building.'
    }))
}
function publishCatalog(cfg) {
  const tasks = catalog(cfg)
  const dir = path.join(cfg.stateDir, 'catalog')
  fs.mkdirSync(dir, { recursive: true })
  const patch = {
    run: {
      tag: `${cfg.runnerId}-catalog`,
      repo: cfg.repo,
      workflow: cfg.workflow,
      status: 'catalog',
      note: 'Read-only local To Do catalog; no tasks have been started',
      board: 'https://workflow.koreokorp.com'
    },
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t]))
  }
  // The existing helper preserves removed tasks; explicitly retire old catalog entries.
  const previous = path.join(dir, 'progress.json')
  if (fs.existsSync(previous))
    for (const id of Object.keys(read(previous).tasks))
      if (!patch.tasks[id])
        patch.tasks[id] = { stage: 'done', note: 'No longer in local To Do catalog' }
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [cfg.progressHelper, dir, encodeURIComponent(JSON.stringify(patch))],
      { windowsHide: true, encoding: 'utf8', timeout: 15000 }
    )
  )
  if (result.remote !== 'ok') throw new Error(`Catalog upload: ${result.remote}`)
  return { tasks: tasks.length, tag: patch.run.tag, remote: result.remote }
}
function preflight(cfg, command) {
  if (process.platform !== 'win32') throw new Error('Live execution requires Windows')
  for (const file of [cfg.claudeExe, cfg.workflowFile, cfg.progressHelper]) fs.accessSync(file)
  // The job names the workflow, so the file checked here must be the one that name loads.
  // A project copy might win the lookup and skip the board integration; refuse instead.
  if (
    path.resolve(cfg.workflowFile) !==
      path.join(os.homedir(), '.claude', 'workflows', `${cfg.workflow}.js`) ||
    fs.existsSync(path.join(cfg.repoDir, '.claude', 'workflows', `${cfg.workflow}.js`))
  )
    throw new Error('workflowFile must be the saved user workflow named by workflow')
  const baseWorkflow = path.join(path.dirname(cfg.workflowFile), 'backlog-run.js')
  if (!fs.readFileSync(baseWorkflow, 'utf8').includes('// board-runner integration v1'))
    throw new Error('Install workflow integration before enabling execution')
  const available = new Set(
    catalog(cfg)
      .filter((t) => t.stage === 'queued')
      .map((t) => t.id)
  )
  if (command.taskIds.some((id) => !available.has(id)))
    throw new Error('Selected task is no longer in local To Do catalog; refresh selection')
}
function launch(cfg, command) {
  const args = workflowArgs(command, cfg)
  fs.mkdirSync(args.runDir, { recursive: true })
  const promptFile = path.join(args.runDir, 'workflow-prompt.txt')
  fs.writeFileSync(promptFile, workflowPrompt(command, cfg))
  const output = fs.openSync(path.join(args.runDir, 'claude-output.json'), 'w')
  const errors = fs.openSync(path.join(args.runDir, 'claude-stderr.log'), 'w')
  const child = spawn(
    POWERSHELL,
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'owned-process.ps1'),
      '-Executable',
      cfg.claudeExe,
      '-PromptFile',
      promptFile,
      '-OwnerProcessId',
      String(process.pid)
    ],
    {
      cwd: cfg.repoDir,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', output, errors],
      env: {
        ...process.env,
        WORKFLOW_BOARD_RUN_TAG: args.runTag,
        WORKFLOW_BOARD_RUN_DIR: args.runDir
      }
    }
  )
  fs.closeSync(output)
  fs.closeSync(errors)
  let spawnError
  let stopRequested = false
  const done = new Promise((resolve) => {
    child.on('error', (error) => {
      spawnError = error
    })
    child.on('close', (code) => {
      // A successful CLI exit alone does not prove Workflow ran. Require its matching
      // terminal progress snapshot, and never manufacture successful task completion.
      let progress
      try {
        progress = read(path.join(args.runDir, 'progress.json'))
      } catch {
        // Missing/malformed progress is a failed run, even when the CLI exits zero.
      }
      const status = progress?.run?.tag === args.runTag ? progress.run.status : null
      const ok = code === 0 && status === 'done'
      const terminalStatus = stopRequested
        ? 'stopped'
        : ok
          ? 'done'
          : status === 'stopped'
            ? 'stopped'
            : 'failed'
      let snapshotNote = ''
      if (terminalStatus !== 'done') {
        // A killed workflow cannot run its Summary phase. Preserve its worktrees and
        // completed outcomes, but retire unfinished rows and publish the terminal run.
        const tasks = {}
        for (const id of command.taskIds) {
          const task = progress?.tasks?.[id]
          if (!['pr-open', 'draft-pr', 'done', 'skipped'].includes(task?.stage))
            tasks[id] = {
              stage: !task || task.stage === 'queued' ? 'not-started' : 'stuck',
              note: `${terminalStatus}; inspect preserved worktree and local logs`
            }
        }
        try {
          const result = JSON.parse(
            execFileSync(
              process.execPath,
              [
                cfg.progressHelper,
                args.runDir,
                encodeURIComponent(
                  JSON.stringify({
                    run: {
                      tag: args.runTag,
                      runDir: args.runDir,
                      repo: cfg.repo,
                      workflow: cfg.workflow,
                      status: terminalStatus,
                      note: 'Runner observed owned process exit; unfinished work preserved'
                    },
                    tasks
                  })
                )
              ],
              {
                windowsHide: true,
                encoding: 'utf8',
                timeout: 15000,
                stdio: ['ignore', 'pipe', 'pipe']
              }
            )
          )
          if (result.remote !== 'ok') snapshotNote = '; progress upload pending/failed'
        } catch {
          snapshotNote = '; terminal snapshot failed; inspect local progress'
        }
      }
      resolve({
        status: terminalStatus,
        message: spawnError
          ? `Launch failed: ${spawnError.code}`
          : ok
            ? 'Workflow finished; inspect task outcomes and PRs'
            : `Workflow exited (${code}); terminal progress: ${status || 'missing'}. Inspect local logs.${snapshotNote}`
      })
    })
  })
  return {
    pid: child.pid,
    done,
    stop: async () => {
      stopRequested = true
      // Job Object owns every descendant. Terminating its supervisor closes the sole
      // job handle; no PID lookup, process-name match or unrelated session is touched.
      if (child.exitCode === null && child.signalCode === null && !child.kill())
        throw new Error('Could not terminate owned supervisor')
    }
  }
}
function acquire(file) {
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' })
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
    const pid = Number(fs.readFileSync(file, 'utf8'))
    if (!Number.isInteger(pid) || pid <= 0 || alive(pid))
      throw new Error('Runner already active, or lock needs manual inspection')
    fs.unlinkSync(file)
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' })
  }
  return () => {
    if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.unlinkSync(file)
  }
}
async function recover(cfg, journal, deps = { request, alive }) {
  const state = read(journal)
  const job = state.jobs[state.currentId]
  if (!job) return console.log('No unresolved job')
  if (job.launchAttempted && (!job.pid || deps.alive(job.pid)))
    throw new Error(
      'Owned child may still be alive (or spawn outcome unknown). Inspect locally; automatic recovery refused.'
    )
  const status = TERMINAL.has(job.status) ? job.status : 'failed'
  const response = await deps.request(cfg, '/api/runner/poll', {
    runnerId: cfg.runnerId,
    instanceId: state.instanceId,
    repo: cfg.repo,
    workflow: cfg.workflow,
    name: cfg.name,
    acceptingJobs: false,
    current: {
      id: job.id,
      status,
      runTag: job.runTag,
      message: 'Recovered journal after owned child exit; job will not be replayed'
    }
  })
  // Same bar as a normal poll. Clearing the journal on any other reply would drop the
  // only record of this report while the board still shows the job as running.
  if (!response || response.ok !== true)
    throw new Error('Board did not confirm the recovered report; journal left unchanged')
  job.status = status
  state.currentId = null
  write(journal, state)
  console.log(
    'Recovered terminal acknowledgment; wait 20 seconds before restarting with a new instance'
  )
}
async function main(argv = process.argv.slice(2)) {
  if (argv.some((arg) => !['--once', '--publish-catalog', '--recover', '--check'].includes(arg)))
    throw new Error('Unknown option')
  // Both return before the listener starts, so any other option would be silently ignored.
  const alone = argv.find((arg) => arg === '--check' || arg === '--recover')
  if (alone && argv.length > 1) throw new Error(`${alone} cannot be combined with other options`)
  const file = path.join(os.homedir(), '.claude', 'workflow-tools', 'board-runner.json')
  const cfg = config(file)
  if (argv.includes('--check')) {
    console.log(
      JSON.stringify({
        runnerId: cfg.runnerId,
        executionEnabled: cfg.executionEnabled === true,
        repoDir: cfg.repoDir,
        workflow: cfg.workflow,
        localToDoTasks: catalog(cfg).length
      })
    )
    return
  }
  fs.mkdirSync(cfg.stateDir, { recursive: true })
  const release = acquire(path.join(cfg.stateDir, 'runner.lock'))
  const journal = path.join(cfg.stateDir, 'journal.json')
  let runner
  try {
    if (argv.includes('--recover')) return await recover(cfg, journal)
    if (argv.includes('--publish-catalog')) console.log(JSON.stringify(publishCatalog(cfg)))
    // A single connectivity poll is always disarmed, even if the local config is armed.
    if (argv.includes('--once')) cfg.executionEnabled = false
    runner = new Runner(cfg, {
      load: () => (fs.existsSync(journal) ? read(journal) : null),
      save: (state) => write(journal, state),
      poll: (body) => request(cfg, '/api/runner/poll', body),
      preflight: (command) => preflight(cfg, command),
      launch: (command) => launch(cfg, command)
    })
    let shutdown = false
    const stop = () => {
      shutdown = true
      runner.closed = true
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    console.log(
      JSON.stringify({
        connected: false,
        runnerId: cfg.runnerId,
        executionEnabled: cfg.executionEnabled === true
      })
    )
    do {
      try {
        await runner.poll()
        console.log(
          JSON.stringify({
            heartbeat: new Date().toISOString(),
            status: runner.current()?.status || 'idle',
            executionEnabled: cfg.executionEnabled === true
          })
        )
      } catch (error) {
        console.error(error.message)
        if (argv.includes('--once')) throw error
      }
      if (argv.includes('--once')) break
      await new Promise((resolve) => setTimeout(resolve, 3000))
    } while (!shutdown)
    if (runner.child) await runner.stop()
    if (runner.current()) await runner.poll()
  } finally {
    release()
  }
}
module.exports = {
  Runner,
  workflowArgs,
  workflowPrompt,
  validate,
  launch,
  read,
  write,
  catalog,
  config,
  recover,
  onPath,
  main
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
