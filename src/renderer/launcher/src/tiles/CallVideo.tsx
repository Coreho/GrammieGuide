import { useEffect, useRef } from 'react'

/** Only a blank native canvas view occupies this slot; controls remain in React. */
export function CallVideo({ callId }: { callId: string }) {
  const slot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = slot.current
    if (!node) return
    let live = true
    let frame = 0
    const update = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!live) return
        const rect = node.getBoundingClientRect()
        const panel = node.closest('section')!.getBoundingClientRect()
        const x = Math.ceil(Math.max(0, rect.left, panel.left))
        const y = Math.ceil(Math.max(0, rect.top, panel.top))
        const right = Math.floor(Math.min(window.innerWidth, rect.right, panel.right))
        const bottom = Math.floor(Math.min(window.innerHeight, rect.bottom, panel.bottom))
        void window.launcher
          .setWhatsAppVideoBounds(
            right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
          )
          .catch(() => {})
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(node)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    update()
    return () => {
      live = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      void window.launcher.setWhatsAppVideoBounds(null).catch(() => {})
    }
  }, [callId])
  return (
    <div
      ref={slot}
      className="call-video"
      role="img"
      aria-label="Family video and your camera preview"
    >
      <p>Getting video ready…</p>
    </div>
  )
}
