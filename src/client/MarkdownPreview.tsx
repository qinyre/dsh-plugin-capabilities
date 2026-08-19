/**
 * Local Markdown preview for the skill editor: marked + DOMPurify, bundled
 * into the plugin. The host exports its own Markdown renderer (the chat
 * pipeline), but whether a given host build serves it through the frozen
 * platform table is not guaranteed — bundling our own keeps the preview
 * working on every host version. Skill bodies come from third-party
 * repositories, so the rendered HTML is sanitized before it mounts.
 */

import { useMemo } from 'react'
import type { ReactElement } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

const parse = (text: string): string =>
  DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: false }) as string)

export function MarkdownPreview(props: { text: string }): ReactElement {
  const html = useMemo(() => parse(props.text), [props.text])
  return <div className="dpc-mdBody" dangerouslySetInnerHTML={{ __html: html }} />
}
