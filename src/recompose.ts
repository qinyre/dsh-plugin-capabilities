/**
 * Live recompose: apply MCP patch-layer changes to the running host without
 * a restart, through the official mechanism — the same app-boot
 * reconcileProfilePatches call the plugin manager uses when the hmr service
 * is armed. A plain `dsh web` boot arms no file watcher, so the explicit
 * reconcile is what actually recomposes the mcp-client rows; hosts without
 * an anchored app-boot (0.1.x, unusual launches) fall back to the
 * restart-required banner.
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CapabilitiesHost } from './types.ts'

interface AppBootReconcile {
  readProfilePatches(binName: string, context: unknown): unknown[]
  reconcileProfilePatches(ctx: unknown, patches: unknown[], binName: string, requiredIds?: readonly string[]): Promise<unknown>
}

let appBoot: AppBootReconcile | null | undefined

/** The runtime's CLI entry this host booted from: a direct bin.js launch, or
 * — walking up from any argv script — the desktop host's own CLI (which
 * resolves runtime packages inside the asar), else a dsh install's bin.js.
 * The entry is the require anchor for @deepseek-ai/dsh-app-boot: only the
 * copy whose bootstrap map holds THIS root context can reconcile live. */
export function dshCliAnchor(argv: readonly string[] = process.argv, exists: (path: string) => boolean = existsSync): string | undefined {
  for (const candidate of argv.slice(1)) {
    if (typeof candidate !== 'string' || !/\.[cm]?js$/.test(candidate) || !exists(candidate)) continue
    let dir = dirname(resolve(candidate))
    for (let depth = 0; depth < 6 && dir !== dirname(dir); depth++) {
      const scoped = join(dir, 'node_modules', '@deepseek-ai')
      const desktopCli = join(scoped, 'dsh-desktop-host', 'lib', 'cli.js')
      const cliEntry = join(scoped, 'dsh', 'lib', 'bin.js')
      if (exists(desktopCli)) return desktopCli
      if (exists(cliEntry)) return cliEntry
      dir = dirname(dir)
    }
  }
  return undefined
}

async function loadAppBoot(): Promise<AppBootReconcile | null> {
  if (appBoot !== undefined) return appBoot
  const entry = dshCliAnchor()
  if (entry !== undefined) {
    try {
      const file = createRequire(entry).resolve('@deepseek-ai/dsh-app-boot')
      const mod = (await import(pathToFileURL(file).href)) as Partial<AppBootReconcile>
      appBoot = typeof mod.reconcileProfilePatches === 'function' && typeof mod.readProfilePatches === 'function'
        ? (mod as AppBootReconcile)
        : null
    } catch {
      appBoot = null
    }
  } else {
    appBoot = null
  }
  return appBoot
}

/**
 * Recompose the running profile from the patch layers on disk. Returns true
 * when the official reconcile ran clean — the MCP rows are live and no
 * restart is needed. False on any miss (no anchor, no app-boot, no
 * profileContext, or the reconcile rejected); callers keep the
 * restart-required notice for exactly those hosts.
 */
export async function recomposeProfile(host: CapabilitiesHost): Promise<boolean> {
  const profile = host.get?.('profileContext')
  const root = (host as { root?: unknown }).root
  const boot = await loadAppBoot()
  if (boot === null || profile === undefined || root === undefined) {
    host.get?.('hmr') // arming fallback for watcher-driven hosts
    return false
  }
  try {
    await boot.reconcileProfilePatches(root, boot.readProfilePatches('dsh', profile), 'dsh')
    return true
  } catch {
    host.get?.('hmr')
    return false
  }
}
