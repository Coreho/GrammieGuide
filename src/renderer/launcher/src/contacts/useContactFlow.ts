import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeContactState } from '@shared/contacts'
import type { PublicContacts } from '@shared/contactSettings'

export function useContactFlow(settings: PublicContacts | undefined): {
  state: HomeContactState | null
  open: boolean
  busy: boolean
  request: () => void
  close: () => void
} {
  const [state, setState] = useState<HomeContactState | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const refresh = async (): Promise<void> => {
      const sequence = generation.current
      try {
        const result = await window.launcher.getContact()
        if (live && sequence === generation.current) setState(result)
      } catch {
        if (live && sequence === generation.current)
          setState((before) => ({
            contact: before?.contact ?? null,
            request: null,
            problem: 'unavailable'
          }))
      }
      if (live)
        timer = setTimeout(() => {
          void refresh()
        }, 1000)
    }
    if (settings?.enabled) void refresh()
    else {
      setState(null)
      setOpen(false)
    }
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [settings])

  const request = useCallback((): void => {
    setOpen(true)
    if (running.current) return
    running.current = true
    generation.current++
    setBusy(true)
    void window.launcher
      .requestCallback()
      .then(
        (result) => {
          if (mounted.current) setState(result)
        },
        () => {
          if (mounted.current)
            setState((before) => ({
              contact: before?.contact ?? null,
              request: null,
              problem: 'unavailable'
            }))
        }
      )
      .finally(() => {
        running.current = false
        if (mounted.current) setBusy(false)
      })
  }, [])
  return { state, open, busy, request, close: useCallback(() => setOpen(false), []) }
}
