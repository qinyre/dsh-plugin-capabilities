/** The desktop shell's preload bridge (present only inside DSH Desktop). */
declare global {
  interface Window {
    dshDesktop?: {
      retry(): void
      openLogs(): void
      restartSidecar(): void
    }
  }
}

export {}
