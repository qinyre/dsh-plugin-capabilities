/**
 * Registered-workspace enumeration for the project-skills picker. dsh's web
 * composition mounts the `workspaceRegistry` service (WorkspaceRegistry:
 * list()/get()/resolveByPath()); older hosts and non-web profiles don't have
 * it. Every access is defensive on purpose — a missing or oddly-shaped
 * service just means "no workspace picker", never an error.
 */

import { existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { CapabilitiesHost, WorkspaceView } from './types.ts'

interface WorkspaceRegistryLike {
  list?: () => Iterable<unknown>
}

/** Enumerate registered workspaces; `supported:false` hides the picker. */
export function listWorkspaces(host: CapabilitiesHost): { supported: boolean; items: WorkspaceView[] } {
  const registry = host.get?.('workspaceRegistry') as WorkspaceRegistryLike | undefined
  if (registry === null || registry === undefined || typeof registry.list !== 'function') {
    return { supported: false, items: [] }
  }
  let rows: unknown[]
  try {
    rows = [...registry.list()]
  } catch {
    return { supported: false, items: [] }
  }
  const items: WorkspaceView[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    const path = typeof record.path === 'string' && record.path.trim() !== ''
      ? record.path
      : typeof record.cwd === 'string' && record.cwd.trim() !== '' ? record.cwd : undefined
    if (path === undefined || seen.has(path)) continue
    seen.add(path)
    let available = false
    try {
      available = existsSync(path) && statSync(path).isDirectory()
    } catch {
      available = false
    }
    items.push({
      id: typeof record.id === 'string' && record.id !== '' ? record.id : path,
      title: typeof record.title === 'string' && record.title.trim() !== '' ? record.title : basename(path),
      path,
      available,
    })
  }
  return { supported: true, items }
}

/** Resolve one workspace id (or exact path) to its directory. */
export function resolveWorkspacePath(host: CapabilitiesHost, id: string): string | undefined {
  const { items } = listWorkspaces(host)
  const row = items.find(item => item.id === id) ?? items.find(item => item.path === id)
  return row !== undefined && row.available ? row.path : undefined
}
