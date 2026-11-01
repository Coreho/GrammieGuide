import { useCallback, useEffect, useState } from 'react'
import type { RavelryPageState } from '@shared/knitting/ravelry'

const NOT_A_PATTERN: RavelryPageState = { savable: false, saved: false }

/**
 * Whether the page she is on in the embedded browser is a Ravelry pattern. Main works that out
 * from the page itself, and saving takes no address, so Home can only ever save what she's viewing.
 */
export function useRavelrySitePattern(
  active: boolean,
  say: (line: string) => void
): RavelryPageState & { saving: boolean; save: () => void } {
  const [state, setState] = useState<RavelryPageState>(NOT_A_PATTERN)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!active) {
      setState(NOT_A_PATTERN)
      return
    }
    let live = true
    const refresh = (): void => {
      window.launcher.ravelryPageState().then(
        (next) => {
          if (live) setState(next)
        },
        () => {
          if (live) setState(NOT_A_PATTERN)
        }
      )
    }
    refresh()
    const offPage = window.launcher.onBrowserPageChanged(refresh)
    const offKnitting = window.launcher.onKnittingChanged(refresh)
    return () => {
      live = false
      offPage()
      offKnitting()
    }
  }, [active])

  const save = useCallback((): void => {
    setSaving(true)
    window.launcher
      .saveRavelryPage()
      .then(
        (result) => {
          if (result.ok) {
            setState({ savable: true, saved: true })
            say(
              result.withInstructions
                ? 'Saved, with its instructions.'
                : 'Saved. Your family can add the instructions.'
            )
          } else {
            say(
              result.reason === 'full'
                ? 'Your pattern shelf is full. Your family can make room.'
                : "This pattern couldn't be saved right now."
            )
          }
        },
        () => say("This pattern couldn't be saved right now.")
      )
      .finally(() => setSaving(false))
  }, [say])

  return { ...state, saving, save }
}
