#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { write } = require('./board-runner.cjs')

const marker = '// board-runner integration v1'
function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2)
    throw new Error(
      'Local workflow changed; inspect integration patch before installing: ' + from.slice(0, 90)
    )
  return source.replace(from, to)
}
function patchWorkflow(source) {
  if (source.includes(marker)) return source
  source = replaceOnce(
    source,
    'const A = parseArgs(args)',
    `const A = parseArgs(args)
${marker}
const SELECTED_IDS = A.taskIds === undefined ? null : A.taskIds
if (SELECTED_IDS !== null && (!Array.isArray(SELECTED_IDS) || !SELECTED_IDS.length ||
    SELECTED_IDS.some(id => typeof id !== 'string' || !/^TASK-\\d+(?:\\.\\d+)*$/.test(id)) ||
    new Set(SELECTED_IDS).size !== SELECTED_IDS.length)) throw new Error('Invalid selected task IDs')
const RUN_TAG = A.runTag || null
const RUN_DIR = A.runDir || null
if ((RUN_TAG === null) !== (RUN_DIR === null) ||
    (RUN_TAG && (!/^[\\w.-]{1,100}$/.test(RUN_TAG) || typeof RUN_DIR !== 'string' ||
    !/^[A-Za-z]:\\//.test(RUN_DIR) || /[\\r\\n"'\x60$]/.test(RUN_DIR)))) throw new Error('Invalid board run identity')`
  )
  source = replaceOnce(
    source,
    "const FOCUS = A.focus ? String(A.focus) : ''",
    "const FOCUS = SELECTED_IDS ? SELECTED_IDS.join(' ') : A.focus ? String(A.focus) : ''"
  )
  const identityAnchor = '  `5. helperPath = absolute forward-slash path'
  source = replaceOnce(
    source,
    identityAnchor,
    `  (RUN_TAG ? \`Board identity OVERRIDES step 4: runTag = "\${RUN_TAG}"; runDir = "\${RUN_DIR}". Use these exact values in every file, worktree, progress record and returned field. Create "\${RUN_DIR}/wt".\\n\` : '') +
${identityAnchor}`
  )
  source = replaceOnce(
    source,
    'if (pre.blocked) return { stopReason: `blocked at preflight: ${pre.blocked}` }',
    "if (pre.blocked) return { stopReason: `blocked at preflight: ${pre.blocked}` }\nif (RUN_TAG && (pre.runTag !== RUN_TAG || pre.runDir !== RUN_DIR)) throw new Error('Preflight did not preserve board run identity; no tasks started')"
  )
  source = replaceOnce(
    source,
    'const picks = picked.picks.slice(0, MAX_TASKS)',
    `// Enforce selection in code: a picker model cannot expand the authorized scope.
const seenPicks = new Set()
const picks = picked.picks.filter(p => {
  if ((SELECTED_IDS && !SELECTED_IDS.includes(p.id)) || seenPicks.has(p.id)) return false
  seenPicks.add(p.id)
  return true
}).slice(0, MAX_TASKS)`
  )
  return source
}
function patchHelper(source) {
  if (source.includes(marker)) return source
  source = replaceOnce(
    source,
    'function readPatch(raw) {',
    `${marker}
// The board runner pins identity in the child environment as a second check on
// agent-generated helper commands. Manual workflows have no such environment.
const boardTag = process.env.WORKFLOW_BOARD_RUN_TAG
const boardRunDir = process.env.WORKFLOW_BOARD_RUN_DIR
if (boardTag && (!boardRunDir || path.resolve(runDir) !== path.resolve(boardRunDir))) {
  throw new Error('Progress directory does not match the board job')
}

function readPatch(raw) {`
  )
  return replaceOnce(
    source,
    '  if (patch.run) Object.assign(state.run, patch.run)',
    `  if (patch.run) Object.assign(state.run, patch.run)
  if (boardTag) Object.assign(state.run, { tag: boardTag, runDir: boardRunDir })`
  )
}
function install() {
  const root = path.join(os.homedir(), '.claude')
  const tools = path.join(root, 'workflow-tools')
  const workflow = path.join(root, 'workflows', 'backlog-run.js')
  const helper = path.join(tools, 'run-progress.cjs')
  // Compute both before touching either; fail on source drift instead of partial edits.
  const changes = [
    [workflow, patchWorkflow(fs.readFileSync(workflow, 'utf8'))],
    [helper, patchHelper(fs.readFileSync(helper, 'utf8'))]
  ]
  for (const [file, content] of changes) {
    if (content === fs.readFileSync(file, 'utf8')) continue
    fs.copyFileSync(file, `${file}.pre-board-runner-${Date.now()}.bak`)
    const tmp = `${file}.install.tmp`
    fs.writeFileSync(tmp, content)
    fs.renameSync(tmp, file)
  }
  for (const file of ['board-runner.cjs', 'owned-process.ps1'])
    fs.copyFileSync(path.join(__dirname, file), path.join(tools, file))
  const configFile = path.join(tools, 'board-runner.json')
  if (!fs.existsSync(configFile))
    write(configFile, {
      runnerId: 'grammie-windows',
      name: 'GrammieGuide Windows (execution disabled)',
      repo: 'GrammieGuide',
      repoDir: path.resolve(__dirname, '../..'),
      workflow: 'backlog-run',
      workflowFile: workflow,
      runsDir: path.join(os.homedir(), 'GrammieGuide-runs'),
      stateDir: path.join(tools, 'board-runner-state'),
      remoteConfig: path.join(tools, 'board-remote.json'),
      claudeExe: path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
      backlogCli: path.join(process.env.APPDATA, 'npm', 'node_modules', 'backlog.md', 'cli.js'),
      progressHelper: helper,
      executionEnabled: false,
      concurrency: 2
    })
  console.log(
    JSON.stringify({
      installed: tools,
      configFile,
      executionEnabled: JSON.parse(fs.readFileSync(configFile, 'utf8')).executionEnabled,
      started: false
    })
  )
}
module.exports = { patchWorkflow, patchHelper }
if (require.main === module) install()
