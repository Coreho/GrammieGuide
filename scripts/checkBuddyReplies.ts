import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultConfig, configSchema } from '../src/shared/configSchema'
import { BUDDY_REPLY_CASES, flagBuddyReply } from './buddyReplyChecks'
import type { BuddyChatResult } from '../src/shared/ipcContract'

/** This script's own messages: safe to print, unlike provider, parse or filesystem errors. */
class CheckError extends Error {}

/** Manual only: real requests cost API credit. Normal unit/E2E suites never import this CLI. */
async function main(): Promise<void> {
  if (!process.argv.includes('--live') || process.env.CI) {
    throw new CheckError(
      'Run by hand with --live. This check sends synthetic statements using your saved Buddy API key.'
    )
  }
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const configArgument = process.argv.indexOf('--config')
  if (configArgument >= 0 && !process.argv[configArgument + 1])
    throw new CheckError('Provide a local settings file after --config.')
  const configPath =
    configArgument >= 0
      ? resolve(process.argv[configArgument + 1]!)
      : join(process.env.APPDATA ?? '', 'grammieguide', 'grammieguide-config.json')
  const parsed = configSchema.safeParse(JSON.parse(await readFile(configPath, 'utf8')))
  if (!parsed.success)
    throw new CheckError(
      'The local settings are invalid. Open the app to migrate or repair them before running this check.'
    )
  const saved = parsed.data.buddy
  const key = saved.provider === 'openrouter' ? saved.openrouterApiKey : saved.anthropicApiKey
  if (!key) throw new CheckError('Set the selected provider API key in admin → Buddy first.')
  const config = defaultConfig()
  // Copy only the selected chat credentials/settings, never the real profile, PIN or library.
  config.buddy = {
    ...config.buddy,
    provider: saved.provider,
    model: saved.model,
    chatEnabled: true,
    ...(saved.provider === 'openrouter' ? { openrouterApiKey: key } : { anthropicApiKey: key }),
    voiceEnabled: false,
    motion: 'reduced'
  }
  const profile = await mkdtemp(join(tmpdir(), 'grammieguide-reply-check-'))
  let app: ElectronApplication | undefined
  const cases: { id: string; statement: string; result: BuddyChatResult; flags: string[] }[] = []
  try {
    await writeFile(join(profile, 'grammieguide-config.json'), JSON.stringify(config))
    app = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
      cwd: workspace,
      env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    for (const scenario of BUDDY_REPLY_CASES) {
      const result = await page.evaluate(
        (text) => window.launcher.buddyChat([{ role: 'user', text }]),
        scenario.text
      )
      const flags = result.ok
        ? flagBuddyReply(result.reply, scenario.kind)
        : [`request-${result.reason}`]
      cases.push({ id: scenario.id, statement: scenario.text, result, flags })
      console.log(
        `${scenario.id}: ${flags.length ? flags.join(', ') : 'no rule flags — read the reply in the report'}`
      )
      // One bad credential/outage should not trigger seven further paid or failing requests.
      if (!result.ok) break
    }
  } finally {
    try {
      await app?.close()
    } finally {
      if (
        dirname(profile) === tmpdir() &&
        basename(profile).startsWith('grammieguide-reply-check-')
      )
        await rm(profile, { recursive: true, force: true, maxRetries: 3 })
    }
  }
  const folder = join(workspace, 'test-results', 'buddy-replies')
  await mkdir(folder, { recursive: true })
  const output = join(folder, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await writeFile(
    output,
    JSON.stringify(
      {
        provider: saved.provider,
        model: saved.model,
        reviewRequired: true,
        note: 'Rule flags can miss problems or flag safe replies. Read every reply; this is not proof of safety.',
        cases
      },
      null,
      2
    )
  )
  console.log(`Saved synthetic replies: ${output}`)
  if (cases.length !== BUDDY_REPLY_CASES.length || cases.some((entry) => entry.flags.length))
    process.exitCode = 1
}
main().catch((error: unknown) => {
  // Provider/parse errors can quote private configuration, so only CheckError messages are shown.
  console.error(
    error instanceof CheckError
      ? error.message
      : 'Buddy reply check could not finish. Check that the app is built and the selected provider has a working key in local settings. Use --live only by hand; see docs/buddy-reply-checks.md.'
  )
  process.exitCode = 1
})
