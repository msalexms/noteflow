export const exportImport = {
  export: 'Exportar',
  import: 'Importar',

  selectAll: 'Seleccionar todo ({selected} de {total})',
  noNotes: 'Sin notas',
  formatLabel: 'Formato:',
  exportToFolder: 'Exportar a carpeta...',
  exportToFile: 'Exportar a archivo...',
  exporting: 'Esperando al diálogo de guardado...',
  exportComplete: 'Exportación completada',
  exportFailed: 'Error al exportar',
  done: 'Hecho',
  back: 'Atrás',
  unknownError: 'Error desconocido',

  sources: {
    noteflow: {
      label: 'Archivo NoteFlow',
      cta: 'Seleccionar archivo',
      tutorial: 'Elige una exportación .noteflow / .json, o cualquier archivo .md / .txt suelto.',
    },
    mdFolder: {
      label: 'Carpeta Markdown',
      cta: 'Elegir carpeta',
      tutorial:
        'Elige una carpeta con archivos .md / .txt (p. ej. un vault de Obsidian). Las subcarpetas se convierten en grupos y carpetas; se conservan el frontmatter YAML y las #etiquetas.',
    },
    notion: {
      label: 'Notion',
      cta: 'Seleccionar .zip',
      steps: [
        'Abre en Notion la página que quieres exportar.',
        'Haz clic en ••• (arriba a la derecha) → Export.',
        'Establece Export format en HTML.',
        'Activa Include subpages y Create folders for subpages.',
        'Haz clic en Export y luego importa aquí el .zip descargado.',
      ],
    },
    keep: {
      label: 'Google Keep',
      cta: 'Seleccionar .zip',
      steps: [
        'Ve a takeout.google.com.',
        'Haz clic en Deselect all y luego selecciona solo Keep.',
        'Crea la exportación y descarga el .zip.',
        'Importa aquí el .zip descargado.',
      ],
    },
  },

  picking: 'Abriendo el selector de archivos...',
  importing: 'Importando notas...',
  importFailed: 'Error al importar',
  close: 'Cerrar',
  invalidFile: 'Archivo no válido',
  couldNotRead: 'No se pudo leer la exportación',
  noNotesFound: 'No se encontraron notas en esta exportación',
  noNotesWithContent: 'No se encontraron notas con contenido en esta exportación',
  notesImported: {
    one: '{count} nota importada',
    other: '{count} notas importadas',
  },

  noteCount: {
    one: '{count} nota',
    other: '{count} notas',
  },
  exportedOn: 'exportado el {date}',
  conflictCount: {
    one: '{count} conflicto',
    other: '{count} conflictos',
  },
  idConflict: 'El ID ya existe',
  dirConflict: 'La carpeta ya existe',
  strategySkip: 'Omitir',
  strategyOverwrite: 'Sobrescribir',
  strategyKeepBoth: 'Conservar ambas',
  willBeImported: 'Se importarán {count} de {total}',
  importNotes: 'Importar notas',
}
