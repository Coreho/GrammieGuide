import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Smallest share of her chosen text size a label may shrink to before it is left to clip. */
const MIN_LABEL_FIT = 0.6

/**
 * Shrinks one label just enough that its whole words fit the tile. Rows are
 * fixed now, so a long word at the largest text size used to break mid-word
 * ("Grandchildre / n") or lose its last line. Most labels keep fit 1; the
 * caregiver's text size is only trimmed where a word cannot otherwise fit.
 * Writes a CSS variable rather than React state so measuring never re-renders.
 */
export function useLabelFit<T extends HTMLElement = HTMLDivElement>(
  label: string,
  shape: string
): RefObject<T | null> {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const text = ref.current
    const button = text?.parentElement
    if (!text || !button) return
    const overflowing = (): boolean =>
      text.scrollWidth > text.clientWidth + 1 ||
      button.scrollWidth > button.clientWidth + 1 ||
      button.scrollHeight > button.clientHeight + 1
    const fit = (): void => {
      let scale = 1
      text.style.setProperty('--label-fit', '1')
      while (scale > MIN_LABEL_FIT && overflowing()) {
        scale = Math.round((scale - 0.04) * 100) / 100
        text.style.setProperty('--label-fit', String(scale))
      }
    }
    fit()
    // The label resizes when her text size or the web font changes. Re-fitting
    // on the next frame, outside the observer callback, avoids Chromium's
    // "ResizeObserver loop" error; the second pass finds the same fit and stops.
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(text)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [label, shape])
  return ref
}
