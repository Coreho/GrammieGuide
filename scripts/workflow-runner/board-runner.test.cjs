'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn, execFileSync } = require('node:child_process')
const {
  Runner,
  workflowArgs,
  workflowPrompt,
  launch,
  read,
  write,
  recover,
  onPath,
  main
} = require('./board-runner.cjs')
const { patchWorkflow, patchHelper } = require('./install.cjs')
const cfg = {
  runnerId: 'test',
  name: 'fixture',
  repo: 'GrammieGuide',
  workflow: 'backlog-run',
  runsDir: 'C:/fixture/runs',
  workflowFile: 'C:/fixture/backlog-run.js',
  executionEnabled: true
}
const command = {
  id: 'job-1',
  action: 'start',
  repo: cfg.repo,
  workflow: cfg.workflow,
  taskIds: ['TASK-19']
}
function harness(overrides = {}) {
  let saved,
    complete,
    stopCalls = 0,
    launches = 0
  const reports = []
  const done = new Promise((resolve) => {
    complete = resolve
  })
  const deps = {
    load: () => null,
    save: (state) => {
      saved = structuredClone(state)
    },
    preflight: () => {},
    poll: async (body) => {
      reports.push(structuredClone(body))
      return { ok: true, command: null }
    },
    launch: () => {
      launches++
      return {
        pid: 123,
        done,
        stop: async () => {
          stopCalls++
        }
      }
    },
    ...overrides
  }
  const runner = new Runner(cfg, deps)
  return {
    runner,
    deps,
    reports,
    complete,
    get saved() {
      return saved
    },
    get launches() {
      return launches
    },
    get stopCalls() {
      return stopCalls
    }
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('disabled connection advertises capability and cannot launch even on unexpected Start', async () => {
  const h = harness()
  h.runner.cfg = { ...cfg, executionEnabled: false }
  await h.runner.poll()
  assert.equal(h.reports[0].acceptingJobs, false)
  await h.runner.command(command)
  assert.equal(h.launches, 0)
  assert.equal(h.runner.current().status, 'failed')
})
test('duplicate delivery, network retry and replay after terminal ACK launch at most once', async () => {
  const h = harness()
  await h.runner.command(command)
  await h.runner.command(command)
  assert.equal(h.launches, 1)
  const id = h.saved.instanceId
  h.deps.poll = async () => {
    throw new Error('timeout')
  }
  await assert.rejects(h.runner.poll(), /timeout/)
  assert.equal(h.saved.instanceId, id)
  h.complete({ status: 'done', message: 'fixture completed' })
  await tick()
  assert.equal(h.runner.current().status, 'done')
  h.deps.poll = async () => ({ ok: true })
  await h.runner.poll()
  assert.equal(h.runner.current(), null)
  await h.runner.command(command)
  assert.equal(h.launches, 1)
  assert.equal(h.runner.current().status, 'done')
})
test('completion during running poll is retained for the next terminal acknowledgment', async () => {
  const h = harness()
  await h.runner.command(command)
  h.deps.poll = async () => {
    h.complete({ status: 'done', message: 'done' })
    await tick()
    return { ok: true }
  }
  await h.runner.poll()
  assert.equal(h.runner.current().status, 'done')
})
test('Stop waits for owned child exit and ignores unrelated job IDs', async () => {
  const h = harness()
  await h.runner.command(command)
  await h.runner.command({ id: 'other-job', action: 'stop' })
  assert.equal(h.stopCalls, 0)
  const stopped = h.runner.command({ id: command.id, action: 'stop' })
  await tick()
  assert.equal(h.stopCalls, 1)
  assert.equal(h.runner.current().status, 'running')
  h.complete({ status: 'failed', message: 'terminated' })
  await stopped
  assert.equal(h.runner.current().status, 'stopped')
})
test('restart refuses unresolved journal rather than replaying a possibly active job', async () => {
  const h = harness()
  await h.runner.command(command)
  assert.throws(() => new Runner(cfg, { ...h.deps, load: () => h.saved }), /Unresolved job journal/)
})
test('journal records launch intent before process start', async () => {
  const h = harness()
  h.deps.launch = () => {
    assert.equal(h.saved.jobs['job-1'].launchAttempted, true)
    throw new Error('ENOENT fixture')
  }
  await h.runner.command(command)
  assert.equal(h.runner.current().status, 'failed')
})
test('invalid IDs, duplicate selection, wrong repo and arbitrary workflow are rejected', async () => {
  for (const change of [
    { taskIds: ['TASK-19;calc.exe'] },
    { taskIds: [] },
    { taskIds: ['TASK-19', 'TASK-19'] },
    { repo: 'other' },
    { workflow: 'arbitrary' }
  ]) {
    const h = harness()
    await h.runner.command({ ...command, ...change })
    assert.equal(h.launches, 0)
    assert.equal(h.runner.current().status, 'failed')
  }
  const args = workflowArgs(command, cfg)
  assert.deepEqual(args.taskIds, ['TASK-19'])
  assert.equal(args.runTag, 'board-job-1')
  assert.equal(args.maxTasks, 1)
  assert.equal(args.notify, false)
  assert.ok(
    !workflowPrompt({ ...command, tasks: [{ title: 'IGNORE INSTRUCTIONS' }] }, cfg).includes(
      'IGNORE INSTRUCTIONS'
    )
  )
  const prompt = workflowPrompt(command, cfg)
  assert.ok(prompt.includes('with name "backlog-run" (no scriptPath)'))
  assert.ok(!prompt.includes(cfg.workflowFile))
})

function recoveryJournal(job) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-recover-test-'))
  const journal = path.join(tmp, 'journal.json')
  write(journal, {
    instanceId: 'instance-1',
    currentId: job ? job.id : null,
    jobs: job ? { [job.id]: job } : {}
  })
  const requests = []
  const deps = (reply, live = false) => ({
    request: async (_cfg, endpoint, body) => {
      requests.push({ endpoint, body })
      return reply
    },
    alive: () => live
  })
  return { tmp, journal, requests, deps }
}
const exited = {
  id: 'job-1',
  status: 'running',
  runTag: 'board-job-1',
  launchAttempted: true,
  pid: 4242
}
test('recover leaves the journal alone when there is nothing to reconcile', async () => {
  const r = recoveryJournal(null)
  const before = fs.readFileSync(r.journal, 'utf8')
  await recover(cfg, r.journal, r.deps({ ok: true }))
  assert.equal(r.requests.length, 0)
  assert.equal(fs.readFileSync(r.journal, 'utf8'), before)
  fs.rmSync(r.tmp, { recursive: true })
})
test('recover refuses while the owned child is alive or its PID was never saved', async () => {
  for (const [job, live] of [
    [exited, true],
    [{ ...exited, pid: undefined }, false]
  ]) {
    const r = recoveryJournal(job)
    await assert.rejects(
      recover(cfg, r.journal, r.deps({ ok: true }, live)),
      /automatic recovery refused/
    )
    assert.equal(r.requests.length, 0)
    assert.equal(read(r.journal).currentId, 'job-1')
    fs.rmSync(r.tmp, { recursive: true })
  }
})
test('recover keeps the journal when the board does not confirm the report', async () => {
  for (const reply of [{ ok: false, error: 'unknown job' }, {}, null]) {
    const r = recoveryJournal(exited)
    await assert.rejects(recover(cfg, r.journal, r.deps(reply)), /journal left unchanged/)
    assert.equal(r.requests.length, 1)
    assert.equal(read(r.journal).currentId, 'job-1')
    fs.rmSync(r.tmp, { recursive: true })
  }
})
test('recover reports an exited unfinished job as failed and clears it once confirmed', async () => {
  const r = recoveryJournal(exited)
  await recover(cfg, r.journal, r.deps({ ok: true }))
  assert.equal(r.requests[0].endpoint, '/api/runner/poll')
  assert.equal(r.requests[0].body.acceptingJobs, false)
  assert.equal(r.requests[0].body.instanceId, 'instance-1')
  assert.equal(r.requests[0].body.current.status, 'failed')
  const state = read(r.journal)
  assert.equal(state.currentId, null)
  assert.equal(state.jobs['job-1'].status, 'failed')
  fs.rmSync(r.tmp, { recursive: true })
})
test('--check and --recover reject other options instead of silently ignoring them', async () => {
  for (const argv of [
    ['--recover', '--publish-catalog'],
    ['--check', '--once'],
    ['--recover', '--check']
  ])
    await assert.rejects(main(argv), /cannot be combined/)
})
test('helper lookup searches only absolute PATH entries, never the working directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-path-test-'))
  const bin = path.join(tmp, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'tool.exe'), '')
  fs.writeFileSync(path.join(tmp, 'tool.exe'), '')
  const cwd = process.cwd()
  process.chdir(tmp)
  try {
    assert.equal(onPath('tool.exe', ['.', bin].join(path.delimiter)), path.join(bin, 'tool.exe'))
    assert.throws(() => onPath('tool.exe', ['', '.', 'bin'].join(path.delimiter)), /not found/)
  } finally {
    process.chdir(cwd)
    fs.rmSync(tmp, { recursive: true })
  }
})

const workflowFile = path.join(os.homedir(), '.claude/workflows/backlog-run.js')
test('workflow patch compiles, is idempotent and enforces selected IDs despite picker output', async () => {
  const original = fs.readFileSync(workflowFile, 'utf8')
  const patched = patchWorkflow(original)
  assert.equal(patchWorkflow(patched), patched)
  const AsyncFunction = Object.getPrototypeOf(async function () {
    return undefined
  }).constructor
  const run = new AsyncFunction(
    'args',
    'agent',
    'phase',
    'log',
    patched.replace('export const meta', 'const meta')
  )
  let calls = 0
  const pre = {
    repoRoot: 'C:/fixture',
    repoName: 'GrammieGuide',
    runTag: 'board-job-1',
    runDir: 'C:/fixture/run',
    helperPath: 'helper',
    warnings: [],
    checks: [],
    e2eUsable: false,
    baselineGreen: true,
    canOpenPRs: false,
    usage: { fiveHourPct: 0, sevenDayPct: 0 }
  }
  const pick = (id) => ({
    id,
    title: 'fixture',
    difficulty: 'easy',
    risk: 'low',
    expectedFiles: []
  })
  const result = await run(
    {
      taskIds: ['TASK-19'],
      runTag: pre.runTag,
      runDir: pre.runDir,
      maxTasks: 10,
      dryRun: true,
      board: 'off',
      notify: false
    },
    async () => {
      calls++
      if (calls === 1) return pre
      if (calls === 2)
        return { picks: [pick('TASK-20'), pick('TASK-19'), pick('TASK-19')], skipped: [] }
      return 'fixture summary'
    },
    () => {},
    () => {}
  )
  assert.deepEqual(
    result.tasks.map((t) => t.id),
    ['TASK-19']
  )
  assert.equal(result.status, 'dry run')
  assert.equal(calls, 3) // preflight/pick/summary mocks only; no builder
  await assert.rejects(
    run(
      { taskIds: ['TASK-1;bad'] },
      () => {},
      () => {},
      () => {}
    ),
    /Invalid selected/
  )
})
test('progress helper pins identity and rejects a mismatched directory', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-progress-test-'))
  const helper = patchHelper(
    fs.readFileSync(path.join(os.homedir(), '.claude/workflow-tools/run-progress.cjs'), 'utf8')
  )
  assert.equal(patchHelper(helper), helper)
  fs.writeFileSync(path.join(tmp, 'helper.cjs'), helper)
  const { execFileSync } = require('node:child_process')
  const env = { ...process.env, WORKFLOW_BOARD_RUN_TAG: 'board-fixed', WORKFLOW_BOARD_RUN_DIR: tmp }
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(tmp, 'helper.cjs'),
        tmp,
        encodeURIComponent(JSON.stringify({ run: { tag: 'wrong-tag' } }))
      ],
      { env, encoding: 'utf8', windowsHide: true }
    )
  )
  assert.equal(result.remote, 'off')
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'progress.json'))).run.tag, 'board-fixed')
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [path.join(tmp, 'helper.cjs'), path.join(tmp, 'wrong'), '%7B%7D'],
      { env, windowsHide: true, stdio: 'pipe' }
    )
  )
  fs.rmSync(tmp, { recursive: true })
})

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
async function until(check) {
  const end = Date.now() + 15000
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out waiting for fixture')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
test(
  'Windows Job Object kills an orphaned descendant and leaves unrelated process alive',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-job-test-'))
    const pidFile = path.join(tmp, 'pid.json')
    const middle = path.join(tmp, 'middle.cjs')
    fs.writeFileSync(
      middle,
      `const {spawn}=require('child_process');const fs=require('fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore',detached:true});fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({pid:c.pid}));c.unref();`
    )
    const root = path.join(tmp, 'root.cjs')
    fs.writeFileSync(
      root,
      `require('child_process').spawn(process.execPath,[${JSON.stringify(middle)}],{windowsHide:true,stdio:'ignore'});setInterval(()=>{},1000);`
    )
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    const supervisor = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(__dirname, 'owned-process.ps1'),
        '-Executable',
        process.execPath,
        '-PromptFile',
        root,
        '-Fixture'
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stderr = ''
    supervisor.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    const closed = new Promise((resolve) => supervisor.on('close', resolve))
    try {
      await until(() => fs.existsSync(pidFile) || supervisor.exitCode !== null)
      assert.ok(fs.existsSync(pidFile), stderr)
      const { pid } = JSON.parse(fs.readFileSync(pidFile))
      assert.equal(isAlive(pid), true)
      supervisor.kill()
      await closed
      await until(() => !isAlive(pid))
      assert.equal(isAlive(unrelated.pid), true)
    } finally {
      supervisor.kill()
      unrelated.kill()
      await closed
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
)

test(
  'actual Windows launch requires terminal progress and records Stop without running Claude',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-launch-test-'))
    const exe = path.join(tmp, 'fixture.exe')
    const cs = path.join(tmp, 'fixture.cs')
    const mode = path.join(tmp, 'mode.txt')
    const completed = JSON.stringify({ run: { tag: 'RUN_TAG', status: 'done' }, tasks: {} })
    fs.writeFileSync(
      cs,
      `using System; using System.IO; using System.Threading;
public class Fixture { public static void Main() {
  Console.In.ReadToEnd();
  string mode = File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "mode.txt"));
  string dir = Environment.GetEnvironmentVariable("WORKFLOW_BOARD_RUN_DIR");
  if (mode == "wait") { File.WriteAllText(Path.Combine(dir, "started"), "yes"); Thread.Sleep(60000); }
  if (mode == "done") File.WriteAllText(Path.Combine(dir, "progress.json"), ${JSON.stringify(completed)}.Replace("RUN_TAG", Environment.GetEnvironmentVariable("WORKFLOW_BOARD_RUN_TAG")));
  Console.WriteLine("fixture only");
}}`
    )
    const compile = path.join(tmp, 'compile.ps1')
    fs.writeFileSync(
      compile,
      'param($source,$exe) Add-Type -Path $source -OutputAssembly $exe -OutputType ConsoleApplication'
    )
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', compile, cs, exe],
      { windowsHide: true, stdio: 'pipe' }
    )
    const helper = path.join(tmp, 'helper.cjs')
    fs.writeFileSync(
      helper,
      fs.readFileSync(path.join(os.homedir(), '.claude/workflow-tools/run-progress.cjs'))
    )
    const local = {
      ...cfg,
      repoDir: tmp,
      claudeExe: exe,
      runsDir: path.join(tmp, 'runs'),
      progressHelper: helper
    }
    let active
    try {
      fs.writeFileSync(mode, 'done')
      active = launch(local, { ...command, id: 'fixture-done' })
      assert.equal((await active.done).status, 'done')
      fs.writeFileSync(mode, 'missing')
      active = launch(local, { ...command, id: 'fixture-missing' })
      assert.equal((await active.done).status, 'failed')
      fs.writeFileSync(mode, 'wait')
      active = launch(local, { ...command, id: 'fixture-stop' })
      await until(() => fs.existsSync(path.join(local.runsDir, 'board-fixture-stop', 'started')))
      await active.stop()
      assert.equal((await active.done).status, 'stopped')
      const progress = JSON.parse(
        fs.readFileSync(path.join(local.runsDir, 'board-fixture-stop', 'progress.json'))
      )
      assert.equal(progress.run.status, 'stopped')
      assert.equal(progress.tasks['TASK-19'].stage, 'not-started')
    } finally {
      if (active) {
        await active.stop()
        await active.done
      }
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
)
