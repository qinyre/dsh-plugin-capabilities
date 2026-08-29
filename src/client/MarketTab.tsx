/** Settings “市场” tab: browse and install curated skill repositories and
 * MCP servers. Two segments (skills / MCP) with independently fetched
 * indexes; installs reuse the repositories and MCP-row plumbing, so a
 * skills install lands live in the catalog and an MCP install raises the
 * same pending-restart notice as the MCP tab. */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, IconRefreshOutline14, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { CSS } from './css.ts'
import type { MarketRepoView, MarketServerView, Translate } from './index.ts'
import type { McpInjected, McpScope } from './McpTab.tsx'

/** One registered skill repository as the roots route reports it. */
export interface RootRowView {
  id: string
  kind: 'local' | 'git'
  label: string
  url?: string
  ref?: string
  path?: string
  roots: string[]
  materialDir?: string
  addedAt: number
  /** False once one of its scan roots vanished from disk. */
  live: boolean
}

export interface MarketInjected {
  skillsIndex(): Promise<{ source: 'remote' | 'bundled'; repos: Array<MarketRepoView & { installedId: string | null }> }>
  mcpIndex(): Promise<{ source: 'remote' | 'bundled'; servers: Array<MarketServerView & { installed: boolean }> }>
  installSkillRepo(url: string): Promise<{ ok: boolean; root: RootRowView }>
  installMcp(id: string, scope: McpScope): Promise<{ ok: boolean; id: string }>
  removeRoot(id: string): Promise<{ ok: boolean }>
}

/** UI language hint for the index's zh display fields. */
const zhUi = (): boolean => navigator.language.toLowerCase().startsWith('zh')

type Segment = 'skills' | 'mcp'

export function MarketTab(props: { t: Translate; market: MarketInjected; mcp: McpInjected }): ReactElement {
  const { t, market, mcp } = props
  const [segment, setSegment] = useState<Segment>('skills')
  const [repos, setRepos] = useState<Array<MarketRepoView & { installedId: string | null }> | null>(null)
  const [servers, setServers] = useState<Array<MarketServerView & { installed: boolean }> | null>(null)
  const [source, setSource] = useState<'remote' | 'bundled'>('remote')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [mcpScope, setMcpScope] = useState<McpScope>('profile')
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState<{ kind: 'root'; id: string; name: string } | { kind: 'mcp'; id: string; name: string; scope: McpScope } | null>(null)
  const [detail, setDetail] = useState<{ kind: Segment; id: string } | null>(null)
  const [reload, setReload] = useState(0)

  const refreshSkills = useCallback((): void => {
    setRepos(null)
    void market.skillsIndex().then(
      (body) => { setRepos(body.repos); setSource(body.source) },
      (error: Error) => { setRepos([]); setOutcome({ ok: false, text: `${t('failed')}: ${String(error.message ?? error)}` }) },
    )
  }, [market, t])

  const refreshMcp = useCallback((): void => {
    setServers(null)
    void market.mcpIndex().then(
      (body) => { setServers(body.servers); setSource(body.source) },
      (error: Error) => { setServers([]); setOutcome({ ok: false, text: `${t('failed')}: ${String(error.message ?? error)}` }) },
    )
  }, [market, t])

  useEffect(() => {
    // Refetch the visible segment when it changes or the reload ticks; the
    // hidden segment keeps its last state as a cache.
    if (segment === 'skills') refreshSkills()
    else refreshMcp()
  }, [segment, reload, refreshSkills, refreshMcp])

  const doInstallRepo = async (repo: MarketRepoView): Promise<void> => {
    setBusyId(repo.id)
    setOutcome(null)
    try {
      await market.installSkillRepo(repo.url)
      setOutcome({ ok: true, text: t('marketRepoInstalled') })
      refreshSkills()
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
      refreshSkills()
    } finally {
      setBusyId(null)
    }
  }

  const doInstallMcp = async (server: MarketServerView): Promise<void> => {
    setBusyId(server.id)
    setOutcome(null)
    try {
      await market.installMcp(server.id, mcpScope)
      setOutcome({ ok: true, text: t('restartNeeded') })
      refreshMcp()
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
      refreshMcp()
    } finally {
      setBusyId(null)
    }
  }

  const doUninstall = async (): Promise<void> => {
    if (confirmUninstall === null) return
    const target = confirmUninstall
    setBusyId(target.id)
    try {
      if (target.kind === 'root') {
        await market.removeRoot(target.id)
        setOutcome({ ok: true, text: t('rootRemoved') })
        refreshSkills()
      } else {
        await mcp.remove(target.id, target.scope)
        setOutcome({ ok: true, text: t('restartNeeded') })
        refreshMcp()
      }
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setBusyId(null)
      setConfirmUninstall(null)
    }
  }

  const pick = <T,>(base: T, zh: T | undefined): T => (zhUi() && zh !== undefined ? zh : base)
  const title = (entry: { name: string; nameZh?: string }): string => pick(entry.name, entry.nameZh)
  const desc = (entry: { description: string; descriptionZh?: string }): string => pick(entry.description, entry.descriptionZh)
  const longText = (entry: { description: string; descriptionZh?: string; detail?: string; detailZh?: string }): string =>
    entry.detail !== undefined ? pick(entry.detail, entry.detailZh) : desc(entry)

  const cardStop = (event: { stopPropagation(): void }): void => { event.stopPropagation() }

  // The card list refreshes on install/uninstall, so the detail modal resolves
  // its entry by id each render and follows the fresh installed state.
  const detailRepo = detail !== null && detail.kind === 'skills' && repos !== null ? repos.find(repo => repo.id === detail.id) ?? null : null
  const detailServer = detail !== null && detail.kind === 'mcp' && servers !== null ? servers.find(server => server.id === detail.id) ?? null : null

  return (
    <div className="dpc-section">
      <style>{CSS}</style>

      <div className="dpc-head">
        <h3>{t('marketTitle')}</h3>
        <span className="dpc-spacer" />
        <button type="button" className="dpc-refresh" aria-label={t('refresh')} title={t('refresh')} onClick={() => setReload((value) => value + 1)}>
          <IconRefreshOutline14 size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="dpc-intro">{t('marketIntro')}</p>

      <div className="dpc-segments" role="tablist" aria-label={t('marketTitle')}>
        <button type="button" role="tab" aria-selected={segment === 'skills'} className="dpc-segment" data-active={segment === 'skills' ? 'true' : undefined} onClick={() => setSegment('skills')}>
          {t('marketSkills')}
        </button>
        <button type="button" role="tab" aria-selected={segment === 'mcp'} className="dpc-segment" data-active={segment === 'mcp' ? 'true' : undefined} onClick={() => setSegment('mcp')}>
          {t('marketMcp')}
        </button>
      </div>

      {outcome !== null && (
        <div className="dpc-banner" data-kind={outcome.ok ? 'ok' : 'error'} role="status">
          <StateDot state={outcome.ok ? 'done' : 'error'} size={10} />
          <div className="dpc-bannerBody"><span>{outcome.text}</span></div>
        </div>
      )}
      {source === 'bundled' && (
        <div className="dpc-banner" data-kind="info" role="status">
          <StateDot state="ongoing" size={10} />
          <div className="dpc-bannerBody"><span>{t('marketOffline')}</span></div>
        </div>
      )}

      {segment === 'skills' && (
        <>
          <p className="dpc-intro">{t('marketSkillsIntro')}</p>
          {repos === null && <p className="dpc-empty">{t('loading')}</p>}
          {repos !== null && repos.length === 0 && <p className="dpc-empty">{t('marketEmpty')}</p>}
          {repos !== null && repos.length > 0 && (
            <ul className="dpc-cards">
              {repos.map((repo) => (
                <li className="dpc-card" key={repo.id} onClick={() => setDetail({ kind: 'skills', id: repo.id })}>
                  <div className="dpc-cardTop">
                    <strong className="dpc-cardTitle" title={repo.url}>{title(repo)}</strong>
                    {repo.skillCount !== undefined && <span className="dpc-tag">{t('marketSkillCount').replace('{n}', String(repo.skillCount))}</span>}
                    {repo.installedId !== null && <span className="dpc-tag" data-kind="source">{t('marketInstalled')}</span>}
                  </div>
                  <p className="dpc-cardDesc">{desc(repo)}</p>
                  <div className="dpc-cardRow">
                    <button type="button" className="dpc-link" onClick={() => setDetail({ kind: 'skills', id: repo.id })}>{t('marketDetail')}</button>
                    <a className="dpc-link" href={repo.homepage ?? repo.url} target="_blank" rel="noreferrer" onClick={cardStop}>{t('marketHome')}</a>
                    <span className="dpc-spacer" />
                    {repo.installedId !== null ? (
                      <Button variant="ghost" size="sm" disabled={busyId !== null} onClick={(event) => { event.stopPropagation(); setConfirmUninstall({ kind: 'root', id: repo.installedId as string, name: title(repo) }) }}>
                        {t('marketUninstall')}
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" disabled={busyId !== null} onClick={(event) => { event.stopPropagation(); void doInstallRepo(repo) }}>
                        {busyId === repo.id ? t('marketInstalling') : t('marketInstall')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {segment === 'mcp' && (
        <>
          <p className="dpc-intro">{t('marketMcpIntro')}</p>
          <div className="dpc-cardRow">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span>{t('scopeLabel')}</span>
              <select
                className="dpc-select"
                style={{ width: 'auto' }}
                value={mcpScope}
                disabled={busyId !== null}
                onChange={(event) => setMcpScope(event.target.value as McpScope)}
              >
                <option value="profile">{t('scopeProfile')}</option>
                <option value="global">{t('scopeGlobal')}</option>
              </select>
            </label>
          </div>
          {servers === null && <p className="dpc-empty">{t('loading')}</p>}
          {servers !== null && servers.length === 0 && <p className="dpc-empty">{t('marketEmpty')}</p>}
          {servers !== null && servers.length > 0 && (
            <ul className="dpc-cards">
              {servers.map((server) => (
                <li className="dpc-card" key={server.id} onClick={() => setDetail({ kind: 'mcp', id: server.id })}>
                  <div className="dpc-cardTop">
                    <strong className="dpc-cardTitle" title={server.id}>{title(server)}</strong>
                    <span className="dpc-tag">{server.transport}</span>
                    {server.runtime !== undefined && <span className="dpc-tag">{server.runtime}</span>}
                    {server.installed && <span className="dpc-tag" data-kind="source">{t('marketInstalled')}</span>}
                  </div>
                  <p className="dpc-cardDesc">{desc(server)}</p>
                  {server.envKeys !== undefined && server.envKeys.length > 0 && (
                    <p className="dpc-envHint">{t('marketNeedsEnv')}: {server.envKeys.join(', ')}</p>
                  )}
                  <div className="dpc-cardRow">
                    <button type="button" className="dpc-link" onClick={() => setDetail({ kind: 'mcp', id: server.id })}>{t('marketDetail')}</button>
                    <a className="dpc-link" href={server.homepage} target="_blank" rel="noreferrer" onClick={cardStop}>{t('marketHome')}</a>
                    <span className="dpc-spacer" />
                    {server.installed ? (
                      <Button variant="ghost" size="sm" disabled={busyId !== null} onClick={(event) => { event.stopPropagation(); void mcp.list().then(
                        (body) => {
                          const row = body.servers.find(item => item.serverName === server.id)
                          if (row !== undefined) setConfirmUninstall({ kind: 'mcp', id: row.id, name: server.id, scope: row.scope })
                        },
                        (error: Error) => setOutcome({ ok: false, text: `${t('failed')}: ${String(error.message ?? error)}` }),
                      ) }}>
                        {t('marketUninstall')}
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" disabled={busyId !== null} onClick={(event) => { event.stopPropagation(); void doInstallMcp(server) }}>
                        {busyId === server.id ? t('marketInstalling') : t('marketAdd')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal
        open={detailRepo !== null || detailServer !== null}
        onClose={() => setDetail(null)}
        title={detailRepo !== null ? title(detailRepo) : detailServer !== null ? title(detailServer) : ''}
        closeLabel={t('close')}
        className="dpc-marketDialog"
        contentClassName="dpc-marketContent"
        footer={
          <>
            {detailRepo !== null && (
              <a className="dpc-link" href={detailRepo.homepage ?? detailRepo.url} target="_blank" rel="noreferrer">{t('marketHome')}</a>
            )}
            {detailServer !== null && (
              <a className="dpc-link" href={detailServer.homepage} target="_blank" rel="noreferrer">{t('marketHome')}</a>
            )}
            <span className="dpc-spacer" />
            {detailRepo !== null && (detailRepo.installedId !== null ? (
              <Button variant="ghost" disabled={busyId !== null} onClick={() => { setConfirmUninstall({ kind: 'root', id: detailRepo.installedId as string, name: title(detailRepo) }); setDetail(null) }}>
                {t('marketUninstall')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busyId !== null} onClick={() => void doInstallRepo(detailRepo)}>
                {busyId === detailRepo.id ? t('marketInstalling') : t('marketInstall')}
              </Button>
            ))}
            {detailServer !== null && (detailServer.installed ? (
              <Button variant="ghost" disabled={busyId !== null} onClick={() => void mcp.list().then(
                (body) => {
                  const row = body.servers.find(item => item.serverName === detailServer.id)
                  if (row !== undefined) { setConfirmUninstall({ kind: 'mcp', id: row.id, name: title(detailServer), scope: row.scope }); setDetail(null) }
                },
                (error: Error) => setOutcome({ ok: false, text: `${t('failed')}: ${String(error.message ?? error)}` }),
              )}>
                {t('marketUninstall')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busyId !== null} onClick={() => void doInstallMcp(detailServer)}>
                {busyId === detailServer.id ? t('marketInstalling') : t('marketAdd')}
              </Button>
            ))}
          </>
        }
      >
        {(detailRepo !== null || detailServer !== null) && (
          <div className="dpc-detailTagsRow">
            {detailRepo !== null && detailRepo.skillCount !== undefined && (
              <span className="dpc-tag">{t('marketSkillCount').replace('{n}', String(detailRepo.skillCount))}</span>
            )}
            {detailRepo !== null && detailRepo.installedId !== null && (
              <span className="dpc-tag" data-kind="source">{t('marketInstalled')}</span>
            )}
            {detailServer !== null && (
              <>
                <span className="dpc-tag">{detailServer.transport}</span>
                {detailServer.runtime !== undefined && <span className="dpc-tag">{detailServer.runtime}</span>}
                {detailServer.category !== undefined && <span className="dpc-tag">{detailServer.category}</span>}
                {detailServer.installed && <span className="dpc-tag" data-kind="source">{t('marketInstalled')}</span>}
              </>
            )}
          </div>
        )}
        {detailRepo !== null && (
          <>
            <p className="dpc-detailDesc">{longText(detailRepo)}</p>
            {detailRepo.skills !== undefined && detailRepo.skills.length > 0 && (
              <div className="dpc-detailSection">
                <div className="dpc-detailLabel">{t('marketSkillListLabel')}</div>
                <ul className="dpc-skillList">
                  {detailRepo.skills.map(item => (
                    <li className="dpc-skillItem" key={item.name}>
                      <code className="dpc-skillName">{item.name}</code>
                      {item.description !== undefined && (
                        <span className="dpc-skillDesc">{pick(item.description, item.descriptionZh)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {detailServer !== null && (
          <>
            <p className="dpc-detailDesc">{longText(detailServer)}</p>
            {detailServer.command !== undefined && (
              <div className="dpc-detailSection">
                <div className="dpc-detailLabel">{t('marketCommandLabel')}</div>
                <code className="dpc-code">{[detailServer.command, ...(detailServer.args ?? [])].join(' ')}</code>
              </div>
            )}
            {detailServer.transport === 'streamable-http' && detailServer.url !== undefined && (
              <div className="dpc-detailSection">
                <div className="dpc-detailLabel">{t('marketCommandLabel')}</div>
                <code className="dpc-code">{detailServer.url}</code>
              </div>
            )}
            {detailServer.envKeys !== undefined && detailServer.envKeys.length > 0 && (
              <div className="dpc-detailSection">
                <div className="dpc-detailLabel">{t('marketNeedsEnv')}</div>
                <div className="dpc-detailTags">
                  {detailServer.envKeys.map(key => <span className="dpc-tag" key={key}>{key}</span>)}
                </div>
              </div>
            )}
            {detailServer.tools !== undefined && detailServer.tools.length > 0 && (
              <div className="dpc-detailSection">
                <div className="dpc-detailLabel">{t('marketToolsLabel')}</div>
                <div className="dpc-detailTags">
                  {detailServer.tools.map(name => <span className="dpc-tag" key={name}>{name}</span>)}
                </div>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={confirmUninstall !== null}
        onClose={() => setConfirmUninstall(null)}
        title={t('marketUninstallConfirm')}
        description={confirmUninstall?.name ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmUninstall(null)}>{t('cancel')}</Button>
            <Button variant="primary" disabled={busyId !== null} onClick={() => void doUninstall()}>{t('marketUninstall')}</Button>
          </>
        }
      >
        <p>{confirmUninstall?.kind === 'root' ? t('marketUninstallRootWarn') : t('removeWarn')}</p>
      </Modal>
    </div>
  )
}
