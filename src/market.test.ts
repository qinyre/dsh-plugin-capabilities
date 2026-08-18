import { describe, expect, it } from 'vitest'
import { bundledMarketPath, loadMarketIndex, marketIndexUrl } from './market.ts'
import { readFileSync } from 'node:fs'

const okJson = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, json: async () => body }) as unknown as Response) as unknown as typeof fetch

describe('loadMarketIndex', () => {
  it('prefers a valid remote index', async () => {
    const index = await loadMarketIndex('skills', {
      fetcher: okJson({ repos: [{ id: 'r1', name: 'Repo', description: 'd', url: 'https://github.com/a/b' }] }),
    })
    expect(index?.source).toBe('remote')
    expect(index?.skills?.[0]?.id).toBe('r1')
  })

  it('falls back to the bundled snapshot when remote is unreachable or invalid', async () => {
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    const index = await loadMarketIndex('skills', { fetcher: failing })
    expect(index?.source).toBe('bundled')
    expect(index?.skills?.length).toBeGreaterThan(0)
    expect(index?.skills?.every(repo => typeof repo.url === 'string')).toBe(true)

    const garbage = await loadMarketIndex('skills', { fetcher: okJson({ repos: [] }) })
    expect(garbage?.source).toBe('bundled')
  })

  it('validates entries and drops malformed ones', async () => {
    const index = await loadMarketIndex('mcp', {
      fetcher: okJson({
        servers: [
          { id: 'ok', name: 'OK', description: 'd', transport: 'stdio', command: 'npx', args: ['-y', 'x'], envKeys: ['K'], homepage: 'https://x' },
          { id: 'no-command', name: 'Bad', description: 'd', transport: 'stdio', homepage: 'https://x' },
          { id: 'no-home', name: 'Bad2', description: 'd', transport: 'stdio', command: 'npx' },
          'not an object',
        ],
      }),
    })
    expect(index?.source).toBe('remote')
    expect(index?.servers).toHaveLength(1)
    expect(index?.servers?.[0]).toMatchObject({ id: 'ok', envKeys: ['K'] })
  })

  it('ships parseable bundled snapshots with expected top-level shape', () => {
    for (const kind of ['skills', 'mcp'] as const) {
      const parsed = JSON.parse(readFileSync(bundledMarketPath(kind), 'utf8')) as Record<string, unknown>
      expect(parsed.version).toBe(1)
      expect(Array.isArray(kind === 'skills' ? parsed.repos : parsed.servers)).toBe(true)
      expect(marketIndexUrl(kind)).toContain(`https://raw.githubusercontent.com/qinyre/dsh-plugin-capabilities/main/market/${kind}.json`)
    }
  })

  it('marks nothing installed and returns null entries-safe data offline for mcp too', async () => {
    const index = await loadMarketIndex('mcp', { fetcher: okJson({ servers: [{ id: 'http1', name: 'H', description: 'd', transport: 'streamable-http', url: 'https://e/mcp', homepage: 'https://x' }] }) })
    expect(index?.servers?.[0]).toMatchObject({ transport: 'streamable-http', url: 'https://e/mcp' })
  })
})
