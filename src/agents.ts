/**
 * Foreign-agent config readers: MCP servers from Claude Code (~/.claude.json,
 * ~/.claude/settings.json), Codex (~/.codex/config.toml), Cursor
 * (~/.cursor/mcp.json) and Gemini CLI (~/.gemini/settings.json). Pure reads of
 * well-known paths; anything missing or malformed yields an empty list.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { McpTransport } from './mcp.ts'

/** One MCP server discovered in a foreign agent's config. */
export interface ImportedServer {
  agent: 'claude-code' | 'codex' | 'cursor' | 'gemini'
  name: string
  transport: McpTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

/** Keep only string-valued entries of a record (configs may hold numbers). */
function stringEntries(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((entry): entry is string => typeof entry === 'string')
  return out.length > 0 ? out : undefined
}

/** Map one mcpServers entry (Claude / Cursor share the shape); null for unsupported shapes (sse). */
function mapMcpServersEntry(agent: ImportedServer['agent'], name: string, entry: unknown): ImportedServer | null {
  if (typeof entry !== 'object' || entry === null) return null
  const record = entry as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : 'stdio'
  if (type === 'stdio' || (type === 'stdio' && record.command !== undefined)) {
    if (typeof record.command !== 'string' || record.command === '') return null
    return {
      agent, name, transport: 'stdio',
      command: record.command,
      args: stringArray(record.args),
      env: stringEntries(record.env),
    }
  }
  if (type === 'http' || type === 'streamable-http') {
    if (typeof record.url !== 'string' || record.url === '') return null
    return {
      agent, name, transport: 'streamable-http',
      url: record.url,
      headers: stringEntries(record.headers),
    }
  }
  // 'sse' and anything else: dsh's mcp-client speaks stdio + streamable-http only.
  return null
}

/** MCP servers from Claude Code's user-scope config files. */
export function scanClaudeMcp(home: string = homedir()): ImportedServer[] {
  const merged: Record<string, unknown> = {}
  for (const file of [join(home, '.claude', 'settings.json'), join(home, '.claude.json')]) {
    if (!existsSync(file)) continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: unknown }
      if (typeof parsed.mcpServers === 'object' && parsed.mcpServers !== null) {
        Object.assign(merged, parsed.mcpServers)
      }
    } catch {
      // Broken or partial config: skip the file, keep earlier merges.
    }
  }
  const out: ImportedServer[] = []
  for (const [name, entry] of Object.entries(merged)) {
    const mapped = mapMcpServersEntry('claude-code', name, entry)
    if (mapped !== null) out.push(mapped)
  }
  return out
}

/** MCP servers from Cursor's ~/.cursor/mcp.json (mcpServers, Claude-shaped). */
export function scanCursorMcp(home: string = homedir()): ImportedServer[] {
  const file = join(home, '.cursor', 'mcp.json')
  if (!existsSync(file)) return []
  let parsed: { mcpServers?: unknown }
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: unknown }
  } catch {
    return []
  }
  if (typeof parsed.mcpServers !== 'object' || parsed.mcpServers === null) return []
  const out: ImportedServer[] = []
  for (const [name, entry] of Object.entries(parsed.mcpServers)) {
    const mapped = mapMcpServersEntry('cursor', name, entry)
    if (mapped !== null) out.push(mapped)
  }
  return out
}

/** MCP servers from Gemini CLI's ~/.gemini/settings.json (mcpServers; httpUrl
 *  keys map to streamable-http, plain `url` marks SSE and is skipped). */
export function scanGeminiMcp(home: string = homedir()): ImportedServer[] {
  const file = join(home, '.gemini', 'settings.json')
  if (!existsSync(file)) return []
  let parsed: { mcpServers?: unknown }
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: unknown }
  } catch {
    return []
  }
  if (typeof parsed.mcpServers !== 'object' || parsed.mcpServers === null) return []
  const out: ImportedServer[] = []
  for (const [name, entry] of Object.entries(parsed.mcpServers)) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (typeof record.command === 'string' && record.command !== '') {
      out.push({
        agent: 'gemini', name, transport: 'stdio',
        command: record.command,
        args: stringArray(record.args),
        env: stringEntries(record.env),
      })
    } else if (typeof record.httpUrl === 'string' && record.httpUrl !== '') {
      out.push({ agent: 'gemini', name, transport: 'streamable-http', url: record.httpUrl })
    }
    // `url`-only entries are SSE endpoints, which dsh's client cannot speak.
  }
  return out
}

/** MCP servers from Codex's config.toml ([mcp_servers.<name>] tables). */
export function scanCodexMcp(home: string = homedir()): ImportedServer[] {
  const file = join(home, '.codex', 'config.toml')
  if (!existsSync(file)) return []
  let root: Record<string, unknown>
  try {
    root = parseToml(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return []
  }
  const table = root.mcp_servers
  if (typeof table !== 'object' || table === null) return []
  const out: ImportedServer[] = []
  for (const [name, entry] of Object.entries(table)) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (typeof record.command === 'string' && record.command !== '') {
      out.push({
        agent: 'codex', name, transport: 'stdio',
        command: record.command,
        args: stringArray(record.args),
        env: stringEntries(record.env),
      })
    } else if (typeof record.url === 'string' && record.url !== '') {
      out.push({ agent: 'codex', name, transport: 'streamable-http', url: record.url })
    }
  }
  return out
}

/** All foreign-agent MCP servers, deduplicated by (agent, name). */
export function scanAllMcp(home: string = homedir()): ImportedServer[] {
  const seen = new Set<string>()
  return [...scanClaudeMcp(home), ...scanCodexMcp(home), ...scanCursorMcp(home), ...scanGeminiMcp(home)]
    .filter(server => {
      const key = `${server.agent}/${server.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** One foreign agent whose skill directory this plugin scans when present. */
export interface AgentSkillSource {
  /** Stable key (surfaces on skill rows as `agent` for the UI). */
  key: string
  /** Display label — brand names, locale-neutral on purpose. */
  label: string
  /** Home-relative path segments. */
  segments: string[]
}

/**
 * Curated foreign-agent skill directories (user level). `~/.agents/skills`
 * is deliberately absent: the mounted provider's own user-agents root already
 * covers it, and mounting it twice would double-watch the same tree.
 */
export const AGENT_SKILL_SOURCES: readonly AgentSkillSource[] = [
  { key: 'claude', label: 'Claude Code', segments: ['.claude', 'skills'] },
  { key: 'codex', label: 'Codex', segments: ['.codex', 'skills'] },
  { key: 'gemini', label: 'Gemini CLI', segments: ['.gemini', 'skills'] },
  { key: 'cursor', label: 'Cursor', segments: ['.cursor', 'skills'] },
  { key: 'copilot', label: 'GitHub Copilot', segments: ['.copilot', 'skills'] },
  { key: 'windsurf', label: 'Windsurf', segments: ['.codeium', 'windsurf', 'skills'] },
  { key: 'windsurf-alt', label: 'Windsurf', segments: ['.windsurf', 'skills'] },
  { key: 'opencode', label: 'OpenCode', segments: ['.config', 'opencode', 'skills'] },
  { key: 'trae', label: 'Trae', segments: ['.trae', 'skills'] },
  { key: 'trae-cn', label: 'Trae CN', segments: ['.trae-cn', 'skills'] },
  { key: 'roo', label: 'Roo Code', segments: ['.roo', 'skills'] },
  { key: 'qoder', label: 'Qoder', segments: ['.qoder', 'skills'] },
  { key: 'qoder-cn', label: 'Qoder CN', segments: ['.qoder-cn', 'skills'] },
  { key: 'codebuddy', label: 'CodeBuddy', segments: ['.codebuddy', 'skills'] },
  { key: 'workbuddy', label: 'WorkBuddy', segments: ['.workbuddy', 'skills'] },
  { key: 'openclaw', label: 'OpenClaw', segments: ['.openclaw', 'skills'] },
  { key: 'clawdbot', label: 'OpenClaw', segments: ['.clawdbot', 'skills'] },
  { key: 'cc-switch', label: 'CC Switch', segments: ['.cc-switch', 'skills'] },
]

/** The user-level catalog path of one source key (undefined when unknown). */
export function agentSkillSourcePath(key: string, home: string = homedir()): string | undefined {
  const source = AGENT_SKILL_SOURCES.find(row => row.key === key)
  return source === undefined ? undefined : join(home, ...source.segments)
}

/** Which catalog source (if any) a skill directory belongs to. */
export function agentSourceOf(dir: string | undefined, home: string = homedir()): AgentSkillSource | undefined {
  if (dir === undefined) return undefined
  for (const source of AGENT_SKILL_SOURCES) {
    const root = join(home, ...source.segments)
    if (dir === root || dir.startsWith(root + sep)) return source
  }
  return undefined
}

/**
 * The filesystem provider scans each mount root exactly one level deep, but
 * real agent trees nest skills inside marketplace/plugin subdirectories. Walk
 * a root's subtree (bounded) and return the parent directory of every skill
 * folder found — mounting those parents makes every discovered skill visible
 * to the provider's one-level scan without changing the mount mechanism.
 * A directory holding SKILL.md is a leaf: never descended into, so no skill
 * is ever contributed twice.
 */
export function expandAgentRoots(root: string, limits: { maxDepth?: number; maxDirs?: number } = {}): string[] {
  const maxDepth = limits.maxDepth ?? 4
  const maxDirs = limits.maxDirs ?? 300
  const parents = new Set<string>()
  let visited = 0
  const walk = (dir: string, depth: number): void => {
    if (visited >= maxDirs) return
    visited++
    let skillDoc = false
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === 'SKILL.md') skillDoc = true
    }
    if (skillDoc) {
      // The root itself is a single skill: its parent must be the mount root
      // for the provider's child scan to see it.
      parents.add(dirname(dir) === dir ? dir : dirname(dir))
      return
    }
    if (depth >= maxDepth) return
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      if (entry.isSymbolicLink()) continue
      walk(join(dir, entry.name), depth + 1)
      if (visited >= maxDirs) return
    }
  }
  if (!existsSync(root)) return []
  walk(root, 0)
  return [...parents]
}

/** Other agents' skill roots that exist on this machine (depth-1 layout). */
export function agentSkillRoots(home: string = homedir()): string[] {
  return AGENT_SKILL_SOURCES
    .map(source => join(home, ...source.segments))
    .filter(path => existsSync(path))
}

/**
 * Mount set for the agent catalog: each existing root plus the parents of
 * nested skill folders found beneath it (see expandAgentRoots). Deduplicated
 * and existence-filtered — this is what feeds customSkillDirs at remount.
 */
export function agentSkillMountRoots(home: string = homedir()): string[] {
  const out = new Set<string>()
  for (const source of AGENT_SKILL_SOURCES) {
    const root = join(home, ...source.segments)
    if (!existsSync(root)) continue
    out.add(root)
    for (const parent of expandAgentRoots(root)) out.add(parent)
  }
  return [...out]
}
