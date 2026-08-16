/**
 * dsh-plugin-capabilities end-to-end smoke: real source dsh, temp DSH_HOME,
 * install this package into the web profile, boot `dsh web`, then probe the
 * manager's routes, including a real skill write and MCP row write.
 *
 * Gate: DSH_DESKTOP_PLUGIN_SMOKE=1. Requires deepseek-harness checked out
 * beside this repo and a host that permits capturing child-process output.
 */

import { spawn, execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const srcDir = fileURLToPath(new URL('.', import.meta.url))
const pluginDir = join(srcDir, '..')
// Layout convention: this repo and deepseek-harness/ sit side by side under
// the same parent directory (src → repo → parent).
const repoRoot = join(srcDir, '..', '..', 'deepseek-harness')
const guard = existsSync(join(repoRoot, 'apps', 'cli', 'src', 'bin.ts'))
const [nodeMajor, nodeMinor] = process.version.slice(1).split('.').map(Number)
const nodeOk = (nodeMajor === 22 && nodeMinor >= 19) || nodeMajor >= 24

const smokeRoot = mkdtempSync(join(tmpdir(), 'dsh-plugin-capabilities-smoke-'))
const dshBin = join(repoRoot, 'apps', 'cli', 'src', 'bin.ts')

/** Test env with a CLEAN PATH (vitest prepends ancestor .bin dirs). */
function smokeEnv(dshHome: string): NodeJS.ProcessEnv {
  const systemBins = [
    process.env.npm_config_prefix,
    join(homedir(), 'AppData', 'Roaming', 'npm'),
    dirname(process.execPath),
  ].filter((value): value is string => typeof value === 'string' && value !== '')
  const pathValue = [...systemBins, 'C:\\Windows\\system32', 'C:\\Windows'].join(';')
  return { ...process.env, DSH_HOME: dshHome, PATH: pathValue }
}

function dsh(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--import', 'tsx/esm', dshBin, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1
      resolve({ code, out: `${stdout}\n${stderr}` })
    })
  })
}

function bootWeb(dshHome: string): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    // `dsh web` is a hardcoded alias for `--profile web` and rejects any
    // parent --profile (deepseek-harness apps/cli/src/args.ts).
    const child = spawn(process.execPath, ['--import', 'tsx/esm', dshBin, 'web', '--port', '0', '--host', '127.0.0.1'], {
      cwd: repoRoot,
      env: { ...smokeEnv(dshHome), DSH_DESKTOP: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buffer = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timed out waiting for dsh web URL line; output:\n${buffer.slice(-4000)}`))
    }, 120_000)
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString()
      const match = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/.exec(buffer)
      if (match !== null) {
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        child.stderr?.off('data', onData)
        resolve({ port: Number(match[1]) })
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    afterAll(() => { try { child.kill() } catch { /* already gone */ } })
  })
}

describe.skipIf(process.env.DSH_DESKTOP_PLUGIN_SMOKE !== '1' || !guard || !nodeOk)('dsh-plugin-capabilities smoke', () => {
  afterAll(() => {
    if (smokeRoot.startsWith(tmpdir()) && smokeRoot.includes('dsh-plugin-capabilities-smoke-')) {
      rmSync(smokeRoot, { recursive: true, force: true })
    }
  })

  it('installs, boots web, lists skills, writes a skill and an MCP row', { timeout: 240_000 }, async () => {
    const env = smokeEnv(smokeRoot)

    // 1. Install this package into profile "web".
    const install = await dsh(['plugin', '--profile', 'web', 'add', `file:${pluginDir}`], env)
    if (install.code !== 0) console.log('[smoke] FULL dsh output:\n' + install.out)
    expect(install.code, install.out).toBe(0)

    // 2. Boot `dsh web --port 0`.
    const { port } = await bootWeb(smokeRoot)
    const base = `http://127.0.0.1:${port}`
    const origin = { Origin: base, 'Content-Type': 'application/json' }
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(base + path, { method: 'POST', headers: origin, body: JSON.stringify(body) })

    // 3. Skills list serves the catalog with the editable flag.
    const skillsResponse = await fetch(`${base}/dsh-plugin-capabilities/skills`)
    expect(skillsResponse.status).toBe(200)
    const skillsBody = await skillsResponse.json() as { skills?: Array<{ name: string; source: string; editable: boolean }> }
    expect(Array.isArray(skillsBody.skills)).toBe(true)

    // 4. Write a user skill; the watched root picks it up into the catalog.
    const save = await post('/dsh-plugin-capabilities/skill/save', {
      name: 'smoke-skill',
      description: 'created by the capabilities smoke',
      modelInvocable: true,
      userInvocable: true,
      content: 'Say smoke.',
    })
    expect(save.status).toBe(200)
    const file = join(smokeRoot, 'skills', 'smoke-skill', 'SKILL.md')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('name: smoke-skill')
    const listed = await fetch(`${base}/dsh-plugin-capabilities/skills`).then(r => r.json()) as { skills: Array<{ name: string; editable: boolean }> }
    // Watcher invalidation is asynchronous; poll briefly for the new skill.
    const deadline = Date.now() + 15_000
    let seen = listed.skills.some(skill => skill.name === 'smoke-skill' && skill.editable)
    while (!seen && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const again = await fetch(`${base}/dsh-plugin-capabilities/skills`).then(r => r.json()) as { skills: Array<{ name: string; editable: boolean }> }
      seen = again.skills.some(skill => skill.name === 'smoke-skill' && skill.editable)
    }
    expect(seen).toBe(true)

    // 5. MCP row lands in the profile patch and lists back.
    const mcpSave = await post('/dsh-plugin-capabilities/mcp/save', {
      id: '',
      serverName: 'smokeweb',
      transport: 'streamable-http',
      url: 'http://127.0.0.1:9/mcp',
    })
    expect(mcpSave.status).toBe(200)
    const servers = await fetch(`${base}/dsh-plugin-capabilities/mcp`).then(r => r.json()) as { servers: Array<{ serverName: string }> }
    expect(servers.servers.some(row => row.serverName === 'smokeweb')).toBe(true)
    const patch = readFileSync(join(smokeRoot, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('@deepseek-ai/dsh-mcp-client')
  })
})
