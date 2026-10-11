/** Profile discovery (pure reads; same contract as dsh-plugin-install). */

import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/** Profile that boots this UI: `--profile <name>` on the CLI invocation. */
export function argvProfile(argv: readonly string[] = process.argv): string | undefined {
  const flag = argv.indexOf('--profile')
  if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith('-')) return argv[flag + 1]
  return undefined
}

/** The profile a module location runs under, when it sits inside one. */
export interface ActiveProfile {
  profile: string
  profileDirPath: string
}

/**
 * Derive the active profile from where a module physically runs: pnpm
 * installs resolve packages under `<home>/profiles/<name>/node_modules/…`
 * (realpaths included, so `.pnpm` store paths still walk out through the
 * profile). Launchers that never put `--profile` on argv — the desktop host
 * is one — used to fall through to `web` and silently address the wrong
 * profile. Returns undefined for layouts outside any profile (e.g. a
 * development checkout installed via `file:`), leaving the caller's
 * argv-based fallback in charge.
 */
export function activeProfileContext(modulePath: string): ActiveProfile | undefined {
  let dir = dirname(modulePath)
  for (let depth = 0; depth < 10 && dir !== dirname(dir); depth++) {
    const parent = dirname(dir)
    if (basename(dirname(parent)) === 'profiles') {
      const profile = basename(parent)
      if (profile !== '' && profile !== '.') return { profile, profileDirPath: parent }
    }
    dir = parent
  }
  return undefined
}

/** The dsh home directory itself: `$DSH_HOME`, default `~/.dsh`. */
export function dshHomeDir(dshHome: string | undefined = process.env.DSH_HOME): string {
  return dshHome ?? join(homedir(), '.dsh')
}

/** Directory of a profile under DSH_HOME (default `~/.dsh`). */
export function profileDir(profile: string, dshHome: string | undefined = process.env.DSH_HOME): string {
  return join(dshHomeDir(dshHome), 'profiles', profile)
}
