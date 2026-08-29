import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkMcpRow, listMcp, listMcpScoped, mcpRowToInput, mcpScopeDir, removeMcp, resolveCommandOnPath, setMcpDisabled, upsertMcp, validateMcpInput, type McpInput } from './mcp.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-caps-mcp-'))
const profile = join(root, 'profiles', 'web')
const home = join(root, 'home')
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync('dsh-caps-path-bin', { recursive: true, force: true })
})

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

describe('corrupt patch file', () => {
  it('fails reads and writes with the file path and parser location, writing nothing', () => {
    // GitHub issue #1: a malformed cordis.patch.yml surfaced as the raw
    // "Document with errors cannot be stringified" when a write hit String(doc).
    const brokenDir = join(root, 'profiles', 'broken')
    mkdirSync(brokenDir, { recursive: true })
    writeFileSync(join(brokenDir, 'cordis.patch.yml'), 'foo: 1\n  bar: 2\n', 'utf8')
    const before = readFileSync(join(brokenDir, 'cordis.patch.yml'), 'utf8')

    expect(() => listMcp(brokenDir)).toThrow(/cordis\.patch\.yml/)
    expect(() => listMcp(brokenDir)).toThrow(/line 1/)
    expect(() => upsertMcp(brokenDir, stdio)).toThrow(/未写入任何内容/)
    expect(readFileSync(join(brokenDir, 'cordis.patch.yml'), 'utf8')).toBe(before)
  })
})

describe('global patch layer (GitHub issue #2)', () => {
  const cleanHome = (): void => rmSync(join(home, 'cordis.patch.yml'), { force: true })

  it('merges both layers, global first, and flags shadowed profile rows', () => {
    cleanHome()
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'cordis.patch.yml'), [
      '- insert:',
      '    - id: mcp-shared-tools',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: shared-tools',
      '        transport: stdio',
      '        command: node',
      '        args:',
      '          - global.js',
      '',
    ].join('\n'), 'utf8')

    upsertMcp(profile, { ...stdio, serverName: 'github' })
    // Same id as the global row: the home layer composes after the profile
    // layer, so this profile row never takes effect.
    upsertMcp(profile, { ...stdio, serverName: 'shared', id: 'mcp-shared-tools' })

    const { servers, globalError } = listMcpScoped(profile, home)
    expect(globalError).toBeUndefined()
    expect(servers.map(row => `${row.scope}/${row.id}`)).toEqual(['global/mcp-shared-tools', 'profile/mcp-github', 'profile/mcp-shared-tools'])
    expect(servers[0]).toMatchObject({ serverName: 'shared-tools', args: ['global.js'] })
    expect(servers[2].shadowed).toBe(true)
    expect(servers[1].shadowed).toBeUndefined()

    cleanHome()
    expect(listMcpScoped(profile, home).servers.every(row => row.scope === 'profile')).toBe(true)
  })

  it('degrades a broken global file to globalError and still lists profile rows', () => {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'cordis.patch.yml'), 'foo: 1\n  bar: 2\n', 'utf8')
    const { servers, globalError } = listMcpScoped(profile, home)
    expect(globalError).toMatch(/cordis\.patch\.yml/)
    expect(globalError).toMatch(/line 1/)
    expect(servers.length).toBeGreaterThan(0)
    expect(servers.every(row => row.scope === 'profile')).toBe(true)
    cleanHome()
  })

  it('writes, toggles, and removes through the global scope dir', () => {
    cleanHome()
    const globalDir = mcpScopeDir('global', profile, home)
    expect(globalDir).toBe(home)

    const id = upsertMcp(globalDir, { ...stdio, serverName: 'shared-tools' })
    expect(id).toBe('mcp-shared-tools')
    // The global layer file (not the profile's) received the row.
    expect(readFileSync(join(home, 'cordis.patch.yml'), 'utf8')).toContain('shared-tools')

    expect(setMcpDisabled(globalDir, id, true)).toBe(true)
    expect(listMcp(home)[0].disabled).toBe(true)
    expect(removeMcp(globalDir, id)).toBe(true)
    expect(listMcp(home)).toHaveLength(0)
    expect(listMcp(profile).some(row => row.serverName === 'shared-tools')).toBe(false)
  })
})

describe('mcpRowToInput', () => {
  it('rebuilds a create request carrying identity fields but not the id', () => {
    const rows = listMcp(profile)
    const source = rows[0]
    const input = mcpRowToInput(source)
    expect(input.id).toBe('')
    expect(input.serverName).toBe(source.serverName)
    expect(input.transport).toBe(source.transport)
    expect(input.command).toBe(source.command)
    expect(input.args).toEqual(source.args)
    expect(input.env).toEqual(source.env)
    expect(validateMcpInput(input)).toBeNull()
  })
})

describe('command resolution + connectivity check', () => {
  it('resolves bare commands across PATH entries, honoring Windows extensions and quotes', () => {
    const bin = join(root, 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'tool.cmd'), '@echo off\r\n')
    writeFileSync(join(bin, 'plain'), '#!/bin/sh\n')

    expect(resolveCommandOnPath('tool', `"${bin}"`, 'win32')).toBe(true)
    expect(resolveCommandOnPath('tool', bin, 'win32')).toBe(true)
    expect(resolveCommandOnPath('tool', bin, 'linux')).toBe(false)
    expect(resolveCommandOnPath('plain', bin, 'win32')).toBe(true)
    expect(resolveCommandOnPath('missing-thing', bin, 'win32')).toBe(false)
    expect(resolveCommandOnPath('missing-thing', `${bin};`, 'win32')).toBe(false)
    expect(resolveCommandOnPath(join(bin, 'tool.cmd'), '', 'win32')).toBe(true)
    expect(resolveCommandOnPath(join(bin, 'nope'), '', 'win32')).toBe(false)

    // The POSIX branch splits on ':'; a Windows temp path carries a drive
    // letter, so exercise it through a colon-free relative entry instead.
    mkdirSync('dsh-caps-path-bin', { recursive: true })
    writeFileSync(join('dsh-caps-path-bin', 'plain'), '#!/bin/sh\n')
    expect(resolveCommandOnPath('plain', 'dsh-caps-path-bin:/elsewhere', 'linux')).toBe(true)
    expect(resolveCommandOnPath('tool', 'dsh-caps-path-bin:/elsewhere', 'linux')).toBe(false)
  })

  it('checks stdio rows against PATH without spawning anything', async () => {
    const base = { id: 'mcp-x', serverName: 'x', disabled: false, scope: 'profile' as const }
    const missing = await checkMcpRow({ ...base, transport: 'stdio', command: 'definitely-not-a-real-cmd-xyz' }, { pathEnv: '' })
    expect(missing.ok).toBe(false)
    expect(missing.detail).toContain('not found on PATH')

    const bin = join(root, 'bin')
    const found = await checkMcpRow({ ...base, transport: 'stdio', command: 'tool' }, { pathEnv: bin, platform: 'win32' })
    expect(found.ok).toBe(true)

    const empty = await checkMcpRow({ ...base, transport: 'stdio' }, {})
    expect(empty.ok).toBe(false)
  })

  it('checks http rows with a bounded GET; refusal reads as unreachable', async () => {
    const base = { id: 'mcp-y', serverName: 'y', disabled: false, scope: 'profile' as const }
    // Port 1 has no listener: the connect fails fast (ECONNREFUSED), which is
    // exactly the signal the check exists to surface.
    const refused = await checkMcpRow({ ...base, transport: 'streamable-http', url: 'http://127.0.0.1:1/mcp' }, { timeoutMs: 1500 })
    expect(refused.ok).toBe(false)

    const broken = await checkMcpRow({ ...base, transport: 'streamable-http' }, {})
    expect(broken.ok).toBe(false)
  }, 10_000)
})
