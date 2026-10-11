import { describe, expect, it } from 'vitest'
import { activeProfileContext } from './profile.ts'

describe('activeProfileContext（从模块物理位置识别激活 profile）', () => {
  it('names the profile for a registry install under a profile', () => {
    expect(activeProfileContext('C:/Users/u/.dsh/profiles/desktop/node_modules/dsh-plugin-capabilities/lib/index.js'))
      .toEqual({ profile: 'desktop', profileDirPath: 'C:/Users/u/.dsh/profiles/desktop' })
  })

  it('walks out of a .pnpm virtual store path', () => {
    expect(activeProfileContext('C:/h/profiles/web/node_modules/.pnpm/dsh-plugin-capabilities@0.3.14/node_modules/dsh-plugin-capabilities/lib/index.js'))
      .toEqual({ profile: 'web', profileDirPath: 'C:/h/profiles/web' })
  })

  it('accepts posix separators', () => {
    expect(activeProfileContext('/home/u/.dsh/profiles/work/node_modules/dsh-plugin-capabilities/lib/index.js'))
      .toEqual({ profile: 'work', profileDirPath: '/home/u/.dsh/profiles/work' })
  })

  it('returns undefined outside any profile (development checkout)', () => {
    expect(activeProfileContext('D:/Program/dsh-dosket/dsh-plugin-capabilities/lib/index.js')).toBeUndefined()
    expect(activeProfileContext('/index.js')).toBeUndefined()
  })
})
