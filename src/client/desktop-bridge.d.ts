/** The desktop shell's preload bridge marker, present only inside DSH
 * Desktop (the official surface exposes browser/deviceInfo/keyboard/
 * shortcuts/updates — none of them a restart; the shell's restart lives in
 * the tray menu and is user-triggered). Presence alone is the "am I on the
 * desktop" signal this plugin uses. */

declare global {
  interface Window {
    dshDesktop?: {
      protocolVersion?: number
    }
  }
}

export {}
