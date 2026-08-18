/** Settings top-level “技能与 MCP” section: one nav entry beside 通用设置 and
 * 模型, with the Skills, MCP, and 市场 pages as internal tabs. The pages are
 * pure composition; data still arrives through the injected faces. */

import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { CSS } from './css.ts'
import { MarketTab } from './MarketTab.tsx'
import type { MarketInjected } from './MarketTab.tsx'
import { McpTab } from './McpTab.tsx'
import type { McpInjected } from './McpTab.tsx'
import { SkillsTab } from './SkillsTab.tsx'
import type { SkillsInjected } from './SkillsTab.tsx'
import type { Translate } from './index.ts'

export function CapabilitiesSection(props: {
  t: Translate
  skills: SkillsInjected
  mcp: McpInjected
  market: MarketInjected
}): ReactElement {
  const { t, skills, mcp, market } = props
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const rows = [
    { id: 'skills', label: t('skillsTab') },
    { id: 'mcp', label: t('mcpTab') },
    { id: 'market', label: t('marketTab') },
  ]
  const [activeId, setActiveId] = useState('skills')
  // The skills page mounts immediately; a tab mounts only when first
  // selected, then stays mounted while hidden so editor drafts and outcome
  // banners survive switching between the views.
  const [visitedIds, setVisitedIds] = useState<ReadonlySet<string>>(() => new Set(['skills']))

  useEffect(() => {
    setVisitedIds((previous) => {
      if (previous.has(activeId)) return previous
      return new Set([...previous, activeId])
    })
  }, [activeId])

  return (
    <div className="dpc-section">
      <style>{CSS}</style>

      <h2 className="dpc-heading">{t('sectionNav')}</h2>
      <div className="dpc-tabs" role="tablist" aria-label={t('sectionNav')}>
        {rows.map((row, index) => {
          const selected = row.id === activeId
          return (
            <button
              key={row.id}
              ref={(element) => { tabRefs.current[index] = element }}
              id={`${tabsId}-tab-${row.id}`}
              type="button"
              role="tab"
              className="dpc-tab"
              aria-selected={selected}
              aria-controls={`${tabsId}-panel-${row.id}`}
              data-active={selected ? 'true' : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => { setActiveId(row.id) }}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight': nextIndex = (index + 1) % rows.length; break
                  case 'ArrowLeft': nextIndex = (index - 1 + rows.length) % rows.length; break
                  case 'Home': nextIndex = 0; break
                  case 'End': nextIndex = rows.length - 1; break
                  default: return
                }
                event.preventDefault()
                setActiveId(rows[nextIndex]?.id ?? 'skills')
                tabRefs.current[nextIndex]?.focus()
              }}
            >
              {row.label}
            </button>
          )
        })}
      </div>
      {rows
        .filter(row => row.id === activeId || visitedIds.has(row.id))
        .map((row) => {
          const selected = row.id === activeId
          return (
            <div
              key={row.id}
              id={`${tabsId}-panel-${row.id}`}
              className="dpc-tabPanel"
              role="tabpanel"
              aria-labelledby={`${tabsId}-tab-${row.id}`}
              hidden={!selected}
            >
              {row.id === 'skills'
                ? <SkillsTab t={t} injected={skills} />
                : row.id === 'mcp'
                  ? <McpTab t={t} injected={mcp} />
                  : <MarketTab t={t} market={market} mcp={mcp} />}
            </div>
          )
        })}
    </div>
  )
}
