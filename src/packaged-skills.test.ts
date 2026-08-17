/** Guards for the vendored skills shipped in the package: every directory
 * under skills/ must be a loadable skill for dsh's filesystem scanner —
 * SKILL.md present, frontmatter name matching the directory (the scanner
 * dedupes/keys by it), description non-empty, name grammar valid — and carry
 * its license so redistribution stays compliant. */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { packagedSkillsDir } from './index.ts'

const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

function readFrontmatter(path: string): { name?: unknown; description?: unknown } {
  const raw = readFileSync(path, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  expect(match, `${path} has YAML frontmatter`).toBeDefined()
  return parse(match![1]!) as { name?: unknown; description?: unknown }
}

describe('packaged skills', () => {
  it('ships the two vendored skills with licenses', () => {
    expect(readdirSync(packagedSkillsDir(), { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort())
      .toEqual(['find-skills', 'skill-creator'])
    expect(existsSync(join(packagedSkillsDir(), 'skill-creator', 'LICENSE.txt'))).toBe(true)
    expect(existsSync(join(packagedSkillsDir(), 'find-skills', 'LICENSE'))).toBe(true)
  })

  it('keeps every skill directory loadable by the scanner', () => {
    for (const name of ['find-skills', 'skill-creator']) {
      const frontmatter = readFrontmatter(join(packagedSkillsDir(), name, 'SKILL.md'))
      expect(frontmatter.name, `${name} frontmatter name`).toBe(name)
      expect(SKILL_NAME.test(String(frontmatter.name)), `${name} name grammar`).toBe(true)
      expect(typeof frontmatter.description).toBe('string')
      expect(String(frontmatter.description).length).toBeGreaterThan(0)
    }
  })
})
