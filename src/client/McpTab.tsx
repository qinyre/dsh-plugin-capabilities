/** Settings → Plugins “MCP” tab: manage the profile's mcp-client rows.
 * Mutations rewrite the profile patch and need a dsh restart — the banner
 * hands the restart to the desktop shell when one is present. */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, IconApiOutline14, IconRefreshOutline14, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { CSS } from './css.ts'
import type { Translate } from './index.ts'

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
  restart(): void
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
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

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

  const restartBanner = (
    <div className="dpc-banner" data-kind="info" role="status">
      <StateDot state="ongoing" size={10} />
      <div className="dpc-bannerBody">
        <span>{t('restartNeeded')}</span>
        <span className="dpc-bannerHint">
          {injected.desktop
            ? <>{t('restartDesktopHint')}{' '}<Button variant="outline" size="sm" onClick={injected.restart}>{t('restartNow')}</Button></>
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
        <Button variant="primary" size="sm" onClick={openCreate}>{t('addServer')}</Button>
      </div>
      <p className="dpc-intro">{t('mcpIntro')}</p>

      {outcome !== null && (
        <div className="dpc-banner" data-kind={outcome.ok ? 'ok' : 'error'} role="status">
          <StateDot state={outcome.ok ? 'done' : 'error'} size={10} />
          <div className="dpc-bannerBody"><span>{outcome.text}</span></div>
        </div>
      )}
      {pending && restartBanner}

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
    </div>
  )
}
