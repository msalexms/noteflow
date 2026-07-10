// Export / Import modal. Format names (Markdown, JSON, ZIP, .noteflow) and
// product names (Notion, Google Keep) stay literal; everything else translates.
export const exportImport = {
  export: 'Export',
  import: 'Import',

  // Export flow.
  selectAll: 'Select all ({selected} of {total})',
  noNotes: 'No notes',
  formatLabel: 'Format:',
  exportToFolder: 'Export to folder...',
  exportToFile: 'Export to file...',
  exporting: 'Waiting for save dialog...',
  exportComplete: 'Export complete',
  exportFailed: 'Export failed',
  done: 'Done',
  back: 'Back',
  unknownError: 'Unknown error',

  // Import — source picker.
  sources: {
    noteflow: {
      label: 'NoteFlow file',
      cta: 'Select file',
      tutorial: 'Pick a .noteflow / .json export, or any single .md / .txt file.',
    },
    mdFolder: {
      label: 'Markdown folder',
      cta: 'Choose folder',
      tutorial:
        'Choose a folder of .md / .txt files (e.g. an Obsidian vault). Subfolders become groups and folders; YAML frontmatter and #tags are kept.',
    },
    notion: {
      label: 'Notion',
      cta: 'Select .zip',
      steps: [
        'Open the page you want to export in Notion.',
        'Click ••• (top-right) → Export.',
        'Set Export format to HTML.',
        'Turn on Include subpages and Create folders for subpages.',
        'Click Export, then import the downloaded .zip here.',
      ],
    },
    keep: {
      label: 'Google Keep',
      cta: 'Select .zip',
      steps: [
        'Go to takeout.google.com.',
        'Click Deselect all, then pick Keep only.',
        'Create the export and download the .zip.',
        'Import the downloaded .zip here.',
      ],
    },
  },

  // Import — status / results.
  picking: 'Opening file picker...',
  importing: 'Importing notes...',
  importFailed: 'Import failed',
  close: 'Close',
  invalidFile: 'Invalid file',
  couldNotRead: 'Could not read export',
  noNotesFound: 'No notes found in this export',
  noNotesWithContent: 'No notes with content found in this export',
  notesImported: {
    one: '{count} note imported',
    other: '{count} notes imported',
  },

  // Import — preview.
  noteCount: {
    one: '{count} note',
    other: '{count} notes',
  },
  exportedOn: 'exported {date}',
  conflictCount: {
    one: '{count} conflict',
    other: '{count} conflicts',
  },
  idConflict: 'ID already exists',
  dirConflict: 'Folder already exists',
  strategySkip: 'Skip',
  strategyOverwrite: 'Overwrite',
  strategyKeepBoth: 'Keep both',
  willBeImported: '{count} of {total} will be imported',
  importNotes: 'Import notes',
}
