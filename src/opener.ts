/**
 * Open a directory in the OS file manager, from the dsh sidecar process.
 * Spawned detached with all stdio ignored — a GUI file manager needs no
 * pipes, and explorer.exe reports failure through exit codes we must not
 * await (it exits non-zero even on success in several Windows versions).
 */

import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'

/** Open one directory; resolves true when a launcher was started. */
export function openDirectory(dir: string): boolean {
  try {
    if (!statSync(dir).isDirectory()) return false
  } catch {
    return false
  }
  const launcher = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  try {
    const child = spawn(launcher, [dir], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return true
  } catch {
    return false
  }
}
