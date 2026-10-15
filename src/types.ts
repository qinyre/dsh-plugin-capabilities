/** Shared types across the capabilities manager modules. */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** The webServer service subset this plugin consumes (structural). */
export interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

/** One skill as the host registry reports it (SkillSummary subset). */
export interface HostSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: { modelInvocable: boolean; userInvocable: boolean }
  readonly source: string
  readonly provider: string
  /** Provider-specific base (directory skills carry their folder here). */
  readonly resourceBase?: { kind: 'directory'; path: string } | { kind: 'url'; url: string } | { kind: 'opaque'; description: string }
}

/** Loaded skill definition subset the routes consume. */
export interface HostSkillDefinition {
  readonly name: string
  readonly content: string
  readonly path?: string
  readonly resourceBase?: HostSkill['resourceBase']
}

/** The skills service subset this plugin consumes (structural). */
export interface SkillsService {
  list(options?: { cwd?: string }): Promise<HostSkill[]>
  get(name: string, options?: { cwd?: string }): Promise<HostSkillDefinition | undefined>
}

/** Host context carrying both services this plugin injects. */
export interface CapabilitiesHost {
  webServer: WebServerService
  skills: SkillsService
  /**
   * Lazy service lookup (cordis `ctx.get`) for optional host services such as
   * `workspaceRegistry` — absent on old hosts, which the callers treat as
   * "no workspace picker" rather than an error.
   */
  get?(name: string): unknown
}

/** One registered workspace as the picker shows it. */
export interface WorkspaceView {
  id: string
  title: string
  path: string
  /** False when the directory disappeared from disk (rows stay visible). */
  available: boolean
}
