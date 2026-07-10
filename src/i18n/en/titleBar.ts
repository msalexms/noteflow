// Top window bar (TitleBar) + the crash fallback bar (ErrorBoundary): window
// controls, brain toggle, update button, and the GitHub sync status tooltip.
export const titleBar = {
  // Window controls (shared with the error fallback).
  settings: 'Settings',
  minimize: 'Minimize',
  maximize: 'Maximize',
  close: 'Close (hides to tray)',
  closeShort: 'Close',

  // Brain toggle.
  openBrain: 'Open brain view',
  closeBrain: 'Close brain view',

  // Update button.
  installing: 'Installing… NoteFlow will restart',
  downloading: 'Downloading... {progress}',
  updateAvailable: 'Update available: v{version}',

  // Sync status tooltip.
  syncing: 'Syncing...',
  uploading: 'Uploading changes...',
  syncBlocked: 'Sync blocked — changes won’t upload until you reconnect.',
  clickToRetry: 'Click to retry',
  syncError: 'Sync error: {error}',
  syncIdle: '{owner}/{repo} · Last sync: {time}\nClick to sync',
  never: 'Never',

  // Crash fallback (ErrorBoundary).
  errorTitle: 'Something went wrong',
  errorBody: 'An unexpected error broke this view. Your notes are safe on disk. Try reloading the window.',
  reload: 'Reload',
}
