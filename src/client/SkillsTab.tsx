/** Settings → Plugins “技能/Skills” tab: view the discovered catalog, edit the
 * user-owned root. Pure presentation-layer — data arrives through props. */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, IconRefreshOutline14, IconSkillOutline16, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { CSS } from './css.ts'
import type { Translate } from './index.ts'

/** One skill as the host reports it (plus the editable flag the route adds). */
export interface SkillRowView {
  name: string
  description: string
  whenToUse?: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  source: string
  provider: string
  editable: boolean
}

export interface SkillsInjected {
  list(): Promise<{ skills: SkillRowView[] }>
  get(name: string): Promise<{ content: string }>
  save(input: { name: string; description: string; whenToUse?: string; modelInvocable: boolean; userInvocable: boolean; content: string }): Promise<{ ok: boolean }>
  remove(name: string): Promise<{ ok: boolean }>
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

export function SkillsTab(props: { t: Translate; injected: SkillsInjected }): ReactElement {
  const { t, injected } = props
  const [skills, setSkills] = useState<SkillRowView[] | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirmName, setConfirmName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    void injected.list().then(
      (body) => { if (current) setSkills(body.skills) },
      (error: Error) => { if (current) { setSkills([]); setOutcome({ ok: false, text: `${t('failed')}: ${String(error.message ?? error)}` }) } },
    )
    return () => { current = false }
  }, [injected, reload, t])

  const openCreate = (): void => {
    setFormError(null)
    setEditor({ mode: 'create', name: '', description: '', whenToUse: '', modelInvocable: true, userInvocable: true, content: '' })
  }

  const openExisting = async (skill: SkillRowView): Promise<void> => {
    setBusy(true)
    setFormError(null)
    try {
      const body = await injected.get(skill.name)
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
    const deadline = Date.now() + timeoutMs
    const tick = (): void => {
      if (Date.now() > deadline) return
      setTimeout(() => {
        void injected.list().then(
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

  const readOnly = editor?.mode === 'view'

  return (
    <div className="dpc-section">
      <style>{CSS}</style>

      <div className="dpc-head">
        <IconSkillOutline16 aria-hidden="true" />
        <h3>{t('skillsTitle')}</h3>
        <span className="dpc-spacer" />
        <Button variant="primary" size="sm" onClick={openCreate}>{t('newSkill')}</Button>
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
        {skills !== null && <span className="dpc-count">{skills.length}</span>}
        <span className="dpc-spacer" />
        <button type="button" className="dpc-refresh" aria-label={t('view')} title={t('view')} disabled={busy} onClick={() => setReload((value) => value + 1)}>
          <IconRefreshOutline14 size={14} aria-hidden="true" />
        </button>
      </div>

      {skills === null && <p className="dpc-empty">{t('loading')}</p>}
      {skills !== null && skills.length === 0 && <p className="dpc-empty">{t('emptySkills')}</p>}
      {skills !== null && skills.length > 0 && (
        <ul className="dpc-cards">
          {skills.map((skill) => (
            <li className="dpc-card" key={`${skill.source}/${skill.name}`}>
              <div className="dpc-cardTop">
                <strong className="dpc-cardTitle" title={skill.name}>{skill.name}</strong>
                <span className="dpc-tag" data-kind="source">{t(SOURCE_KEYS[skill.source] ?? 'sourceCustom')}</span>
              </div>
              <p className="dpc-cardDesc" title={skill.description}>{skill.description}</p>
              <div className="dpc-cardRow">
                {!skill.invocation.modelInvocable && <span className="dpc-tag">⚙</span>}
                {!skill.invocation.userInvocable && <span className="dpc-tag">/</span>}
                <span className="dpc-spacer" />
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void openExisting(skill)}>
                  {skill.editable ? t('edit') : t('view')}
                </Button>
                {skill.editable && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmName(skill.name)}>{t('delete')}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor === null ? '' : editor.mode === 'create' ? t('newSkill') : editor.mode === 'edit' ? t('editSkill') : t('viewSkill')}
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
            <label className="dpc-label">
              <span>{t('skillContent')}</span>
              <textarea
                className="dpc-textarea"
                value={editor.content}
                readOnly={readOnly}
                onChange={(event) => setEditor({ ...editor, content: event.target.value })}
              />
            </label>
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
    </div>
  )
}
