/** Settings → Plugins “MCP” tab: manage the profile's mcp-client rows.
 * Mutations rewrite the profile patch and need a dsh restart — the banner
 * hands the restart to the desktop shell when one is present. */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, IconApiOutline14, IconRefreshOutline14, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { CSS } from './css.ts'
import type { ImportedServerView, Translate } from './index.ts'

export interface McpRow {
  id: string
  serverName: string
  transport: 'stdio' | 'streamable-http'
  disabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

export interface McpInjected {
  list(): Promise<{ servers: McpRow[] }>
  save(input: Record<string, unknown>): Promise<{ ok: boolean; id: string }>
  toggle(id: string, disabled: boolean): Promise<{ ok: boolean }>
  remove(id: string): Promise<{ ok: boolean }>
  scanImport(): Promise<{ servers: ImportedServerView[]; existing: string[] }>
  applyImport(items: Array<{ agent: string; name: string }>): Promise<{ ok: boolean; results: Array<{ name: string; ok: boolean; error?: string }> }>
  restart(): Promise<void>
  desktop: boolean
}

/** Editor dialog state; null when closed. Textareas hold line-based values. */
interface EditorState {
  id: string
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  url: string
  headers: string
}

/** One import entry together with its index in the flat state array —
 *  checkbox handlers rewrite the flat array, so indices must survive grouping. */
type ImportItem = { server: ImportedServerView; existing: boolean; checked: boolean }

/** Group import candidates by source agent, known agents first. */
export function importGroups(items: ImportItem[]): Array<{ agent: string; label: string; items: Array<{ item: ImportItem; index: number }> }> {
  const label = (agent: string) => agent === 'claude-code' ? 'Claude Code' : agent === 'codex' ? 'Codex' : agent
  const order = ['claude-code', 'codex']
  const agents = [...new Set(items.map(item => item.server.agent))]
    .sort((a, b) => {
      const rank = (agent: string) => { const at = order.indexOf(agent); return at === -1 ? order.length : at }
      return rank(a) - rank(b) || a.localeCompare(b)
    })
  return agents.map(agent => ({
    agent,
    label: label(agent),
    items: items.map((item, index) => ({ item, index })).filter(({ item }) => item.server.agent === agent),
  }))
}

/** KEY=VALUE / KEY: VALUE lines to a map. */
function parsePairs(text: string, separator: ':' | '='): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf(separator)
    if (at <= 0) continue
    map[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim()
  }
  return map
}

function mapToPairs(map: Record<string, string> | undefined, separator: string): string {
  if (map === undefined) return ''
  return Object.entries(map).map(([key, value]) => `${key}${separator}${value.includes('\n') ? JSON.stringify(value) : value}`).join('\n')
}

export function McpTab(props: { t: Translate; injected: McpInjected }): ReactElement {
  const { t, injected } = props
  const [servers, setServers] = useState<McpRow[] | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importItems, setImportItems] = useState<Array<{ server: ImportedServerView; existing: boolean; checked: boolean }> | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const [restartConfirm, setRestartConfirm] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const openImport = async (): Promise<void> => {
    setImportOpen(true)
    setImportItems(null)
    try {
      const body = await injected.scanImport()
      const existing = new Set(body.existing)
      setImportItems(body.servers.map(server => ({
        server,
        existing: existing.has(server.name),
        checked: !existing.has(server.name),
      })))
    } catch (error) {
      setImportItems([])
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    }
  }

  const doImport = async (): Promise<void> => {
    if (importItems === null) return
    const items = importItems.filter(item => item.checked && !item.existing).map(item => ({ agent: item.server.agent, name: item.server.name }))
    setBusy(true)
    try {
      const body = await injected.applyImport(items)
      const failed = body.results.filter(item => !item.ok)
      setOutcome(failed.length === 0
        ? { ok: true, text: t('restartNeeded') }
        : { ok: false, text: `${t('failed')}: ${failed.map(item => `${item.name} (${item.error})`).join(', ')}` })
      setImportOpen(false)
      setPending(true)
      setReload((value) => value + 1)
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setBusy(false)
    }
  }

  const reloadList = (showPending: boolean): void => {
    setReload((value) => value + 1)
    if (showPending) setPending(true)
  }

  useEffect(() => {
    let current = true
    void injected.list().then(
      (body) => { if (current) setServers(body.servers) },
      (error: Error) => { if (current) { setServers([]); setOutcome({ ok: false, text: `${t('failed')}: ${String(error.message ?? error)}` }) } },
    )
    return () => { current = false }
  }, [injected, reload, t])

  const openCreate = (): void => {
    setFormError(null)
    setEditor({ id: '', serverName: '', transport: 'stdio', command: '', args: '', env: '', url: '', headers: '' })
  }

  const openEdit = (row: McpRow): void => {
    setFormError(null)
    setEditor({
      id: row.id,
      serverName: row.serverName,
      transport: row.transport,
      command: row.command ?? '',
      args: (row.args ?? []).join('\n'),
      env: mapToPairs(row.env, '='),
      url: row.url ?? '',
      headers: mapToPairs(row.headers, ':'),
    })
  }

  const doSave = async (): Promise<void> => {
    if (editor === null) return
    setBusy(true)
    setFormError(null)
    try {
      await injected.save({
        id: editor.id,
        serverName: editor.serverName.trim(),
        transport: editor.transport,
        ...(editor.transport === 'stdio'
          ? {
              command: editor.command.trim(),
              args: editor.args.split(/\r?\n/).map(line => line.trim()).filter(line => line !== ''),
              env: parsePairs(editor.env, '='),
            }
          : {
              url: editor.url.trim(),
              headers: parsePairs(editor.headers, ':'),
            }),
      })
      setEditor(null)
      setOutcome({ ok: true, text: t('restartNeeded') })
      reloadList(true)
    } catch (error) {
      setFormError(String(error instanceof Error ? error.message : error))
    } finally {
      setBusy(false)
    }
  }

  const doToggle = async (row: McpRow): Promise<void> => {
    setBusy(true)
    try {
      await injected.toggle(row.id, !row.disabled)
      setOutcome({ ok: true, text: t('restartNeeded') })
      reloadList(true)
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setBusy(false)
    }
  }

  const doRemove = async (): Promise<void> => {
    if (confirmId === null) return
    setBusy(true)
    try {
      await injected.remove(confirmId)
      setOutcome({ ok: true, text: t('restartNeeded') })
      reloadList(true)
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setBusy(false)
      setConfirmId(null)
    }
  }

  const doRestart = (): void => {
    setRestartConfirm(false)
    setRestarting(true)
    void injected.restart()
    // 桌面模式：壳层重启完成后会重载窗口。独立模式：轮询本源，恢复即刷新。
    if (injected.desktop) return
    const deadline = Date.now() + 60_000
    const poll = (): void => {
      if (Date.now() > deadline) return
      window.setTimeout(() => {
        void injected.list().then(
          () => { window.location.reload() },
          () => { poll() },
        )
      }, 1500)
    }
    window.setTimeout(poll, 3000)
  }

  const restartBanner = (
    <div className="dpc-banner" data-kind="info" role="status">
      <StateDot state="ongoing" size={10} />
      <div className="dpc-bannerBody">
        <span>{restarting ? t('restarting') : t('restartNeeded')}</span>
        <span className="dpc-bannerHint">
          {restarting
            ? (!injected.desktop && t('restartPortHint'))
            : injected.desktop
              ? <>{t('restartDesktopHint')}{' '}<Button variant="outline" size="sm" onClick={() => setRestartConfirm(true)}>{t('restartNow')}</Button></>
              : t('restartOtherHint')}
        </span>
      </div>
    </div>
  )

  return (
    <div className="dpc-section">
      <style>{CSS}</style>

      <div className="dpc-head">
        <IconApiOutline14 aria-hidden="true" />
        <h3>{t('mcpTitle')}</h3>
        <span className="dpc-spacer" />
        <Button variant="ghost" size="sm" disabled={restarting} onClick={() => setRestartConfirm(true)}>{t('restart')}</Button>
        <Button variant="ghost" size="sm" onClick={() => void openImport()}>{t('importServers')}</Button>
        <Button variant="primary" size="sm" onClick={openCreate}>{t('addServer')}</Button>
      </div>
      <p className="dpc-intro">{t('mcpIntro')}</p>

      {outcome !== null && (
        <div className="dpc-banner" data-kind={outcome.ok ? 'ok' : 'error'} role="status">
          <StateDot state={outcome.ok ? 'done' : 'error'} size={10} />
          <div className="dpc-bannerBody"><span>{outcome.text}</span></div>
        </div>
      )}
      {(pending || restarting) && restartBanner}

      <div className="dpc-listHead">
        <h3>{t('mcpTab')}</h3>
        {servers !== null && <span className="dpc-count">{servers.length}</span>}
        <span className="dpc-spacer" />
        <button type="button" className="dpc-refresh" aria-label={t('view')} title={t('view')} disabled={busy} onClick={() => setReload((value) => value + 1)}>
          <IconRefreshOutline14 size={14} aria-hidden="true" />
        </button>
      </div>

      {servers === null && <p className="dpc-empty">{t('loading')}</p>}
      {servers !== null && servers.length === 0 && <p className="dpc-empty">{t('emptyMcp')}</p>}
      {servers !== null && servers.length > 0 && (
        <ul className="dpc-cards">
          {servers.map((row) => (
            <li className="dpc-card" key={row.id}>
              <div className="dpc-cardTop">
                <strong className="dpc-cardTitle" title={row.id}>{row.serverName}</strong>
                <span className="dpc-tag">{row.transport}</span>
                <span className="dpc-tag" data-kind={row.disabled ? 'off' : undefined}>{row.disabled ? t('disabled') : t('enabled')}</span>
              </div>
              <p className="dpc-cardDesc">
                {row.transport === 'stdio' ? `${row.command ?? ''} ${(row.args ?? []).join(' ')}` : row.url ?? ''}
              </p>
              <div className="dpc-cardRow">
                <span className="dpc-spacer" />
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void doToggle(row)}>{t('toggle')}</Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => openEdit(row)}>{t('edit')}</Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmId(row.id)}>{t('delete')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor !== null && editor.id !== '' ? t('editServer') : t('addServer')}
        className="dpc-modalForm"
        contentClassName="dpc-modalScroll"
      >
        {editor !== null && (
          <div className="dpc-form">
            <label className="dpc-label">
              <span>{t('serverName')}</span>
              <input
                className="dpc-input"
                value={editor.serverName}
                disabled={editor.id !== ''}
                onChange={(event) => setEditor({ ...editor, serverName: event.target.value })}
              />
            </label>
            <label className="dpc-label">
              <span>{t('transport')}</span>
              <select
                className="dpc-select"
                value={editor.transport}
                disabled={editor.id !== ''}
                onChange={(event) => setEditor({ ...editor, transport: event.target.value as EditorState['transport'] })}
              >
                <option value="stdio">{t('transportStdio')}</option>
                <option value="streamable-http">{t('transportHttp')}</option>
              </select>
            </label>
            {editor.transport === 'stdio' ? (
              <>
                <label className="dpc-label">
                  <span>{t('command')}</span>
                  <input className="dpc-input" value={editor.command} onChange={(event) => setEditor({ ...editor, command: event.target.value })} />
                </label>
                <label className="dpc-label">
                  <span>{t('args')}</span>
                  <textarea className="dpc-textarea" data-short="true" value={editor.args} onChange={(event) => setEditor({ ...editor, args: event.target.value })} />
                </label>
                <label className="dpc-label">
                  <span>{t('envPairs')}</span>
                  <textarea className="dpc-textarea" data-short="true" value={editor.env} onChange={(event) => setEditor({ ...editor, env: event.target.value })} />
                </label>
              </>
            ) : (
              <>
                <label className="dpc-label">
                  <span>{t('url')}</span>
                  <input className="dpc-input" value={editor.url} onChange={(event) => setEditor({ ...editor, url: event.target.value })} />
                </label>
                <label className="dpc-label">
                  <span>{t('headersPairs')}</span>
                  <textarea className="dpc-textarea" data-short="true" value={editor.headers} onChange={(event) => setEditor({ ...editor, headers: event.target.value })} />
                </label>
              </>
            )}
            {formError !== null && <p className="dpc-formError">{formError}</p>}
            <div className="dpc-cardRow">
              <span className="dpc-spacer" />
              <Button variant="ghost" onClick={() => setEditor(null)}>{t('cancel')}</Button>
              <Button variant="primary" disabled={busy} onClick={() => void doSave()}>{t('save')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title={t('confirmRemove')}
        description={confirmId ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmId(null)}>{t('cancel')}</Button>
            <Button variant="primary" disabled={busy} onClick={() => void doRemove()}>{t('delete')}</Button>
          </>
        }
      >
        <p>{t('removeWarn')}</p>
      </Modal>

      <Modal
        open={restartConfirm}
        onClose={() => setRestartConfirm(false)}
        title={t('restartConfirmTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestartConfirm(false)}>{t('cancel')}</Button>
            <Button variant="primary" onClick={doRestart}>{t('restartNow')}</Button>
          </>
        }
      >
        <p>{t('restartConfirmBody')}</p>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('importServers')}
        className="dpc-modalWide"
      >
        <div className="dpc-form">
          <p className="dpc-intro" style={{ margin: 0 }}>{t('importIntro')}</p>
          {importItems === null && <p className="dpc-empty">{t('loading')}</p>}
          {importItems !== null && importItems.length === 0 && <p className="dpc-empty">{t('importEmpty')}</p>}
          {importItems !== null && importItems.length > 0 && (
            <div className="dpc-importScroll">
              {importGroups(importItems).map(group => {
                const selectable = group.items
                  .filter(({ item }) => !item.existing)
                  .map(({ index }) => index)
                const allChecked = selectable.length > 0
                  && selectable.every(index => importItems[index].checked)
                return (
                  <section className="dpc-importGroup" key={group.agent}>
                    <div className="dpc-importHead">
                      <span className="dpc-tag" data-kind="source">{group.label}</span>
                      <span className="dpc-importCount">{group.items.length}</span>
                      {selectable.length > 0 && (
                        <label className="dpc-importAll">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(event) => {
                              const next = importItems.slice()
                              for (const index of selectable) next[index] = { ...next[index], checked: event.target.checked }
                              setImportItems(next)
                            }}
                          />
                          {t('importSelectAll')}
                        </label>
                      )}
                    </div>
                    <ul className="dpc-cards" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                      {group.items.map(({ item, index }) => {
                        const command = item.server.transport === 'stdio'
                          ? `${item.server.command ?? ''} ${(item.server.args ?? []).join(' ')}`.trim()
                          : item.server.url ?? ''
                        return (
                          <li className="dpc-card" key={`${item.server.agent}/${item.server.name}`} style={{ opacity: item.existing ? 0.55 : 1 }}>
                            <div className="dpc-cardTop">
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: item.existing ? 'default' : 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={item.checked}
                                  disabled={item.existing}
                                  onChange={(event) => {
                                    const next = importItems.slice()
                                    next[index] = { ...item, checked: event.target.checked }
                                    setImportItems(next)
                                  }}
                                />
                                <strong className="dpc-cardTitle" title={item.server.name}>{item.server.name}</strong>
                              </label>
                              <span className="dpc-tag">{item.server.transport}</span>
                              {item.existing && <span className="dpc-tag">{t('importExisting')}</span>}
                            </div>
                            <p className="dpc-cardDesc" title={command}>{command}</p>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
          {formError !== null && <p className="dpc-formError">{formError}</p>}
          <div className="dpc-cardRow">
            <span className="dpc-spacer" />
            <Button variant="ghost" onClick={() => setImportOpen(false)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || importItems === null || !importItems.some(item => item.checked && !item.existing)}
              onClick={() => void doImport()}
            >
              {t('importSelected')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
