/** dsh-plugin-capabilities client entry: contributes the “技能/Skills” and
 * “MCP” tabs into Settings → Plugins. Calls the host routes with fetch. */

import { createElement as h } from 'react'
import { McpTab, type McpInjected, type McpRow } from './McpTab.tsx'
import { SkillsTab, type SkillsInjected, type SkillRowView } from './SkillsTab.tsx'
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
    restart: (): void => { window.dshDesktop?.restartSidecar?.() },
    desktop: window.dshDesktop !== undefined,
  }

  ctx.slots.inject('settings.plugins.tab', () => {
    return ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'capabilities-skills',
      order: 30,
      label: () => t('skillsTab'),
      locale: NS,
      inject: () => skillsInjected,
    }, () => h(SkillsTab, { t, injected: skillsInjected }))
  })

  ctx.slots.inject('settings.plugins.tab', () => {
    return ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'capabilities-mcp',
      order: 40,
      label: () => t('mcpTab'),
      locale: NS,
      inject: () => mcpInjected,
    }, () => h(McpTab, { t, injected: mcpInjected }))
  })
}
