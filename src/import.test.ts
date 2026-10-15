import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { analyzeSource, importSkills, importZip, toKebab, frontmatterName } from './import.ts'
import { pluginStateDir } from './state.ts'

const base = mkdtempSync(join(tmpdir(), 'dsh-caps-import-'))
const dest = join(base, 'dest')
const dshHome = join(base, 'home')

beforeAll(() => {
  mkdirSync(dest, { recursive: true })
  mkdirSync(dshHome, { recursive: true })
})
afterAll(() => rmSync(base, { recursive: true, force: true }))

const skillDoc = (name: string, description = 'test skill'): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nbody of ${name}\n`

describe('name helpers', () => {
  it('toKebab slugifies and rejects empty results', () => {
    expect(toKebab('My Cool Skill')).toBe('my-cool-skill')
    expect(toKebab('  already-kebab  ')).toBe('already-kebab')
    expect(toKebab('///')).toBeNull()
  })

  it('frontmatterName reads the name field only', () => {
    expect(frontmatterName('---\nname: "quoted-one"\ndescription: x\n---\n')).toBe('quoted-one')
    expect(frontmatterName('no frontmatter')).toBeUndefined()
  })
})

describe('importSkills from folders and files', () => {
  it('imports a single skill directory using its frontmatter name', () => {
    const src = join(base, 'single')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), skillDoc('solo-skill'))
    const outcome = importSkills(src, dest)
    expect(outcome.failed).toEqual([])
    expect(outcome.imported).toEqual([{ name: 'solo-skill', overwritten: false }])
    expect(existsSync(join(dest, 'solo-skill', 'SKILL.md'))).toBe(true)
  })

  it('falls back to the folder name when frontmatter has no name', () => {
    const src = join(base, 'My Folder_2')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\ndescription: x\n---\nbody')
    const outcome = importSkills(src, dest)
    expect(outcome.imported[0]?.name).toBe('my-folder-2')
  })

  it('imports a batch of skill folders plus top-level loose .md files', () => {
    const src = join(base, 'collection')
    mkdirSync(join(src, 'one'), { recursive: true })
    mkdirSync(join(src, 'two'), { recursive: true })
    writeFileSync(join(src, 'one', 'SKILL.md'), skillDoc('batch-one'))
    writeFileSync(join(src, 'two', 'SKILL.md'), skillDoc('batch-two'))
    writeFileSync(join(src, 'loose.md'), '---\nname: loose-file\ndescription: x\n---\nbody')
    const outcome = importSkills(src, dest)
    expect(outcome.imported.map(item => item.name).sort()).toEqual(['batch-one', 'batch-two', 'loose-file'])
    expect(existsSync(join(dest, 'loose-file.md'))).toBe(true)
  })

  it('imports a lone .md file as a flat skill', () => {
    const file = join(base, 'standalone.md')
    writeFileSync(file, skillDoc('standalone'))
    const outcome = importSkills(file, dest)
    expect(outcome.imported).toEqual([{ name: 'standalone', overwritten: false }])
    expect(existsSync(join(dest, 'standalone.md'))).toBe(true)
  })

  it('skips existing names by default and overwrites on request', () => {
    const src = join(base, 'conflict-src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), skillDoc('clash-skill', 'version two'))
    expect(importSkills(src, dest, 'skip').imported).toEqual([{ name: 'clash-skill', overwritten: false }])
    expect(importSkills(src, dest, 'skip').skipped).toEqual(['clash-skill'])
    const again = importSkills(src, dest, 'overwrite')
    expect(again.imported).toEqual([{ name: 'clash-skill', overwritten: true }])
    expect(again.skipped).toEqual([])
    expect(again.failed).toEqual([])
  })

  it('reports unusable sources instead of throwing mid-copy', () => {
    expect(() => importSkills(join(base, 'missing-path'), dest)).toThrow('does not exist')
    const empty = join(base, 'empty-src')
    mkdirSync(empty, { recursive: true })
    expect(() => importSkills(empty, dest)).toThrow('no skills found')
  })

  it('refuses skill folders that contain symbolic links (sibling links are skipped)', () => {
    const src = join(base, 'linked-src')
    mkdirSync(join(src, 'real', 'inner'), { recursive: true })
    writeFileSync(join(src, 'real', 'SKILL.md'), skillDoc('linked-skill'))
    symlinkSync(dest, join(src, 'real', 'hook'), 'junction')
    const outcome = importSkills(src, dest)
    expect(outcome.imported).toEqual([])
    expect(outcome.failed).toHaveLength(1)
    expect(outcome.failed[0]?.name).toBe('linked-skill')
    expect(outcome.failed[0]?.error).toContain('symbolic links')
  })
})

describe('importZip', () => {
  it('imports a zipped skill collection and cleans up its staging tree', () => {
    const archive = zipSync({
      'pack/one/SKILL.md': strToU8(skillDoc('zip-one')),
      'pack/two/SKILL.md': strToU8(skillDoc('zip-two')),
    })
    const outcome = importZip(Buffer.from(archive).toString('base64'), dest, 'skip', dshHome)
    expect(outcome.imported.map(item => item.name).sort()).toEqual(['zip-one', 'zip-two'])
    const importsDir = join(pluginStateDir(dshHome), 'imports')
    expect(existsSync(importsDir) ? readdirSync(importsDir) : []).toEqual([])
  })

  it('rejects entries that escape the staging directory', () => {
    const archive = zipSync({ '../evil.md': strToU8('nope') })
    expect(() => importZip(Buffer.from(archive).toString('base64'), dest, 'skip', dshHome)).toThrow(/unsafe entry name/)
    expect(existsSync(join(base, 'evil.md'))).toBe(false)
  })

  it('rejects absolute paths and Windows device names inside the archive', () => {
    const absolute = zipSync({ '/abs.md': strToU8('nope') })
    expect(() => importZip(Buffer.from(absolute).toString('base64'), dest, 'skip', dshHome)).toThrow()
    const device = zipSync({ 'x/con/SKILL.md': strToU8(skillDoc('device')) })
    expect(() => importZip(Buffer.from(device).toString('base64'), dest, 'skip', dshHome)).toThrow()
  })

  it('rejects oversized and non-zip uploads', () => {
    expect(() => importZip('', dest, 'skip', dshHome)).toThrow('empty upload')
    expect(() => importZip(Buffer.from('this is not a zip').toString('base64'), dest, 'skip', dshHome)).toThrow(/not a readable ZIP/)
  })

  it('analyzes a zipped single skill (SKILL.md at the archive root) as one bundle', () => {
    const archive = zipSync({ 'SKILL.md': strToU8(skillDoc('zip-root-skill')) })
    const outcome = importZip(Buffer.from(archive).toString('base64'), dest, 'skip', dshHome)
    expect(outcome.imported).toEqual([{ name: 'zip-root-skill', overwritten: false }])
  })
})

describe('analyzeSource classification', () => {
  it('classifies dirs with SKILL.md as single bundles and files as flat', () => {
    const single = analyzeSource(join(base, 'single'))
    expect(single.kind).toBe('dir')
    expect(single.items).toHaveLength(1)
    const file = analyzeSource(join(base, 'standalone.md'))
    expect(file.kind).toBe('file')
    expect(file.items[0]?.kind).toBe('flat')
  })

  it('refuses non-markdown files', () => {
    const txt = join(base, 'notes.txt')
    writeFileSync(txt, 'nope')
    expect(() => analyzeSource(txt)).toThrow(/only folders/)
  })
})
