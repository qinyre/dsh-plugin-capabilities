import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { removeTree } from './rmtree.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-caps-rmtree-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('removeTree', () => {
  it('deletes a tree holding read-only files and folders', () => {
    const dir = join(root, 'readonly')
    mkdirSync(join(dir, 'nested'), { recursive: true })
    writeFileSync(join(dir, 'nested', 'SKILL.md'), '---\nname: ro\n---\n')
    // Read-only entries are the Windows EPERM source: plain rmSync cannot
    // unlink them, removeTree clears the attribute before removing.
    chmodSync(join(dir, 'nested', 'SKILL.md'), 0o444)
    chmodSync(join(dir, 'nested'), 0o555)
    removeTree(dir)
    expect(existsSync(dir)).toBe(false)
  })

  it('treats a missing path as done (force semantics)', () => {
    expect(() => removeTree(join(root, 'never-existed'))).not.toThrow()
  })
})
