/**
 * Skill import: copy a folder, a single markdown file, or a ZIP upload into a
 * writable destination (the user root or a workspace's `.dsh/skills`). ZIPs
 * stage under the plugin state dir and are always cleaned up; archive entry
 * names are validated against path traversal before anything is written, and
 * sources containing symlinks are refused so an import cannot smuggle a link
 * outside its tree.
 */

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { basename, extname, join, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { unzipSync } from 'fflate'
import { SKILL_NAME_RE } from './skills.ts'
import { pluginStateDir } from './state.ts'

/** Archive limits (mirrors common-sense rival caps; base64 inflates ~4/3). */
export const ZIP_MAX_BYTES = 32 * 1024 * 1024
export const ZIP_MAX_ENTRIES = 1000
export const ZIP_MAX_TOTAL_BYTES = 64 * 1024 * 1024

export type ConflictPolicy = 'skip' | 'overwrite'

export interface ImportItemResult {
  name: string
  overwritten: boolean
}

export interface ImportOutcome {
  imported: ImportItemResult[]
  skipped: string[]
  failed: Array<{ name: string; error: string }>
}

/** Loosen a source folder/file name into a kebab-case skill name; null when nothing survives. */
export function toKebab(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return SKILL_NAME_RE.test(slug) ? slug : null
}

/** The `name:` field of a SKILL.md frontmatter block, unquoted. */
export function frontmatterName(text: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) return undefined
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^name:\s*(.+?)\s*$/.exec(line)
    if (field !== null) return field[1].replace(/^["']|["']$/g, '')
  }
  return undefined
}

/** Windows reserved device names, case-insensitive, with or without extension. */
const DEVICE_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** One ZIP entry name, validated segment by segment; null when unsafe. */
function safeZipName(name: string): string | null {
  if (name === '' || name.length > 400 || name.includes('\0')) return null
  if (name.startsWith('/') || name.startsWith('\\')) return null
  if (/^[a-zA-Z]:/.test(name)) return null
  const parts: string[] = []
  for (const segment of name.split(/[\\/]/)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return null
    if (DEVICE_NAME_RE.test(segment)) return null
    parts.push(segment)
  }
  if (parts.length === 0) return null
  return parts.join('/')
}

/** True when any entry under `dir` is a symbolic link (budgeted walk). */
export function containsSymlink(dir: string, limits: { maxDepth?: number; maxEntries?: number } = {}): boolean {
  const maxDepth = limits.maxDepth ?? 4
  const maxEntries = limits.maxEntries ?? 500
  let visited = 0
  const walk = (current: string, depth: number): boolean => {
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      if (visited++ >= maxEntries) return false
      if (entry.isSymbolicLink()) return true
      if (entry.isDirectory() && depth < maxDepth && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        if (walk(join(current, entry.name), depth + 1)) return true
      }
    }
    return false
  }
  try {
    return lstatSync(dir).isSymbolicLink() || walk(dir, 0)
  } catch {
    return false
  }
}

/** One importable item discovered under a source. */
interface SourceItem {
  /** Directory to copy as `<name>/` (bundle) — or file to copy as `<name>.md` (flat). */
  path: string
  kind: 'bundle' | 'flat'
  name: string
}

/** Skill name for a bundle directory: frontmatter first, folder name second. */
function bundleName(dir: string): string | null {
  const doc = join(dir, 'SKILL.md')
  let text: string | undefined
  try {
    text = readFileSync(doc, 'utf8')
  } catch {
    return null
  }
  return toKebab(frontmatterName(text) ?? '') ?? toKebab(basename(dir))
}

/** Skill name for a flat markdown file: frontmatter first, file name second. */
function flatName(file: string): string | null {
  if (basename(file).toLowerCase() !== 'skill.md') {
    let text: string | undefined
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      text = undefined
    }
    if (text !== undefined) {
      const named = toKebab(frontmatterName(text) ?? '')
      if (named !== null) return named
    }
  }
  return toKebab(basename(file).replace(/\.md$/i, ''))
}

/** Classify one source path into the items it yields (never empty unless it throws). */
export function analyzeSource(sourcePath: string): { kind: 'dir' | 'file'; items: SourceItem[] } {
  let stats
  try {
    stats = statSync(sourcePath)
  } catch {
    throw new Error('source path does not exist')
  }
  if (stats.isFile()) {
    if (extname(sourcePath).toLowerCase() !== '.md') throw new Error('only folders, ZIP archives, and .md files can be imported')
    const name = flatName(sourcePath)
    if (name === null) throw new Error('cannot derive a kebab-case name for this file')
    return { kind: 'file', items: [{ path: sourcePath, kind: 'flat', name }] }
  }
  const hasOwnDoc = existsSync(join(sourcePath, 'SKILL.md'))
  if (hasOwnDoc) {
    const name = bundleName(sourcePath)
    if (name === null) throw new Error('cannot derive a kebab-case name for this skill')
    return { kind: 'dir', items: [{ path: sourcePath, kind: 'bundle', name }] }
  }
  const items: SourceItem[] = []
  let entries: Dirent[]
  try {
    entries = readdirSync(sourcePath, { withFileTypes: true })
  } catch {
    throw new Error('source folder is not readable')
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const child = join(sourcePath, entry.name)
    if (entry.isDirectory() && existsSync(join(child, 'SKILL.md'))) {
      const name = bundleName(child)
      if (name !== null) items.push({ path: child, kind: 'bundle', name })
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const name = flatName(child)
      if (name !== null) items.push({ path: child, kind: 'flat', name })
    }
  }
  if (items.length === 0) throw new Error('no skills found in source (looking for skill folders with SKILL.md, or .md files)')
  return { kind: 'dir', items }
}

/** Copy one item into the destination honoring the conflict policy. */
function importItem(item: SourceItem, destDir: string, conflict: ConflictPolicy, outcome: ImportOutcome): void {
  const dest = item.kind === 'bundle' ? join(destDir, item.name) : join(destDir, `${item.name}.md`)
  const clash = item.kind === 'bundle'
    ? [join(destDir, item.name), join(destDir, `${item.name}.md`)].some(existsSync)
    : [join(destDir, `${item.name}.md`), join(destDir, item.name)].some(existsSync)
  if (clash && conflict === 'skip') {
    outcome.skipped.push(item.name)
    return
  }
  if (containsSymlink(item.path)) {
    outcome.failed.push({ name: item.name, error: 'source contains symbolic links' })
    return
  }
  try {
    if (clash) rmSync(dest, { recursive: true, force: true })
    if (item.kind === 'bundle') {
      cpSync(item.path, dest, { recursive: true })
    } else {
      cpSync(item.path, dest)
    }
    outcome.imported.push({ name: item.name, overwritten: clash })
  } catch (error) {
    outcome.failed.push({ name: item.name, error: error instanceof Error ? error.message : String(error) })
  }
}

/** Import from a folder or file on disk into `destDir` (created when missing). */
export function importSkills(sourcePath: string, destDir: string, conflict: ConflictPolicy = 'skip'): ImportOutcome {
  const outcome: ImportOutcome = { imported: [], skipped: [], failed: [] }
  const { items } = analyzeSource(sourcePath)
  mkdirSync(destDir, { recursive: true })
  for (const item of items) importItem(item, destDir, conflict, outcome)
  return outcome
}

/** Decode + validate + extract a base64 ZIP into a staging dir. */
export function stageZip(base64: string, dshHome?: string): { root: string; contentDir: string } {
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) throw new Error('empty upload')
  if (bytes.length > ZIP_MAX_BYTES) throw new Error(`archive too large (max ${Math.floor(ZIP_MAX_BYTES / 1024 / 1024)} MiB)`)
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new Error('not a readable ZIP archive')
  }
  const names = Object.keys(entries)
  if (names.length > ZIP_MAX_ENTRIES) throw new Error(`too many archive entries (max ${ZIP_MAX_ENTRIES})`)
  let total = 0
  for (const name of names) total += entries[name].length
  if (total > ZIP_MAX_TOTAL_BYTES) throw new Error(`archive expands beyond ${Math.floor(ZIP_MAX_TOTAL_BYTES / 1024 / 1024)} MiB`)

  const root = join(pluginStateDir(dshHome), 'imports', `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`)
  const contentDir = join(root, 'content')
  for (const name of names) {
    const safe = safeZipName(name)
    if (safe === null) throw new Error(`archive contains an unsafe entry name: ${name.slice(0, 80)}`)
    const target = resolve(contentDir, safe)
    if (target !== contentDir && !target.startsWith(contentDir + sep)) {
      throw new Error(`archive entry escapes the staging directory: ${name.slice(0, 80)}`)
    }
  }
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue
    const target = resolve(contentDir, safeZipName(name) as string)
    mkdirSync(resolve(target, '..'), { recursive: true })
    // The name was validated above; the resolve+prefix double-check ran for
    // every entry before any write, so this write cannot leave the tree.
    writeFileSync(target, data)
  }
  return { root, contentDir }
}

/**
 * Descent through wrapper directories (a GitHub-style archive lands as
 * `repo-master/<skills…>`): while a level holds no SKILL.md, no loose .md,
 * and exactly one plain subdirectory, step into it — bounded, so a crafted
 * nesting depth cannot walk far.
 */
function unwrapSingleDir(contentDir: string): string {
  let current = contentDir
  for (let depth = 0; depth < 4; depth++) {
    if (existsSync(join(current, 'SKILL.md'))) return current
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return current
    }
    const dirs = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    const looseMd = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    if (looseMd.length > 0 || dirs.length !== 1) return current
    const only = dirs[0]
    if (only === undefined) return current
    current = join(current, only.name)
  }
  return current
}

/** Import a base64 ZIP upload; the staging tree is always removed afterwards. */
export function importZip(base64: string, destDir: string, conflict: ConflictPolicy = 'skip', dshHome?: string): ImportOutcome {
  const staging = stageZip(base64, dshHome)
  try {
    return importSkills(unwrapSingleDir(staging.contentDir), destDir, conflict)
  } finally {
    rmSync(staging.root, { recursive: true, force: true })
  }
}
