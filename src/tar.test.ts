import { gzipSync } from 'node:zlib'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { extractTarGz } from './tar.ts'

const root = mkdtempSync(join(tmpdir(), 'dsh-caps-tar-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** One USTAR entry (the shape GitHub codeload emits); body null = directory. */
function tarEntry(name: string, body: Buffer | null, type = body === null ? '5' : '0'): Buffer {
  const header = Buffer.alloc(512)
  const size = body === null ? 0 : body.length
  header.write(name, 0, 'utf8')
  header.write('0000644\0', 100, 'utf8')
  header.write('0000000\0', 108, 'utf8')
  header.write('0000000\0', 116, 'utf8')
  header.write(size.toString(8).padStart(11, '0') + '\0', 124, 'utf8')
  header.write('00000000000\0', 136, 'utf8')
  header.write('        ', 148, 'utf8')
  header.write(type, 156, 'utf8')
  header.write('ustar\0', 257, 'utf8')
  header.write('00', 263, 'utf8')
  let sum = 0
  for (const byte of header) sum += byte
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8')
  const pad = (512 - (size % 512)) % 512
  return Buffer.concat([header, body === null ? Buffer.alloc(0) : body, Buffer.alloc(pad)])
}

function tarGz(entries: Buffer[]): Buffer {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]))
}

describe('extractTarGz', () => {
  it('extracts files and directories with stripComponents', () => {
    const target = join(root, 'basic')
    const archive = tarGz([
      tarEntry('owner-repo-abc123/', null),
      tarEntry('owner-repo-abc123/SKILL.md', Buffer.from('---\nname: x\n---\n')),
      tarEntry('owner-repo-abc123/docs/', null),
      tarEntry('owner-repo-abc123/docs/a.md', Buffer.from('hello')),
    ])
    const written = extractTarGz(archive, target, { stripComponents: 1 })
    expect(written).toBe(4)
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('name: x')
    expect(readFileSync(join(target, 'docs', 'a.md'), 'utf8')).toBe('hello')
  })

  it('rejects entries that escape the target directory', () => {
    const target = join(root, 'escape')
    mkdirSync(target, { recursive: true })
    const guard = join(root, 'escape-guard.txt')
    writeFileSync(guard, 'keep')
    const archive = tarGz([tarEntry('../../escape-guard.txt', Buffer.from('pwn'))])
    expect(() => extractTarGz(archive, target)).toThrow(/unsafe/)
    expect(readFileSync(guard, 'utf8')).toBe('keep')
  })

  it('rejects absolute paths', () => {
    const archive = tarGz([tarEntry('/etc/pwned', Buffer.from('x'))])
    expect(() => extractTarGz(archive, join(root, 'absolute'))).toThrow(/unsafe/)
  })

  it('handles a long name delivered via the GNU L entry', () => {
    const target = join(root, 'longname')
    const long = `deep/${'a'.repeat(120)}/SKILL.md`
    const archive = tarGz([
      tarEntry('././@LongLink', Buffer.from(`${long}\0`), 'L'),
      tarEntry('placeholder', Buffer.from('---\nname: long\n---\n')),
    ])
    extractTarGz(archive, target, { stripComponents: 1 })
    expect(readFileSync(join(target, 'a'.repeat(120), 'SKILL.md'), 'utf8')).toContain('long')
  })

  it('skips symlink entries without writing them', () => {
    const target = join(root, 'links')
    const archive = tarGz([
      tarEntry('pkg/', null),
      tarEntry('pkg/link', null, '2'),
    ])
    extractTarGz(archive, target, { stripComponents: 1 })
    expect(existsSync(join(target, 'link'))).toBe(false)
  })

  it('rejects a truncated archive', () => {
    const archive = tarGz([tarEntry('pkg/SKILL.md', Buffer.from('x'.repeat(600)))])
    const cut = archive.subarray(0, archive.length - 700)
    expect(() => extractTarGz(cut, join(root, 'truncated'))).toThrow(/truncated|too large|end of file/)
  })

  it('handles multi-block file bodies', () => {
    const target = join(root, 'big')
    const body = Buffer.from('y'.repeat(1025))
    const archive = tarGz([tarEntry('pkg/data.md', body)])
    extractTarGz(archive, target, { stripComponents: 1 })
    expect(readFileSync(join(target, 'data.md'), 'utf8')).toHaveLength(1025)
  })
})
