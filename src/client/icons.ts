/** Icon adapter across host generations: 0.1.2-era hosts export pixel-size
 * suffixes (IconXxxOutline14/16), 0.5+ renamed them to stroke variants
 * (IconXxxOutlineRegular/Medium). The client chunk resolves the primitives
 * package through the host ModuleLoader's CJS require, where a missing name
 * is undefined rather than a link error — so we pick whichever name the
 * running host provides and degrade to an empty render when neither matches,
 * keeping a future rename from blanking the whole section again. */
import type { ReactElement } from 'react'
import type { SVGProps } from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

type IconComponent = (props: { className?: string; size?: number } & SVGProps<SVGSVGElement>) => ReactElement | null

const table = primitives as unknown as Record<string, IconComponent | undefined>

const pick = (...names: string[]): IconComponent => {
  for (const name of names) {
    const found = table[name]
    if (found !== undefined) return found
  }
  return () => null
}

export const IconApi = pick('IconApiOutline14', 'IconApiOutlineRegular')
export const IconRefresh = pick('IconRefreshOutline14', 'IconRefreshOutlineRegular')
export const IconSkill = pick('IconSkillOutline16', 'IconSkillOutlineRegular')
