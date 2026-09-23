import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getConfig, setConfig } from '../../config/store'
import { logActivity } from '../activityLog/activityLog'

/**
 * The old app's admin panel opened via Ctrl+Shift+A with no PIN at all -
 * flagged in the rewrite plan as a security gap to actually fix, not port
 * forward. This adds real server-side enforcement (not just a UI screen the
 * renderer could route around): sensitive IPC handlers check
 * isAdminUnlocked() themselves.
 */

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_MS = 30_000

let unlocked = false
let failedAttempts = 0
let lockedUntil = 0

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString('hex')
}

export function isPinSet(): boolean {
  const cfg = getConfig()
  return Boolean(cfg.reliability.adminPinHash && cfg.reliability.adminPinSalt)
}

export function setPin(newPin: string, currentPin?: string): { ok: boolean; reason?: string } {
  if (!/^\d{4,8}$/.test(newPin)) {
    return { ok: false, reason: 'PIN must be 4-8 digits' }
  }
  if (isPinSet()) {
    const verify = verifyPin(currentPin ?? '')
    if (!verify.ok) return { ok: false, reason: 'current PIN incorrect' }
  }
  const salt = randomBytes(16).toString('hex')
  const hash = hashPin(newPin, salt)
  setConfig({
    reliability: { ...getConfig().reliability, adminPinHash: hash, adminPinSalt: salt }
  })
  logActivity('admin-pin-set')
  return { ok: true }
}

export function verifyPin(pin: string): { ok: boolean; reason?: string } {
  if (Date.now() < lockedUntil) {
    return { ok: false, reason: `too many attempts, try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)}s` }
  }

  const cfg = getConfig()
  const { adminPinHash, adminPinSalt } = cfg.reliability
  if (!adminPinHash || !adminPinSalt) {
    return { ok: false, reason: 'no PIN configured' }
  }

  const candidate = hashPin(pin, adminPinSalt)
  const expected = Buffer.from(adminPinHash, 'hex')
  const actual = Buffer.from(candidate, 'hex')
  const match = expected.length === actual.length && timingSafeEqual(expected, actual)

  if (match) {
    failedAttempts = 0
    return { ok: true }
  }

  failedAttempts += 1
  logActivity('admin-pin-failed', `attempt ${failedAttempts}`)
  if (failedAttempts >= LOCKOUT_THRESHOLD) {
    lockedUntil = Date.now() + LOCKOUT_MS
    failedAttempts = 0
  }
  return { ok: false, reason: 'incorrect PIN' }
}

export function unlockAdmin(pin: string): { ok: boolean; reason?: string } {
  const result = verifyPin(pin)
  if (result.ok) {
    unlocked = true
    logActivity('admin-unlocked')
  }
  return result
}

export function lockAdmin(): void {
  unlocked = false
  logActivity('admin-locked')
}

export function isAdminUnlocked(): boolean {
  return unlocked
}
