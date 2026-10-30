import { win32 } from 'path'

/**
 * True only for the exe the installer places: it installs per machine with no
 * choice of folder (`nsis` in package.json). A whole-path match, so a folder
 * like "GrammieGuide Old" or a copy in dist/ or a temp folder never counts.
 * Windows paths ignore case, and `win32` keeps this testable on any platform.
 */
export function isInstalledExe(exePath: string, programFiles: string | undefined): boolean {
  if (!programFiles) return false
  const installed = win32.join(programFiles, 'GrammieGuide', 'GrammieGuide.exe')
  return win32.normalize(exePath).toLowerCase() === installed.toLowerCase()
}
