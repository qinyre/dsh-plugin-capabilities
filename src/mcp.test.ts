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

  it('writes rows inside an anonymous insert list, never as bare entries', () => {
    // The loader skips bare `- id:` entries whose target does not exist;
    // only `- insert:` rows mount. This is the contract that made 0.1.2
    // rows invisible to the agent.
    const text = readFileSync(patch(), 'utf8')
    expect(text).toContain('- insert:')
    expect(text).not.toMatch(/^- id: mcp-/m)
    expect(text).toMatch(/^ {4}- id: mcp-github$/m)
  })

  it('absorbs legacy bare rows into the insert list on the next write', () => {
    writeFileSync(patch(), [
      '- id: dsh-market',
      '  config:',
      '    allowRestart: false',
      '- id: mcp-open-websearch',
      '  name: "@deepseek-ai/dsh-mcp-client"',
      '  config:',
      '    serverName: open-websearch',
      '    transport: stdio',
      '    command: npx',
      '',
    ].join('\n'))

    expect(listMcp(profile)).toHaveLength(1)
    expect(listMcp(profile)[0]).toMatchObject({ id: 'mcp-open-websearch', serverName: 'open-websearch' })

    upsertMcp(profile, { id: '', serverName: 'context7', transport: 'stdio', command: 'npx' })
    const text = readFileSync(patch(), 'utf8')
    expect(text).not.toMatch(/^- id: mcp-open-websearch/m)
    expect(text).toMatch(/^ {4}- id: mcp-open-websearch$/m)
    expect(text).toContain('dsh-market')
    expect(listMcp(profile)).toHaveLength(2)
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

  it('treats a create request that omits id as a create (raw JSON cast)', () => {
    const raw = { serverName: 'probe', transport: 'stdio', command: 'node' } as unknown as McpInput
    expect(validateMcpInput(raw)).toBeNull()
    const id = upsertMcp(profile, raw)
    expect(id).toBe('mcp-probe')
    expect(listMcp(profile).find(row => row.id === 'mcp-probe')?.command).toBe('node')
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

  it('drops the insert entry once its last row is removed', () => {
    for (const row of listMcp(profile)) removeMcp(profile, row.id)
    const text = readFileSync(patch(), 'utf8')
    expect(text).not.toContain('- insert:')
    expect(listMcp(profile)).toHaveLength(0)
  })
})
