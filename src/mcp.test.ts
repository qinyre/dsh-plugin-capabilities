import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { listMcp, removeMcp, setMcpDisabled, upsertMcp, validateMcpInput, type McpInput } from './mcp.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-caps-mcp-'))
const profile = join(root, 'profiles', 'web')
afterAll(() => rmSync(root, { recursive: true, force: true }))

const patch = () => join(profile, 'cordis.patch.yml')

const stdio: McpInput = {
  id: '',
  serverName: 'github',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: 'secret' },
}

describe('validateMcpInput', () => {
  it('enforces serverName grammar and per-transport requirements', () => {
    expect(validateMcpInput(stdio)).toBeNull()
    expect(validateMcpInput({ ...stdio, serverName: 'has space' })).toContain('serverName')
    expect(validateMcpInput({ ...stdio, command: ' ' })).toContain('command')
    expect(validateMcpInput({ id: '', serverName: 'web', transport: 'streamable-http' })).toContain('url')
    expect(validateMcpInput({ id: '', serverName: 'web', transport: 'streamable-http', url: 'ftp://x' })).toContain('url')
    expect(validateMcpInput({ id: 'a/b', serverName: 'web', transport: 'streamable-http', url: 'http://x' })).toContain('id')
  })
})

describe('profile patch CRUD', () => {
  it('creates rows in a missing file, dedupes ids, and reads them back', () => {
    const id1 = upsertMcp(profile, stdio)
    expect(id1).toBe('mcp-github')
    const id2 = upsertMcp(profile, { ...stdio, env: undefined })
    expect(id2).toBe('mcp-github-2')

    const rows = listMcp(profile)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 'mcp-github', serverName: 'github', transport: 'stdio', command: 'npx', disabled: false })
    expect(rows[0].args).toEqual(['-y', '@modelcontextprotocol/server-github'])
    expect(rows[0].env).toEqual({ GITHUB_TOKEN: 'secret' })
  })

  it('preserves foreign rows and comments across edits', () => {
    writeFileSync(patch(), [
      '# user comment',
      '- id: something-else',
      "  name: 'other-plugin'",
      '  config:',
      '    a: 1',
      '',
    ].join('\n'))
    upsertMcp(profile, { ...stdio, serverName: 'web', transport: 'streamable-http', url: 'http://localhost:3000/mcp' })
    const text = readFileSync(patch(), 'utf8')
    expect(text).toContain('# user comment')
    expect(text).toContain('something-else')
    expect(text).toContain('streamable-http')
    expect(listMcp(profile)).toHaveLength(1)
    expect(listMcp(profile)[0]).toMatchObject({ transport: 'streamable-http', url: 'http://localhost:3000/mcp' })
  })

  it('updates an existing row in place when the id matches', () => {
    upsertMcp(profile, stdio)
    expect(listMcp(profile)).toHaveLength(2)
    upsertMcp(profile, { ...stdio, id: 'mcp-github', command: 'pnpm' })
    const rows = listMcp(profile)
    expect(rows).toHaveLength(2)
    expect(rows.find(row => row.id === 'mcp-github')?.command).toBe('pnpm')
  })

  it('toggles disabled and removes rows', () => {
    expect(setMcpDisabled(profile, 'mcp-github', true)).toBe(true)
    expect(listMcp(profile).find(row => row.id === 'mcp-github')?.disabled).toBe(true)
    expect(setMcpDisabled(profile, 'mcp-github', false)).toBe(true)
    expect(listMcp(profile).find(row => row.id === 'mcp-github')?.disabled).toBe(false)
    expect(setMcpDisabled(profile, 'no-such', true)).toBe(false)

    expect(removeMcp(profile, 'mcp-github')).toBe(true)
    expect(listMcp(profile).find(row => row.id === 'mcp-github')).toBeUndefined()
    expect(removeMcp(profile, 'mcp-github')).toBe(false)
  })
})
