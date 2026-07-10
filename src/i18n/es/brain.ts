import type { Messages } from '../en'

export const brain: Messages['brain'] = {
  title: 'Cerebro',
  nodesCount: { one: '{count} nodo', other: '{count} nodos' },
  dragResize: 'Arrastra para redimensionar',
  showAiPanel: 'Mostrar el panel de IA',

  localAi: 'IA local',
  localAiEnabled: 'IA local activada',
  localAiDisabled: 'IA local desactivada',
  indexingInProgress: 'Indexación en curso…',
  reindexStale: 'Las notas cambiaron — reindexa para actualizar los resultados',
  reindexAll: 'Reindexar todas las notas',
  close: 'Cerrar la vista del cerebro',
  emptyNotes: 'Aún no hay notas que mostrar.',

  downloadingModelPct: 'Descargando modelo {pct}%',
  downloadingModel: 'Descargando modelo…',
  indexingPct: 'Indexando {pct}%',
  indexing: 'Indexando…',
  starting: 'Iniciando…',

  disableTitle: 'Desactivar la IA local',
  enableTitle: 'Activar la IA local',
  enabling: 'Activando…',
  contentConnections: 'conexiones por contenido',
  disableBody: 'La IA local está activada. Al desactivarla se ocultan las conexiones por contenido en el Cerebro y se deja de dar contexto de tus notas al chat. Tu índice actual se conserva, así que puedes reactivarla más tarde sin volver a descargar ni reindexar.',
  enableBody: 'El Cerebro ya muestra la estructura de tus notas y grupos. Activa la IA local (100% sin conexión) para revelar además las conexiones por contenido y dar contexto de tus notas al chat. La primera vez se descarga un modelo pequeño y se indexan tus notas — la app puede usar más CPU un rato.',
  activationFailed: 'La activación falló',

  lowEndTitle: 'Dispositivo de pocos recursos detectado',
  view2d: 'vista 2D',
  view3d: 'vista 3D',
  lowEndBody: 'Este equipo parece tener pocos recursos, así que el Cerebro muestra la vista 2D más ligera, que usa menos CPU y GPU. Puedes cambiar a la vista 3D para un cerebro más inmersivo — se ve mejor pero exige más a tu hardware.',
  keep2d: 'Seguir en 2D',
  use3d: 'Usar 3D',
}
