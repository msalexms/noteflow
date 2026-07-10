// Group overview + note overview + shared note/section cards.
export const overview = {
  // ── Group overview ──────────────────────────────────────────────────────────
  doubleClickRename: 'Double-click to rename',
  archivedBadge: 'Archived',
  cardWidth: 'Card width',
  newNoteInGroup: 'New note in this group',
  groupEmpty: 'This group is empty',
  noFolder: 'No folder',
  archived: 'Archived',
  emptyDropHint: 'Empty — drop a note here',
  empty: 'Empty',

  // Group-overview delete confirmations.
  deleteNotes: 'Delete notes',
  deleteNotesMessage: '{count} notes will be permanently deleted.',

  // Selection action bar (group overview).
  selectedCount: '{count} selected',
  favorite: 'Favorite',
  unfavorite: 'Unfavorite',
  moveToFolderTooltip: 'Move to folder in this group',
  noGroup: 'No group',
  deleteSelected: 'Delete selected',
  clearSelection: 'Clear selection (Esc)',

  // ── Note overview ───────────────────────────────────────────────────────────
  renameNote: 'Rename note',
  addSection: 'Add section',
  addSectionTooltip: 'Add section and edit it',
  noteEncrypted: 'This note is encrypted',
  unlockToPreview: 'Unlock it in the editor to preview its sections',
  noSections: 'This note has no sections',
  sectionsPlural: {
    one: '{count} section',
    other: '{count} sections',
  },

  // AI visibility tooltips for a multi-section selection.
  aiShowTooltip: 'The AI will index and use these sections again',
  aiHideTooltip: 'The AI will never index, read or reference these sections',
  cantDeleteAllSections: "Can't delete every section — delete the note instead",

  // Note-overview delete-sections confirmation.
  deleteSections: 'Delete sections',
  deleteSectionsMessage: {
    one: '{count} section will be permanently deleted.',
    other: '{count} sections will be permanently deleted.',
  },

  // Section card.
  openSection: 'Open "{name}"',
  selectSection: 'Select section',
  aiBadge: 'AI',

  // Section preview card (shared with the hover popover).
  rawSection: 'Raw markdown section',
  richSection: 'Rich text section',
  emptySection: 'Empty section',
}
