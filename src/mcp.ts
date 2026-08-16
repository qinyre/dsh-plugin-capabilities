/**
 * MCP server rows in the profile's own patch layer: one
 * `@deepseek-ai/dsh-mcp-client` row per server. The YAML document API keeps
 * foreign rows and comments intact across edits. Row changes need a dsh
 * restart to compose — callers surface that as a pending-restart notice.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument, Document, type YAMLMap, type YAMLSeq } from 'yaml'
/** The plugin every managed row instantiates. */
export const MCP_PLUGIN = '@deepseek-ai/dsh-mcp-client'

/** MCP serverName grammar (dsh-mcp-client's contract). */
export const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

/** Transport choices the client supports. */
export type McpTransport = 'stdio' | 'streamable-http'

/** One managed row, as shown to the browser. */
export interface McpRow {
  id: string
  serverName: string
  transport: McpTransport
  disabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

/** Write request for one server row (id empty = create). */
export type McpInput = Omit<McpRow, 'disabled'> & { disabled?: boolean }

/** Load the profile patch as a YAML document; `[]` for a missing file. */
function loadPatch(profileDirPath: string): Document {
  const path = join(profileDirPath, 'cordis.patch.yml')
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '[]'
  return parseDocument(text)
}

function savePatch(profileDirPath: string, doc: Document): void {
  mkdirSync(profileDirPath, { recursive: true })
  writeFileSync(join(profileDirPath, 'cordis.patch.yml'), String(doc), 'utf8')
}

/** Wrap a plain value into a YAML node (yaml v2 exposes no standalone createNode). */
function toNode<T>(value: unknown): T {
  return new Document(value as never).contents as T
}

/** The patch row sequence; an empty file's null root becomes an empty seq. */
function rowSeq(doc: Document): YAMLSeq<YAMLMap> {
  if (doc.contents === null) doc.contents = toNode<YAMLSeq<YAMLMap>>([])
  return doc.contents as YAMLSeq<YAMLMap>
}

/** Rows whose `name` is the MCP client plugin. */
function mcpRows(doc: Document): YAMLMap[] {
  return (rowSeq(doc).items ?? []).filter(item => item.get('name') === MCP_PLUGIN)
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(entry => typeof entry === 'string')
}

/** Read every mcp-client row in the profile layer. */
export function listMcp(profileDirPath: string): McpRow[] {
  const doc = loadPatch(profileDirPath)
  return mcpRows(doc).map(item => {
    // config is a YAMLMap node — materialize it before property access.
    const configNode = item.get('config') as unknown
    const plain = (typeof configNode === 'object' && configNode !== null && typeof (configNode as { toJS?: unknown }).toJS === 'function'
      ? (configNode as { toJS(document: Document): unknown }).toJS(doc)
      : {}) as Record<string, unknown>
    return {
      id: String(item.get('id') ?? ''),
      serverName: String(plain.serverName ?? ''),
      transport: plain.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
      disabled: item.get('disabled') === true,
      ...(typeof plain.command === 'string' && plain.command !== '' ? { command: plain.command } : {}),
      ...(Array.isArray(plain.args) ? { args: plain.args.map(String) } : {}),
      ...(isStringMap(plain.env) ? { env: plain.env } : {}),
      ...(typeof plain.cwd === 'string' && plain.cwd !== '' ? { cwd: plain.cwd } : {}),
      ...(typeof plain.url === 'string' && plain.url !== '' ? { url: plain.url } : {}),
      ...(isStringMap(plain.headers) ? { headers: plain.headers } : {}),
    }
  })
}

/** Validate one write request; returns the rejection reason or null. */
export function validateMcpInput(input: McpInput): string | null {
  if (!SERVER_NAME_RE.test(input.serverName)) return 'serverName must be 1-32 chars of A-Z a-z 0-9 _ -'
  // The route casts raw JSON to McpInput; a create request may omit `id`.
  const id = input.id ?? ''
  if (id.includes('/') || id.includes('..')) return 'invalid id'
  if (input.transport === 'stdio') {
    if (input.command === undefined || input.command.trim() === '') return 'stdio transport requires a command'
  } else if (input.url === undefined || !/^https?:\/\//.test(input.url)) {
    return 'http transport requires an http(s) url'
  }
  return null
}

/** Add or replace one server row. Returns the (possibly deduplicated) id. */
export function upsertMcp(profileDirPath: string, input: McpInput): string {
  const inputId = input.id ?? ''
  const doc = loadPatch(profileDirPath)
  const seq = rowSeq(doc)

  const existing = inputId !== ''
    ? mcpRows(doc).find(item => item.get('id') === inputId)
    : undefined

  let id = inputId !== '' ? inputId : `mcp-${input.serverName}`
  if (existing === undefined) {
    const taken = new Set(
      (seq.items ?? []).map(item => String(item.get('id') ?? '')).filter(id => id !== ''),
    )
    let suffix = 2
    while (taken.has(id)) id = `mcp-${input.serverName}-${suffix++}`
  }

  const config: Record<string, unknown> = input.transport === 'stdio'
    ? {
        serverName: input.serverName,
        transport: input.transport,
        command: input.command,
        ...(input.args !== undefined && input.args.length > 0 ? { args: input.args } : {}),
        ...(input.env !== undefined && Object.keys(input.env).length > 0 ? { env: input.env } : {}),
        ...(input.cwd !== undefined && input.cwd !== '' ? { cwd: input.cwd } : {}),
      }
    : {
        serverName: input.serverName,
        transport: input.transport,
        url: input.url,
        ...(input.headers !== undefined && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
      }
  const row: Record<string, unknown> = { id, name: MCP_PLUGIN, config }
  if (input.disabled === true) row.disabled = true

  const node = toNode<YAMLMap>(row)
  if (existing === undefined) seq.add(node)
  else seq.items[seq.items.indexOf(existing)] = node

  savePatch(profileDirPath, doc)
  return id
}

/** Flip one row's disabled flag (absent = enabled). Returns false when missing. */
export function setMcpDisabled(profileDirPath: string, id: string, disabled: boolean): boolean {
  const doc = loadPatch(profileDirPath)
  const item = mcpRows(doc).find(row => row.get('id') === id)
  if (item === undefined) return false
  if (disabled) item.set('disabled', true)
  else item.delete('disabled')
  savePatch(profileDirPath, doc)
  return true
}

/** Remove one server row. Returns false when missing. */
export function removeMcp(profileDirPath: string, id: string): boolean {
  const doc = loadPatch(profileDirPath)
  const item = mcpRows(doc).find(row => row.get('id') === id)
  if (item === undefined) return false
  const seq = rowSeq(doc)
  seq.items.splice(seq.items.indexOf(item), 1)
  savePatch(profileDirPath, doc)
  return true
}
