import { isAdminUnlocked } from '../services/auth/adminAuth'

/**
 * Server-side enforcement, not just a UI gate: the old app's admin panel
 * had no PIN at all, and a generic config:set with no check would let
 * anyone who can reach IPC (e.g. via devtools on any window) rewrite tiles,
 * the Anthropic API key, or confusion thresholds without ever unlocking
 * anything. Every caregiver-only handler calls this first.
 */
export function requireAdminUnlocked(): void {
  if (!isAdminUnlocked()) {
    throw new Error('admin unlock required')
  }
}
