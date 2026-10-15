import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { AGENT_SKILL_SOURCES, agentSkillMountRoots, agentSkillRoots, agentSkillSourcePath, agentSourceOf, expandAgentRoots } from './agents.ts'

const home = mkdtempSync(join(tmpdir(), 'dsh-caps-roots-'))
afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('AGENT_SKILL_SOURCES catalog', () => {
  it('has unique keys and well-formed segments', () => {
    const keys = AGENT_SKILL_SOURCES.map(row => row.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const row of AGENT_SKILL_SOURCES) {
      expect(row.segments.length).toBeGreaterThan(0)
      expect(row.segments.every(segment => segment.length > 0)).toBe(true)
    }
  })

  it('agentSkillSourcePath joins under the given home', () => {
    expect(agentSkillSourcePath('claude', home)).toBe(join(home, '.claude', 'skills'))
    expect(agentSkillSourcePath('nope', home)).toBeUndefined()
  })

  it('agentSourceOf matches a directory to its catalog root', () => {
    const claude = join(home, '.claude', 'skills')
    expect(agentSourceOf(join(claude, 'foo'), home)?.key).toBe('claude')
    expect(agentSourceOf(join(home, 'somewhere-else'), home)).toBeUndefined()
    expect(agentSourceOf(undefined, home)).toBeUndefined()
  })
})

describe('agentSkillRoots', () => {
  it('lists only catalog directories that exist', () => {
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    const roots = agentSkillRoots(home)
    expect(roots).toContain(join(home, '.claude', 'skills'))
    expect(roots).not.toContain(join(home, '.codex', 'skills'))
  })
})

describe('expandAgentRoots', () => {
  it('returns the root itself when it holds direct skill folders', () => {
    const root = join(home, 'direct')
    mkdirSync(join(root, 'alpha'), { recursive: true })
    writeFileSync(join(root, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: x\n---\nbody')
    expect(expandAgentRoots(root)).toEqual([root])
  })

  it('returns the parent of a nested skill folder', () => {
    const root = join(home, 'nested')
    mkdirSync(join(root, 'marketplace', 'pack', 'beta'), { recursive: true })
    writeFileSync(join(root, 'marketplace', 'pack', 'beta', 'SKILL.md'), '---\nname: beta\ndescription: x\n---\nbody')
    expect(expandAgentRoots(root)).toEqual([join(root, 'marketplace', 'pack')])
  })

  it('treats a skill directory as a leaf and never descends into it', () => {
    const root = join(home, 'leaf')
    mkdirSync(join(root, 'bundle', 'nested', 'gamma'), { recursive: true })
    writeFileSync(join(root, 'bundle', 'SKILL.md'), '---\nname: bundle\ndescription: x\n---\nbody')
    writeFileSync(join(root, 'bundle', 'nested', 'gamma', 'SKILL.md'), '---\nname: gamma\ndescription: x\n---\nbody')
    expect(expandAgentRoots(root)).toEqual([root])
  })

  it('returns the parent directory when the root itself is a single skill', () => {
    const root = join(home, 'single', 'skills')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'SKILL.md'), '---\nname: solo\ndescription: x\n---\nbody')
    expect(expandAgentRoots(root)).toEqual([join(home, 'single')])
  })

  it('skips node_modules, hidden and symlinked directories', () => {
    const root = join(home, 'skips')
    mkdirSync(join(root, 'node_modules', 'pack', 'delta'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pack', 'delta', 'SKILL.md'), '---\nname: delta\n---\nbody')
    mkdirSync(join(root, '.hidden', 'epsilon'), { recursive: true })
    writeFileSync(join(root, '.hidden', 'epsilon', 'SKILL.md'), '---\nname: epsilon\n---\nbody')
    const realDir = join(home, 'skips-real')
    mkdirSync(join(realDir, 'zeta'), { recursive: true })
    writeFileSync(join(realDir, 'zeta', 'SKILL.md'), '---\nname: zeta\n---\nbody')
    symlinkSync(realDir, join(root, 'linked'), 'junction')
    expect(expandAgentRoots(root)).toEqual([])
  })

  it('returns nothing for a missing or empty root', () => {
    expect(expandAgentRoots(join(home, 'does-not-exist'))).toEqual([])
    const empty = join(home, 'empty-root')
    mkdirSync(empty, { recursive: true })
    // An empty root contributes no extra mount points; the root itself is
    // still mounted by agentSkillMountRoots, so this is purely additive.
    expect(expandAgentRoots(empty)).toEqual([])
  })
})

describe('agentSkillMountRoots', () => {
  it('mounts existing roots plus parents of nested skills, nothing else', () => {
    const scoped = mkdtempSync(join(tmpdir(), 'dsh-caps-mount-'))
    afterAll(() => rmSync(scoped, { recursive: true, force: true }))
    mkdirSync(join(scoped, '.gemini', 'skills', 'marketplace', 'eta'), { recursive: true })
    writeFileSync(join(scoped, '.gemini', 'skills', 'marketplace', 'eta', 'SKILL.md'), '---\nname: eta\n---\nbody')
    const roots = agentSkillMountRoots(scoped)
    expect(roots).toContain(join(scoped, '.gemini', 'skills'))
    expect(roots).toContain(join(scoped, '.gemini', 'skills', 'marketplace'))
    expect(roots.some(root => root.includes('.claude'))).toBe(false)
  })
})
