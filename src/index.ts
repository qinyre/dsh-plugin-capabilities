/** dsh-plugin-capabilities host entry: mount the manager's HTTP routes once
 * the profile composes both the web server and the skill registry, and mount
 * a host-plane filesystem skill provider so the Settings page sees a live
 * catalog (the web composition deliberately leaves the host row to presets).
 * The provider's custom roots also take the user-registered skill
 * repositories from the plugin state file, and remount whenever those
 * change — the catalog follows without a dsh restart. */

import type { Context } from '@deepseek-ai/cordis'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentSkillRoots } from './agents.ts'
import { argvProfile, dshHomeDir, profileDir } from './profile.ts'
import { mountCapabilitiesRoutes } from './routes.ts'
import { loadState } from './state.ts'
import type { CapabilitiesHost } from './types.ts'

export const name = 'dsh-plugin-capabilities'

/**
 * The package's own vendored skills (`skills/` at the package root — resolves
 * identically from src/ under vitest and from lib/ when installed). Scanned as
 * a custom root, so every session sees them through the registry's global
 * layer while the files stay zero-copy and travel with plugin installs.
 */
export function packagedSkillsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
}

/** Optional cordis.yml configuration; profile defaults to the booted one. */
export interface Config {
  /** Profile whose patch layer holds the MCP rows; defaults to argv or `web`. */
  profile?: string
}

export const inject = ['webServer', 'skills']

/** The provider plugin's structural shape (name/apply export). */
interface FilesystemSkillPlugin {
  name: string
  apply(context: Context, config?: unknown): void
}

/** The disposable fiber `ctx.plugin()` returns, as far as we use it. */
interface PluginFiber {
  dispose(): Promise<void>
}

export function apply(ctx: Context, config?: Config): void {
  const profile = config?.profile ?? argvProfile() ?? 'web'
  ctx.inject(['webServer', 'skills'], (hostCtx: Context) => {
    // The web bundle disables the host-plane `skill-filesystem` row on
    // purpose (presets own per-session discovery). The Settings manager
    // mounts its own host-plane provider as a CHILD of this plugin: it dies
    // with us, registers into the registry's global layer (deployment-level
    // providers are exactly what that layer is for — agents read the merged
    // catalog), and preset layers keep their semantics (nearest layer still
    // wins duplicate names). Custom roots, in scan order: the package's own
    // vendored skills (read-only, update with the plugin), the user's
    // registered repositories (local paths and GitHub checkouts, managed
    // from the Settings page), then other agents' skill roots
    // (~/.claude/skills, ~/.codex/skills) — zero-copy, live-synced both
    // ways. Registering or removing a repository remounts the provider with
    // the new root set; a failed load only means an empty catalog — the
    // routes keep serving.
    let providerFiber: PluginFiber | undefined
    let disposed = false
    ctx.effect(() => {
      const disposer = (): void => { disposed = true }
      let chain: Promise<void> = Promise.resolve()
      const remountProvider = (): Promise<void> => {
        // Serialize remounts; concurrent add/remove requests must not
        // interleave dispose and re-plugin on the same provider.
        chain = chain.then(async () => {
          if (disposed) return
          const mod = (await import('@deepseek-ai/dsh-skill-filesystem')) as unknown as
            (FilesystemSkillPlugin & { default?: FilesystemSkillPlugin })
          const plugin = mod.default ?? mod
          if (providerFiber !== undefined) {
            const old = providerFiber
            providerFiber = undefined
            try { await old.dispose() } catch { /* unloading raced us */ }
          }
          if (disposed) return
          const roots = [
            packagedSkillsDir(),
            ...loadState().skillRoots.flatMap(entry => entry.roots),
            ...agentSkillRoots(),
          ].filter(dir => existsSync(dir))
          try {
            providerFiber = hostCtx.plugin(plugin, roots.length > 0 ? { customSkillDirs: roots } : {}) as PluginFiber
          } catch {
            // Context already disposed: nothing left to mount for.
          }
        })
        chain = chain.catch(() => undefined)
        return chain
      }
      void remountProvider()

      ctx.effect(
        () => mountCapabilitiesRoutes(hostCtx as unknown as CapabilitiesHost, {
          profileDirPath: profileDir(profile),
          dshHomePath: dshHomeDir(),
          remountProvider,
        }),
        'dsh-plugin-capabilities: http routes',
      )
      return disposer
    }, 'dsh-plugin-capabilities: skill provider')
  })
}
