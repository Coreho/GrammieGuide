import type { Migration } from './index'

/** Preserve identities so an in-flight callback journal still refers to the same people. */
export const migration: Migration = {
  version: 22,
  migrate(prev) {
    const config = prev as Record<string, unknown>
    const { preferred, fallback, ...contacts } = (config.contacts ?? {}) as Record<string, unknown>
    return {
      ...config,
      schemaVersion: 22,
      contacts: { ...contacts, people: contacts.people ?? [preferred, fallback].filter(Boolean) }
    }
  }
}
