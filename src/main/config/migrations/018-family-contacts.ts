import type { Migration } from './index'
import { defaultContactSetup } from '@shared/contactSettings'

export const migration: Migration = {
  version: 18,
  migrate(prev) {
    const config = prev as Record<string, unknown>
    return { ...config, schemaVersion: 18, contacts: config.contacts ?? defaultContactSetup() }
  }
}
