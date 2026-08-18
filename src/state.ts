/**
 * Plugin-owned state under `$DSH_HOME/dsh-plugin-capabilities/`: the custom
 * skill repositories the user registered from the Settings page. Everything
 * the provider mounts live (local paths, extracted GitHub checkouts) hangs
 * off this file, so it stays small, JSON, and hand-recoverable.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

/** One user-registered custom skill repository. */
export interface SkillRootEntry {
  /** Stable id (used by the remove route and directory names). */
  id: string
  /** `local` — a path on this machine; `git` — extracted from a GitHub URL. */
  kind: 'local' | 'git'
  /** Display label (repo `owner/name` or the local path's basename). */
  label: string
  /** The source URL (git entries). */
  url?: string
  /** Branch/tag/ref the tarball was pulled from (git entries). */
  ref?: string
  /** Local path the user pointed at (local entries). */
  path?: string
  /** Scan roots this entry contributes (single-skill repos get a wrapper dir). */
  roots: string[]
  /** Where this entry's downloaded/junctioned material lives, if any. */
  materialDir?: string
  addedAt: number
}

/** On-disk state document. */
export interface PluginState {
  skillRoots: SkillRootEntry[]
}

/** The plugin's own directory under DSH_HOME (default `~/.dsh`). */
export function pluginStateDir(dshHome: string | undefined = process.env.DSH_HOME): string {
  return join(dshHome ?? join(homedir(), '.dsh'), 'dsh-plugin-capabilities')
}

function statePath(dshHome?: string): string {
  return join(pluginStateDir(dshHome), 'state.json')
}

function emptyState(): PluginState {
  return { skillRoots: [] }
}

/** Load the state document; missing/corrupt files yield empty state. */
export function loadState(dshHome?: string): PluginState {
  const path = statePath(dshHome)
  if (!existsSync(path)) return emptyState()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PluginState>
    if (!Array.isArray(parsed.skillRoots)) return emptyState()
    const roots = parsed.skillRoots.filter((entry): entry is SkillRootEntry =>
      typeof entry === 'object' && entry !== null && typeof entry.id === 'string' && Array.isArray(entry.roots))
    return { skillRoots: roots }
  } catch {
    return emptyState()
  }
}

/** Persist the state document (atomic-enough for a single-writer UI). */
export function saveState(state: PluginState, dshHome?: string): void {
  const dir = pluginStateDir(dshHome)
  mkdirSync(dir, { recursive: true })
  writeFileSync(statePath(dshHome), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/** New unique entry id. */
export function newEntryId(kind: 'local' | 'git'): string {
  return `${kind}-${randomBytes(4).toString('hex')}`
}

/** One entry's downloaded material (git extraction, junction wrappers). */
export function materialDirFor(entryId: string, dshHome?: string): string {
  return join(pluginStateDir(dshHome), 'repos', entryId)
}

/** Append one entry and persist. Returns the stored entry. */
export function addSkillRoot(entry: Omit<SkillRootEntry, 'addedAt'>, dshHome?: string): SkillRootEntry {
  const state = loadState(dshHome)
  const stored: SkillRootEntry = { ...entry, addedAt: Date.now() }
  state.skillRoots.push(stored)
  saveState(state, dshHome)
  return stored
}

/** Remove one entry by id and delete its material dir. Returns false when absent. */
export function removeSkillRoot(id: string, dshHome?: string): boolean {
  const state = loadState(dshHome)
  const at = state.skillRoots.findIndex(entry => entry.id === id)
  if (at === -1) return false
  const [removed] = state.skillRoots.splice(at, 1)
  saveState(state, dshHome)
  if (removed.materialDir !== undefined) {
    rmSync(removed.materialDir, { recursive: true, force: true, maxRetries: 2 })
  }
  return true
}

/** Whether a git URL is already registered (market “installed” state). */
export function findRootByUrl(url: string, dshHome?: string): SkillRootEntry | undefined {
  return loadState(dshHome).skillRoots.find(entry => entry.url === url)
}
