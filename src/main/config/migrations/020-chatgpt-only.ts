import type { Migration } from './index'

/** Remove obsolete credentials without resetting voice, facts or the rest of Home. */
export const migration: Migration = {
  version: 20,
  migrate(prev) {
    const config = prev as Record<string, unknown>
    const buddy = (config.buddy ?? {}) as Record<string, unknown>
    const { anthropicApiKey: _anthropic, openrouterApiKey: _openrouter, ...settings } = buddy
    return {
      ...config,
      schemaVersion: 20,
      buddy: {
        ...settings,
        provider: 'chatgpt',
        model: buddy.provider === 'chatgpt' ? (buddy.model ?? '') : ''
      }
    }
  }
}
