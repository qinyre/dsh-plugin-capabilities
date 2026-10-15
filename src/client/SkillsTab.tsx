/** Settings “技能” tab: view the discovered catalog, edit the user-owned
 * root, toggle skills on/off, open their folders, and manage the custom
 * skill repositories (local paths and GitHub checkouts) feeding the catalog.
 * Pure presentation-layer — data arrives through props. */

import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { Button, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconRefresh, IconSkill } from './icons.ts'
import { CSS } from './css.ts'
import { MarkdownPreview } from './MarkdownPreview.tsx'
import type { ImportOutcomeView, ImportRequest, OpenTarget, Translate, WorkspaceItemView } from './index.ts'
import type { RootRowView } from './MarketTab.tsx'

/** One skill as the host reports it (plus the flags the route adds). */
export interface SkillRowView {
  name: string
  description: string
  whenToUse?: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  source: string
  provider: string
  editable: boolean
  /** Only user-root skills can be deleted (the delete route removes one
   * directory under $DSH_HOME/skills); other editable sources just save. */
  removable: boolean
  /** The skill's folder when it lives on disk (drives open-folder). */
  dir?: string
  /** File-backed skills can be enabled/disabled through the policy route. */
  policyEditable: boolean
  /** Set for cataloged foreign-agent skills (drives the source label). */
  agent?: string
  agentLabel?: string
}

/** Options threading the selected workspace through to the routes. */
export interface WorkspaceScope {
  workspace?: string
}

export interface SkillsInjected {
  list(options?: WorkspaceScope): Promise<{ skills: SkillRowView[] }>
  get(name: string, options?: WorkspaceScope): Promise<{ content: string }>
  save(input: { name: string; description: string; whenToUse?: string; modelInvocable: boolean; userInvocable: boolean; content: string; workspace?: string }): Promise<{ ok: boolean }>
  remove(name: string): Promise<{ ok: boolean }>
  policy(name: string, enabled: boolean, options?: WorkspaceScope): Promise<{ ok: boolean }>
  open(target: OpenTarget): Promise<{ ok: boolean }>
  roots(): Promise<{ roots: RootRowView[] }>
  addRoot(input: { kind: 'local' | 'git'; path?: string; url?: string }): Promise<{ ok: boolean; root: RootRowView }>
  removeRoot(id: string): Promise<{ ok: boolean }>
  workspaces(): Promise<{ supported: boolean; items: WorkspaceItemView[] }>
  importSkills(input: ImportRequest): Promise<ImportOutcomeView>
}

/** Editor dialog state; null when closed. */
interface EditorState {
  mode: 'create' | 'edit' | 'view'
  name: string
  description: string
  whenToUse: string
  modelInvocable: boolean
  userInvocable: boolean
  content: string
}

const SOURCE_KEYS: Record<string, string> = {
  'project-dsh': 'sourceProjectDsh',
  'project-agents': 'sourceProjectAgents',
  'user-dsh': 'sourceUserDsh',
  'user-agents': 'sourceUserAgents',
  runtime: 'sourceRuntime',
  bundled: 'sourceBundled',
  custom: 'sourceCustom',
}

/** Status tag for the invocation policy; undefined = default (both allowed). */
function policyTag(skill: SkillRowView): { key?: string; off: boolean } {
  const { modelInvocable, userInvocable } = skill.invocation
  if (!modelInvocable && !userInvocable) return { key: 'skillDisabled', off: true }
  if (!modelInvocable) return { key: 'skillUserOnly', off: false }
  if (!userInvocable) return { key: 'skillModelOnly', off: false }
  return { off: false }
}

/** Add-repository form state; null when the form is collapsed. */
interface AddRootState {
  kind: 'local' | 'git'
  value: string
}

/** Import dialog state; null when closed. */
interface ImportState {
  kind: 'zip' | 'folder' | 'file'
  path: string
  zipName: string | null
  zipData: string | null
  zipBytes: number
  dest: 'user' | 'workspace'
  destId: string
  conflict: 'skip' | 'overwrite'
}

/** ZIP upload bound mirrors the server (32 MiB archive). */
const ZIP_MAX_BYTES = 32 * 1024 * 1024

/** Read a picked File as the base64 payload the import route expects. */
function readZipBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const comma = text.indexOf(',')
      resolve(comma >= 0 ? text.slice(comma + 1) : text)
    }
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}

export function SkillsTab(props: { t: Translate; injected: SkillsInjected }): ReactElement {
  const { t, injected } = props
  const [skills, setSkills] = useState<SkillRowView[] | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  /** Content pane of the editor modal: rendered Markdown vs the raw editor. */
  const [preview, setPreview] = useState(false)
  const [confirmName, setConfirmName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  // Project skills: the registered-workspace picker ('' = global catalog).
  const [workspace, setWorkspace] = useState('')
  const [workspaces, setWorkspaces] = useState<{ supported: boolean; items: WorkspaceItemView[] } | null>(null)

  // Import dialog.
  const [importState, setImportState] = useState<ImportState | null>(null)
  const [importOutcome, setImportOutcome] = useState<ImportOutcomeView | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  // Custom skill repositories.
  const [roots, setRoots] = useState<RootRowView[] | null>(null)
  const [addRoot, setAddRoot] = useState<AddRootState | null>(null)
  const [rootBusy, setRootBusy] = useState(false)
  const [confirmRootId, setConfirmRootId] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void injected.workspaces().then(
      (body) => { if (current) setWorkspaces(body) },
      () => { if (current) setWorkspaces({ supported: false, items: [] }) },
    )
    return () => { current = false }
  }, [injected])

  useEffect(() => {
    let current = true
    const scope = workspace === '' ? undefined : { workspace }
    void injected.list(scope).then(
      (body) => { if (current) setSkills(body.skills) },
      (error: Error) => { if (current) { setSkills([]); setOutcome({ ok: false, text: `${t('failed')}: ${String(error.message ?? error)}` }) } },
    )
    void injected.roots().then(
      (body) => { if (current) setRoots(body.roots) },
      () => { if (current) setRoots([]) },
    )
    return () => { current = false }
  }, [injected, reload, t, workspace])

  const openCreate = (): void => {
    setFormError(null)
    setPreview(false)
    setEditor({ mode: 'create', name: '', description: '', whenToUse: '', modelInvocable: true, userInvocable: true, content: '' })
  }

  const openExisting = async (skill: SkillRowView): Promise<void> => {
    setBusy(true)
    setFormError(null)
    try {
      const body = await injected.get(skill.name, workspace === '' ? undefined : { workspace })
      // Read-only sources open on the rendered preview; editable ones on the
      // plain-text editor. The toggle in the content row flips either way.
      setPreview(!skill.editable)
      setEditor({
        mode: skill.editable ? 'edit' : 'view',
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse ?? '',
        modelInvocable: skill.invocation.modelInvocable,
        userInvocable: skill.invocation.userInvocable,
        content: body.content,
      })
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setBusy(false)
    }
  }

  /**
   * After a write/delete, the watched directory takes a moment to invalidate
   * the catalog — poll until the change is visible (bounded), then stop.
   */
  const refreshUntil = (predicate: (skills: SkillRowView[]) => boolean, timeoutMs = 10_000): void => {
    const scope = workspace === '' ? undefined : { workspace }
    const deadline = Date.now() + timeoutMs
    const tick = (): void => {
      if (Date.now() > deadline) return
      setTimeout(() => {
        void injected.list(scope).then(
          (body) => {
            setSkills(body.skills)
            if (!predicate(body.skills)) tick()
          },
          () => tick(),
        )
      }, 1000)
    }
    tick()
  }

  const doSave = async (): Promise<void> => {
    if (editor === null) return
    setBusy(true)
    setFormError(null)
    try {
      const name = editor.name.trim()
      await injected.save({
        name,
        description: editor.description,
        whenToUse: editor.whenToUse.trim() === '' ? undefined : editor.whenToUse,
        modelInvocable: editor.modelInvocable,
        userInvocable: editor.userInvocable,
        content: editor.content,
        ...(workspace === '' ? {} : { workspace }),
      })
      setOutcome({ ok: true, text: t('saved') })
      setEditor(null)
      refreshUntil(skills => skills.some(skill => skill.name === name))
    } catch (error) {
      setFormError(String(error instanceof Error ? error.message : error))
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async (): Promise<void> => {
    if (confirmName === null) return
    const name = confirmName
    setBusy(true)
    try {
      await injected.remove(name)
      setOutcome({ ok: true, text: t('saved') })
      refreshUntil(skills => !skills.some(skill => skill.name === name))
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setBusy(false)
      setConfirmName(null)
    }
  }

  const doToggle = async (skill: SkillRowView): Promise<void> => {
    const enabled = skill.invocation.modelInvocable || skill.invocation.userInvocable
    setBusy(true)
    try {
      await injected.policy(skill.name, !enabled, workspace === '' ? undefined : { workspace })
      setOutcome({ ok: true, text: !enabled ? t('skillEnabled') : t('skillDisabledMsg') })
      refreshUntil(list => {
        const row = list.find(item => item.name === skill.name)
        return row !== undefined && row.invocation.modelInvocable === !enabled && row.invocation.userInvocable === !enabled
      })
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setBusy(false)
    }
  }

  const doOpen = async (target: OpenTarget): Promise<void> => {
    try {
      await injected.open(target)
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    }
  }

  const doAddRoot = async (): Promise<void> => {
    if (addRoot === null || addRoot.value.trim() === '') return
    setRootBusy(true)
    setFormError(null)
    try {
      await injected.addRoot(addRoot.kind === 'local'
        ? { kind: 'local', path: addRoot.value.trim() }
        : { kind: 'git', url: addRoot.value.trim() })
      setOutcome({ ok: true, text: t('rootAdded') })
      setAddRoot(null)
      void injected.roots().then(
        (body) => setRoots(body.roots),
        () => setRoots([]),
      )
      // The provider remounts asynchronously; refresh the catalog a few
      // times so the repository's skills appear without manual reload.
      for (let tick = 0; tick < 4; tick++) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        void injected.list().then(
          (body) => setSkills(body.skills),
          () => undefined,
        )
      }
    } catch (error) {
      setFormError(String(error instanceof Error ? error.message : error))
    } finally {
      setRootBusy(false)
    }
  }

  const doRemoveRoot = async (): Promise<void> => {
    if (confirmRootId === null) return
    setRootBusy(true)
    try {
      await injected.removeRoot(confirmRootId)
      setOutcome({ ok: true, text: t('rootRemoved') })
      setRoots(null)
      void injected.roots().then(
        (body) => setRoots(body.roots),
        () => setRoots([]),
      )
      setReload((value) => value + 1)
    } catch (error) {
      setOutcome({ ok: false, text: `${t('failed')}: ${String(error instanceof Error ? error.message : error)}` })
    } finally {
      setRootBusy(false)
      setConfirmRootId(null)
    }
  }

  const readOnly = editor?.mode === 'view'

  const openImport = (): void => {
    setImportOutcome(null)
    setImportError(null)
    setImportState({
      kind: 'zip',
      path: '',
      zipName: null,
      zipData: null,
      zipBytes: 0,
      dest: workspace === '' ? 'user' : 'workspace',
      destId: workspace,
      conflict: 'skip',
    })
  }

  const onZipPick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined || importState === null) return
    if (file.size > ZIP_MAX_BYTES) {
      setImportError(t('zipTooLarge'))
      return
    }
    try {
      const data = await readZipBase64(file)
      setImportState({ ...importState, zipName: file.name, zipData: data, zipBytes: file.size })
      setImportError(null)
    } catch {
      setImportError(t('failed'))
    }
  }

  const doImport = async (): Promise<void> => {
    if (importState === null) return
    if (importState.kind === 'zip' && importState.zipData === null) {
      setImportError(t('importPickZip'))
      return
    }
    if (importState.kind !== 'zip' && importState.path.trim() === '') {
      setImportError(t('importPickPath'))
      return
    }
    const dest = importState.dest === 'user'
      ? { kind: 'user' as const }
      : importState.destId === ''
        ? null
        : { kind: 'workspace' as const, id: importState.destId }
    if (dest === null) {
      setImportError(t('importPickDest'))
      return
    }
    setImportBusy(true)
    setImportError(null)
    try {
      const source = importState.kind === 'zip'
        ? { kind: 'zip' as const, data: importState.zipData as string }
        : { kind: importState.kind, path: importState.path.trim() }
      const body: ImportRequest = { source, dest, conflict: importState.conflict }
      const result = await injected.importSkills(body)
      setImportOutcome(result)
      // Refresh whichever catalog the destination belongs to.
      if (importState.dest === 'workspace' && importState.destId === workspace) setReload(value => value + 1)
      else if (importState.dest === 'user' && workspace === '') setReload(value => value + 1)
    } catch (error) {
      setImportError(String(error instanceof Error ? error.message : error))
    } finally {
      setImportBusy(false)
    }
  }

  const needle = query.trim().toLowerCase()
  const sourceKeyOf = (skill: SkillRowView): string => skill.agent ?? skill.source
  const sourceLabelOf = (skill: SkillRowView): string => skill.agentLabel ?? t(SOURCE_KEYS[skill.source] ?? 'sourceCustom')
  const filtered = skills === null ? [] : skills.filter(skill =>
    (sourceFilter === 'all' || sourceKeyOf(skill) === sourceFilter)
    && (needle === '' || skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle)))
  const sources = skills === null ? [] : [...new Map(skills.map(skill => [sourceKeyOf(skill), sourceLabelOf(skill)])).entries()]
    .map(([id, label]) => ({ id, label }))

  return (
    <div className="dpc-section">
      <style>{CSS}</style>

      <div className="dpc-head">
        <IconSkill aria-hidden="true" />
        <h3>{t('skillsTitle')}</h3>
        <span className="dpc-spacer" />
        <Button variant="ghost" size="sm" onClick={() => void doOpen({ target: 'user-skills' })}>{t('openUserSkills')}</Button>
        <Button variant="ghost" size="sm" onClick={openImport}>{t('importSkills')}</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={workspace !== ''}
          title={workspace !== '' ? t('importCreateHint') : undefined}
          onClick={openCreate}
        >
          {t('newSkill')}
        </Button>
      </div>
      <p className="dpc-intro">{t('skillsIntro')}</p>

      {outcome !== null && (
        <div className="dpc-banner" data-kind={outcome.ok ? 'ok' : 'error'} role="status">
          <StateDot state={outcome.ok ? 'done' : 'error'} size={10} />
          <div className="dpc-bannerBody"><span>{outcome.text}</span></div>
        </div>
      )}

      <div className="dpc-listHead">
        <h3>{t('skillsTab')}</h3>
        {skills !== null && <span className="dpc-count">{filtered.length}/{skills.length}</span>}
        <span className="dpc-spacer" />
        {workspaces !== null && workspaces.supported && (
          <select
            className="dpc-select"
            aria-label={t('workspaceLabel')}
            title={t('workspaceLabel')}
            value={workspace}
            onChange={(event) => { setSourceFilter('all'); setWorkspace(event.target.value) }}
          >
            <option value="">{t('workspaceAll')}</option>
            {workspaces.items.map(item => (
              <option key={item.id} value={item.id} disabled={!item.available}>
                {item.title}{item.available ? '' : ` (${t('workspaceMissing')})`}
              </option>
            ))}
          </select>
        )}
        <input
          className="dpc-search"
          type="search"
          placeholder={t('searchSkills')}
          aria-label={t('searchSkills')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="dpc-refresh" aria-label={t('refresh')} title={t('refresh')} disabled={busy} onClick={() => setReload((value) => value + 1)}>
          <IconRefresh size={14} aria-hidden="true" />
        </button>
      </div>

      {sources.length > 1 && (
        <div className="dpc-chips" role="group" aria-label={t('source')}>
          {[{ id: 'all', label: t('filterAll') }, ...sources].map(chip => (
            <button
              key={chip.id}
              type="button"
              className="dpc-chip"
              data-active={sourceFilter === chip.id ? 'true' : undefined}
              onClick={() => setSourceFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {skills === null && <p className="dpc-empty">{t('loading')}</p>}
      {skills !== null && filtered.length === 0 && <p className="dpc-empty">{skills.length === 0 ? t('emptySkills') : t('noMatch')}</p>}
      {skills !== null && filtered.length > 0 && (
        <ul className="dpc-cards">
          {filtered.map((skill) => {
            const tag = policyTag(skill)
            return (
              <li className="dpc-card" key={`${skill.source}/${skill.name}`}>
                <div className="dpc-cardTop">
                  <strong className="dpc-cardTitle" title={skill.name}>{skill.name}</strong>
                  <span className="dpc-tag" data-kind="source">{sourceLabelOf(skill)}</span>
                  {tag.key !== undefined && <span className="dpc-tag" data-kind={tag.off ? 'off' : undefined}>{t(tag.key)}</span>}
                </div>
                <p className="dpc-cardDesc" title={skill.description}>{skill.description}</p>
                <div className="dpc-cardRow">
                  {skill.policyEditable && (
                    <button
                      type="button"
                      className="dpc-switch"
                      role="switch"
                      aria-checked={skill.invocation.modelInvocable || skill.invocation.userInvocable}
                      aria-label={t('toggleSkill')}
                      title={t('toggleSkillHint')}
                      disabled={busy}
                      onClick={() => void doToggle(skill)}
                    >
                      <span className="dpc-switchKnob" />
                    </button>
                  )}
                  {skill.dir !== undefined && (
                    <button
                      type="button"
                      className="dpc-link"
                      onClick={() => void doOpen({ target: 'skill', name: skill.name, ...(workspace === '' ? {} : { workspace }) })}
                    >
                      {t('openFolder')}
                    </button>
                  )}
                  <span className="dpc-spacer" />
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void openExisting(skill)}>
                    {skill.editable ? t('edit') : t('view')}
                  </Button>
                  {skill.removable && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmName(skill.name)}>{t('delete')}</Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="dpc-listHead dpc-rootsHead">
        <h3>{t('rootsTitle')}</h3>
        {roots !== null && <span className="dpc-count">{roots.length}</span>}
        <span className="dpc-spacer" />
        {addRoot === null && (
          <Button variant="ghost" size="sm" onClick={() => setAddRoot({ kind: 'git', value: '' })}>{t('addRoot')}</Button>
        )}
      </div>
      <p className="dpc-intro">{t('rootsIntro')}</p>
      {roots === null && <p className="dpc-empty">{t('loading')}</p>}
      {roots !== null && roots.length === 0 && <p className="dpc-empty">{t('emptyRoots')}</p>}
      {roots !== null && roots.length > 0 && (
        <ul className="dpc-roots">
          {roots.map((root) => (
            <li className="dpc-root" key={root.id}>
              <span className="dpc-tag" data-kind="source">{root.kind === 'git' ? 'GitHub' : t('rootLocal')}</span>
              <strong className="dpc-rootLabel" title={root.kind === 'git' ? root.url : root.path}>{root.label}</strong>
              <span className="dpc-rootPath">{root.kind === 'git' ? root.url : root.path}</span>
              {!root.live && <span className="dpc-tag" data-kind="off">{t('rootStale')}</span>}
              <span className="dpc-spacer" />
              <button type="button" className="dpc-link" onClick={() => void doOpen({ target: 'root', id: root.id })}>{t('openFolder')}</button>
              <Button variant="ghost" size="sm" disabled={rootBusy} onClick={() => setConfirmRootId(root.id)}>{t('delete')}</Button>
            </li>
          ))}
        </ul>
      )}
      {addRoot !== null && (
        <div className="dpc-form dpc-addRoot">
          <div className="dpc-addRootRow">
            <select
              className="dpc-select"
              aria-label={t('rootKind')}
              value={addRoot.kind}
              onChange={(event) => setAddRoot({ ...addRoot, kind: event.target.value as AddRootState['kind'] })}
            >
              <option value="git">GitHub</option>
              <option value="local">{t('rootLocal')}</option>
            </select>
            <input
              className="dpc-input"
              type="text"
              placeholder={addRoot.kind === 'git' ? 'https://github.com/anthropics/skills' : t('rootLocalPlaceholder')}
              aria-label={t('rootPlaceholder')}
              value={addRoot.value}
              autoFocus
              onChange={(event) => setAddRoot({ ...addRoot, value: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') void doAddRoot() }}
            />
            <Button variant="primary" size="sm" disabled={rootBusy || addRoot.value.trim() === ''} onClick={() => void doAddRoot()}>{t('add')}</Button>
            <Button variant="ghost" size="sm" disabled={rootBusy} onClick={() => { setAddRoot(null); setFormError(null) }}>{t('cancel')}</Button>
          </div>
          <p className="dpc-intro">{addRoot.kind === 'git' ? t('rootGitHint') : t('rootLocalHint')}</p>
          {formError !== null && <p className="dpc-formError">{formError}</p>}
        </div>
      )}

      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor === null ? '' : editor.mode === 'create' ? t('newSkill') : editor.mode === 'edit' ? t('editSkill') : t('viewSkill')}
        className="dpc-modalForm"
        contentClassName="dpc-modalScroll"
      >
        {editor !== null && (
          <div className="dpc-form">
            <label className="dpc-label">
              <span>{t('skillName')}</span>
              <input
                className="dpc-input"
                value={editor.name}
                disabled={readOnly || editor.mode === 'edit'}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </label>
            <label className="dpc-label">
              <span>{t('skillDescription')}</span>
              <input
                className="dpc-input"
                value={editor.description}
                disabled={readOnly}
                onChange={(event) => setEditor({ ...editor, description: event.target.value })}
              />
            </label>
            <label className="dpc-label">
              <span>{t('skillWhenToUse')}</span>
              <input
                className="dpc-input"
                value={editor.whenToUse}
                disabled={readOnly}
                onChange={(event) => setEditor({ ...editor, whenToUse: event.target.value })}
              />
            </label>
            <div className="dpc-checks">
              <label>
                <input
                  type="checkbox"
                  checked={editor.modelInvocable}
                  disabled={readOnly}
                  onChange={(event) => setEditor({ ...editor, modelInvocable: event.target.checked })}
                />
                {t('modelInvocable')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={editor.userInvocable}
                  disabled={readOnly}
                  onChange={(event) => setEditor({ ...editor, userInvocable: event.target.checked })}
                />
                {t('userInvocable')}
              </label>
            </div>
            <div className="dpc-label">
              <div className="dpc-cardRow">
                <span>{t('skillContent')}</span>
                <span className="dpc-spacer" />
                <div className="dpc-segments" role="tablist" aria-label={t('skillContent')}>
                  <button type="button" role="tab" aria-selected={preview} className="dpc-segment" data-active={preview ? 'true' : undefined} onClick={() => setPreview(true)}>
                    {t('skillPreview')}
                  </button>
                  <button type="button" role="tab" aria-selected={!preview} className="dpc-segment" data-active={!preview ? 'true' : undefined} onClick={() => setPreview(false)}>
                    {readOnly ? t('skillPlainText') : t('edit')}
                  </button>
                </div>
              </div>
              {preview
                ? <div className="dpc-mdPreview"><MarkdownPreview text={editor.content} /></div>
                : (
                  <textarea
                    className="dpc-textarea"
                    value={editor.content}
                    readOnly={readOnly}
                    onChange={(event) => setEditor({ ...editor, content: event.target.value })}
                  />
                )}
            </div>
            {formError !== null && <p className="dpc-formError">{formError}</p>}
            <div className="dpc-cardRow">
              <span className="dpc-spacer" />
              <Button variant="ghost" onClick={() => setEditor(null)}>{readOnly ? t('close') : t('cancel')}</Button>
              {!readOnly && <Button variant="primary" disabled={busy} onClick={() => void doSave()}>{t('save')}</Button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmName !== null}
        onClose={() => setConfirmName(null)}
        title={t('confirmDelete')}
        description={confirmName ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmName(null)}>{t('cancel')}</Button>
            <Button variant="primary" disabled={busy} onClick={() => void doDelete()}>{t('delete')}</Button>
          </>
        }
      >
        <p>{t('deleteWarn')}</p>
      </Modal>

      <Modal
        open={confirmRootId !== null}
        onClose={() => setConfirmRootId(null)}
        title={t('confirmRemoveRoot')}
        description={roots?.find(root => root.id === confirmRootId)?.label ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRootId(null)}>{t('cancel')}</Button>
            <Button variant="primary" disabled={rootBusy} onClick={() => void doRemoveRoot()}>{t('delete')}</Button>
          </>
        }
      >
        <p>{t('removeRootWarn')}</p>
      </Modal>

      <Modal
        open={importState !== null}
        onClose={() => { setImportState(null); setImportOutcome(null); setImportError(null) }}
        title={t('importSkills')}
        className="dpc-modalForm"
        contentClassName="dpc-modalScroll"
      >
        {importState !== null && (
          <div className="dpc-form">
            <p className="dpc-intro">{t('skillImportIntro')}</p>
            <label className="dpc-label">
              <span>{t('importSourceKind')}</span>
              <select
                className="dpc-select"
                value={importState.kind}
                onChange={(event) => setImportState({ ...importState, kind: event.target.value as ImportState['kind'] })}
              >
                <option value="zip">{t('importKindZip')}</option>
                <option value="folder">{t('importKindFolder')}</option>
                <option value="file">{t('importKindFile')}</option>
              </select>
            </label>
            {importState.kind === 'zip' ? (
              <div className="dpc-label">
                <div className="dpc-cardRow">
                  <label className="dpc-link" htmlFor="dpc-import-zip" style={{ cursor: 'pointer' }}>{t('importChooseZip')}</label>
                  <span>{importState.zipName ?? t('importPickZip')}</span>
                </div>
                <input
                  id="dpc-import-zip"
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  style={{ display: 'none' }}
                  onChange={(event) => void onZipPick(event)}
                />
              </div>
            ) : (
              <label className="dpc-label">
                <span>{importState.kind === 'folder' ? t('importKindFolder') : t('importKindFile')}</span>
                <input
                  className="dpc-input"
                  type="text"
                  placeholder={importState.kind === 'folder' ? t('importFolderPlaceholder') : t('importFilePlaceholder')}
                  value={importState.path}
                  onChange={(event) => setImportState({ ...importState, path: event.target.value })}
                />
              </label>
            )}
            <label className="dpc-label">
              <span>{t('importDest')}</span>
              <select
                className="dpc-select"
                value={importState.dest === 'user' ? 'user' : importState.destId}
                onChange={(event) => {
                  const value = event.target.value
                  setImportState({ ...importState, dest: value === 'user' ? 'user' : 'workspace', destId: value === 'user' ? '' : value })
                }}
              >
                <option value="user">{t('importDestUser')}</option>
                {(workspaces?.items ?? []).filter(item => item.available).map(item => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
            <label className="dpc-label">
              <span>{t('importConflict')}</span>
              <select
                className="dpc-select"
                value={importState.conflict}
                onChange={(event) => setImportState({ ...importState, conflict: event.target.value as ImportState['conflict'] })}
              >
                <option value="skip">{t('conflictSkip')}</option>
                <option value="overwrite">{t('conflictOverwrite')}</option>
              </select>
            </label>
            {importError !== null && <p className="dpc-formError">{importError}</p>}
            {importOutcome !== null && (
              <div className="dpc-importResult">
                <p className="dpc-intro">
                  <StateDot state={importOutcome.ok ? 'done' : 'error'} size={10} />
                  {' '}{t('importResultOk')}: {importOutcome.imported.length}
                  {' · '}{t('importResultSkip')}: {importOutcome.skipped.length}
                  {' · '}{t('importResultFail')}: {importOutcome.failed.length}
                </p>
                {importOutcome.skipped.length > 0 && <p className="dpc-intro">{t('importResultSkip')}: {importOutcome.skipped.join(', ')}</p>}
                {importOutcome.failed.map(item => (
                  <p className="dpc-formError" key={item.name}>{item.name}: {item.error}</p>
                ))}
              </div>
            )}
            <div className="dpc-cardRow">
              <span className="dpc-spacer" />
              <Button variant="ghost" onClick={() => { setImportState(null); setImportOutcome(null); setImportError(null) }}>{t('close')}</Button>
              <Button variant="primary" disabled={importBusy} onClick={() => void doImport()}>
                {importBusy ? t('importBusy') : t('importRun')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
