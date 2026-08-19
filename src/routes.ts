/** HTTP routes bridging the Settings UI to the capabilities manager. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { scanAllMcp } from './agents.ts'
import { readJsonBody, sameOrigin, sendJson } from './http.ts'
import { loadMarketIndex, type MarketMcpServer } from './market.ts'
import { openDirectory } from './opener.ts'
import { addGitRepo, addLocalRepo, rootExists } from './repos.ts'
import { dshLaunch, restartOwnedByShell, scheduleRestart, trustedRestartRequest } from './restart.ts'
import { deleteSkill, setSkillPolicy, updateSkillFile, userSkillsDir, validateSkillInput, writeSkill, type SkillInput } from './skills.ts'
import { findRootByUrl, loadState, pluginStateDir, removeSkillRoot, type SkillRootEntry } from './state.ts'
import { removeTree } from './rmtree.ts'
import { listMcp, removeMcp, setMcpDisabled, upsertMcp, validateMcpInput, type McpInput } from './mcp.ts'
import type { CapabilitiesHost, HostSkill } from './types.ts'

/**
 * A 'custom' skill is writable only when its folder sits inside a root this
 * plugin manages: the materialized repositories under the plugin state dir,
 * or a registered local root. Vendored skills shipped inside the plugin
 * package (under node_modules) are custom-sourced too but stay read-only —
 * edits there would die with the next plugin update.
 */
function customSkillWritable(dir: string, dshHome: string | undefined): boolean {
  const state = pluginStateDir(dshHome)
  if (dir === state || dir.startsWith(state + sep)) return true
  return loadState(dshHome).skillRoots.some(entry =>
    entry.roots.some(root => dir === root || dir.startsWith(root + sep)))
}

/** Whether the save route may write this catalog row back to disk. */
function skillWritable(skill: HostSkill, dir: string | undefined, dshHome: string | undefined): boolean {
  if (dir === undefined) return false
  if (skill.source === 'user-dsh') return true
  return skill.source === 'custom' && customSkillWritable(dir, dshHome)
}

/** One catalog skill as the browser sees it (editable/dir flags added). */
type SkillRow = HostSkill & { editable: boolean; removable: boolean; dir?: string; policyEditable: boolean }

function toSkillRow(skill: HostSkill, dshHome: string | undefined): SkillRow {
  const dir = skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path : undefined
  return {
    ...skill,
    editable: skillWritable(skill, dir, dshHome),
    removable: skill.source === 'user-dsh',
    ...(dir !== undefined ? { dir } : {}),
    policyEditable: dir !== undefined,
  }
}

/** One registered repository plus a liveness flag (roots can go stale). */
function toRootView(entry: SkillRootEntry): SkillRootEntry & { live: boolean } {
  return { ...entry, live: entry.roots.every(root => rootExists(root)) }
}

export interface CapabilitiesRoutesConfig {
  profileDirPath: string
  /** Remount the host-plane skill provider after root-set changes. */
  remountProvider: () => Promise<void>
}

/** Register the manager's routes; returns the disposer removing them all. */
export function mountCapabilitiesRoutes(host: CapabilitiesHost, config: CapabilitiesRoutesConfig): () => void {
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
          sendJson(response, 200, { skills: skills.map(skill => toSkillRow(skill, process.env.DSH_HOME)) })
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
          if (definition === undefined) {
            sendJson(response, 404, { error: 'skill not found' })
            return
          }
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
          // An existing skill edits in place (its own folder, whichever
          // editable source it comes from — preserving frontmatter keys the
          // editor does not own); a new name creates in the user root. The
          // file location is resolved server-side from the catalog, never
          // taken from the request.
          const existing = (await host.skills.list()).find(skill => skill.name === input.name)
          if (existing !== undefined) {
            const dir = existing.resourceBase?.kind === 'directory' ? existing.resourceBase.path : undefined
            if (!skillWritable(existing, dir, process.env.DSH_HOME)) {
              sendJson(response, 403, { error: `skills from source '${existing.source}' are read-only` })
              return
            }
            updateSkillFile(join(dir as string, 'SKILL.md'), input)
          } else {
            writeSkill(input)
          }
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
      path: '/dsh-plugin-capabilities/skill/policy',
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
          const body = (await readJsonBody(request)) as { name?: unknown; enabled?: unknown }
          if (typeof body.name !== 'string' || typeof body.enabled !== 'boolean') {
            sendJson(response, 400, { error: 'name and enabled are required' })
            return
          }
          const definition = await host.skills.get(body.name)
          if (definition === undefined) {
            sendJson(response, 404, { error: 'skill not found' })
            return
          }
          if (definition.path === undefined) {
            sendJson(response, 422, { error: 'skill has no file on disk (runtime-registered)' })
            return
          }
          setSkillPolicy(definition.path, body.enabled)
          sendJson(response, 200, { ok: true })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/open',
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
          const body = (await readJsonBody(request)) as { target?: unknown; name?: unknown; id?: unknown }
          if (typeof body.target !== 'string') {
            sendJson(response, 400, { error: 'target is required' })
            return
          }
          // Targets are resolved server-side; the browser never supplies a
          // raw path, so this cannot be turned into an arbitrary open.
          let dir: string | undefined
          if (body.target === 'user-skills') {
            dir = userSkillsDir()
            // 用户还没建过任何技能时该目录不存在；「打开技能目录」应按需创建而非报错。
            mkdirSync(dir, { recursive: true })
          } else if (body.target === 'plugin-state') {
            dir = pluginStateDir()
            mkdirSync(dir, { recursive: true })
          } else if (body.target === 'skill') {
            if (typeof body.name !== 'string') {
              sendJson(response, 400, { error: 'name is required' })
              return
            }
            const definition = await host.skills.get(body.name)
            if (definition === undefined) {
              sendJson(response, 404, { error: 'skill not found' })
              return
            }
            dir = definition.path !== undefined
              ? definition.path.replace(/[/\\]SKILL\.md$/, '').replace(/[/\\][^/\\]+\.md$/, '')
              : definition.resourceBase?.kind === 'directory' ? definition.resourceBase.path : undefined
          } else if (body.target === 'root') {
            if (typeof body.id !== 'string') {
              sendJson(response, 400, { error: 'id is required' })
              return
            }
            const entry = loadState().skillRoots.find(row => row.id === body.id)
            if (entry === undefined) {
              sendJson(response, 404, { error: 'repository not found' })
              return
            }
            dir = entry.materialDir ?? entry.path ?? entry.roots[0]
          } else {
            sendJson(response, 400, { error: 'unknown target' })
            return
          }
          if (dir === undefined || !openDirectory(dir)) {
            sendJson(response, 422, { error: 'directory is not available on disk' })
            return
          }
          sendJson(response, 200, { ok: true })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/roots',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        sendJson(response, 200, { roots: loadState().skillRoots.map(toRootView) })
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/roots/add',
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
          const body = (await readJsonBody(request)) as { kind?: unknown; path?: unknown; url?: unknown }
          if (body.kind !== 'local' && body.kind !== 'git') {
            sendJson(response, 400, { error: 'kind must be local or git' })
            return
          }
          const entry = body.kind === 'local'
            ? typeof body.path === 'string' && body.path.trim() !== ''
              ? await addLocalRepo(body.path)
              : undefined
            : typeof body.url === 'string' && body.url.trim() !== ''
              ? await addGitRepo(body.url)
              : undefined
          if (entry === undefined) {
            sendJson(response, 400, { error: body.kind === 'local' ? 'path is required' : 'url is required' })
            return
          }
          await config.remountProvider()
          sendJson(response, 200, { ok: true, root: toRootView(entry) })
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/roots/remove',
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
          const removed = removeSkillRoot(body.id)
          if (removed === undefined) {
            sendJson(response, 404, { error: 'repository not found' })
            return
          }
          // Unwatch before unlink: the provider's directory watchers hold
          // handles on the material tree, and removing a watched tree on
          // Windows fails with EPERM (the state is already saved by then,
          // which is why the repo still disappears despite the error).
          await config.remountProvider()
          if (removed.materialDir !== undefined) removeTree(removed.materialDir)
          sendJson(response, 200, { ok: true })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/market/skills',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const index = await loadMarketIndex('skills')
        if (index === null) {
          sendJson(response, 502, { error: 'market index unavailable (offline?)' })
          return
        }
        sendJson(response, 200, {
          source: index.source,
          repos: (index.skills ?? []).map(repo => ({ ...repo, installedId: findRootByUrl(repo.url)?.id ?? null })),
        })
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/market/mcp',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        const index = await loadMarketIndex('mcp')
        if (index === null) {
          sendJson(response, 502, { error: 'market index unavailable (offline?)' })
          return
        }
        const existing = new Set(listMcp(config.profileDirPath).map(row => row.serverName))
        sendJson(response, 200, {
          source: index.source,
          servers: (index.servers ?? []).map(server => ({ ...server, installed: existing.has(server.id) })),
        })
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/market/skills/install',
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
          const body = (await readJsonBody(request)) as { url?: unknown }
          if (typeof body.url !== 'string') {
            sendJson(response, 400, { error: 'url is required' })
            return
          }
          const entry = await addGitRepo(body.url)
          await config.remountProvider()
          sendJson(response, 200, { ok: true, root: toRootView(entry) })
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),

    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-capabilities/market/mcp/install',
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
          const index = await loadMarketIndex('mcp')
          const server = index?.servers?.find((row: MarketMcpServer) => row.id === body.id)
          if (server === undefined) {
            sendJson(response, 404, { error: 'server not found in the market index' })
            return
          }
          if (listMcp(config.profileDirPath).some(row => row.serverName === server.id)) {
            sendJson(response, 409, { error: 'already installed' })
            return
          }
          const input: McpInput = {
            id: '',
            serverName: server.id,
            transport: server.transport,
            ...(server.transport === 'stdio'
              ? { command: server.command, args: server.args, env: undefined }
              : { url: server.url }),
          }
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
