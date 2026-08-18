/**
 * Market indexes for the Settings “市场” tab: a remote JSON list per kind
 * (skills repositories, MCP servers) fetched from the plugin's GitHub repo,
 * with the copy bundled inside the package as an offline fallback. Entries
 * are validated before they reach the browser; a bad remote index degrades
 * to the bundled one instead of erroring the page.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Which catalog a request wants. */
export type MarketKind = 'skills' | 'mcp'

/** One installable skill repository in the skills index. */
export interface MarketSkillRepo {
  id: string
  name: string
  nameZh?: string
  description: string
  descriptionZh?: string
  url: string
  homepage?: string
  skillCount?: number
  /** Skill names inside the repository, for the market detail view. */
  skills?: string[]
}

/** One installable server in the MCP index. */
export interface MarketMcpServer {
  id: string
  name: string
  nameZh?: string
  description: string
  descriptionZh?: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  envKeys?: string[]
  url?: string
  homepage: string
  category?: string
  /** Runtime hint shown next to stdio commands (npx / uvx). */
  runtime?: string
  /** Tool names the server exposes, for the market detail view. */
  tools?: string[]
}

export interface MarketIndex {
  source: 'remote' | 'bundled'
  skills?: MarketSkillRepo[]
  servers?: MarketMcpServer[]
}

/** Remote source of truth, one file per kind under the plugin repo. */
export function marketIndexUrl(kind: MarketKind): string {
  return `https://raw.githubusercontent.com/qinyre/dsh-plugin-capabilities/main/market/${kind}.json`
}

/** The snapshot shipped inside the package (src/../market in tests, lib/../market installed). */
export function bundledMarketPath(kind: MarketKind): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'market', `${kind}.json`)
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)

function parseSkillsIndex(parsed: unknown): MarketSkillRepo[] | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const repos = (parsed as { repos?: unknown }).repos
  if (!Array.isArray(repos)) return null
  const out: MarketSkillRepo[] = []
  for (const entry of repos) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (!isString(record.id) || !isString(record.name) || !isString(record.description) || !isString(record.url)) continue
    out.push({
      id: record.id,
      name: record.name,
      ...isString(record.nameZh) ? { nameZh: record.nameZh } : {},
      description: record.description,
      ...isString(record.descriptionZh) ? { descriptionZh: record.descriptionZh } : {},
      url: record.url,
      ...isString(record.homepage) ? { homepage: record.homepage } : {},
      ...(typeof record.skillCount === 'number' ? { skillCount: record.skillCount } : {}),
      ...isStringArray(record.skills) ? { skills: record.skills } : {},
    })
  }
  return out.length > 0 ? out : null
}

function parseMcpIndex(parsed: unknown): MarketMcpServer[] | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const servers = (parsed as { servers?: unknown }).servers
  if (!Array.isArray(servers)) return null
  const out: MarketMcpServer[] = []
  for (const entry of servers) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (!isString(record.id) || !isString(record.name) || !isString(record.description) || !isString(record.homepage)) continue
    const transport = record.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
    if (transport === 'stdio' && !isString(record.command)) continue
    if (transport === 'streamable-http' && !isString(record.url)) continue
    out.push({
      id: record.id,
      name: record.name,
      ...isString(record.nameZh) ? { nameZh: record.nameZh } : {},
      description: record.description,
      ...isString(record.descriptionZh) ? { descriptionZh: record.descriptionZh } : {},
      transport,
      ...(isString(record.command) ? { command: record.command } : {}),
      ...(isStringArray(record.args) ? { args: record.args } : {}),
      ...(isStringArray(record.envKeys) ? { envKeys: record.envKeys } : {}),
      ...(isString(record.url) ? { url: record.url } : {}),
      homepage: record.homepage,
      ...isString(record.category) ? { category: record.category } : {},
      ...isString(record.runtime) ? { runtime: record.runtime } : {},
      ...isStringArray(record.tools) ? { tools: record.tools } : {},
    })
  }
  return out.length > 0 ? out : null
}

export interface LoadMarketOptions {
  fetcher?: typeof fetch
  /** Remote fetch timeout; the bundled fallback has none. */
  timeoutMs?: number
  dshHome?: string
}

/** Load one market index: remote first, bundled snapshot as fallback. */
export async function loadMarketIndex(kind: MarketKind, options: LoadMarketOptions = {}): Promise<MarketIndex | null> {
  const doFetch = options.fetcher ?? fetch
  if (kind === 'skills') {
    const remote = await fetchIndex(doFetch, 'skills', parseSkillsIndex, options)
    if (remote !== null) return { source: 'remote', skills: remote }
  } else {
    const remote = await fetchIndex(doFetch, 'mcp', parseMcpIndex, options)
    if (remote !== null) return { source: 'remote', servers: remote }
  }
  const bundled = bundledMarketPath(kind)
  if (!existsSync(bundled)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(bundled, 'utf8'))
    if (kind === 'skills') {
      const skills = parseSkillsIndex(parsed)
      return skills === null ? null : { source: 'bundled', skills }
    }
    const servers = parseMcpIndex(parsed)
    return servers === null ? null : { source: 'bundled', servers }
  } catch {
    return null
  }
}

/** Fetch and validate one remote index; null on any failure. */
async function fetchIndex<T>(
  doFetch: typeof fetch,
  kind: MarketKind,
  parse: (parsed: unknown) => T[] | null,
  options: LoadMarketOptions,
): Promise<T[] | null> {
  try {
    const response = await doFetch(marketIndexUrl(kind), { signal: AbortSignal.timeout(options.timeoutMs ?? 8000) })
    if (!response.ok) return null
    return parse(await response.json())
  } catch {
    // Network unavailable or slow: the bundled snapshot takes over.
    return null
  }
}
