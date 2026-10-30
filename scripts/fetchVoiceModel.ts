// Downloads the Kokoro-82M model Buddy's local voice speaks with into
// resources/voice-model/ (gitignored; ~325 MB), where electron-builder picks it
// up as an extra resource. The installed app never downloads anything: the
// kiosk must speak with no network.
//
//   npm run fetch:voice                                  download what's missing
//   npx tsx scripts/fetchVoiceModel.ts --from <dir>      copy from a folder holding the same files
//
// Files are pinned to one Hugging Face revision and checked by SHA-256, so a
// changed or truncated file fails the build instead of shipping. Re-running
// skips files that already match.
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231'
// Same layout transformers.js expects under its localModelPath.
const OUT = resolve('resources/voice-model', REPO)
const FILES: Record<string, string> = {
  'config.json': 'df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f',
  'tokenizer.json': '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34',
  'tokenizer_config.json': 'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20',
  // fp32: on a plain CPU it ran about three times faster than the q8 file.
  'onnx/model.onnx': '8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb'
}

const fromIndex = process.argv.indexOf('--from')
const from = fromIndex > 0 ? resolve(process.argv[fromIndex + 1]) : null

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

async function matches(path: string, expected: string): Promise<boolean> {
  try {
    await stat(path)
  } catch {
    return false
  }
  return (await sha256(path)) === expected
}

for (const [name, expected] of Object.entries(FILES)) {
  const target = join(OUT, name)
  if (await matches(target, expected)) {
    console.log(`ok       ${name}`)
    continue
  }
  await mkdir(dirname(target), { recursive: true })
  const partial = `${target}.partial`
  if (from) {
    await copyFile(join(from, name), partial)
  } else {
    const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${name}`
    console.log(`fetching ${name}`)
    const response = await fetch(url)
    if (!response.ok || !response.body) throw new Error(`${name}: HTTP ${response.status}`)
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      createWriteStream(partial)
    )
  }
  const actual = await sha256(partial)
  if (actual !== expected) {
    await rm(partial, { force: true })
    throw new Error(`${name}: SHA-256 ${actual} does not match the pinned ${expected}`)
  }
  await rename(partial, target)
  console.log(`saved    ${name}`)
}
console.log(`Voice model ready in ${OUT}`)
