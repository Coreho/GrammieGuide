import { zLayers } from '@shared/zLayers'
import './IdleDimOverlay.css'

/** A dark veil over the whole screen; `level` is the caregiver's opacity, capped at 0.5 by the schema. */
export function IdleDimOverlay({
  dimmed,
  level,
  reducedMotion
}: {
  dimmed: boolean
  level: number
  reducedMotion: boolean
}) {
  return (
    <div
      className={`idle-dim-overlay${dimmed ? ' dimmed' : ''}${reducedMotion ? ' reduced-motion' : ''}`}
      data-idle-dimmed={dimmed ? 'true' : 'false'}
      style={{ zIndex: zLayers.idleDim, opacity: dimmed ? level : 0 }}
      aria-hidden="true"
    />
  )
}
