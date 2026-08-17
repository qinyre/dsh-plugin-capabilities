import type { IncomingMessage } from 'node:http'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dshLaunch, restartOwnedByShell, trustedRestartRequest } from './restart.ts'

describe('dshLaunch', () => {
  it('replays an absolute bin entry with execArgv, runtime args, and cwd beside it', () => {
    const launch = dshLaunch(
      ['node', '/repo/apps/cli/src/bin.ts', 'web', '--port', '0'],
      ['--expose-internals', '--import', 'tsx/esm'],
    )
    expect(launch.file).toBe(process.execPath)
    expect(launch.args).toEqual(['--expose-internals', '--import', 'tsx/esm', resolve('/repo/apps/cli/src/bin.ts'), 'web', '--port', '0'])
    expect(launch.cwd).toBe(resolve('/repo/apps/cli/src'))
    expect(launch.viaShell).toBe(false)
  })
  it('resolves a relative source entry to an absolute path', () => {
    const launch = dshLaunch(['node', 'apps/cli/src/bin.js'], [])
    expect(launch.args[0]).toMatch(/^(?:[A-Za-z]:)?[\\/]/)
    expect(launch.cwd).toBe(launch.args[0].replace(/[\\/]bin\.js$/, ''))
  })
  it('falls back to the bare dsh shim for unknown entries, keeping runtime args', () => {
    expect(dshLaunch(['node', '/somewhere/server.js', 'web'])).toMatchObject({ file: 'dsh', args: ['web'], viaShell: process.platform === 'win32' })
    expect(dshLaunch(['node'])).toMatchObject({ file: 'dsh', args: [] })
  })
})

const request = (headers: Record<string, string | undefined>, address = '127.0.0.1'): IncomingMessage =>
  ({ headers, socket: { remoteAddress: address } }) as unknown as IncomingMessage

describe('trustedRestartRequest', () => {
  it('accepts a direct same-origin loopback request', () => {
    expect(trustedRestartRequest(request({ origin: 'http://127.0.0.1:8080', host: '127.0.0.1:8080' }))).toBe(true)
  })
  it('rejects non-loopback peers and proxy forwarding traces', () => {
    expect(trustedRestartRequest(request({ origin: 'http://127.0.0.1:8080', host: '127.0.0.1:8080' }, '192.168.1.5'))).toBe(false)
    expect(trustedRestartRequest(request({ origin: 'http://127.0.0.1:8080', host: '127.0.0.1:8080', 'x-forwarded-for': '1.2.3.4' }))).toBe(false)
  })
  it('rejects cross-origin or missing origin/host', () => {
    expect(trustedRestartRequest(request({ origin: 'http://evil.example', host: '127.0.0.1:8080' }))).toBe(false)
    expect(trustedRestartRequest(request({ host: '127.0.0.1:8080' }))).toBe(false)
    expect(trustedRestartRequest(request({ origin: 'http://127.0.0.1:8080' }))).toBe(false)
  })
})

describe('restartOwnedByShell', () => {
  it('is true only under the desktop marker', () => {
    expect(restartOwnedByShell({ DSH_DESKTOP: '1' })).toBe(true)
    expect(restartOwnedByShell({ DSH_DESKTOP: '' })).toBe(false)
    expect(restartOwnedByShell({})).toBe(false)
  })
})
