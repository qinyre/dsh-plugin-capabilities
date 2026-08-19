import { gzipSync } from 'node:zlib'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { addGitRepo, addLocalRepo, detectSkillRoots, parseGitHubSource } from './repos.ts'
import { loadState, removeSkillRoot } from './state.ts'
import { removeTree } from './rmtree.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-caps-repos-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const skill = (name: string): string => `---\nname: ${name}\ndescription: d ${name}\n---\n\nbody\n`

/** Tar a staging directory (with one top-level component) like codeload. */
function tarballOf(staging: string): Buffer {
  const files: Array<{ name: string; body: Buffer; dir: boolean }> = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name)
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        files.push({ name: `${rel}/`, body: Buffer.alloc(0), dir: true })
        walk(child, rel)
      } else {
        files.push({ name: rel, body: readFileSync(child), dir: false })
      }
    }
  }
  walk(staging, '')
  const blocks: Buffer[] = []
  for (const entry of files) {
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 'utf8')
    header.write('0000644\0', 100, 'utf8')
    header.write('0000000\0', 108, 'utf8')
    header.write('0000000\0', 116, 'utf8')
    header.write(entry.body.length.toString(8).padStart(11, '0') + '\0', 124, 'utf8')
    header.write('00000000000\0', 136, 'utf8')
    header.write('        ', 148, 'utf8')
    header.write(entry.dir ? '5' : '0', 156, 'utf8')
    header.write('ustar\0', 257, 'utf8')
    header.write('00', 263, 'utf8')
    let sum = 0
    for (const byte of header) sum += byte
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8')
    const pad = (512 - (entry.body.length % 512)) % 512
    blocks.push(Buffer.concat([header, entry.body, Buffer.alloc(pad)]))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

describe('parseGitHubSource', () => {
  it('accepts the common URL shapes', () => {
    expect(parseGitHubSource('https://github.com/anthropics/skills')).toMatchObject({ owner: 'anthropics', repo: 'skills', label: 'anthropics/skills' })
    expect(parseGitHubSource('https://github.com/anthropics/skills.git')).toMatchObject({ repo: 'skills' })
    expect(parseGitHubSource('anthropics/skills')).toMatchObject({ owner: 'anthropics' })
    expect(parseGitHubSource('https://github.com/anthropics/skills/tree/v2')).toMatchObject({ ref: 'v2' })
    expect(parseGitHubSource('https://github.com/anthropics/skills#dev')).toMatchObject({ ref: 'dev' })
    expect(parseGitHubSource('https://github.com/anthropics/skills/tree/v2')?.tarballUrl).toBe('https://codeload.github.com/anthropics/skills/tar.gz/v2')
    expect(parseGitHubSource('https://github.com/anthropics/skills')?.tarballUrl).toBe('https://codeload.github.com/anthropics/skills/tar.gz/HEAD')
  })
  it('rejects non-GitHub input', () => {
    expect(parseGitHubSource('https://gitlab.com/a/b')).toBeNull()
    expect(parseGitHubSource('not a url')).toBeNull()
    expect(parseGitHubSource('')).toBeNull()
  })
})

describe('detectSkillRoots', () => {
  it('detects a single skill at the checkout root', () => {
    const dir = join(root, 'single')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), skill('single'))
    expect(detectSkillRoots(dir)).toEqual({ roots: [], single: true })
  })

  it('detects skills as immediate children', () => {
    const dir = join(root, 'collection')
    mkdirSync(join(dir, 'one'), { recursive: true })
    writeFileSync(join(dir, 'one', 'SKILL.md'), skill('one'))
    expect(detectSkillRoots(dir)).toEqual({ roots: [dir], single: false })
  })

  it('detects a nested skills/ wrapper and mixed layouts', () => {
    const dir = join(root, 'nested')
    mkdirSync(join(dir, 'skills', 'alpha'), { recursive: true })
    writeFileSync(join(dir, 'skills', 'alpha', 'SKILL.md'), skill('alpha'))
    mkdirSync(join(dir, 'top'), { recursive: true })
    writeFileSync(join(dir, 'top', 'SKILL.md'), skill('top'))
    writeFileSync(join(dir, 'README.md'), 'not a skill')
    const detected = detectSkillRoots(dir)
    expect(detected.single).toBe(false)
    // top/ is discovered through the checkout root; skills/ registers on its own.
    expect(detected.roots).toContain(dir)
    expect(detected.roots).toContain(join(dir, 'skills'))
  })

  it('returns empty for a repo without skills', () => {
    const dir = join(root, 'empty')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'main.ts'), 'x')
    expect(detectSkillRoots(dir)).toEqual({ roots: [], single: false })
  })
})

describe('addLocalRepo', () => {
  it('registers a collection folder in place', async () => {
    const home = join(root, 'home-local')
    const source = join(root, 'local-collection')
    mkdirSync(join(source, 'greet'), { recursive: true })
    writeFileSync(join(source, 'greet', 'SKILL.md'), skill('greet'))
    const entry = await addLocalRepo(source, home)
    expect(entry.kind).toBe('local')
    expect(entry.roots).toEqual([source])
    expect(loadState(home).skillRoots).toHaveLength(1)
    expect(existsSync(join(home, 'dsh-plugin-capabilities', 'state.json'))).toBe(true)
  })

  it('wraps a single-skill folder in a junction material dir', async () => {
    const home = join(root, 'home-single')
    const source = join(root, 'local-single')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'SKILL.md'), skill('solo'))
    const entry = await addLocalRepo(source, home)
    expect(entry.roots).toHaveLength(1)
    // The scan root is the material dir; its single child is a link to source.
    const children = readdirSync(entry.roots[0])
    expect(children).toHaveLength(1)
    expect(readFileSync(join(entry.roots[0], children[0], 'SKILL.md'), 'utf8')).toContain('solo')

    // Removing the entry deregisters; the caller then deletes the material
    // dir (the junction wrapper) — never the linked source.
    expect(removeSkillRoot(entry.id, home)).toMatchObject({ id: entry.id })
    removeTree(entry.roots[0])
    expect(existsSync(entry.roots[0])).toBe(false)
    expect(existsSync(join(source, 'SKILL.md'))).toBe(true)
  })

  it('rejects a path without skills', async () => {
    const source = join(root, 'no-skills')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'notes.txt'), 'x')
    await expect(addLocalRepo(source, join(root, 'home-noskills'))).rejects.toThrow(/no SKILL\.md/)
  })
})

describe('addGitRepo', () => {
  /** Fake codeload: serves a tarball built from a callback-defined checkout. */
  const fakeFetcher = (build: (checkout: string) => void): typeof fetch => {
    return (async () => {
      const staging = join(root, `staging-${Math.random().toString(36).slice(2)}`)
      mkdirSync(join(staging, 'owner-repo-sha'), { recursive: true })
      build(join(staging, 'owner-repo-sha'))
      const archive = tarballOf(staging)
      rmSync(staging, { recursive: true, force: true })
      return {
        ok: true,
        arrayBuffer: async () => archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
      } as unknown as Response
    }) as unknown as typeof fetch
  }

  it('downloads, extracts, detects, and persists a collection repo', async () => {
    const home = join(root, 'home-git')
    const fetcher = fakeFetcher((checkout) => {
      mkdirSync(join(checkout, 'brainstorming'), { recursive: true })
      writeFileSync(join(checkout, 'brainstorming', 'SKILL.md'), skill('brainstorming'))
    })
    const entry = await addGitRepo('https://github.com/obra/superpowers', { dshHome: home, fetcher })
    expect(entry.kind).toBe('git')
    expect(entry.label).toBe('obra/superpowers')
    expect(entry.roots).toHaveLength(1)
    expect(readFileSync(join(entry.roots[0], 'brainstorming', 'SKILL.md'), 'utf8')).toContain('brainstorming')
    expect(loadState(home).skillRoots.map(row => row.label)).toContain('obra/superpowers')
  })

  it('registers a single-skill repo through the material dir', async () => {
    const home = join(root, 'home-git-single')
    const fetcher = fakeFetcher((checkout) => {
      writeFileSync(join(checkout, 'SKILL.md'), skill('solo-repo'))
    })
    const entry = await addGitRepo('someone/solorepo', { dshHome: home, fetcher })
    expect(entry.roots).toHaveLength(1)
    // The material dir is the scan root; the checkout is its one child.
    const children = readdirSync(entry.roots[0])
    expect(children).toEqual(['repo'])
    expect(readFileSync(join(entry.roots[0], 'repo', 'SKILL.md'), 'utf8')).toContain('solo-repo')
  })

  it('rejects re-registering the same repo', async () => {
    const home = join(root, 'home-git-dup')
    const fetcher = fakeFetcher((checkout) => {
      mkdirSync(join(checkout, 'a'), { recursive: true })
      writeFileSync(join(checkout, 'a', 'SKILL.md'), skill('a'))
    })
    await addGitRepo('anthropics/skills', { dshHome: home, fetcher })
    await expect(addGitRepo('https://github.com/anthropics/skills', { dshHome: home, fetcher })).rejects.toThrow(/already registered/)
  })

  it('fails cleanly when the repo holds no skills', async () => {
    const home = join(root, 'home-git-empty')
    const fetcher = fakeFetcher((checkout) => {
      writeFileSync(join(checkout, 'README.md'), 'no skills here')
    })
    await expect(addGitRepo('someone/noskills', { dshHome: home, fetcher })).rejects.toThrow(/no SKILL\.md/)
    // The failed attempt leaves no entry behind.
    expect(loadState(home).skillRoots).toHaveLength(0)
  })

  it('propagates download failures', async () => {
    const failing = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch
    await expect(addGitRepo('a/missing', { dshHome: join(root, 'home-git-404'), fetcher: failing })).rejects.toThrow(/HTTP 404/)
  })
})
