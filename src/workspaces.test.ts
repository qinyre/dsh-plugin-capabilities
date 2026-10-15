import { describe, expect, it } from 'vitest'
import type { CapabilitiesHost } from './types.ts'
import { listWorkspaces, resolveWorkspacePath } from './workspaces.ts'

/** Minimal host stub: only the lazy service lookup is exercised here. */
function hostWith(registry: unknown): CapabilitiesHost {
  return {
    webServer: { register: () => () => undefined },
    skills: { list: async () => [], get: async () => undefined },
    get: (name: string) => (name === 'workspaceRegistry' ? registry : undefined),
  }
}

describe('listWorkspaces', () => {
  it('is unsupported when the service is missing or malformed', () => {
    expect(listWorkspaces(hostWith(undefined)).supported).toBe(false)
    expect(listWorkspaces(hostWith(null)).supported).toBe(false)
    expect(listWorkspaces(hostWith({})).supported).toBe(false)
    expect(listWorkspaces(hostWith({ list: 'nope' })).supported).toBe(false)
    expect(listWorkspaces(hostWith({ list: () => { throw new Error('boom') } })).supported).toBe(false)
  })

  it('maps registry rows, accepting cwd as the path spelling and junk rows', () => {
    const registry = {
      list: () => [
        { id: 'ws-1', path: 'D:\\work\\alpha', title: 'alpha' },
        { id: 'ws-2', cwd: 'D:\\work\\beta', title: '' },
        { title: 'no path' },
        null,
        'junk',
      ],
    }
    const listing = listWorkspaces(hostWith(registry))
    expect(listing.supported).toBe(true)
    expect(listing.items).toHaveLength(2)
    expect(listing.items[0]).toMatchObject({ id: 'ws-1', title: 'alpha', path: 'D:\\work\\alpha' })
    expect(listing.items[1].path).toBe('D:\\work\\beta')
    expect(listing.items[1].title).toBe('beta')
  })

  it('marks missing directories unavailable and dedupes by path', () => {
    const registry = {
      list: () => [
        { id: 'a', path: 'D:\\definitely-not-here-xyz', title: 'ghost' },
        { id: 'b', path: 'D:\\definitely-not-here-xyz', title: 'dupe' },
      ],
    }
    const listing = listWorkspaces(hostWith(registry))
    expect(listing.items).toHaveLength(1)
    expect(listing.items[0].available).toBe(false)
  })
})

describe('resolveWorkspacePath', () => {
  const host = hostWith({
    list: () => [
      { id: 'ws-1', path: process.cwd(), title: 'here' },
      { id: 'ws-2', path: 'D:\\gone', title: 'gone' },
    ],
  })

  it('resolves by id and by exact path, and refuses unavailable rows', () => {
    expect(resolveWorkspacePath(host, 'ws-1')).toBe(process.cwd())
    expect(resolveWorkspacePath(host, process.cwd())).toBe(process.cwd())
    expect(resolveWorkspacePath(host, 'ws-2')).toBeUndefined()
    expect(resolveWorkspacePath(host, 'nope')).toBeUndefined()
  })
})
