---
name: noteflow-context
description: Contexto completo del proyecto NoteFlow — app de escritorio de notas rápidas para Windows/Linux/macOS. Úsala cuando el usuario quiera trabajar con este proyecto: añadir features, corregir bugs, hacer releases, entender la arquitectura, modificar el workflow de CI/CD o interactuar con el repositorio de GitHub.
---

# NoteFlow — Guía del proyecto

> **Mantenimiento de las skills (LEER PRIMERO):** Cuando se implemente una funcionalidad
> importante o se cambie la arquitectura, **actualizar las dos skills** al cerrar el trabajo:
> esta (`noteflow-context`, arquitectura/IPC/release) y `noteflow-features` (UX/diseño/atajos).
> Si la feature toca el CLI, actualizar también `cli/noteflow-cli/SKILL.md`. Mantenerlas al
> día es lo que hace que la próxima sesión arranque con contexto correcto.
>
> **Idioma de la UI (REGLA para features nuevas):** todo el **texto visible de la aplicación va en
> inglés** (labels, botones, placeholders, tooltips, mensajes de error de UI). El contenido del
> usuario y las respuestas del LLM siguen el idioma del usuario; las skills/docs siguen en español.

## Repositorio y proyectos relacionados

- **GitHub:** https://github.com/yagoid/noteflow
- **Rama principal:** `main`
- **Directorio local:** raíz del repo clonado (la ruta absoluta varía por máquina).
- **Versión actual:** ver `package.json` (`version`). Convención `vX.Y.Z`.
- **Licencia:** `FSL-1.1-Apache-2.0` (Functional Source License — source-available; convierte a
  Apache 2.0 el 2028-06-06). Antes era MIT. El `package.json` lleva el campo `license` y el
  `PKGBUILD` usa `LicenseRef-FSL-1.1-Apache-2.0`.
- **Skills hermanas:**
  - `noteflow-features` → funcionalidades, UI, UX, atajos (perspectiva de producto/usuario).
  - `noteflow-cli` → referencia completa del CLI companion.
  - `noteflow-mobile` → app móvil hermana (React Native + Expo), comparte el formato de nota.

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
| Almacenamiento | Archivos `.md` en el dir de notas (ver más abajo) |
| Formato de notas | YAML frontmatter + cuerpo Markdown |

## Estructura de directorios

```
noteflow/
├── electron/
│   ├── main.ts          # Proceso principal: IPC, tray, ventanas, settings, alarmas,
│   │                    #   auto-update, temp-notes, single-instance, fs.watch, sticky anim
│   ├── preload.ts       # Bridge IPC expuesto al renderer como window.noteflow
│   ├── noteFormat.ts    # Formato v2 en el main (espejo de src/lib/noteUtils.ts):
│   │                    #   parseNoteDir, serializeNoteFolder, listNoteDirs, parser legacy v1
│   ├── migration.ts     # Migración única v1→v2 (flat .md → carpetas), idempotente
│   ├── githubSync.ts    # Sync con GitHub (Device Flow OAuth, push/pull por carpeta,
│   │                    #   Trees API, migración remota, cifrado token)
│   └── ai/              # Índice semántico local + LLM ("El Cerebro" Fases 1-3)
│       ├── protocol.ts  #   Tipos de mensajes worker↔main + constantes (modelo, schema)
│       ├── aiIndex.ts   #   Lifecycle del worker en el main (fork/respawn, debounce, API)
│       ├── aiWorker.ts  #   utilityProcess: embeddings (Transformers.js) + SQLite index
│       └── llm/         #   Proveedor LLM (Fase 3, corre en main; key NUNCA va al renderer)
│           ├── presets.ts          #     Catálogo de proveedores (anthropic | openai-compatible)
│           ├── types.ts            #     LlmProvider, ChatMessage, config (por preset)
│           ├── secret.ts           #     Cifrado de API key (safeStorage, espejo de githubSync)
│           ├── anthropic.ts        #     Provider SDK @anthropic-ai/sdk (messages.stream)
│           ├── openaiCompatible.ts #     Provider fetch SSE (OpenAI/DeepSeek/MiniMax/Ollama/…)
│           └── index.ts            #     getProvider/resolveConfig/toPublic + DEFAULT_LLM_CONFIG
├── cli/
│   ├── noteflow.js      # CLI companion (Node.js standalone, sin deps de Electron)
│   ├── noteflow.cmd     # Wrapper Windows (entra en PATH vía NSIS)
│   ├── install-cli.sh   # Instalador headless Linux/RPi (curl | sudo bash)
│   └── noteflow-cli/SKILL.md  # Skill publicada del CLI (npx skills add ...)
├── build/
│   ├── nsis-include.nsh        # NSIS: añade/quita resources\cli del PATH de usuario (Win)
│   ├── linux-postinstall.sh    # deb: setuid chrome-sandbox + symlink CLI en /usr/local/bin
│   └── linux-postremove.sh     # deb: limpia symlink CLI y statoverride del sandbox
├── src/
│   ├── App.tsx           # Raíz React, carga notas, atajos globales, routing sticky
│   ├── main.tsx          # Entry point renderer, init de tema
│   ├── stores/
│   │   ├── notesStore.ts             # Estado de notas (Zustand) — loadNotes (batch), CRUD
│   │   ├── groupsStore.ts            # Grupos — persistidos en groups.json (IPC)
│   │   ├── themeStore.ts             # Tema — lee/escribe settings.json vía IPC (sendSync)
│   │   ├── editorSettingsStore.ts    # Tamaño de fuente del editor (localStorage)
│   │   ├── sectionTagColorsStore.ts  # Color por nombre de sección — section-colors.json
│   │   ├── aiStore.ts                # Estado del índice IA (enabled, related, grafo, progreso) vía IPC ai:*
│   │   └── aiChatStore.ts            # Estado del chat/LLM (config por proveedor, modelos, mensajes, sesiones) vía IPC ai:llm-*/ai:chat*/ai:chats-*
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── Editor.tsx               # Instancia TipTap (conversión md↔html en lib/markdownHtml.ts)
│   │   │   ├── NoteEditor.tsx           # Wrapper con tabs de secciones, atajos de fuente
│   │   │   ├── EditorToolbar.tsx        # Toolbar de formato
│   │   │   ├── DeadlineTaskItem.ts      # Extensión TipTap: task item con deadline+alarma
│   │   │   ├── DeadlineTaskItemView.tsx # NodeView React para DeadlineTaskItem
│   │   │   ├── CodeBlockWithCopy.tsx    # NodeView: code block con botón copiar
│   │   │   ├── ResizableImage.tsx       # NodeView: imagen redimensionable
│   │   │   ├── TableContextMenu.tsx     # Menú contextual de tablas
│   │   │   ├── SearchHighlightExtension.ts # Resaltado de matches de búsqueda in-note
│   │   │   ├── InNoteSearchBar.tsx      # Barra búsqueda dentro de la nota (modo WYSIWYG)
│   │   │   ├── RawNoteSearchBar.tsx     # Barra búsqueda dentro de la nota (modo raw)
│   │   │   └── RelatedNotesPanel.tsx    # Panel "Related notes" (IA) al pie del editor
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx              # Lista de notas, filtros, búsqueda, grupos/carpetas
│   │   │   ├── NoteGroupHeader.tsx      # Cabecera de grupo (nombre→group overview; resto→colapsar)
│   │   │   ├── NoteFolderHeader.tsx     # Cabecera colapsable de carpeta (dentro de grupo)
│   │   │   ├── SectionTabsRow.tsx       # Fila de tags de secciones en la tarjeta de nota
│   │   │   └── useSidebarGroups.ts      # Hook: agrupa/ordena notas por grupo→carpeta
│   │   ├── GroupOverview/
│   │   │   └── GroupOverview.tsx        # Vista de grupo (sustituye editor): bandas por carpeta
│   │   │                                #   + "No folder" + "Archived"; reutiliza useSidebarGroups
│   │   ├── NoteOverview/
│   │   │   └── NoteOverview.tsx         # Vista de nota (sustituye editor): una tarjeta por sección,
│   │   │                                #   mini-mock del editor (envuelve SectionPreviewCard)
│   │   ├── SectionPreview/              # Previsualización de sección reutilizable
│   │   │   ├── SectionPreviewCard.tsx   #   Tarjeta mini-mock pura (la usan NoteOverview, hover y cerebro)
│   │   │   ├── HoverPreviewProvider.tsx #   Provider + popover flotante de hover (sidebar/grupos/editor/IA);
│   │   │   │                            #     1 popover central, cierra con cualquier click (pointerdown global)
│   │   │   └── hoverPreviewContext.ts   #   Contexto + hook useSectionHoverPreview (archivo aparte: fast-refresh)
│   │   ├── AiPanel/                     # Panel de IA (Fase 3) — mitad izq. de la vista cerebro
│   │   │   ├── AiPanel.tsx              #   Contenedor con pestañas Chat / Related / Profile / ⚙ Settings
│   │   │   ├── ChatView.tsx             #   Chat streaming + selector de modelo + historial + citas
│   │   │   ├── RelatedView.tsx          #   "Related notes" por sección (movido aquí del cerebro)
│   │   │   ├── LlmConfigView.tsx        #   Config del proveedor (preset, baseUrl, key, modelo, test)
│   │   │   ├── ProfileFlow.tsx          #   Cuestionario por secciones (chips/tags/text/choice + archivos + enlaces) → genera nota de perfil
│   │   │   └── profileQuestions.ts      #   Esquema data-driven (PROFILE_SECTIONS: Professional/Personal/Your style/AI; proxy + binarias Big Five) + PROFILE_FIELDS + detectLocale()
│   │   ├── Brain/                       # Vista cerebro ("El Cerebro" Fase 2 — grafo de notas)
│   │   │   ├── BrainView.tsx            #   Split AiPanel | canvas (Fase 3); divisor redimensionable;
│   │   │   │                            #     ELIGE el render: 3D si hay WebGL, si no fallback 2D
│   │   │   ├── BrainScene.tsx           #   *** RENDER POR DEFECTO *** — cerebro 3D inmersivo
│   │   │   │                            #     (three.js: wireframe + bloom + orbit/zoom + impulsos)
│   │   │   ├── brainMesh.ts             #   Malla 3D procedural del cerebro (icosphere deformada +
│   │   │   │                            #     relleno interior + cerebelo + tronco; edges/BFS path)
│   │   │   ├── assignVertices.ts        #   Asigna cada nodo del grafo a un vértice de la malla 3D
│   │   │   ├── tunerState.ts            #   Params de forma/look del 3D (DEFAULT_LOOK, persistencia)
│   │   │   ├── BrainTuner.tsx           #   Panel dev de escultura de la forma 3D (SHOW_TUNER=false)
│   │   │   ├── BrainCanvas.tsx          #   FALLBACK 2D (sin WebGL): <canvas> + d3-force, pan/zoom/drag
│   │   │   ├── useBrainGraph.ts         #   Modelo compartido: nodos (grupo/carpeta/nota/sección) + 2 capas de aristas
│   │   │   ├── useForceLayout.ts        #   Simulación d3-force del fallback 2D (estructura + contenido)
│   │   │   ├── brainColors.ts           #   Resuelve CSS vars del tema → RGB (lo usan 2D y 3D)
│   │   │   └── BrainNodePreview.tsx     #   Ventanita clicable al pulsar un nodo nota/sección (click→navega)
│   │   ├── NoteCard/                    # Tarjeta de nota en sidebar
│   │   ├── TitleBar.tsx                 # Barra de título personalizada (frameless);
│   │   │                                #   el ⚙ abre la ventana de Ajustes (SettingsModal)
│   │   ├── Settings/                    # Ventana de Ajustes unificada (overlay split nav+contenido)
│   │   │   ├── SettingsModal.tsx        #   Contenedor: nav izquierda + panel derecho según sección
│   │   │   ├── AppearancePanel.tsx      #   Tema/fuente/acento/headings/escala + preview (era ThemeSettingsModal)
│   │   │   ├── EditorPanel.tsx          #   Font size / fuente / ancho (eran controles inline del menú)
│   │   │   ├── StartupPanel.tsx         #   Autostart + stickies al arrancar (era StartupSettingsModal)
│   │   │   ├── SyncPanel.tsx            #   Conectar/desconectar GitHub, status, pull (era GitHubSyncModal)
│   │   │   ├── DataPanel.tsx            #   Export/Import (lanza ExportImportModal) + dir de notas
│   │   │   ├── ShortcutsPanel.tsx       #   Lista de atajos (era KeyboardShortcutsModal)
│   │   │   └── AboutPanel.tsx           #   Versión (app:get-version) + check/instalar updates + repo
│   │   ├── CommandPalette/             # Paleta de comandos
│   │   ├── ConfirmModal.tsx            # Modal de confirmación genérico
│   │   ├── EncryptionModal.tsx         # Modal cifrar/descifrar notas
│   │   ├── ExportImportModal.tsx       # Modal exportar/importar notas (flujo, lanzado desde DataPanel)
│   │   └── StickyApp.tsx               # Ventana sticky flotante (fold/unfold)
│   ├── lib/
│   │   ├── noteUtils.ts          # parseNoteFolder, serializeNoteFolder, buildNoteWritePayload,
│   │   │                         #   noteFingerprint, noteDirname, extractTags, default title…
│   │   ├── cryptoUtils.ts        # Cifrado AES-256-GCM + PBKDF2 (WebCrypto)
│   │   ├── alarmUtils.ts         # Recolección de alarmas/deadlines para programarlas
│   │   ├── searchUtils.ts        # Helpers de búsqueda (normalización, matching)
│   │   ├── tagColors.ts          # getTagColor — color por nombre de tag (8 colores)
│   │   ├── markdownHtml.ts       # Conversión markdown↔HTML (htmlFromMarkdown/htmlToMarkdown);
│   │   │                         #   usado por el editor TipTap y SectionPreviewCard (previews)
│   │   └── themes.ts             # Definición de los 14 temas (CSS vars)
│   └── types/
│       └── index.ts             # Tipos TS + declaración global window.noteflow
├── dist-electron/         # Output compilado de electron/ (COMMITEADO — incluir en commits)
├── docs/                  # Landing page (GitHub Pages, servida desde /docs en main) — solo HTML/assets
├── public/                # Iconos, assets estáticos
├── release/               # Output de electron-builder (gitignored)
├── PKGBUILD               # Build manual/AUR del paquete Arch (electron del sistema, NOTEFLOW_NATIVE)
└── .github/workflows/
    └── release.yml        # CI/CD: build matrix (win+linux+mac) + release al pushear un tag
```

## Comandos de desarrollo

```bash
npm run dev            # Vite + Electron en paralelo (usa .electron-dev como user-data-dir)
npm run build          # tsc -b && vite build && tsc -p tsconfig.electron.json
npm run build:electron # solo compila electron/ → dist-electron/
npm run dist           # build + electron-builder (genera instaladores en release/)
npm run lint           # eslint
```

## Arquitectura IPC (Electron)

El renderer NO tiene acceso a Node.js. Toda operación de sistema pasa por IPC:

```
Renderer (React)
  └─ window.noteflow.*         ← expuesto por preload.ts
       └─ ipcRenderer.invoke()/send()/sendSync()
            └─ ipcMain.handle()/on()  ← definido en main.ts
```

### Handlers IPC (fuente de verdad: `electron/main.ts` + `electron/preload.ts`)

| Canal | Tipo | Descripción |
|---|---|---|
| `fs:read-all-notes` | handle | Lee TODAS las carpetas de nota en una llamada → `NoteDirRecord[]` (`{dir,path,noteMd,sections:[{file,content}]}`; batch, con reintentos) |
| `fs:read-note-dir` | handle | Lee UNA carpeta de nota → `NoteDirRecord \| null` (usado por syncNote) |
| `fs:write-note` | handle | Escritura multi-archivo de una carpeta: `{dir, files, deleteFiles}` (note.md primero) + 1 broadcast + schedulePush por archivo + scheduleIndex |
| `fs:delete-note` | handle | Borra la carpeta entera (rmSync recursivo) + broadcast + scheduleDeleteDir en GitHub |
| `fs:notes-dir` | handle | Devuelve ruta del dir de notas |
| `app:open-notes-folder` | handle | Abre la carpeta en el explorador |
| `app:choose-notes-dir` | handle | Diálogo para elegir carpeta |
| `app:get-login-item` / `app:set-login-item` | handle | Autostart al login (gestiona `.desktop` propio en Linux) |
| `app:get-version` | handle | Versión actual de la app (`app.getVersion()`) — la usa el panel About |
| `app:check-update` | handle | Consulta la última release en la API de GitHub |
| `app:download-and-install` | handle | Descarga el instalador (allowlist de hosts) e instala; emite progreso |
| `app:open-url` | handle | Abre URL externa (solo https, validada) |
| `settings:get-theme` / `settings:set-theme` | on (sync/async) | Tema en settings.json (sendSync para leer) |
| `settings:get-ui-state` / `settings:set-ui-state` | handle | Estado UI (nota/sección activa, grupos y carpetas colapsados) |
| `settings:get-startup-stickies` / `settings:set-startup-stickies` | handle | Stickies que se abren al arrancar |
| `groups:get` / `groups:set` | handle | Grupos → `groups.json` (en dir de notas, se sincroniza) |
| `folders:get` / `folders:set` | handle | Carpetas → `folders.json` (en dir de notas, se sincroniza) |
| `section-colors:get` / `section-colors:set` | handle | Color por sección → `section-colors.json` (saneado, se sincroniza) |
| `note-order:get` / `note-order:set` | handle | Orden manual de notas → `note-order.json` (en dir de notas, se sincroniza) |
| `notes:export` | handle | Exporta a `.noteflow`/`.json`/`.md`/`.txt` (diálogo de guardado) |
| `notes:parse-import-file` | handle | Abre y parsea un archivo de importación (incluye `.md`/`.txt`) |
| `notes:parse-external-import` | handle | Importa de otras apps (`'md-folder'\|'notion'\|'keep'`): abre diálogo carpeta/`.zip`, parsea con `electron/importers/` y devuelve un intermedio normalizado `ExternalNote[]` (`{title,format,body,tags?,created?,archived?,favorited?,relPath[]}`); NO serializa ni crea grupos (eso es del renderer) |
| `notes:write-imported` | handle | Escribe las notas importadas (filenames saneados) |
| `alarms:schedule` | on | Registra el set de alarmas en el motor del main; dispara las vencidas |
| `window:minimize` / `maximize` / `close` | on | Controles de ventana (frameless) |
| `window:get-id` | on (sync) | webContents id de la ventana (para filtrar broadcasts) |
| `window:open-sticky` | on | Abre ventana sticky flotante |
| `window:set-size` | on | Redimensiona la ventana (usado por sticky) |
| `window:fold-to-corner` / `window:unfold` | on | Anima el plegado/desplegado de stickies |
| `sync:get-status` | handle | Estado del sync (`enabled`, `connected`, owner, repo, lastSync, error, `initialPullStatus`) |
| `sync:initiate` | handle | Inicia Device Flow OAuth (recibe `repo`); al completar → `sync-auth-complete` + autosync |
| `sync:cancel-auth` | handle | Cancela un Device Flow en curso |
| `sync:disconnect` | handle | Desconecta GitHub, para autosync, limpia settings |
| `sync:pull` | handle | Pull manual desde el remoto |
| `ai:get-settings` / `ai:set-settings` | handle | Lee/escribe `settings.ai` (enabled, modelId); `set` aplica al worker y emite estado |
| `ai:related` | handle | Notas relacionadas con la **sección activa** (centroides + coseno) |
| `ai:search` | handle | Búsqueda semántica híbrida (vector + FTS5, RRF). La usa el RAG del chat (Fase 3) |
| `ai:graph` | handle | Aristas de contenido nota-a-nota (centroides por nota + coseno) para la vista cerebro (Fase 2) |
| `ai:reindex-all` | handle | Reindexa TODAS las secciones en background (lotes de 16) con progreso |
| `ai:llm-get-config` / `ai:llm-set-config` | handle | Lee/escribe `settings.aiLlm` (config del LLM por proveedor). `get` saneado (sin key); `set` aplica al **preset activo** (clave/modelo/baseUrl por proveedor) y cifra la key con `safeStorage` |
| `ai:llm-presets` | handle | Catálogo de presets de proveedor (`electron/ai/llm/presets.ts`) |
| `ai:llm-list-models` / `ai:llm-test` | handle | Lista modelos del proveedor activo / valida conexión+credenciales |
| `ai:chat` | handle | Chat **agéntico** con streaming: monta contexto RAG (`ai:search`+`ai:graph`) y corre un **bucle de tool-calling** (`provider.streamTurn` + `agentTools.executeTool`, máx. `MAX_AGENT_STEPS=12`); emite por eventos; resuelve al terminar. Cada mensaje de usuario puede llevar `attachmentIds[]`: main los resuelve de `chatFiles` (txt/md inline en el texto, pdf/img como `Attachment` nativos, capados por `capabilities`) |
| `ai:chat-pick-files` / `ai:chat-remove-file` | handle | Adjuntos del chat: mismo file picker que el perfil (`pickFilesIntoCache`) pero a la caché `chatFiles` (NO se consume al enviar → siguen disponibles para preguntas de seguimiento). Devuelve metadatos `{id,name,kind,sizeBytes}` + `errors[]`; bytes NUNCA cruzan al renderer |
| `ai:chat-cancel` | on | Aborta un `ai:chat` en vuelo por `requestId` (AbortController); también resuelve confirmaciones pendientes |
| `ai:chat-confirm` | on | Resuelve la confirmación de una tool destructiva por `toolCallId` (`{toolCallId, approved}`) |
| `ai:chats-load` / `ai:chats-save` | handle | Historial de chats en `userData/ai-chats.json` (local, NO se sincroniza) |
| `ai:profile-pick-files` | handle | Segundo cerebro: file picker capado por capacidades del proveedor (PDF/img/txt/md). Lee a una **caché en main** (bytes NUNCA cruzan al renderer); devuelve solo metadatos `{id,name,kind,sizeBytes}` + `errors[]` |
| `ai:profile-remove-file` | handle | Elimina un archivo de la caché del perfil por `id` |
| `ai:profile-generate` | handle | Segundo cerebro: `{fields[], fileIds[], urls[], locale?}` → monta prompt (campos + txt/md inline + texto scrapeado de urls vía `fetchReadableText`) + adjunta PDF/imágenes nativos → LLM → `{title, sections[]}`. System prompt **infiere/expande** (no solo reformatea). Limpia la caché al terminar |
| `ai:profile-get-status` / `ai:profile-set-completed` | handle | Flag `settings.aiProfile.completedAt` (cuestionario mostrado una vez) |

**Eventos main → renderer** (suscripción vía `window.noteflow.on*`):
`new-note`, `notes-updated` (filePath?, senderId?), `update:download-progress` (percent),
`update:installing` (fase de instalación, post-descarga),
`sync-auth-complete`, `sync:push-state` (`'pushing'|'idle'`), `sync:status-changed`,
`ai:reindex-progress` (`{done,total}`), `ai:index-state` (estado del índice),
`ai:chat-delta` (`{requestId,delta}`), `ai:chat-sources` (`{requestId,sources}`),
`ai:chat-done` (`{requestId,aborted?}`), `ai:chat-error` (`{requestId,error}`),
`ai:chat-tool-call` (`{requestId,toolCallId,name,input}`), `ai:chat-tool-result`
(`{requestId,toolCallId,status,summary}`), `ai:chat-confirm-request`
(`{requestId,toolCallId,name,input}` — tool destructiva esperando confirmación).

### Modelo de almacenamiento

**Notas y datos sincronizables** viven en el dir de notas (todo se sube a GitHub si hay sync):

| Plataforma | Ruta |
|---|---|
| Windows | `~/noteflow-notes/` |
| Linux | `~/.local/share/noteflow-notes/` (XDG; migración automática desde `~/noteflow-notes` y `~/scratch-notes`) |
| macOS | `~/noteflow-notes/` (mismo fallback que Windows — **deliberado**: mantiene paridad con el CLI y deja las notas visibles en el home) |

Contenido del dir de notas:
- `<slug>-<id>/` — **una carpeta por nota** (`note.md` + un `.md` por sección; ver "Formato").
- `.noteflow-format` — marcador de versión del formato (`2`).
- `groups.json` — definición de grupos (`{id,name,color,order,archived?}`; `archived?` oculta el
  grupo y sus notas salvo con "Show archived").
- `folders.json` — definición de carpetas (subcarpetas de grupos).
- `section-colors.json` — mapa `nombreSección(normalizado) → color CSS var`.
- `note-order.json` — orden manual de notas por contexto (`Record<contextKey, string[]>`); contextKey: `'ungrouped'`, `'group:<id>'`, `'folder:<id>'`, `'favorites'`. Gestionado desde `groupsStore` (`noteOrder`, `setContextNoteOrder`).

> El dir es configurable desde Settings → "Choose notes directory".

**Ajustes locales (NO se sincronizan)** en `settings.json`:
- **Windows:** `%APPDATA%\noteflow\settings.json`
- **Linux:** `~/.config/noteflow/settings.json`
- **macOS:** `~/Library/Application Support/NoteFlow/settings.json`
- (vía `app.getPath('userData')`)

Estructura de `settings.json`:
```json
{
  "theme": "carbon",
  "openAtLogin": false,
  "uiState": {
    "activeNoteId": "xyz",
    "activeSectionId": "sec001",
    "collapsedGroupIds": ["abc12345"],
    "collapsedFolderIds": ["fld001"]
  },
  "startupStickies": [
    { "noteId": "xyz", "sectionId": "sec001" }
  ],
  "githubSync": {
    "enabled": true,
    "encryptedToken": "<cifrado con safeStorage o base64 fallback>",
    "owner": "username",
    "repo": "noteflow-notes",
    "lastSync": "2026-03-25T10:00:00.000Z"
  },
  "ai": { "enabled": false, "modelId": "..." },
  "aiLlm": {
    "active": "anthropic",
    "byPreset": {
      "anthropic": { "model": "claude-opus-4-8", "encryptedApiKey": "<safe:...>" },
      "ollama":    { "baseUrl": "http://localhost:11434/v1", "model": "..." }
    }
  },
  "aiProfile": { "completedAt": "2026-06-14T10:00:00.000Z" }
}
```

> **Importante:** grupos/carpetas/colores de sección NO están en `settings.json` — están en
> archivos JSON dentro del dir de notas para poder sincronizarse entre dispositivos. El **historial
> de chats** vive en `userData/ai-chats.json` (local, no se sincroniza); las **API keys del LLM** se
> cifran por proveedor en `settings.aiLlm.byPreset[*].encryptedApiKey` (nunca cruzan al renderer).

## Formato de archivos de nota (v2 — carpeta por nota)

Cada nota es un **directorio** `<slug>-<id>/` (nombre congelado al crear; cambiar el título NO
renombra la carpeta). Dentro: `note.md` (**solo frontmatter**: metadatos + índice de secciones)
y **un `.md` por sección** (`<sectionId>.md`, markdown puro sin frontmatter — editable con
cualquier editor externo, diffs de git limpios). Fuente de verdad: `src/lib/noteUtils.ts`
(`parseNoteFolder` / `serializeNoteFolder` / `buildNoteWritePayload`), **espejado** en
`electron/noteFormat.ts` para main/worker y en `cli/noteflow.js` — mantener los tres en sync.

```
mi-nota-abc12345/
  note.md       ← ancla de metadatos (frontmatter only)
  sec001.md     ← cuerpo de la sección "Note"
  sec002.md     ← cuerpo de la sección "Tasks"
```

`note.md`:
```markdown
---
id: abc12345
title: "Mi nota"
tags: [javascript, react]
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-02T00:00:00.000Z   # timestamp CANÓNICO de conflicto para TODA la nota
formatVersion: 2
group: grp001        # opcional — id de NoteGroup
folder: fld001       # opcional — id de NoteFolder (requiere group)
expiresAt: 2026-01-03T00:00:00.000Z   # opcional — nota temporal (autoborrado)
sections:
  - id: sec001
    name: Note
    file: sec001.md
    isRawMode: true   # true = markdown/raw, false/ausente = rich text (TipTap HTML)
    aiHidden: true    # opcional — la IA NUNCA ve esta sección (índice, chat RAG, tools)
  - id: sec002
    name: Tasks
    file: sec002.md
archived: true    # solo presente si true
favorited: true   # solo presente si true
---
```

Notas **cifradas**: la carpeta contiene **solo `note.md`** (sin secciones en claro); el
frontmatter lleva el bloque `encryption` de siempre:
```yaml
encryption:
  alg: aes-256-gcm+pbkdf2
  salt: <base64url>
  iv: <base64url>
  ciphertext: <base64url>
  iterations: 310000   # omitido si es el default
  hashAlg: SHA-256     # omitido si es el default
```

- Marcador de versión: `<notesDir>/.noteflow-format` (contenido `2`).
- En memoria el `Note` sigue hidratado (`sections[].content`); `Note.filePath` = **directorio**;
  `Note.raw` = contenido de `note.md`. La UI (editor, sidebar, stickies) no cambió.
- Título por defecto: `DD/MM/YYYY`. Sección por defecto: `Note` en raw.
- Tags se extraen del contenido con `#nombre` (`extractTags`).
- `NOTEFLOW_NOTES_DIR` (env) redirige el dir de notas en app y CLI (testing/scripting).
- Los parsers toleran BOM UTF-8 (editores externos como Notepad lo añaden).

### Migración v1 → v2
- **Local** (`electron/migration.ts` → `migrateNotesDirToV2`): corre al arrancar, ANTES del pull
  inicial y del watcher. Convierte cada `<slug>-<id>.md` plano de la raíz en carpeta (parser
  legacy v1: sections inline / claves `section_*` / cuerpo plano), **preservando `updated`**,
  con write→verify→unlink. Idempotente (re-absorbe planos sueltos aunque exista el marcador).
  El CLI tiene `noteflow migrate` (local + remoto). Tras migrar, si la IA está activa se
  programa un `reindexAll` (los `file_path` del índice quedaron obsoletos).
- **Remota** (`githubSync.migrateRemoteToV2IfNeeded`): guardada por
  `settings.githubSync.remoteFormatMigratedAt` + pull inicial OK; disparada desde el arranque,
  `sync:pull` manual y al conectar. Importa los planos remotos que falten o sean más nuevos que
  la carpeta local, hace `pushAllNotes`, borra los planos del remoto y sube el marcador
  `.noteflow-format` AL FINAL. Mientras el remoto siga en v1 (planos y sin marcador), el pull es
  **solo aditivo** (borrados deshabilitados) para no perder carpetas recién migradas.
- **Orden de despliegue:** actualizar TODOS los clientes (desktop, CLI, móvil) antes de migrar;
  un cliente v1 que escriba después re-crearía archivos planos (la migración los re-absorbe en
  el siguiente arranque, pero mejor evitarlo).
- Smoke test: `node scripts/format-migration-smoke.cjs` (migración + round-trip, sin Electron).

## Patrones y decisiones de arquitectura

### Carga de notas en batch
`loadNotes()` usa `fs:read-all-notes` (un solo IPC, con reintentos ante FS no listo en Windows
al despertar/arrancar). Crítico para el tiempo de arranque con muchas notas.

### Importación desde otras apps (`electron/importers/`, `src/lib/notionHtml.ts`)
Importa notas de **Markdown folder**, **Notion** (export HTML `.zip`) y **Google Keep** (Takeout
`.zip`) reutilizando el pipeline de import existente (preview → conflictos → `notes:write-imported`).
Dep nueva: `adm-zip` (JS puro, sin binario nativo → no toca `asarUnpack`/postinstall).
- **Reparto main/renderer (clave):** `htmlToMarkdown` (`src/lib/markdownHtml.ts`) usa `DOMParser` →
  **solo corre en el renderer**. Por eso el **main** (`electron/importers/{index,markdownFolder,notion,
  googleKeep}.ts`, vía IPC `notes:parse-external-import`) hace **solo IO**: unzip/recorrer carpetas y
  emitir un intermedio `ExternalNote[]` (`{title, format:'html'|'md', body, tags?, created?, archived?,
  favorited?, relPath[]}`). El **renderer** (`ExportImportModal.tsx`) convierte `html→md`
  (`notionHtml.notionBodyToMarkdown`, normaliza markup Notion→TipTap antes de `htmlToMarkdown`),
  resuelve `relPath → grupo/folder` (`makeStructureResolver`, fusiona por nombre con `groupsStore`),
  y serializa al v2 con `serializeNoteFolder`.
- **Notion HTML:** maneja **ZIP anidados** (`Export-…-Part-N.zip`), quita el sufijo hex-32 de
  nombres/carpetas, descarta wrappers `Export-*` y la **raíz workspace única** (sus hijos → grupos),
  extrae `.page-title`/`.page-body`, convierte to-do lists (estado del checkbox), preserva embeds
  (links de `<figure>`) y **descarta imágenes y `.csv`** (v1).
- **Google Keep:** Takeout trae **un `.json` por nota** pero la **carpeta de Keep está localizada**
  (ES = "Conservar", etc.), así que NO se filtra por ruta `/Keep/` sino por **forma de la nota**
  (`isKeepNote`: tiene `textContent`/`listContent`/`isTrashed`/`userEditedTimestampUsec`…). Mapea
  `textContent`+`listContent`(→checkboxes), `labels`→tags, `isArchived`/`isPinned`, timestamps µs;
  omite `isTrashed`. Sin `relPath` (Keep no tiene carpetas).
- **Decisiones de UX:** contenido importado en **rich-text** (`isRawMode:false`); **notas sin
  contenido se omiten** (filtradas en preview por `externalContent()`); los **grupos/folders se crean
  solo al confirmar** (previsualizar y cancelar no deja rastro). Nesting >2 niveles se aplana a
  grupo + folder (`'A / B'`). Tutorial in-app por fuente en el selector de origen.
- **Sync:** `notes:write-imported` sube las notas con `pushPathsNow` (push durable awaited por lotes)
  en vez de `schedulePush` por archivo, para que un pull de auto-sync no las borre a mitad del import
  (ver "GitHub Sync" → Push).
- **Smokes:** `scripts/import-notion-smoke.cjs` (node, lado main: hex/wrappers/relPath) y
  `scripts/import-notion-verify.cjs` (e2e: corre la conversión REAL del renderer en una ventana
  oculta de Electron + esbuild, escribe a un dir temporal; valida 0 pérdida de contenido).

### Vista de grupo (group overview)
`notesStore` tiene `groupViewId: string | null` + `setGroupView(id)`. Cuando no es `null`,
`App.tsx` renderiza `GroupOverview` en lugar del editor/paneles (sidebar y TitleBar siguen
montados). `setActiveNote()` limpia `groupViewId` (seleccionar cualquier nota cierra la vista y
devuelve el editor). El componente reutiliza `useSidebarGroups` y `updateNote({group,folder})`
para reorganizar por drag&drop. La navegación a una sección concreta usa `pendingInitialSectionId`
+ un `noteflow:request-section` diferido con `setTimeout(0)` (el editor monta tras cerrar la vista;
bajo StrictMode el efecto de montaje consume el `pending` dos veces, de ahí el re-aviso por evento).
El ancho de tarjeta se guarda en `localStorage` (`noteflow:group-view-card-width`). Sin IPC nuevo.
**Selección múltiple:** estado local `selectedIds: Set<string>` en `GroupOverview`; cada `NoteCard`
recibe `selected`/`selectionActive`/`onToggleSelect` y muestra una checkbox (hover o marcada). Las
acciones por lotes (`SelectionBar`, componente al pie del mismo archivo) reusan los primitivos del
store: `updateNote({favorited})`, `archiveNote` (toggle), `updateNote({group,folder})` y `deleteNote`
iterando sobre la selección (favorite/archive calculan el target como `!todasYaLoTienen`); el borrado
pasa por `ConfirmModal`. `Esc` limpia la selección antes de cerrar la vista. Sin IPC nuevo.

### Vista de nota (note overview)
`notesStore` tiene `noteViewId: string | null` + `setNoteView(id)`. Es la **tercera vista full-area
mutuamente excluyente** con la group overview y la brain view: los tres setters (`setGroupView`,
`setNoteView`, `setBrainView`) y `setActiveNote` se limpian entre sí, así que abrir una cierra las
otras y seleccionar una nota devuelve el editor. `App.tsx` la renderiza (`NoteOverview`) con la
misma prioridad de routing (brain → group → note → editor). **Entradas:** botón en la toolbar de
`NoteEditor` (junto a la estrella) y el ítem "Note overview" del menú contextual del sidebar. Una
**tarjeta por sección** que es un mini-mock del editor: etiqueta de sección, título+`created` de la
nota, una barra-toolbar puramente representativa, y un **preview del contenido renderizado** con
`htmlFromMarkdown` (de `lib/markdownHtml.ts`) dentro de `.prose-editor .ProseMirror`, encogido con
CSS `zoom` (Chromium/Electron) y recortado a unas líneas con fade. El mock visual vive en
`SectionPreview/SectionPreviewCard.tsx` (componente puro, props `compact`/`previewHeight`/`previewZoom`);
`NoteOverview` lo envuelve en su `<button>`. Click en una tarjeta navega a esa sección con el mismo baile
`pendingInitialSectionId` + `noteflow:request-section` diferido. Ancho de tarjeta **fijo** (sin slider).
Las notas cifradas bloqueadas muestran un estado "encrypted". Sin IPC nuevo. **Nota CSS:** el reset global
`button { border: none }` deja `border-style: none`, así que las tarjetas usan `border-solid` explícito para
que el borde se vea (la utilidad `border` de Tailwind solo fija el ancho).

### Previsualización de sección (hover + cerebro)
Reutiliza `SectionPreviewCard` en dos interacciones, sin IPC nuevo (el contenido de toda sección ya está
en memoria en `notesStore`):
- **Hover** (`SectionPreview/HoverPreviewProvider.tsx`, montado en `App.tsx`): un **único** popover en
  portal a `document.body`. El hook `useSectionHoverPreview()` (en `hoverPreviewContext.ts`, archivo
  aparte por la regla `react-refresh/only-export-components`) expone `previewProps(noteId, sectionId, opts)`
  que devuelve handlers de ratón para escupir sobre cualquier disparador. Disparadores cableados:
  `SectionTabsRow` (sidebar + group overview), pestañas del editor (omite la activa), `RelatedView`/`ChatView`.
  `placement: 'cursor-below'` ancla la esquina sup-izq junto al cursor (sidebar/grupos/editor);
  `'element-right'` (default) al lado del elemento (IA). Retardo ~380 ms; el popover es `pointer-events-none`
  y se cierra con **cualquier click** (listener `pointerdown` global en el provider — esto evita que se quede
  pegado al pasar una pestaña del editor a "activa" y perder sus handlers). `title:''` en los handlers
  suprime el tooltip nativo del ancestro. Posición flash-free: primera pintura con altura estimada +
  `opacity:0`, se mide en `useLayoutEffect` y se revela.
- **Cerebro** (`Brain/BrainNodePreview.tsx`): NO es hover. Click en un nodo nota/sección llama
  `onNodeActivate(noteId, sectionId, clientX, clientY)` (en vez de navegar) → `BrainView` fija una tarjeta
  **clicable** junto al click; pulsarla navega (`openNote`), click fuera o `Esc` la cierra. Sustituyó al
  antiguo "fly-in" de cámara (eliminado).

### Grupos archivados
`NoteGroup.archived?` (en `groups.json`, vía `toggleGroupArchived` en `groupsStore`). Cuando
`showArchived` está off, el sidebar oculta el grupo **y sus notas** (el filtro de `baseNotes`
excluye notas cuyo `group` esté en `archivedGroupIds`, y el render salta el item del grupo); con
`showArchived` on, el grupo aparece atenuado y al final (`useSidebarGroups` ordena archivados
últimos). Las notas conservan su `archived` individual (no se cascada). Reusa el mismo toggle
"Show archived" que las notas. El campo es retrocompatible y lo sincroniza `groups:set`; el CLI lo
ignora. Sin IPC nuevo.

### Ventana frameless + hide-on-close
`frame: false`. Los controles de ventana son componentes React → IPC. La ventana principal se
oculta en lugar de cerrarse (`win.hide()`); la app vive en el system tray. Atajo global
`Ctrl+Shift+Space` la muestra/oculta.

### Ventana de Ajustes unificada (`src/components/Settings/`)
El ⚙ del TitleBar abre `SettingsModal` (overlay in-app, NO un BrowserWindow): split **nav
izquierda + panel derecho**, una sección por opción (Appearance, Editor, Startup, Sync, Data,
Shortcuts, About; el usuario añadió además AI). Sustituye al antiguo dropdown del titlebar y al
botón de paleta. Cada panel es el cuerpo extraído de los modales previos (`ThemeSettingsModal`,
`StartupSettingsModal`, `GitHubSyncModal`, `KeyboardShortcutsModal` — **eliminados**, junto con
`TitleBarMenu.tsx`); `ExportImportModal` se conserva y se lanza desde el `DataPanel` por callback.
Tamaño **fijo proporcional** `w-[min(940px,92vw)] h-[min(680px,90vh)]` (no crece con el contenido;
encoge si la ventana de la app es pequeña). Cada panel gestiona su propio estado/efectos — **sin
store ni IPC nuevo** salvo `app:get-version` (panel About). El `CommandPalette` no cambió: sigue
disparando los mismos eventos (`noteflow:open-shortcuts/-startup/-github-sync/check-for-update/
-export/-import`) y el TitleBar los reinterpreta para abrir la ventana en la sección correcta
(export/import siguen abriendo el flujo `ExportImportModal` directo).

### Single instance
`app.requestSingleInstanceLock()` — una segunda instancia trae la existente al frente.

### Sync entre ventanas
Al escribir/borrar una nota, main hace broadcast (`notes-updated`) a todas las BrowserWindows.
El renderer filtra eventos de su propia ventana por `senderId`/`windowId` para evitar races.

### fs.watch de cambios externos
main observa el dir de notas con `fs.watch` (debounce 150ms) para detectar cambios del CLI o
de la sincronización desde otro dispositivo. Los writes propios se marcan en
`recentInternalWrites` para ignorarlos y evitar bucles.

### Recuperación de fallos del renderer
`render-process-gone` / `unresponsive` recargan la ventana automáticamente (común tras
suspender/reanudar). `powerMonitor.on('resume')` reemite `notes-updated` con delays escalonados
(1.5s…30s) por si el FS o el renderer tardan en recuperarse.

### Ventanas sticky (fold/unfold + shape)
Stickies = BrowserWindows extra que cargan la app con hash `#sticky?noteId=...&sectionId=...`,
`alwaysOnTop`, transparentes. En Windows se usa `win.setShape()` (región redondeada calculada
píxel a píxel) porque el DWM ignora `border-radius` al perder foco. Plegado/desplegado animado
en el main (`fold-to-corner`/`unfold`) apilando las píldoras en la esquina.

### GitHub Sync (`electron/githubSync.ts`)
- **Auth:** Device Flow OAuth — sin client secret; el usuario autoriza en
  `github.com/login/device`. Client ID `Ov23liut9QOJ2pJFF0KR` (público por diseño).
- **Token:** `safeStorage.encryptString()` (cifrado a nivel OS) con fallback a base64, en
  `settings.json`.
- **Modelo de rutas:** el remoto espeja el local — `<dir>/note.md`, `<dir>/<secId>.md`; los json
  de metadatos y README en la raíz. Las rutas relativas se codifican **por segmento**
  (`encodeRemotePath`). Push/delete por archivo siguen usando la **Contents API** (acepta rutas
  con `/`); el **listado** usa la **Git Trees API** (`GET /git/trees/{branch}?recursive=1`,
  `default_branch` cacheado).
- **Push:** `schedulePush(relPath, content, onStart?, onEnd?)` — debounce 5s **keyed por ruta
  relativa** (dos archivos de la misma nota debouncen independientes); llamado desde
  `fs:write-note` (por cada archivo escrito), `groups:set`, `folders:set`, `section-colors:set`,
  `note-order:set`. Los callbacks alimentan `pendingPushFiles` → evento `sync:push-state`.
  **Push durable por lotes:** `pushPathsNow(notesDir, relPaths)` sube un set de archivos **ya**
  (awaited, sin debounce, leyendo de disco) y **NO bumpea `lastSync`**. Lo usa `notes:write-imported`:
  cada `schedulePush` que completa adelanta `lastSync` a "ahora", así que durante un import grande un
  pull de auto-sync vería las notas aún no subidas como `updated <= lastSync` y **las borraría**
  (regla de borrado del pull); subirlas al remoto por adelantado las hace inmunes (el pull conserva
  toda carpeta presente en remoto). No-op si el gate de push está cerrado (`initialPullStatus!=='ok'`)
  — ahí `flushPendingLocalChanges` las sube tras el primer pull.
- **Pull:** `pullNotes(notesDir)` — agrupa los blobs del árbol por carpeta de nota; la **carpeta
  es la unidad de conflicto**: compara `updated:` de `note.md` y si el remoto es más nuevo
  escribe la carpeta ENTERA (y borra secciones locales que ya no existan en remoto). Borrado de
  notas a nivel carpeta con la regla de seguridad de siempre (`updated <= lastSync`), y **solo
  si el remoto es v2** (marcador presente y sin planos) — guard de transición. `updatedFiles`
  lleva paths de DIRECTORIOS.
- **Metadata:** `METADATA_FILENAMES` = groups.json, **folders.json**, section-colors.json,
  **note-order.json** (los dos en negrita se pusheaban pero NO se pulleaban — bug arreglado con
  el cambio de formato).
- **Autosync:** pull cada 5 min (`AUTO_SYNC_INTERVAL_MS`) mientras esté conectado.
- **Delete:** `scheduleDelete(relPath)` (sección suelta) y `scheduleDeleteDir(dir)` (lista el
  árbol y borra cada blob bajo `<dir>/`; usado por borrar nota y notas expiradas).
- **⚠️ Serialización de mutaciones remotas (INVARIANTE — leer antes de tocar el sync):** la
  Contents API de GitHub **commitea de una en una por rama** (cada PUT/DELETE mueve el HEAD), así
  que dos escrituras/borrados **concurrentes** chocan con un `409/422` por SHA obsoleto. Por eso
  **TODA** mutación remota pasa por una **única cola** (`enqueueMutation` en `githubSync.ts`):
  `upsertRemoteFile`/`removeRemoteFile` son wrappers finos que encolan su trabajo real (`*Now`) y se
  ejecutan **estrictamente secuencialmente**. **Cualquier write/delete remoto nuevo DEBE ir por
  estos dos puntos** (nunca llamar a `githubRequest` con PUT/DELETE en paralelo ni saltarse la
  cola). Ambos **reintentan una vez** ante conflicto (re-fetch del SHA) y tratan `404` como "ya no
  está" (éxito); **nunca traguen un error de borrado en silencio** — si falla, registrar `syncError`
  (un borrado remoto perdido hace que la nota **reaparezca** en el siguiente pull). Además el
  auto-sync pull **se pospone** si `hasPendingRemoteMutations()` (no rehace una nota cuyo borrado
  remoto aún está en cola). Histórico: un borrado/edición múltiple (p. ej. batch en la group
  overview) disparaba N mutaciones concurrentes → 409s silenciosos → notas restauradas; de ahí la
  cola. Mantener este patrón al añadir operaciones que toquen el remoto (notas, grupos, carpetas,
  metadatos).
- **Repo:** se crea automáticamente con `private: true` + `auto_init: true` si no existe.
- **initialPullStatus** (`pending|ok|failed`) gatea pushes hasta que el primer pull tenga éxito.
  `flushPendingLocalChanges` re-encola la carpeta entera cuando `note.md updated > lastSync`.
- **Migración remota:** `migrateRemoteToV2IfNeeded(notesDir)` — ver "Migración v1 → v2".

### Motor de alarmas y notas temporales (en main)
`setInterval` cada 60s ejecuta `checkAlarms()` + `checkExpiredNotes()`:
- **Alarmas:** el renderer recolecta deadlines/alarmas de los task items (`alarmUtils.ts`) y las
  envía con `alarms:schedule`; el main dispara `Notification` nativa cuando vence (incluye las ya
  vencidas/perdidas al registrar).
- **Notas temporales:** archivos con `expiresAt` vencido se borran del disco y del remoto.

### Auto-update in-app
`app:check-update` consulta la última release (API GitHub, endpoint `/releases/latest` → **ignora
prereleases**; compara con `latest !== current`, así que cualquier versión local distinta dispara
el update — útil para probar el flujo bajando a una versión inferior a la publicada). En Linux
elige el artefacto según la distro detectada: **Arch-based** (`/etc/arch-release`,
`/etc/cachyos-release` o `/usr/bin/pacman`) → `.pkg.tar.zst`; **Debian-based**
(`/etc/debian_version` o `/usr/bin/dpkg`) → `.deb`; resto → `.AppImage` (universal).
En **macOS** elige `NoteFlow-${latest}-arm64.dmg` (solo Apple Silicon).
`app:download-and-install` descarga el artefacto con una **allowlist estricta de hosts**
(github.com + objects/release-assets de githubusercontent.com) y de extensiones (`.exe`, `.deb`,
`.AppImage`, `.pkg.tar.zst`, `.dmg`), emite `update:download-progress` durante la descarga y
`update:installing` al terminarla (la UI muestra un spinner "Installing…" en el botón del
TitleBar), y luego instala **sin depender de popups del SO**:
- **Windows:** `spawn(setup, ['--updated','--force-run'], {detached:true}).unref()` + `app.quit()`
  (tras ~1s). **No usa `/S`**: así la **ventana de progreso nativa de NSIS sí se ve**. El flag
  `--updated` activa el `isUpdated` del macro `_CHECK_APP_RUNNING` de electron-builder, que **se
  salta el popup "cierra la aplicación"** y cierra la instancia él solo (el `MessageBox` solo
  aparece en instalación no-update); `--force-run` la relanza al terminar; al ser instalación
  **per-user** no hay UAC. **Clave:** el `app.quit()` explícito es imprescindible porque el cierre
  de ventana hace hide-to-tray (no sale) — sin él, el instalador tendría que force-killear la app
  tras un retry. Decisión de diseño: se eligió `--updated` (con barra de progreso) sobre `/S`
  (totalmente silencioso) para dar feedback visual de la instalación.
- **Linux deb/pacman:** `pkexec dpkg -i` / `pkexec pacman -U --noconfirm` (el diálogo de PolicyKit
  pidiendo root es esperado e inevitable: instalar a nivel de sistema requiere elevación), con
  fallback a `shell.openPath` si `pkexec` no está; al instalar hace `app.relaunch()` + `app.quit()`.
- **AppImage:** reemplazo en sitio — copia al dir de `$APPIMAGE`, `chmod +x`, **rename atómico**
  sobre el original (no sobreescribe el inodo en uso → no corrompe el proceso vivo) +
  `app.relaunch({execPath})` + `quit()`. Sin `$APPIMAGE` (dev/empaquetado raro) cae a `shell.openPath`.
- **macOS:** la build **no está notarizada**, así que no se usa Squirrel.Mac. Se hace
  `shell.openPath(dest)` para **abrir el `.dmg` en Finder** + una `Notification` "Drag NoteFlow to
  Applications"; el usuario arrastra a Applications y relanza a mano (la app NO sale). Reemplazo
  automático descartado por no poder probarse a ciegas.

> **Pendiente de verificar** en build empaquetado real (Win silent + AppImage in-place + **macOS dmg
> en Apple Silicon real**): probado de momento solo a nivel de compilación/typecheck. macOS, además,
> no se ha podido probar en runtime (sin Mac) — ver el bloque de soporte macOS más abajo.

`NOTEFLOW_NATIVE=1` (lo setea el wrapper
del PKGBUILD) hace que la app trate la instalación nativa de Arch como `isPackaged` para rutas de
iconos y modo no-dev.

### Soporte macOS (Apple Silicon) — añadido sin Mac para probar
Decisiones (tomadas por no disponer de Mac → mínima superficie de riesgo): **sin firmar/notarizar**
(firma ad-hoc vía `CSC_IDENTITY_AUTO_DISCOVERY=false` en CI), **solo arm64** (un `.dmg`), **update =
abrir el dmg en Finder** (no reemplazo automático). Qué cambió y qué NO:
- **NO cambió:** `app.getPath('userData')` (Keychain/Application Support ya correctos), `safeStorage`
  (Keychain con fallback), `fs.watch` recursivo (rama no-Linux), atajos globales/tray (`CommandOrControl`),
  `app.on('activate')→showWindow` (ya existía → reabrir desde el Dock funciona), notes dir (se mantiene
  `~/noteflow-notes` por **paridad con el CLI**), barra de título (`frame:false` → los semáforos nativos
  quedan ocultos y se usan los controles propios de la derecha, sin solapamiento).
- **Sí cambió:** bloque `mac` en electron-builder + `public/icon.icns`; ramas `darwin` en `app:check-update`
  y `app:download-and-install` (`main.ts`); `.dmg` en la allowlist de update; matrix `macos-14` + globs en
  el workflow; `preload.ts` expone `platform` y el renderer muestra `⌘`/`⌃` vía `src/lib/platform.ts`
  (`modKey`/`controlKey`/`keyLabel`); fix `Editor.tsx` Ctrl+Shift+B → acepta `metaKey`.
- **El único punto sin verificar es el runtime en un Mac real** (Gatekeeper + carga de módulos nativos
  desde `app.asar.unpacked` dentro del `.app` + arranque del worker de IA). Recomendado: publicar primero
  un tag prerelease (`-mac.1`) y que alguien lo pruebe antes del estable.

### Cifrado de notas (`src/lib/cryptoUtils.ts`)
AES-256-GCM + PBKDF2 (310.000 iteraciones por defecto, SHA-256) vía WebCrypto. La nota cifrada
guarda solo el bloque `encryption`; sin contraseña no hay secciones legibles. Sin master key ni
backdoor.

### Índice semántico local — "El Cerebro" Fases 1-2 (`electron/ai/`, `src/components/Brain/`)
Subsistema de IA **100% local/offline** que indexa cada **sección** de cada nota como un
**embedding** (vector). El índice es un **artefacto derivado y reconstruible** desde los `.md` (si
se borra, se regenera). Plan maestro "El Cerebro": Fase 1 (índice + panel "Related notes", hecha)
→ **Fase 2 (vista cerebro/grafo, hecha)** → **Fase 3 (panel IA: chat RAG + segundo cerebro, hecha;
falta verificar en app real)** → Fase 4 (nube/monetización). **Principio: un índice, tres
consumidores** (related ✅, grafo ✅, chat ✅). Plan de Fase 2:
`C:\Users\yagoi\.claude\plans\vamos-a-planificar-la-peaceful-manatee.md`.

- **3 procesos:** renderer (`aiStore` + `RelatedNotesPanel`) → main (`aiIndex`, lifecycle +
  debounce + progreso) → **`utilityProcess`** (`aiWorker`, no bloquea el main).
- **Worker (`aiWorker.ts`):** embeddings con **Transformers.js** (`@huggingface/transformers`,
  runtime `onnxruntime-node` nativo, cuantización q8→fp32 fallback) + índice **SQLite**
  (`better-sqlite3`) con vectores (`sqlite-vec`, tabla `vec0`) y texto (`FTS5`). **Las notas
  cifradas se omiten** (no entra texto plano al índice).
- **Secciones ocultas a la IA (`NoteSection.aiHidden`):** flag por sección (frontmatter, como
  `isRawMode`; persistido por los tres espejos de formato — `noteUtils.ts`, `noteFormat.ts`,
  `cli/noteflow.js`). Cuando `aiHidden: true` la sección queda **fuera de TODAS las superficies de
  IA**: no se indexa (`aiWorker` la filtra en `reindexNote`/`reindexAll`; al ocultar una ya indexada
  el cleanup de `reindexNote` la borra del índice), no entra al RAG del chat (`buildChatContext` en
  `main.ts` filtra `aiHidden` — defensa en profundidad ante el fallback de vecinos) y las tools no la
  exponen (`get_note`/`list_notes` en `llm/tools.ts` la omiten). Como el modelo no ve su `section_id`,
  tampoco puede editarla. UI: toggle "Hide from AI"/"Show to AI" en (1) el menú ⋯ del editor (sección
  activa) y (2) el `NoteContextMenu` compartido (click derecho sobre un tag de sección en el sidebar,
  en la group overview y sobre las tarjetas de la note overview). Indicador `EyeOff` en la pestaña del
  editor, en los tags del sidebar y como badge en las tarjetas de la note overview.
- **DB:** `userData/ai-index/index.db` (en dev `userData` = `.electron-dev/`). **Fuera del dir de
  notas** → NO se sincroniza a GitHub. Tablas: `notes`, `chunks`, `vec_chunks` (vec0),
  `fts_chunks` (FTS5), `meta` (modelId/dim/schemaVersion). Dimensión **dinámica** (detectada del
  modelo); cambiar `settings.ai.modelId` o el schema dispara **reindex automático**.
- **Modelo por defecto:** `Xenova/paraphrase-multilingual-mpnet-base-v2` (768-d), elegido por
  benchmark sobre las notas reales (ES+EN+código). Se descarga en el primer uso a
  `userData/ai-models`. Alternativa rápida: `paraphrase-multilingual-MiniLM-L12-v2` (384-d).
- **Indexado incremental:** enganchado a `fs:write-note` (`aiIndex.scheduleIndex(dirPath)`,
  debounce 2.5s, una vez por nota) y `fs:delete-note` (`removeFromIndex(dirPath)`). El worker
  **lee la carpeta de la nota desde disco** (`noteFormat.parseNoteDir`); `notes.file_path` en la
  DB guarda el path del DIRECTORIO. Hash por sección para no re-embeber lo que no cambió.
  `stripNoise` quita imágenes base64 y trunca a ~2000 chars antes de embeber (crítico: 157s→6.7s).
- **related (por sección activa):** centroides por sección → **centrado por la media global**
  (corrige anisotropía) → coseno → de otras notas la mejor por nota, hermanas de la misma nota
  individuales → umbral + top-k. **search:** híbrido vector+FTS5 con fusión RRF (para Fase 3).
- **graph (Fase 2, `ai:graph` → `SqliteIndex.contentEdges`):** **centroide por nota** del
  `chunkCache` → centrado por media global + normalización → coseno todas-las-parejas → umbral
  (`0.05`) + poda top-`maxPerNote` (mutual top-k) → `GraphEdge[]` nota-a-nota. Es la **capa de
  contenido** del grafo; la **estructura** (grupo→carpeta→nota) la arma el renderer con
  `useSidebarGroups`. Consumido por `aiStore.fetchGraphEdges` → `useBrainGraph`.
- **Vista cerebro (`src/components/Brain/`):** modo full-screen conmutable (botón "Cerebro" en el
  TitleBar → `notesStore.brainViewOpen`, espejo de `groupViewId`; sustituye el editor en `App.tsx`,
  `setActiveNote` lo cierra). **`BrainView` elige el render según WebGL** (`detectWebGL()`):
  - **`BrainScene.tsx` (3D, POR DEFECTO — Fase 2.5):** cerebro inmersivo con **three.js**
    (`WebGLRenderer` + `EffectComposer`/`UnrealBloomPass` + `OrbitControls`). La forma es una malla
    procedural (`brainMesh.ts`: icosphere deformada + relleno interior + cerebelo + tronco); cada
    nodo del grafo se fija a un vértice (`assignVertices.ts`). Capas: wireframe tenue (vértices=dots,
    aristas), estructura grupo→carpeta→nota y dendritas nota→sección (líneas), sinapsis de contenido
    nota↔nota (ruteadas por la malla), nodos (dot + anillo de color) y labels HTML proyectados. Look
    en `tunerState.ts` (`DEFAULT_LOOK`: bloom, `wireOpacity`, `dotOpacity`, fog…). Impulsos eléctricos:
    pulso único en hover (nodo→relacionada) + chispas ambientales aleatorias por el wireframe.
    `BrainTuner.tsx` es un panel dev de escultura (`SHOW_TUNER=false`). Click en nota → fly-in +
    `openSection`. Forzar 2D: `localStorage 'noteflow:brain-force-2d'`.
  - **`BrainCanvas.tsx` (2D, FALLBACK sin WebGL):** `<canvas>` 2D propio + `d3-force`
    (`useForceLayout.ts`) con pan/zoom/drag/hover.
  Ambos comparten el modelo (`useBrainGraph.ts`) con dos capas de aristas: estructura sólida (color de
  grupo) + contenido tenue (resaltada al seleccionar/hover, con toggle). Excluye notas
  archivadas/cifradas/temporales. Smoke headless: `scripts/ai-graph-smoke.cjs`.
- **Activación:** flag `settings.ai.enabled` (default `false`). **UI definitiva de activación: el
  overlay/CTA dentro de la vista cerebro** (con IA off el cerebro muestra solo estructura; activar
  desde ahí descarga el modelo + reindexa con barra de progreso). Queda además el toggle temporal
  "Local AI" en el menú del TitleBar. Arranque del worker diferido ~4s tras el boot (`primeSettings`).
- **Deps nativas (IMPRESCINDIBLE):** `better-sqlite3` + `onnxruntime-node` + `sqlite-vec` son
  binarios nativos. `package.json` lleva **`"postinstall": "electron-builder install-app-deps"`**
  (recompila para el ABI de Electron tras cada `npm install`) y entradas en **`build.asarUnpack`**.
  Si el worker sale con "exited before init (code 1)": `npx @electron/rebuild -f -o better-sqlite3`.
- **Deps de la Fase 2:** `three` (+ `@types/three`) para el render 3D por defecto (`BrainScene`,
  lazy-loaded → chunk propio) y `d3-force` (+ `@types/d3-force`) para el fallback 2D. Ambas JS puro,
  sin binario nativo (no tocan `asarUnpack` ni el `postinstall`).
- **Scripts (`scripts/`):** `ai-smoke.cjs` (test e2e headless related/search), `ai-graph-smoke.cjs`
  (test del grafo: clusters por contenido), `ai-inspect.cjs` (inspecciona la DB real), `ai-bench.cjs`
  (benchmark de modelos → `scripts/bench-out/REPORT.md`), `format-migration-smoke.cjs` (migración
  v1→v2 + round-trip del formato; corre con `node`, sin Electron). Los de IA se ejecutan con
  `unset ELECTRON_RUN_AS_NODE; npx electron scripts/ai-smoke.cjs`.
- **Pendiente:** probar el **build empaquetado** (`npm run dist`) en Win/Linux — validar que
  `asarUnpack` y la descarga del modelo funcionan en el instalado (NO verificado aún). Fase 2:
  **detalle progresivo** (expandir secciones como sub-nodos al seleccionar/zoom) está **diferido**
  (los labels de notas ya aparecen al hacer zoom).

### LLM / chat / segundo cerebro — Fase 3 (`electron/ai/llm/`, `src/components/AiPanel/`)
Capa de **LLM** sobre el índice, independiente del flag de embeddings. **Dos interruptores:**
(1) `settings.ai.enabled` (embeddings) habilita RAG + aristas de contenido; (2) `settings.aiLlm`
(proveedor configurado) habilita chat/generación. El chat funciona sin (1) pero **sin contexto**.

- **El LLM corre en el proceso main**, NO en el `aiWorker` (que sigue solo embeddings+SQLite). La
  API key se cifra por proveedor con `safeStorage` y **nunca llega al renderer** (solo `hasKey`).
- **Proveedores (presets, `electron/ai/llm/presets.ts`):** dos implementaciones —
  `anthropic` (SDK oficial `@anthropic-ai/sdk`, `messages.stream`) y `openai` (fetch SSE a
  `/chat/completions`). Presets: Anthropic, OpenAI, DeepSeek, MiniMax, Moonshot, OpenRouter,
  Ollama (local), Custom. **Cada preset guarda su propia key/modelo/baseUrl** (`aiLlm.byPreset`)
  → cambiar de proveedor no mezcla credenciales. `baseUrl` editable salvo Anthropic.
- **RAG (`ai:chat` en main):** embebe la pregunta vía `aiIndex.search` (híbrido) → expande vecinos
  con `aiIndex.graph` → lee secciones de disco (`noteFormat.parseNoteDir`) → monta system prompt con
  contexto → stream. Emite `ai:chat-sources` (notas usadas) antes de los deltas. **Privacidad:** solo
  salen pregunta + chunks recuperados; las cifradas ya están fuera del índice.
- **Chat agéntico (tool-calling):** el chat **NO usa el CLI** — actúa con **function calling nativo**
  ejecutado en el main. Piezas: `electron/ai/llm/types.ts` (`ToolSchema`/`ToolCall`/`ToolResult`/
  `AgentMessage` + método `LlmProvider.streamTurn` que streamea texto y devuelve `toolCalls`),
  `anthropic.ts` (mapea a content blocks `tool_use`/`tool_result`; el `tool_use` llega completo tras
  el stream) y `openaiCompatible.ts` (añade `tools`+`tool_choice:auto` al payload y **acumula
  `delta.tool_calls` por índice** en el SSE). El **catálogo + ejecutor** vive en
  `electron/ai/llm/tools.ts` (`TOOLS`, `DESTRUCTIVE_TOOLS`, `executeTool(name,input,ctx)`),
  **desacoplado de main por DI** (`ToolContext`): lee/parsea con `noteFormat` y escribe reusando los
  primitivos factorizados del main `applyNoteWrite` / `applyNoteDelete` / `applyGroupsSet` /
  `applyFoldersSet` (heredan broadcast `notes-updated` + `schedulePush` + `scheduleIndex`; **sin
  senderId** → la propia ventana del chat también refresca). Tools v1: `list_notes`, `get_note`,
  `list_groups`, `search_notes`, `create_note`, `update_note`, `add_section`, `update_section`,
  `rename_section`, `create_group`, `create_folder`, `rename_group`, `rename_folder`, `delete_*`.
  Las **notas cifradas** se listan pero no se leen/editan. El **bucle** en `ai:chat` itera
  `streamTurn`→ejecutar tools→realimentar `role:'tool'` hasta que no haya `toolCalls` (máx. 12 pasos,
  `MAX_AGENT_STEPS`). **Tools siempre activas** (el modelo decide); **solo las destructivas piden
  confirmación**: el main emite `ai:chat-confirm-request` y `await`ea `chatConfirms` (resuelto por
  `ai:chat-confirm`); si se cancela, devuelve un `ToolResult` "user declined" sin abortar el turno.
- **Iluminación de fuentes:** las notas citadas se "encienden" en el cerebro — pulso/halo aditivo
  brillante en 3D (`litGroup` en `BrainScene`, parpadeo por `sin`) y glow + anillo en 2D
  (`BrainCanvas`). NO se fuerzan etiquetas (eso metía ruido). Prop `highlightedNoteIds`.
- **Historial de chats:** sesiones en `userData/ai-chats.json` (local), gestionadas por `aiChatStore`
  (crear/abrir/borrar; se persiste al terminar cada respuesta). Selector de modelo en el chat
  (cambia el modelo del preset activo). UI del panel **en inglés**.
- **Enrutado del panel desde la paleta de comandos:** `aiChatStore` expone `panelTab`/`pendingPrompt`
  + `openAiPanel(tab, prompt?)` (tipo `PanelTab = 'chat'|'related'|'profile'|'settings'`). La
  `CommandPalette` abre la brain view (`setBrainView(true)`) y llama `openAiPanel` para que el
  `AiPanel` cambie de pestaña reactivamente (un `useEffect` consume `panelTab` y gana sobre el
  auto-routing de primera vez). El comando inline **"Ask AI"** pasa un `prompt`: `openAiPanel`
  arranca un chat nuevo y deja `pendingPrompt`, que `ChatView` auto-envía en cuanto hay proveedor
  configurado (si no, queda en cola). Sin IPC nuevo — es routing in-renderer vía store.
- **Segundo cerebro (cuestionario de baja fricción):** al entrar al cerebro la 1ª vez (si hay
  proveedor y `!aiProfile.completedAt`) sale `ProfileFlow`. La UI es **data-driven** desde
  `profileQuestions.ts` (`PROFILE_SECTIONS` → secciones **Professional / Personal / Your style /
  Working with the AI**; campos tipo `chips`/`tags`/`text`/**`choice`** — `PROFILE_FIELDS` los aplana).
  **Diseño indirecto > directo:** la mayor señal viene de **preguntas-proxy de baja fricción**
  (música/cine/libros favoritos, viaje soñado) y **binarias "esto o lo otro"** (`choice`,
  single-select) pensadas para tap-ear el **Big Five (OCEAN)** — el modelo las interpreta como
  **priors suaves** (correlaciones modestas, nunca veredictos). Se conservan algunos chips directos
  de auto-descripción (enfoque **híbrido**). El usuario también puede **adjuntar archivos** y
  **enlaces**. Al generar, `ai:profile-generate` recibe `{fields (con `section`), fileIds, urls,
  locale}` (agrupa las respuestas por sección en el prompt) y el LLM **infiere/abstrae/organiza** en
  una nota de perfil (creada por `notesStore` en el idioma del usuario). **Privacidad/abstracción:**
  el cuerpo describe a la persona en **rasgos/valores abstractos** (lo que un favorito *representa*,
  no el título); los favoritos literales van en una sección final **"Soft signals (raw — do not
  cite)"** marcada como background-only. El `CHAT_SYSTEM_BASE` además prohíbe name-dropping de esas
  preferencias en chats no relacionados (recomendar directo, sin "como te gusta X…").
- **Adjuntos nativos (la app NUNCA procesa documentos):** la capa LLM admite `Attachment`
  (`{kind:'pdf'|'image', mediaType, data:base64}`) vía `ChatOptions.attachments`; `anthropic.ts`
  los mapea a bloques `document`/`image` y `openaiCompatible.ts` las imágenes a `image_url` parts.
  Qué se ofrece lo decide `providerCapabilities(preset)` (en `llm/index.ts`, expuesto en
  `LlmConfigPublic.capabilities`): **PDF solo Anthropic**; las **imágenes son por preset** porque el
  soporte de visión es **dependiente del modelo** — cada preset declara un default `images?` en
  `presets.ts` (false en los de solo-texto: **DeepSeek/MiniMax/Moonshot**, que rechazan `image_url`
  con un 400; true en los vision-capaces/flexibles: OpenAI/OpenRouter/Ollama/Custom). `.txt/.md` se
  incrustan como texto (universal). DOCX/OCR no se soportan (requerirían procesar). El picker capa las
  extensiones y `ai:chat` filtra los adjuntos por `caps` (defensa en profundidad: si cambias a un
  proveedor sin imágenes, los adjuntos de imagen no se envían). **Archivos de texto/código:** se admite
  una lista amplia de extensiones de texto plano (`TEXT_EXTS` en `main.ts`: .txt/.md + código .py/.js/
  .ts/.go/.rs/… + config .json/.yaml/.toml/… + .sql/.html/.css/…) — todo lo que **ya es texto**, sin
  parsear; se incrustan verbatim (cap 20k chars/archivo). Formatos binarios/estructurados (docx, xlsx)
  no. **Error amable:** si mandas una imagen a un modelo de solo-texto, `friendlyChatError` detecta el
  fallo típico (HTTP 400 `unknown variant image_url`) y devuelve un mensaje claro en vez del JSON crudo.
  Los **enlaces** se descargan con `net.fetch` + `fetchReadableText`
  (https validado, timeout 8s, strip HTML→texto, cap 6000 chars) y van como contexto.
  - **En el chat** (no solo el perfil): el composer de `ChatView` tiene un botón 📎 (`pickAttachments`
    en `aiChatStore`) que abre `ai:chat-pick-files`; los adjuntos pendientes se muestran como chips
    removibles y se cuelgan del turno de usuario al enviar (`ChatTurn.attachments`, metadatos solo).
    `sendMessage` reenvía los `attachmentIds` de **cada** turno en el payload, así las preguntas de
    seguimiento conservan la imagen/PDF en contexto (los bytes viven en `chatFiles` toda la sesión de
    app; al reabrir un chat guardado en disco los bytes ya no están, solo se ven los chips). El picker
    escala las extensiones por `capabilities` (mismo helper `pickFilesIntoCache` que el perfil).
- **Dep nueva:** `@anthropic-ai/sdk` (JS puro, sin binario nativo → no toca `asarUnpack`/postinstall).
- **Smoke:** `scripts/ai-chat-smoke.cjs` (servidor mock OpenAI-compatible; corre con `node`, sin
  Electron): listar modelos, streaming, abort, **tool-calling** (acumulación de `tool_calls`
  fragmentados por índice + turno de seguimiento con `role:'tool'`) y **adjuntos** (imagen →
  `content` array con `image_url`). El mock usa `res.on('close')`
  para limpiar el `setInterval` (con `req.on('close')` Node moderno lo mataba al consumir el body).
- **Pendiente:** verificación manual en app real (necesita key/Ollama); monetización/nube (Fase 4).

### CLI companion (`cli/noteflow.js`)
Node.js standalone (sin deps de Electron) que opera directamente sobre los `.md`. Comandos:
`add`, `new`, `list`, `get`, `delete`, `rename`, `sections`, `favorite` (alias `pin`), `archive`, `groups`,
`group create/delete`, `login`, `logout`, `push`, `pull`/`update`, `status`, `self-update`.
Detalle completo en `cli/noteflow-cli/SKILL.md` (y skill `noteflow-cli`).

## Temas

14 temas en `src/lib/themes.ts` (cada uno = set de CSS vars). Default: `noteflow-dark`.
Los temas de marca **NoteFlow Dark** (default) y **NoteFlow Light** espejan los colores de la
landing real ("The Brain" design system, `docs/src/styles/brain-site.css` — NO el `tokens.css`
sin usar): superficies casi negras cálidas (`#0c0c11`) / pergamino (`#E7DFCC`), tinta blanco-cálida
(`#ECEAE0`) y el acento ámbar firma `--detail` (`#f5a623`, hover/realces de la web) + teal/verde/
púrpura/cyan/rosa/rojo de la web. Ambos usan la fuente Space Grotesk. Resto —
Dark: Tokyo Night, Midnight Blue, Carbon, VS Code Dark, Dracula, True Godot, GruvBox Dark,
Obsidian, Emerald Forest, Synthwave. Light: Arctic Day, Parchment. El tema se persiste en
`settings.json` (`theme`) y se lee de forma síncrona al arrancar (`settings:get-theme`); usuarios
existentes conservan el suyo, los nuevos arrancan en `noteflow-dark`.

## Proceso de release

### Preparación obligatoria antes del release

1. **Compilar `dist-electron/`** si se tocó `electron/` — ese directorio está **commiteado**:
   ```bash
   npm run build
   ```
   Incluir `dist-electron/main.js` y `dist-electron/preload.js` en el commit.

2. **Actualizar versión** (el workflow también la sincroniza desde el tag, pero hacerlo antes
   evita que `package.json` quede desfasado en el repo):
   ```bash
   npm pkg set version=X.Y.Z
   ```

3. **Verificar identidad git** si la máquina no tiene config global:
   ```bash
   git config user.email "<tu-email>"
   git config user.name "<tu-usuario>"
   ```

### Flujo completo

```bash
npm run build                     # 1. compilar si hay cambios en electron/
npm pkg set version=X.Y.Z         # 2. versión
git add src/ electron/ dist-electron/ package.json   # 3. commit
git commit -m "feat/fix: descripción"
git push origin main
git tag vX.Y.Z                    # 4. tag → dispara el workflow de release
git push origin vX.Y.Z
```
- Antes de hacer push a `main` revisar que las skills .claude\skills están actualizadas con los nuevos cambios que se suben (solamente en caso apropiado de ser un cambio a la altura de ser añadido a estas skills).
- Los mensajes de commits deben estar escritos en inglés.

> Al hacer push a `main` puede aparecer `Bypassed rule violations for refs/heads/main: Changes
> must be made through a pull request`. Es una protección de rama bypasseable por el propietario;
> el push se completa igualmente.

### Qué hace el workflow (`.github/workflows/release.yml`)

Se dispara con tags `v*`. Dos jobs:

1. **build** (matrix `windows-latest` + `ubuntu-latest` + `macos-14`):
   - checkout → setup Node 20 → `npm ci`
   - deriva y valida la versión del tag (`vX.Y.Z` → `APP_VERSION`)
   - sincroniza `package.json` (`npm pkg set version=...`) y verifica que coincida
   - `npm run dist` (electron-builder) con `env CSC_IDENTITY_AUTO_DISCOVERY=false` (en macOS fuerza
     firma **ad-hoc** sin Developer ID — necesario para arrancar en Apple Silicon; inofensivo en win/linux)
   - sube artefactos por plataforma (`release-win`, `release-linux`, `release-mac`)
2. **release** (ubuntu, tras build): descarga los tres artefactos y crea el GitHub Release con
   `generate_release_notes: true`, publicando:
   - Windows: `*.exe`, `*.exe.blockmap`, `latest.yml`
   - Linux: `*.deb`, `*.AppImage`, `*.pkg.tar.zst`, `latest-linux.yml`
   - macOS: `*.dmg`, `*.dmg.blockmap`, `latest-mac.yml`
   - `prerelease: contains(github.ref_name, '-')` → un tag con sufijo (p. ej. `vX.Y.Z-mac.1`) sale como
     **prerelease** y el updater in-app (`/releases/latest`) lo ignora — útil para probar macOS sin
     empujarlo a los usuarios actuales.

> Los `.blockmap` / `latest*.yml` son metadatos de electron-builder (canal de updates); aunque
> el auto-update in-app actual descarga el instalador a mano, conviene seguir publicándolos.

### Artefactos

- **Windows:** `NoteFlow-X.Y.Z-Setup.exe` (NSIS) — añade `resources\cli` al PATH del usuario.
- **Linux (Debian/Ubuntu/Mint):** `noteflow_X.Y.Z_amd64.deb` — setuid del sandbox + symlink
  `noteflow` en `/usr/local/bin`.
- **Linux (Arch/CachyOS/Manjaro):** `noteflow-X.Y.Z-x86_64.pkg.tar.zst` (target `pacman` de
  electron-builder). Hay además un `PKGBUILD` en la raíz para build manual/AUR (usa `electron` del
  sistema y `NOTEFLOW_NATIVE=1`); licencia `LicenseRef-FSL-1.1-Apache-2.0`.
- **Linux (universal):** `NoteFlow-X.Y.Z-x86_64.AppImage` — funciona en cualquier distro.
- **macOS (Apple Silicon):** `NoteFlow-X.Y.Z-arm64.dmg` — **sin firmar/notarizar** (firma ad-hoc).
  Gatekeeper avisa en el primer arranque; el usuario hace right-click → Open o
  `xattr -dr com.apple.quarantine /Applications/NoteFlow.app`. Solo arm64 (sin Intel). El CLI viaja en
  `NoteFlow.app/Contents/Resources/cli/noteflow.js` pero **NO se enlaza al PATH automáticamente** (el
  dmg no tiene hooks de instalación) — symlink manual documentado en el README. Icono: `public/icon.icns`
  (generado por `scripts/gen-icons.cjs` con sharp; regenerar si cambia `public/icon.png`).
- Salida: `release/`.

### Convención de versiones
`vX.Y.Z` estable. Patch = bugfixes; Minor = features; Major = cambios de arquitectura.

## Config electron-builder (en `package.json`)

```json
"build": {
  "appId": "dev.noteflow.notes",
  "productName": "NoteFlow",
  "directories": { "output": "release" },
  "win":   { "target": "nsis", "icon": "public/icon.ico",
             "artifactName": "${productName}-${version}-Setup.${ext}" },
  "nsis":  { "include": "build/nsis-include.nsh" },
  "mac":   { "target": [{ "target": "dmg", "arch": "arm64" }], "icon": "public/icon.icns",
             "category": "public.app-category.productivity", "darkModeSupport": true,
             "hardenedRuntime": false, "artifactName": "${productName}-${version}-${arch}.${ext}" },
  "linux": {
    "target": ["deb", "appimage", "pacman"], "category": "Utility", "icon": "public/icon.png",
    "desktop": { "entry": { "Name": "NoteFlow", "Comment": "Fast notes for software engineers",
                            "Keywords": "notes;markdown;text;", "Categories": "Utility;TextEditor;" } }
  },
  "deb": {
    "depends": ["libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6", "xdg-utils",
                "libatspi2.0-0", "libdrm2", "libgbm1", "libxkbcommon0"],
    "afterInstall": "build/linux-postinstall.sh",
    "afterRemove":  "build/linux-postremove.sh"
  },
  "pacman": {
    "depends": ["gtk3", "libnotify", "nss", "libxss", "libxtst", "xdg-utils",
                "at-spi2-core", "libdrm", "libxkbcommon", "alsa-lib"],
    "packageName": "noteflow"
  },
  "extraResources": [
    { "from": "cli/noteflow.js",  "to": "cli/noteflow.js" },
    { "from": "cli/noteflow.cmd", "to": "cli/noteflow.cmd" }
  ],
  "asarUnpack": [
    "**/node_modules/better-sqlite3/**", "**/node_modules/bindings/**",
    "**/node_modules/file-uri-to-path/**", "**/node_modules/sqlite-vec/**",
    "**/node_modules/sqlite-vec-*/**", "**/node_modules/onnxruntime-node/**"
  ],
  "files": ["dist/**/*", "dist-electron/**/*"]
}
```

> **Deps nativas de la IA:** los binarios (`better-sqlite3`, `onnxruntime-node`, `sqlite-vec`) no
> pueden ir dentro del `.asar`, de ahí `asarUnpack`. Y `package.json` lleva
> `"postinstall": "electron-builder install-app-deps"` para recompilarlos al ABI de Electron tras
> cada install. Ver "Índice semántico local" arriba.

> **Nota (electron-builder 26+):** las props del `.desktop` de Linux van dentro de
> `desktop.entry`, NO directamente en `desktop`. Error conocido que rompió el release en v1.2.3.

## Landing page (GitHub Pages)

Servida directamente desde la carpeta `/docs` en `main` (sin workflow propio). Archivos:
`docs/index.html` (landing), `docs/cli.html` (referencia CLI), `docs/mobile-privacy-policy.html`,
`docs/style.css`, `docs/main.js`, `docs/sitemap.xml`, `docs/robots.txt`, `docs/screenshots/`.
URL: https://yagoid.github.io/noteflow/. Actualizarla al añadir features visibles o screenshots.

## Tareas frecuentes

### Estado de un workflow / release
```bash
gh run list --limit 5
gh run view <run-id> --log-failed
gh release list
gh release view vX.Y.Z
```

### Re-crear un tag si falla el release
```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
git tag vX.Y.Z
git push origin vX.Y.Z
```

### Añadir un canal IPC nuevo (checklist)
1. `electron/main.ts` → `ipcMain.handle/on`.
2. `electron/preload.ts` → método en `api` + tipo.
3. `src/types/index.ts` → firma en `window.noteflow`.
4. `npm run build` (recompila `dist-electron/`) e incluirlo en el commit.

### Tras una feature importante
Actualizar **esta skill** (arquitectura/IPC/release) y **`noteflow-features`** (UX/atajos). Si
toca el CLI, también `cli/noteflow-cli/SKILL.md`. Si es visible, revisar `docs/` y el `README.md`.
