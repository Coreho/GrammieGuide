import { app, protocol } from 'electron'
import { open, realpath, type FileHandle } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { MEDIA_SCHEME, parseMediaUrl } from '@shared/media/mediaPath'
import { MEDIA_CONTENT_TYPES } from '@shared/media/mediaTypes'
import { parseByteRange } from '@shared/media/byteRange'
import { logActivity } from '../activityLog/activityLog'
import { MEDIA_LIBRARY_FOLDERS } from './libraryPaths'

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
    }
  ])
}

function isInside(folder: string, candidate: string): boolean {
  const remainder = relative(folder, candidate)
  return (
    !!remainder && remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder)
  )
}

function notFound(reason: string): Response {
  // Neither URLs, filenames nor filesystem error messages belong in her activity log.
  logActivity('media-unavailable', reason)
  return new Response(null, { status: 404 })
}

async function serveMedia(request: Request): Promise<Response> {
  const media = parseMediaUrl(request.url)
  if (!media || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return notFound('invalid-request')
  }
  const contentType = MEDIA_CONTENT_TYPES[extname(media.fileName).toLowerCase()]
  if (!contentType) return notFound('unsupported-type')

  const folder = resolve(app.getPath('userData'), MEDIA_LIBRARY_FOLDERS[media.library])
  const candidate = resolve(folder, media.fileName)
  if (!isInside(folder, candidate)) return notFound('outside-library')

  let file: FileHandle | undefined
  try {
    // Also reject symlinks/junctions leading outside the managed library. Resolve the
    // folder too: a profile moved through a junction would otherwise reject every file.
    const actualPath = await realpath(candidate)
    if (!isInside(await realpath(folder), actualPath)) return notFound('outside-library')
    file = await open(actualPath, 'r')
    const stat = await file.stat()
    if (!stat.isFile()) return notFound('not-file')

    const headers = new Headers({
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff'
    })
    const range = parseByteRange(request.headers.get('Range'), stat.size)
    if (range === 'invalid') {
      logActivity('media-unavailable', 'invalid-range')
      headers.set('Content-Range', `bytes */${stat.size}`)
      headers.set('Content-Length', '0')
      return new Response(null, { status: 416, headers })
    }
    const start = range?.start ?? 0
    const end = range?.end ?? stat.size - 1
    headers.set('Content-Length', String(stat.size === 0 ? 0 : end - start + 1))
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    const status = range ? 206 : 200
    if (request.method === 'HEAD' || stat.size === 0) {
      return new Response(null, { status, headers })
    }

    const stream = file.createReadStream({ start, end, autoClose: true })
    stream.on('error', () => logActivity('media-unavailable', 'read-failed'))
    const response = new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status,
      headers
    })
    file = undefined // The stream owns the handle, including cancellation and errors.
    return response
  } catch {
    // A missing/empty library is normal before the caregiver imports anything.
    return notFound('file-unavailable')
  } finally {
    await file?.close().catch(() => logActivity('media-unavailable', 'close-failed'))
  }
}

export function installMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, serveMedia)
}
