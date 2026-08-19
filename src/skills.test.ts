import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { deleteSkill, serializeSkill, setSkillPolicy, updateSkillFile, validateSkillInput, writeSkill, type SkillInput } from './skills.ts'

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

  it('updateSkillFile edits in place, preserving keys the editor does not own', () => {
    const dir = join(root, 'keep-skill')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'SKILL.md')
    writeFileSync(file, '---\nname: keep-skill\nlicense: MIT\nallowed-tools: Bash\ndescription: "old one"\n---\n\n# Old\n')
    updateSkillFile(file, {
      name: 'keep-skill',
      description: 'new one',
      whenToUse: undefined,
      modelInvocable: false,
      userInvocable: true,
      content: '# New body',
    })
    const after = readFileSync(file, 'utf8')
    expect(after).toContain('license: MIT')
    expect(after).toContain('allowed-tools: Bash')
    expect(after).toContain('description: "new one"')
    expect(after).toContain('disable-model-invocation: true')
    expect(after).not.toContain('user-invocable')
    expect(after).toContain('# New body')
    expect(after).not.toContain('# Old')
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

describe('setSkillPolicy', () => {
  const file = join(root, 'policy', 'SKILL.md')
  const original = '---\nname: pol\ndescription: "A skill"\nwhenToUse: "later"\nlicense: MIT\n---\n\nBody stays.\n'

  it('disables by adding both keys and keeps everything else byte-for-byte', () => {
    mkdirSync(join(root, 'policy'), { recursive: true })
    writeFileSync(file, original)
    setSkillPolicy(file, false)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('disable-model-invocation: true')
    expect(text).toContain('user-invocable: false')
    expect(text).toContain('name: pol')
    expect(text).toContain('whenToUse: "later"')
    expect(text).toContain('license: MIT')
    expect(text).toContain('Body stays.')
    // Idempotent: disabling twice does not duplicate the keys.
    setSkillPolicy(file, false)
    expect(readFileSync(file, 'utf8').match(/disable-model-invocation/g)).toHaveLength(1)
  })

  it('re-enables by removing both keys', () => {
    setSkillPolicy(file, true)
    const text = readFileSync(file, 'utf8')
    expect(text).not.toContain('disable-model-invocation')
    expect(text).not.toContain('user-invocable')
    expect(text).toContain('license: MIT')
    expect(text).toContain('Body stays.')
  })

  it('preserves CRLF files and rejects frontmatter-less files', () => {
    const crlf = join(root, 'policy-crlf', 'SKILL.md')
    mkdirSync(join(root, 'policy-crlf'), { recursive: true })
    writeFileSync(crlf, '---\r\nname: crlf\r\ndescription: d\r\n---\r\n\r\nbody\r\n')
    setSkillPolicy(crlf, false)
    const text = readFileSync(crlf, 'utf8')
    expect(text).toContain('disable-model-invocation: true\r')
    expect(text).toContain('user-invocable: false\r')

    const bare = join(root, 'policy-bare.md')
    writeFileSync(bare, 'no frontmatter here')
    expect(() => setSkillPolicy(bare, false)).toThrow(/frontmatter/)
  })
})
