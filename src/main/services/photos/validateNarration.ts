import { parseBuffer, TrackType } from 'music-metadata'
import { LIBRARY_CONTENT_TYPES } from '@shared/media/mediaTypes'
import { MAX_NARRATION_MS } from '@shared/media/narration'

export async function validateNarration(bytes: Buffer, extension: string): Promise<void> {
  const result = await parseBuffer(
    bytes,
    { mimeType: LIBRARY_CONTENT_TYPES.narration[extension], size: bytes.length },
    { duration: true }
  )
  if (
    !result.format.container ||
    !result.format.codec ||
    result.format.trackInfo.some((track) => track.type === TrackType.video)
  )
    throw new Error('Use a readable audio recording')
  if (
    result.format.duration !== undefined &&
    (!Number.isFinite(result.format.duration) ||
      result.format.duration <= 0 ||
      result.format.duration * 1000 > MAX_NARRATION_MS)
  )
    throw new Error('Keep the story under five minutes')
  // MediaRecorder's streaming WebM may omit duration. Recording and playback
  // also have five-minute timers, and every payload has the byte-size limit.
}
