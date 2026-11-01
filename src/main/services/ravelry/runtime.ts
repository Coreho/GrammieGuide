import { app, safeStorage, session } from 'electron'
import { join } from 'node:path'
import { WEB_PARTITION } from '../browser/webSession'
import { logReliabilityEvent } from '../reliability/reliabilityLog'
import { createRavelryHomeBrowse, type RavelryHomeBrowse } from './homeBrowse'
import { RavelryKeyStore } from './ravelryKey'
import { createRavelryService, type RavelryService } from './ravelryService'

let service: RavelryService | undefined
let store: RavelryKeyStore | undefined
let homeBrowse: RavelryHomeBrowse | undefined

/** Lazy, so registering the IPC handlers never touches the disk or Windows' encryption. */
export function getRavelryService(): RavelryService {
  return (service ??= createRavelryService({
    store: () =>
      (store ??= new RavelryKeyStore(join(app.getPath('userData'), 'ravelry-key.enc'), {
        encrypt: (value) => safeStorage.encryptString(value),
        decrypt: (value) => safeStorage.decryptString(value)
      })),
    canEncrypt: () => safeStorage.isEncryptionAvailable(),
    signedInFetch: (input, init) =>
      session.fromPartition(WEB_PARTITION).fetch(input as string, init),
    log: (detail) => logReliabilityEvent({ op: 'ravelry-fetch', ok: false, detail })
  }))
}

export function getRavelryHomeBrowse(): RavelryHomeBrowse {
  return (homeBrowse ??= createRavelryHomeBrowse(getRavelryService()))
}
