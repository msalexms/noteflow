# NoteFlow

App de escritorio de notas (Electron + React + TS). Para el detalle del proyecto usa la skill:
**`noteflow-context`** (arquitectura, IPC, formato, sync, IA, release — índice con `reference/*.md`).

## Reglas siempre-on

- **Idioma de la UI = inglés** (labels, botones, placeholders, tooltips, errores de UI). El contenido
  del usuario y las respuestas del LLM van en el idioma del usuario; las skills/docs van en español.
- **Tras tocar `electron/`:** ejecutar `npm run build` y **commitear `dist-electron/`** (está versionado).
- **Datos:** notas y ajustes sincronizables viven en el dir de notas; los ajustes locales en
  `settings.json` del `userData` (ver `noteflow-context` → `reference/architecture.md`).
- Al cerrar una feature importante, **actualizar las skills** (el `reference/*.md` que toque) y, si
  es visible, `docs/` y `README.md`.
- Los **mensajes de commit van en inglés**.

## Flujo para editar código

Para cualquier tarea que **edite código** del proyecto, el hilo principal delega en dos subagentes:

1. **`implementer`** — hace el cambio completo y se autoverifica (`npm run lint` + `npm run build` +
   el smoke script relevante si aplica).
2. **`reviewer`** — revisa el `git diff` contra las convenciones de NoteFlow y emite veredicto.
3. Si el reviewer responde `CHANGES_REQUESTED`, aplicar/relanzar hasta que quede limpio.

Las **preguntas, exploración o lectura pura** se responden normal, **sin** lanzar agentes. No se
documenta el trabajo en ficheros: cada agente resume en su respuesta.
