# NoteFlow

App de escritorio de notas rápidas (Electron 35 + React 19 + TypeScript) para Windows/Linux/macOS.
Repo: https://github.com/yagoid/noteflow · rama `main`.

La **documentación del proyecto** vive en `.claude/context/*.md` (abajo el mapa). Este CLAUDE.md es el
**índice siempre cargado**: contiene el mapa + reglas + stack + comandos. El **detalle** está en
`.claude/context/` y se lee **a demanda** — no copiar ese detalle aquí (mantener este fichero como
índice, no como documentación).

## Reglas siempre-on

- **Idioma de la UI = inglés** (labels, botones, placeholders, tooltips, errores de UI). El contenido
  del usuario y las respuestas del LLM van en el idioma del usuario; la documentación va en español.
- **Tras tocar `electron/`:** ejecutar `npm run build` y **commitear `dist-electron/`** (está versionado).
- **Datos:** notas y ajustes sincronizables viven en el dir de notas; los ajustes locales en
  `settings.json` del `userData` (ver `.claude/context/architecture.md`).
- Al cerrar una feature importante, **actualizar la documentación** (el `.claude/context/*.md` que
  toque y la skill `noteflow-features` si es UX) y, si es visible, `docs/` y `README.md`.
- Los **mensajes de commit van en inglés**.

## Mapa del proyecto (abre el fichero del tema que toques)

| Tema | Fichero | Cuándo abrirlo |
|---|---|---|
| Estructura de dirs · Arquitectura IPC (handlers/eventos) · modelo de almacenamiento (`settings.json`, dir de notas) | `.claude/context/architecture.md` | Tocar/añadir IPC, ubicar un archivo o dato |
| Formato v2 (carpeta por nota) · migración v1→v2 · cifrado | `.claude/context/note-format.md` | Tocar el formato de nota (3 espejos), migración o cifrado |
| GitHub Sync (push/pull, cola de mutaciones, invariantes) | `.claude/context/sync.md` | Tocar la sincronización con GitHub |
| "El Cerebro": índice semántico · vista cerebro · LLM/chat agéntico · segundo cerebro · secciones ocultas a la IA | `.claude/context/ai.md` | Tocar embeddings, grafo, chat, tools del agente o perfil |
| Patrones y decisiones (perf sidebar/búsqueda, imports, overviews, hover, relaciones, sticky, alarmas, auto-update, macOS, CLI, temas) | `.claude/context/patterns.md` | Entender una decisión de diseño o tocar uno de esos subsistemas |
| Release · electron-builder · CI/CD · artefactos · landing · tareas frecuentes | `.claude/context/release.md` | Hacer un release, tocar build/CI o tareas de mantenimiento |
| Funcionalidades · UI · UX · atajos (producto/usuario) | skill `noteflow-features` | Discutir/diseñar features o entender la app desde el usuario |

> Skills hermanas: `noteflow-features` (producto/UX), `noteflow-cli` (CLI companion), `noteflow-mobile`
> (app móvil React Native). Detalle de repo/licencia en `.claude/context/architecture.md`.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework desktop | Electron 35 |
| UI | React 19 + TypeScript |
| Build | Vite 7 + tsc + electron-builder 26 |
| Editor de texto | TipTap 2 (Lowlight para highlight de código, tablas) |
| Estado | Zustand 5 |
| Estilos | Tailwind CSS 3 (sistema de temas por CSS vars) |
| Parsing | js-yaml (frontmatter), nanoid (ids), date-fns (fechas) |
| Iconos | lucide-react |
| Almacenamiento | Archivos `.md` en el dir de notas (ver `.claude/context/architecture.md`) |
| Formato de notas | YAML frontmatter + cuerpo Markdown |

## Comandos de desarrollo

```bash
npm run dev            # Vite + Electron en paralelo (usa .electron-dev como user-data-dir)
npm run build          # tsc -b && vite build && tsc -p tsconfig.electron.json
npm run build:electron # solo compila electron/ → dist-electron/
npm run dist           # build + electron-builder (genera instaladores en release/)
npm run lint           # eslint
npm test               # vitest run — batería de tests de lógica pura (tests/)
npm run test:watch     # vitest en modo watch
```

## Flujo para editar código

Para cualquier tarea que **edite código** del proyecto, el hilo principal delega en dos subagentes:

1. **`implementer`** — hace el cambio completo y se autoverifica (`npm run lint` + `npm run build` +
   `npm test` + el smoke script relevante si aplica).
2. **`reviewer`** — revisa el `git diff` contra las convenciones de NoteFlow y emite veredicto.
3. Si el reviewer responde `CHANGES_REQUESTED`, aplicar/relanzar hasta que quede limpio.

Las **preguntas, exploración o lectura pura** y las **tareas operativas/git** (commit, push, releases,
correr scripts) se hacen directas, **sin** lanzar agentes. No se documenta el trabajo en ficheros:
cada agente resume en su respuesta.
