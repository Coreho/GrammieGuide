/**
 * Electron wraps anything thrown in an `ipcMain.handle` before the renderer sees
 * it: `Error invoking remote method 'library:import': Error: <message>`. A
 * message written for the caregiver - "No files were added. Choose photo files
 * (PNG, JPG...)" - arrives at the admin panel buried in that wrapper, which is
 * useless to read and impossible to assert on.
 *
 * The main process deliberately throws plain messages (see libraryIpc.ts: paths
 * and filesystem errors never cross IPC), so the fix belongs here: strip the
 * wrapper on the way back and hand the panel the sentence that was written for
 * her. Pure and unit tested, because getting it wrong is silent - a mangled
 * message just looks like a slightly worse sentence.
 */

const INVOKE_WRAPPER = /^Error invoking remote method '[^']*': (?:Error:\s*)?/

/** The message as it reads once Electron's wrapper is removed. */
export function plainErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const message = error.message
  // Several wrappers can stack if a handler re-throws a wrapped error.
  let plain = message
  for (
    let stripped = plain.replace(INVOKE_WRAPPER, '');
    stripped !== plain;
    stripped = plain.replace(INVOKE_WRAPPER, '')
  ) {
    plain = stripped
  }
  return plain || message
}
