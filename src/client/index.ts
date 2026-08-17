/** dsh-plugin-capabilities client entry: contributes the top-level
 * “技能与 MCP” section into Settings (beside 通用设置/模型, with Skills and
 * MCP as internal tabs). Calls the host routes with fetch. */

import { createElement as h } from 'react'
import { CapabilitiesSection } from './CapabilitiesSection.tsx'
import type { McpInjected, McpRow } from './McpTab.tsx'
import type { SkillsInjected, SkillRowView } from './SkillsTab.tsx'
import { zh, en } from './locales.ts'

/** Locale dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginCapabilities'

/** The `t` function bound by the locale service. */
export interface Translate {
  (key: string): string
}

/** Minimal structural subset of the slots service. */
interface SlotsService {
  inject(slot: string, register: () => unknown): void
  register(meta: Record<string, unknown>, component: () => unknown): unknown
}

/** Minimal structural subset of the locale service. */
interface LocaleService {
  register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): unknown
  bind(namespace: string): Translate
}

/** The client cordis context this plugin relies on (structural). */
interface CapabilitiesClientContext {
  effect(callback: () => unknown, label?: string): void
  locale: LocaleService
  slots: SlotsService
}

/** Same-origin fetch of the manager's host routes. */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

const post = (path: string, body: unknown): Promise<unknown> =>
  fetchJson(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export const name = 'dsh-plugin-capabilities'
export const inject = ['slots', 'locale']

export interface SkillBody { content: string }

/** One foreign-agent server from the import scan. */
export interface ImportedServerView {
  agent: 'claude-code' | 'codex'
  name: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export function apply(ctx: CapabilitiesClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-capabilities: dictionaries')
  const t = ctx.locale.bind(NS)

  const skillsInjected: SkillsInjected = {
    list: () => fetchJson<{ skills: SkillRowView[] }>('/dsh-plugin-capabilities/skills'),
    get: (name: string) => fetchJson<SkillBody>(`/dsh-plugin-capabilities/skill?name=${encodeURIComponent(name)}`),
    save: (input: unknown) => post('/dsh-plugin-capabilities/skill/save', input) as Promise<{ ok: boolean }>,
    remove: (name: string) => post('/dsh-plugin-capabilities/skill/delete', { name }) as Promise<{ ok: boolean }>,
  }

  const mcpInjected: McpInjected = {
    list: () => fetchJson<{ servers: McpRow[] }>('/dsh-plugin-capabilities/mcp'),
    save: (input: unknown) => post('/dsh-plugin-capabilities/mcp/save', input) as Promise<{ ok: boolean; id: string }>,
    toggle: (id: string, disabled: boolean) => post('/dsh-plugin-capabilities/mcp/toggle', { id, disabled }) as Promise<{ ok: boolean }>,
    remove: (id: string) => post('/dsh-plugin-capabilities/mcp/remove', { id }) as Promise<{ ok: boolean }>,
    scanImport: () => fetchJson<{ servers: ImportedServerView[]; existing: string[] }>('/dsh-plugin-capabilities/import/scan'),
    applyImport: (items: Array<{ agent: string; name: string }>) =>
      post('/dsh-plugin-capabilities/import/apply', { items }) as Promise<{ ok: boolean; results: Array<{ name: string; ok: boolean; error?: string }> }>,
    restart: async (): Promise<void> => {
      if (window.dshDesktop !== undefined) {
        window.dshDesktop.restartSidecar?.()
        return
      }
      // 独立 dsh web：自重启路由。连接在关停途中断开属预期，不算失败。
      try { await post('/dsh-plugin-capabilities/restart', {}) } catch { /* dying mid-restart is expected */ }
    },
    desktop: window.dshDesktop !== undefined,
  }

  // One top-level nav entry (between 模型 and 插件), not a tab under the
  // Plugins section — the section component owns its internal Skills/MCP
  // tabs directly, so nothing registers into settings.plugins.tab anymore.
  ctx.slots.inject('settings.section', () => {
    return ctx.slots.register({
      name: 'settings.section',
      id: 'capabilities',
      order: 12,
      label: () => t('sectionNav'),
      locale: NS,
    }, () => h(CapabilitiesSection, { t, skills: skillsInjected, mcp: mcpInjected }))
  })
}
