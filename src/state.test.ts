import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { addSkillRoot, findRootByUrl, loadState, materialDirFor, newEntryId, removeSkillRoot, saveState } from './state.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-caps-state-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('state round-trip', () => {
  it('returns empty for missing and corrupt files', () => {
    expect(loadState(join(root, 'missing'))).toEqual({ skillRoots: [] })
    const corrupt = join(root, 'corrupt')
    mkdirSync(join(corrupt, 'dsh-plugin-capabilities'), { recursive: true })
    writeFileSync(join(corrupt, 'dsh-plugin-capabilities', 'state.json'), '{oops')
    expect(loadState(corrupt)).toEqual({ skillRoots: [] })
  })

  it('adds, finds by url, and removes entries', () => {
    const home = join(root, 'home')
    const entry = addSkillRoot({ id: newEntryId('git'), kind: 'git', label: 'a/b', url: 'a/b', roots: [join(root, 'x')] }, home)
    expect(loadState(home).skillRoots).toHaveLength(1)
    expect(findRootByUrl('a/b', home)?.id).toBe(entry.id)
    expect(findRootByUrl('other/repo', home)).toBeUndefined()

    expect(removeSkillRoot(entry.id, home)).toBe(true)
    expect(removeSkillRoot(entry.id, home)).toBe(false)
    expect(loadState(home).skillRoots).toHaveLength(0)
  })

  it('drops malformed entries on load instead of failing', () => {
    const home = join(root, 'home-malformed')
    saveState({
      skillRoots: [
        { id: 'ok', kind: 'local', label: 'ok', roots: [], addedAt: 1 },
        { nope: true } as never,
        null as never,
      ],
    }, home)
    const loaded = loadState(home)
    expect(loaded.skillRoots.map(entry => entry.id)).toEqual(['ok'])
  })
})

describe('removeSkillRoot with link material', () => {
  it('deletes the junction wrapper without touching the linked source', () => {
    const home = join(root, 'home-link')
    const source = join(root, 'linked-source')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'SKILL.md'), '---\nname: keep\n---\n')

    const id = newEntryId('local')
    const material = materialDirFor(id, home)
    mkdirSync(material, { recursive: true })
    symlinkSync(source, join(material, 'skill'), process.platform === 'win32' ? 'junction' : 'dir')
    addSkillRoot({ id, kind: 'local', label: 'keep', path: source, roots: [material], materialDir: material }, home)

    expect(removeSkillRoot(id, home)).toBe(true)
    expect(existsSync(material)).toBe(false)
    expect(existsSync(join(source, 'SKILL.md'))).toBe(true)
    // State file persisted without the entry.
    expect(readFileSync(join(home, 'dsh-plugin-capabilities', 'state.json'), 'utf8')).not.toContain('linked-source')
  })
})
