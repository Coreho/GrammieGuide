import type { Migration } from './index'

export const migration: Migration = {
  version: 13,
  migrate(prev) {
    const p = prev as Record<string, unknown>
    const display = (p.display ?? {}) as Record<string, unknown>
    const idleDim = (display.idleDim ?? {}) as Record<string, unknown>
    return {
      ...p,
      schemaVersion: 13,
      display: {
        ...display,
        idleDim: {
          enabled: false,
          afterMinutes: 10,
          level: 0.3,
          ...idleDim
        }
      }
    }
  }
}
