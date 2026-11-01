import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { logReliabilityEvent } from '../reliability/reliabilityLog'
import { RavelryKeyStore } from './ravelryKey'
import { createRavelryService, type RavelryService } from './ravelryService'

let service: RavelryService | undefined
let store: RavelryKeyStore | undefined

/** Lazy, so registering the IPC handlers never touches the disk or Windows' encryption. */
export function getRavelryService(): RavelryService {
  return (service ??= createRavelryService({
    store: () =>
      (store ??= new RavelryKeyStore(join(app.getPath('userData'), 'ravelry-key.enc'), {
        encrypt: (value) => safeStorage.encryptString(value),
        decrypt: (value) => safeStorage.decryptString(value)
      })),
    canEncrypt: () => safeStorage.isEncryptionAvailable(),
    log: (detail) => logReliabilityEvent({ op: 'ravelry-fetch', ok: false, detail })
  }))
}
