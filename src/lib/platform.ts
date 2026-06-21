// Renderer-side platform helpers. The main process exposes process.platform via
// preload (window.noteflow.platform) so the UI can show the right modifier key
// labels (⌘ on macOS, Ctrl elsewhere). Falls back to navigator when running
// outside Electron (e.g. tests / Vite preview).

function detectPlatform(): string {
  if (typeof window !== 'undefined' && window.noteflow?.platform) {
    return window.noteflow.platform
  }
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) {
    return 'darwin'
  }
  return 'win32'
}

export const isMac = detectPlatform() === 'darwin'

// Modifier-key label that matches what the user actually presses. App.tsx's
// global handler accepts both ctrlKey and metaKey, so on macOS Cmd works.
export const modKey = isMac ? '⌘' : 'Ctrl'

// Symbols for the other modifiers, used when rendering shortcut hints.
export const altKey = isMac ? '⌥' : 'Alt'
export const shiftKey = isMac ? '⇧' : 'Shift'

// The literal Control key. On macOS it's a distinct key (⌃) from Command (⌘):
// a few shortcuts (section cycling) bind to Control specifically because Cmd+Tab
// is the system app switcher and never reaches the app.
export const controlKey = isMac ? '⌃' : 'Ctrl'

// Maps a raw key token (as stored in shortcut tables) to its display form on the
// current platform. Leaves regular keys ('N', 'Tab', '+'…) untouched.
//   'Ctrl'/'Cmd'/'Mod' → the accelerator key (⌘ on macOS) — these bindings accept
//                         both ctrlKey and metaKey in the handlers.
//   'Control'           → the literal Control key (⌃ on macOS).
export function keyLabel(token: string): string {
  switch (token) {
    case 'Ctrl':
    case 'Cmd':
    case 'Mod':
      return modKey
    case 'Control':
      return controlKey
    case 'Alt':
    case 'Option':
      return altKey
    case 'Shift':
      return shiftKey
    default:
      return token
  }
}
