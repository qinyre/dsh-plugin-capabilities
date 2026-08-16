import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { deleteSkill, serializeSkill, validateSkillInput, writeSkill, type SkillInput } from './skills.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-caps-skills-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const base: SkillInput = {
  name: 'my-skill',
  description: 'Greets politely',
  modelInvocable: true,
  userInvocable: true,
  content: 'Always say please.',
}

describe('serializeSkill', () => {
  it('writes required frontmatter and omits default policy keys', () => {
    const text = serializeSkill(base)
    expect(text).toContain('name: my-skill')
    expect(text).toContain(`description: "Greets politely"`)
    expect(text).toContain('Always say please.')
    expect(text).not.toContain('disable-model-invocation')
    expect(text).not.toContain('user-invocable')
  })
  it('writes non-default policy keys and whenToUse', () => {
    const text = serializeSkill({ ...base, modelInvocable: false, userInvocable: false, whenToUse: 'When greeting' })
    expect(text).toContain('disable-model-invocation: true')
    expect(text).toContain('user-invocable: false')
    expect(text).toContain('whenToUse: "When greeting"')
  })
  it('escapes quotes and newlines in descriptions (YAML double-quoted)', () => {
    const text = serializeSkill({ ...base, description: 'line1\n"quoted" \\ back' })
    expect(text).toContain('description: "line1\\n\\"quoted\\" \\\\ back"')
  })
})

describe('validateSkillInput', () => {
  it('rejects bad names, empty descriptions, oversized bodies', () => {
    expect(validateSkillInput({ ...base, name: 'Bad_Name' })).toContain('kebab')
    expect(validateSkillInput({ ...base, name: '../escape' })).toContain('kebab')
    expect(validateSkillInput({ ...base, description: '  ' })).toContain('description')
    expect(validateSkillInput({ ...base, content: 'x'.repeat(256 * 1024 + 1) })).toContain('content')
  })
  it('accepts a valid skill', () => {
    expect(validateSkillInput(base)).toBeNull()
  })
})

describe('writeSkill / deleteSkill', () => {
  it('round-trips into the user skills root and deletes by exact directory', () => {
    const file = writeSkill(base, root)
    expect(file).toBe(join(root, 'skills', 'my-skill', 'SKILL.md'))
    expect(readFileSync(file, 'utf8')).toBe(serializeSkill(base))

    expect(deleteSkill('my-skill', root)).toBe(true)
    expect(existsSync(join(root, 'skills', 'my-skill'))).toBe(false)
    expect(deleteSkill('my-skill', root)).toBe(false)
  })
  it('never touches sibling directories on delete', () => {
    mkdirSync(join(root, 'skills', 'other'), { recursive: true })
    writeFileSync(join(root, 'skills', 'other', 'SKILL.md'), '---\nname: other\ndescription: d\n---\n\nx')
    expect(deleteSkill('my-skill', root)).toBe(false)
    expect(existsSync(join(root, 'skills', 'other', 'SKILL.md'))).toBe(true)
  })
  it('rejects non-directory skill names in delete', () => {
    mkdirSync(join(root, 'skills', 'flat'), { recursive: true })
    writeFileSync(join(root, 'skills', 'flat.txt'), 'stray')
    expect(deleteSkill('..', root)).toBe(false)
    expect(existsSync(join(root, 'skills', 'flat.txt'))).toBe(true)
  })
})
