/**
 * Skill catalog plumbing: frontmatter serialization for user-root SKILL.md
 * files plus create/update/delete against `$DSH_HOME/skills`. Discovery is the
 * host's business — the filesystem provider watches the directory, so writes
 * land in the catalog without any restart.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Host skill name grammar (dsh-skill's SKILL_NAME). */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** One skill write request from the browser. */
export interface SkillInput {
  name: string
  description: string
  whenToUse?: string
  modelInvocable: boolean
  userInvocable: boolean
  content: string
}

/** The user-owned skill root this plugin writes into (provider rank 400). */
export function userSkillsDir(dshHome: string | undefined = process.env.DSH_HOME): string {
  return join(dshHome ?? join(homedir(), '.dsh'), 'skills')
}

/** YAML double-quoted scalar (JSON string syntax is valid YAML 1.2). */
function quote(value: string): string {
  return JSON.stringify(value)
}

/** Frontmatter + body for one skill file. Policy keys only when non-default. */
export function serializeSkill(input: SkillInput): string {
  const lines = [
    `name: ${input.name}`,
    `description: ${quote(input.description)}`,
  ]
  if (input.whenToUse !== undefined && input.whenToUse !== '') lines.push(`whenToUse: ${quote(input.whenToUse)}`)
  if (!input.modelInvocable) lines.push('disable-model-invocation: true')
  if (!input.userInvocable) lines.push('user-invocable: false')
  const body = input.content.replace(/\r\n/g, '\n').trim()
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`
}

/** Validate one write request; returns the rejection reason or null. */
export function validateSkillInput(input: SkillInput): string | null {
  if (!SKILL_NAME_RE.test(input.name)) return 'name must be kebab-case (a-z, 0-9, dashes)'
  if (input.description.trim() === '') return 'description is required'
  if (input.description.length > 1024) return 'description too long (max 1024)'
  if (input.whenToUse !== undefined && input.whenToUse.length > 2048) return 'whenToUse too long (max 2048)'
  if (input.content.length > 256 * 1024) return 'content too large (max 256 KiB)'
  return null
}

/** Directory holding one user skill's SKILL.md; name grammar blocks traversal. */
function skillDir(name: string, dshHome?: string): string {
  return join(userSkillsDir(dshHome), name)
}

/** Create or update a user skill. Returns the written path. */
export function writeSkill(input: SkillInput, dshHome?: string): string {
  const dir = skillDir(input.name, dshHome)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'SKILL.md')
  writeFileSync(file, serializeSkill(input), 'utf8')
  return file
}

/** Delete a user skill directory. Returns false when it does not exist. */
export function deleteSkill(name: string, dshHome?: string): boolean {
  if (!SKILL_NAME_RE.test(name)) return false
  const dir = skillDir(name, dshHome)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false
  // Only ever remove the exact directory this name resolves to under the
  // skills root; the regex already pins it to one safe path segment.
  rmSync(dir, { recursive: true, force: true })
  return true
}

/**
 * Flip one skill file's load policy by editing only the two invocation keys
 * in its frontmatter — `disable-model-invocation: true` plus
 * `user-invocable: false` together take the skill out of both the model and
 * the human catalogs on every standard-provider surface; enabling removes
 * both keys (defaults permit both surfaces). Works on any file-backed skill
 * (user, project, agent, bundled, custom); the rest of the file, including
 * custom keys, ordering, and body, survives byte-for-byte.
 */
export function setSkillPolicy(file: string, enabled: boolean): void {
  const text = readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) throw new Error('skill file has no frontmatter block')
  const newline = text.includes('\r\n---') ? '\r\n' : '\n'
  const body = text.slice(match[0].length)
  const lines = match[1].split(/\r?\n/)
  const kept = lines.filter(line => !/^(disable-model-invocation|user-invocable):/.test(line))
  if (!enabled) kept.push('disable-model-invocation: true', 'user-invocable: false')
  writeFileSync(file, `---${newline}${kept.join(newline)}${newline}---${body}`, 'utf8')
}
