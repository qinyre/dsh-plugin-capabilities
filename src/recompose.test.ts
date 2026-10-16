/**
 * Recompose-contract tests: the CLI anchor scan finds the runtime entry from
 * the boot argv (desktop host CLI preferred over a plain dsh bin.js), and
 * recomposeProfile degrades to false — never throws — on hosts without the
 * anchored app-boot or the root context.
 */

import { describe, expect, it } from 'vitest'
import { dshCliAnchor, recomposeProfile } from './recompose.ts'
import type { CapabilitiesHost } from './types.ts'

const sep = process.platform === 'win32' ? '\\' : '/'
const joinSep = (...parts: string[]): string => parts.join(sep)

type HostLike = {
  webServer: unknown
  skills: unknown
  get?: (name: string) => unknown
  root?: unknown
}

function stubHost(over: Partial<HostLike> = {}): CapabilitiesHost {
  return {
    webServer: { register: () => () => undefined },
    skills: {},
    ...over,
  } as unknown as CapabilitiesHost
}

describe('dshCliAnchor（运行时入口锚点）', () => {
  it('prefers the desktop host CLI walking up from the argv script', () => {
    const entryFile = `C:${sep}runtime${sep}dsh-desktop-host${sep}lib${sep}index.js`
    const desktopCli = joinSep('C:', 'runtime', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
    const seen: string[] = []
    const exists = (path: string): boolean => {
      seen.push(path)
      return path === entryFile || path === desktopCli
    }
    expect(dshCliAnchor(['node', entryFile], exists)).toBe(desktopCli)
    expect(seen).toContain(desktopCli)
  })

  it('falls back to a dsh install bin.js', () => {
    const entryFile = `D:${sep}tools${sep}dsh${sep}node_modules${sep}@deepseek-ai${sep}dsh-web-app${sep}lib${sep}index.js`
    const cliEntry = joinSep('D:', 'tools', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    const exists = (path: string): boolean => path === entryFile || path === cliEntry
    expect(dshCliAnchor(['node', entryFile], exists)).toBe(cliEntry)
  })

  it('returns undefined when no runtime entry is reachable', () => {
    expect(dshCliAnchor(['node', `C:${sep}somewhere${sep}script.mjs`], () => false)).toBeUndefined()
    expect(dshCliAnchor(['node'], () => true)).toBeUndefined()
  })
})

describe('recomposeProfile（在线重组降级）', () => {
  it('is false without a root context — never throws', async () => {
    const host = stubHost({ get: () => undefined })
    await expect(recomposeProfile(host)).resolves.toBe(false)
  })

  it('is false without service access too', async () => {
    await expect(recomposeProfile(stubHost())).resolves.toBe(false)
  })
})
