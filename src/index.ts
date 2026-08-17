/** dsh-plugin-capabilities host entry: mount the manager's HTTP routes once
 * the profile composes both the web server and the skill registry, and mount
 * a host-plane filesystem skill provider so the Settings page sees a live
 * catalog (the web composition deliberately leaves the host row to presets). */

import type { Context } from '@deepseek-ai/cordis'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentSkillRoots } from './agents.ts'
import { argvProfile, profileDir } from './profile.ts'
import { mountCapabilitiesRoutes } from './routes.ts'
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
    // vendored skills (read-only, update with the plugin), then other agents'
    // skill roots (~/.claude/skills, ~/.codex/skills) — zero-copy, live-synced
    // both ways. A failed load only means an empty catalog — the routes keep
    // serving.
    void (async () => {
      try {
        const mod = (await import('@deepseek-ai/dsh-skill-filesystem')) as unknown as
          (FilesystemSkillPlugin & { default?: FilesystemSkillPlugin })
        const plugin = mod.default ?? mod
        const roots = [packagedSkillsDir(), ...agentSkillRoots()].filter(dir => existsSync(dir))
        hostCtx.plugin(plugin, roots.length > 0 ? { customSkillDirs: roots } : {})
      } catch {
        // Unresolvable provider: skills list stays empty; MCP tab unaffected.
      }
    })()

    ctx.effect(
      () => mountCapabilitiesRoutes(hostCtx as unknown as CapabilitiesHost, { profileDirPath: profileDir(profile) }),
      'dsh-plugin-capabilities: http routes',
    )
  })
}
