/** HTTP routes bridging the Settings UI to the capabilities manager. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { scanAllMcp } from './agents.ts'
import { readJsonBody, sameOrigin, sendJson } from './http.ts'
import { dshLaunch, restartOwnedByShell, scheduleRestart, trustedRestartRequest } from './restart.ts'
import { deleteSkill, validateSkillInput, writeSkill, type SkillInput } from './skills.ts'
import { listMcp, removeMcp, setMcpDisabled, upsertMcp, validateMcpInput, type McpInput } from './mcp.ts'
import type { CapabilitiesHost } from './types.ts'

/** Only this source is writable from the Settings page (provider rank 400). */
const EDITABLE_SOURCE = 'user-dsh'

/** Register the manager's routes; returns the disposer removing them all. */
export function mountCapabilitiesRoutes(host: CapabilitiesHost, config: { profileDirPath: string }): () => void {
  const disposers = [
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/skills',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        try {
          const skills = await host.skills.list()
          sendJson(response, 200, {
            skills: skills.map(skill => ({ ...skill, editable: skill.source === EDITABLE_SOURCE })),
          })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/skill',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const url = new URL(request.url ?? '/', 'http://localhost')
        const name = url.searchParams.get('name') ?? ''
        try {
          const definition = await host.skills.get(name)
          sendJson(response, 200, { name: definition.name, content: definition.content })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/skill/save',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = (await readJsonBody(request)) as Partial<SkillInput>
          const input: SkillInput = {
            name: typeof body.name === 'string' ? body.name : '',
            description: typeof body.description === 'string' ? body.description : '',
            whenToUse: typeof body.whenToUse === 'string' ? body.whenToUse : undefined,
            modelInvocable: body.modelInvocable !== false,
            userInvocable: body.userInvocable !== false,
            content: typeof body.content === 'string' ? body.content : '',
          }
          const invalid = validateSkillInput(input)
          if (invalid !== null) {
            sendJson(response, 400, { error: invalid })
            return
          }
          writeSkill(input)
          sendJson(response, 200, { ok: true, name: input.name })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/skill/delete',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = (await readJsonBody(request)) as { name?: unknown }
          const name = typeof body.name === 'string' ? body.name : ''
          const removed = deleteSkill(name)
          sendJson(response, removed ? 200 : 404, removed ? { ok: true, name } : { error: 'skill not found' })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/mcp',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        sendJson(response, 200, { servers: listMcp(config.profileDirPath), restartNeeded: true })
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/mcp/save',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const input = (await readJsonBody(request)) as McpInput
          const invalid = validateMcpInput(input)
          if (invalid !== null) {
            sendJson(response, 400, { error: invalid })
            return
          }
          const id = upsertMcp(config.profileDirPath, input)
          sendJson(response, 200, { ok: true, id, restartNeeded: true })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/mcp/toggle',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = (await readJsonBody(request)) as { id?: unknown; disabled?: unknown }
          if (typeof body.id !== 'string' || typeof body.disabled !== 'boolean') {
            sendJson(response, 400, { error: 'id and disabled are required' })
            return
          }
          const ok = setMcpDisabled(config.profileDirPath, body.id, body.disabled)
          sendJson(response, ok ? 200 : 404, ok ? { ok: true, restartNeeded: true } : { error: 'server row not found' })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/mcp/remove',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = (await readJsonBody(request)) as { id?: unknown }
          if (typeof body.id !== 'string') {
            sendJson(response, 400, { error: 'id is required' })
            return
          }
          const ok = removeMcp(config.profileDirPath, body.id)
          sendJson(response, ok ? 200 : 404, ok ? { ok: true, restartNeeded: true } : { error: 'server row not found' })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/import/scan',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        try {
          sendJson(response, 200, {
            servers: scanAllMcp(),
            // Profile serverNames, so the browser can grey out existing ones.
            existing: listMcp(config.profileDirPath).map(row => row.serverName),
          })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/import/apply',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = (await readJsonBody(request)) as { items?: unknown }
          const wanted = new Set(
            (Array.isArray(body.items) ? body.items : [])
              .filter((item): item is { agent: string; name: string } =>
                typeof item === 'object' && item !== null && typeof (item as { agent?: unknown }).agent === 'string' && typeof (item as { name?: unknown }).name === 'string')
              .map(item => `${item.agent}/${item.name}`),
          )
          const results: Array<{ name: string; ok: boolean; error?: string }> = []
          for (const server of scanAllMcp()) {
            if (!wanted.has(`${server.agent}/${server.name}`)) continue
            const existing = listMcp(config.profileDirPath).some(row => row.serverName === server.name)
            if (existing) {
              results.push({ name: server.name, ok: false, error: 'already in profile' })
              continue
            }
            const input: McpInput = {
              id: '',
              serverName: server.name,
              transport: server.transport,
              ...(server.transport === 'stdio'
                ? { command: server.command, args: server.args, env: server.env }
                : { url: server.url, headers: server.headers }),
            }
            const invalid = validateMcpInput(input)
            if (invalid !== null) {
              results.push({ name: server.name, ok: false, error: invalid })
              continue
            }
            upsertMcp(config.profileDirPath, input)
            results.push({ name: server.name, ok: true })
          }
          sendJson(response, 200, { ok: results.every(item => item.ok), results, restartNeeded: true })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/restart',
      handler: (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        // 进程控制：仅直接的同源回环请求；桌面模式下重启归壳层所有。
        if (!trustedRestartRequest(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        if (restartOwnedByShell()) {
          sendJson(response, 409, { error: 'restart is owned by the desktop shell' })
          return
        }
        const { pid, replacementPid, logOut } = scheduleRestart(dshLaunch())
        sendJson(response, 200, { ok: true, pid, replacementPid, logOut })
      },
    }),
  ]

  return () => { for (const dispose of disposers) dispose() }
}
