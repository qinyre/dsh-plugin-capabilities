/** Minimal ambient types for the primitives the browser half uses, matching
 * @deepseek-ai/dsh-client-ui-primitives (provided by the host's frozen
 * platform module table; never bundled). Only members used here are
 * declared — keep in sync with the host package. */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, SVGProps } from 'react'

  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'
  export function Button(props: {
    variant?: ButtonVariant
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string | undefined
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>): ReactElement

  export function Input(props: {
    icon?: ReactNode
    className?: string
  } & InputHTMLAttributes<HTMLInputElement>): ReactElement

  export function Modal(props: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel?: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
    headless?: boolean
  }): ReactElement | null

  export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error'
  export function StateDot(props: {
    state: StateDotState
    size?: number | undefined
    className?: string | undefined
  }): ReactElement

  /** Untrusted-Markdown renderer over the app's own mdast pipeline. */
  export function MarkdownText(props: {
    text: string
    streaming?: boolean | undefined
  }): ReactElement

  export function IconRefreshOutline14(props: {
    className?: string | undefined
    size?: number | undefined
  } & SVGProps<SVGSVGElement>): ReactElement

  export function IconSkillOutline16(props: {
    className?: string | undefined
    size?: number | undefined
  } & SVGProps<SVGSVGElement>): ReactElement

  export function IconApiOutline14(props: {
    className?: string | undefined
    size?: number | undefined
  } & SVGProps<SVGSVGElement>): ReactElement
}
