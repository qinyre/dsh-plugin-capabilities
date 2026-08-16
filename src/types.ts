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
}

/** The skills service subset this plugin consumes (structural). */
export interface SkillsService {
  list(options?: { cwd?: string }): Promise<HostSkill[]>
  get(name: string, options?: { cwd?: string }): Promise<{ name: string; content: string }>
}

/** Host context carrying both services this plugin injects. */
export interface CapabilitiesHost {
  webServer: WebServerService
  skills: SkillsService
}
