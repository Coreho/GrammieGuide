import { useEffect } from 'react'
import { isRepeatClick } from '@shared/mouse'

/**
 * Quick repeats are the point of these: a game piece or chime played twice, patting Buddy, or
 * clicking in a text box. Everything else on Home acts once for a double-click.
 */
const REPEATS_WELCOME =
  '[data-game-interactive], [data-buddy-tap], [data-buddy-chat-invite], input, textarea'

/**
 * Stops the second click of a double-click before Home sees it (see isRepeatClick). It listens
 * to click and not pointerdown, so a real frustration signal still reaches the rapid-tap
 * detector, which watches presses.
 */
export function useRepeatClickGuard(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (!isRepeatClick(event as PointerEvent)) return
      if ((event.target as Element | null)?.closest?.(REPEATS_WELCOME)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])
}
