import { app, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { CredentialStore } from './credentials'
import { ChatGptSession } from './session'
import { createChatGptFixture } from './testFixture'

let session: ChatGptSession | undefined
let fixture: ReturnType<typeof createChatGptFixture> | undefined
export function getChatGptFixture(): typeof fixture {
  return fixture
}
export function getChatGptSession(): ChatGptSession {
  if (!session) {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
      throw new Error(
        'Windows credential encryption is unavailable. ChatGPT sign-in cannot be saved safely.'
      )
    const store = new CredentialStore(join(app.getPath('userData'), 'chatgpt-credentials.enc'), {
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value)
    })
    if (
      process.env['GRAMMIEGUIDE_E2E'] === '1' &&
      process.env['GRAMMIEGUIDE_E2E_CHATGPT'] === '1'
    ) {
      fixture = createChatGptFixture(store)
      session = fixture.session
      return session
    }
    session = new ChatGptSession({
      store,
      open: (url) => shell.openExternal(url)
    })
  }
  return session
}
export function cancelChatGptLogin(): void {
  session?.cancelLogin()
}
