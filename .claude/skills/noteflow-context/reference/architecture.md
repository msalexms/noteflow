# NoteFlow — Arquitectura, IPC y almacenamiento

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
| `ai:profile-get-status` / `ai:profile-set-completed` | handle | `settings.aiProfile` = `{completedAt, noteId?}` (cuestionario mostrado una vez + id de la nota de perfil generada, para enlazar/regenerar sin duplicar). `set-completed(noteId?)`: sin `noteId` = "Not now" (saltado) |

**Eventos main → renderer** (suscripción vía `window.noteflow.on*`):
`new-note`, `notes-updated` (filePath?, senderId?), `update:download-progress` (percent),
`update:installing` (fase de instalación, post-descarga),
`sync-auth-complete`, `sync:push-state` (`'pushing'|'idle'`), `sync:status-changed`,
`ai:reindex-progress` (`{done,total}`), `ai:index-state` (estado del índice),
`ai:chat-delta` (`{requestId,delta}`), `ai:chat-sources` (`{requestId,sources}`),
`ai:chat-done` (`{requestId,aborted?}`), `ai:chat-error` (`{requestId,error}`),
`ai:chat-tool-call` (`{requestId,toolCallId,name,input,label}` — `label` es la frase en presente
"qué está haciendo" con el objetivo resuelto a título por `agentTools.describeAction`, mostrada en la
fila de actividad mientras la tool corre), `ai:chat-tool-result`
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
  "aiProfile": { "completedAt": "2026-06-14T10:00:00.000Z", "noteId": "abc12345" }
}
```

> **Importante:** grupos/carpetas/colores de sección NO están en `settings.json` — están en
> archivos JSON dentro del dir de notas para poder sincronizarse entre dispositivos. El **historial
> de chats** vive en `userData/ai-chats.json` (local, no se sincroniza); las **API keys del LLM** se
> cifran por proveedor en `settings.aiLlm.byPreset[*].encryptedApiKey` (nunca cruzan al renderer).
