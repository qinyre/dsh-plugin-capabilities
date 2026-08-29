import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { agentSkillRoots, scanAllMcp, scanClaudeMcp, scanCodexMcp, scanCursorMcp, scanGeminiMcp } from './agents.ts'

const home = mkdtempSync(join(tmpdir(), 'dsh-caps-agents-'))
afterAll(() => rmSync(home, { recursive: true, force: true }))

const CLAUDE_JSON = {
  mcpServers: {
    'open-websearch': {
      type: 'stdio',
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'open-websearch@latest'],
      env: { MODE: 'stdio', SYSTEMROOT: 'C:/Windows' },
      startup_timeout_sec: 30,
    },
    context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    'web-remote': { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer x' } },
    'legacy-sse': { type: 'sse', url: 'https://example.com/sse' },
    broken: { type: 'stdio' },
  },
}

const CODEX_TOML = `
[mcp_servers.context7]
command = "cmd"
args = ["/c", "npx", "-y", "@upstash/context7-mcp"]

[mcp_servers.context7.env]
SYSTEMROOT = "C:/Windows"

[mcp_servers.remote-thing]
url = "https://example.com/mcp"
`

describe('scanClaudeMcp', () => {
  it('maps stdio entries with and without an explicit type, and http entries', () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify(CLAUDE_JSON))
    const servers = scanClaudeMcp(home)
    const names = servers.map(server => server.name)
    expect(names).toContain('open-websearch')
    expect(names).toContain('context7')
    expect(names).toContain('web-remote')
    expect(names).not.toContain('legacy-sse')
    expect(names).not.toContain('broken')

    const stdio = servers.find(server => server.name === 'open-websearch')
    expect(stdio).toMatchObject({ agent: 'claude-code', transport: 'stdio', command: 'cmd' })
    expect(stdio?.args).toEqual(['/c', 'npx', '-y', 'open-websearch@latest'])
    expect(stdio?.env).toEqual({ MODE: 'stdio', SYSTEMROOT: 'C:/Windows' })

    const http = servers.find(server => server.name === 'web-remote')
    expect(http).toMatchObject({ transport: 'streamable-http', url: 'https://example.com/mcp' })
    expect(http?.headers).toEqual({ Authorization: 'Bearer x' })
  })
  it('merges ~/.claude/settings.json under ~/.claude.json and skips broken files', () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ mcpServers: { extra: { command: 'x' } } }))
    const names = scanClaudeMcp(home).map(server => server.name)
    expect(names).toContain('extra')
    expect(names).toContain('context7')
    writeFileSync(join(home, '.claude.json'), '{ broken json')
    expect(scanClaudeMcp(home).map(server => server.name)).toEqual(['extra'])
  })
  it('returns empty for a home with no configs', () => {
    expect(scanClaudeMcp(join(home, 'empty'))).toEqual([])
  })
})

describe('scanCodexMcp', () => {
  it('parses [mcp_servers.*] tables: stdio with env, and url-only http', () => {
    mkdirSync(join(home, '.codex'), { recursive: true })
    writeFileSync(join(home, '.codex', 'config.toml'), CODEX_TOML)
    const servers = scanCodexMcp(home)
    expect(servers).toHaveLength(2)
    const stdio = servers.find(server => server.name === 'context7')
    expect(stdio).toMatchObject({ agent: 'codex', transport: 'stdio', command: 'cmd' })
    expect(stdio?.env).toEqual({ SYSTEMROOT: 'C:/Windows' })
    const http = servers.find(server => server.name === 'remote-thing')
    expect(http).toMatchObject({ transport: 'streamable-http', url: 'https://example.com/mcp' })
  })
  it('returns empty for missing or malformed toml', () => {
    expect(scanCodexMcp(join(home, 'empty'))).toEqual([])
    writeFileSync(join(home, '.codex', 'config.toml'), 'not [ valid toml')
    expect(scanCodexMcp(home)).toEqual([])
  })
})

describe('scanCursorMcp', () => {
  it('reads ~/.cursor/mcp.json (mcpServers, Claude-shaped; SSE skipped)', () => {
    mkdirSync(join(home, '.cursor'), { recursive: true })
    writeFileSync(join(home, '.cursor', 'mcp.json'), JSON.stringify({
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
        'web-remote': { type: 'http', url: 'https://example.com/mcp' },
        'legacy-sse': { type: 'sse', url: 'https://example.com/sse' },
      },
    }))
    const servers = scanCursorMcp(home)
    expect(servers).toHaveLength(2)
    expect(servers.find(server => server.name === 'context7')).toMatchObject({ agent: 'cursor', transport: 'stdio', command: 'npx' })
    expect(servers.find(server => server.name === 'web-remote')).toMatchObject({ agent: 'cursor', transport: 'streamable-http', url: 'https://example.com/mcp' })
    expect(servers.find(server => server.name === 'legacy-sse')).toBeUndefined()
  })
  it('returns empty for missing or malformed files', () => {
    expect(scanCursorMcp(join(home, 'empty'))).toEqual([])
    writeFileSync(join(home, '.cursor', 'mcp.json'), '{ broken json')
    expect(scanCursorMcp(home)).toEqual([])
  })
})

describe('scanGeminiMcp', () => {
  it('maps command entries and httpUrl, skips SSE url entries', () => {
    mkdirSync(join(home, '.gemini'), { recursive: true })
    writeFileSync(join(home, '.gemini', 'settings.json'), JSON.stringify({
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: { A: 'b' } },
        remote: { httpUrl: 'https://example.com/mcp' },
        sseOnly: { url: 'https://example.com/sse' },
      },
    }))
    const servers = scanGeminiMcp(home)
    expect(servers).toHaveLength(2)
    expect(servers.find(server => server.name === 'context7')).toMatchObject({ agent: 'gemini', transport: 'stdio', command: 'npx' })
    expect(servers.find(server => server.name === 'remote')).toMatchObject({ agent: 'gemini', transport: 'streamable-http', url: 'https://example.com/mcp' })
    expect(servers.find(server => server.name === 'sseOnly')).toBeUndefined()
  })
  it('returns empty for missing or malformed files', () => {
    expect(scanGeminiMcp(join(home, 'empty'))).toEqual([])
    writeFileSync(join(home, '.gemini', 'settings.json'), '{ broken json')
    expect(scanGeminiMcp(home)).toEqual([])
  })
})

describe('scanAllMcp + agentSkillRoots', () => {
  it('dedupes by (agent, name) and keeps both agents', () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify(CLAUDE_JSON))
    writeFileSync(join(home, '.codex', 'config.toml'), CODEX_TOML)
    const all = scanAllMcp(home)
    expect(all.filter(server => server.name === 'context7')).toHaveLength(2)
    const keys = all.map(server => `${server.agent}/${server.name}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('lists only existing agent skill roots', () => {
    expect(agentSkillRoots(home)).toEqual([])
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    expect(agentSkillRoots(home)).toEqual([join(home, '.claude', 'skills')])
  })
})
