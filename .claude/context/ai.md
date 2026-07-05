# NoteFlow — "El Cerebro" (índice semántico, vista cerebro, LLM/chat, segundo cerebro)

### Índice semántico local — "El Cerebro" Fases 1-2 (`electron/ai/`, `src/components/Brain/`)
Subsistema de IA **100% local/offline** que indexa cada **sección** de cada nota como un
**embedding** (vector). El índice es un **artefacto derivado y reconstruible** desde los `.md` (si
se borra, se regenera). Plan maestro "El Cerebro": Fase 1 (índice + panel "Related notes", hecha)
→ **Fase 2 (vista cerebro/grafo, hecha)** → **Fase 3 (panel IA: chat RAG + segundo cerebro, hecha;
falta verificar en app real)** → **Fase 4 (nube/monetización — diseño cerrado en
`.claude/context/monetization.md`)**. **Principio: un índice, tres
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
    `openSection`. Forzar 2D: `localStorage 'noteflow:brain-force-2d'`. En equipos de pocos recursos
    el cerebro arranca por defecto en 2D y muestra un popup una-vez ofreciendo cambiar a 3D; la
    elección explícita del usuario (o el legacy force-2D) se marca con `localStorage
    'noteflow:brain-3d-chosen'` y ya no vuelve a nudgear.
    La detección de gama baja (`isLowEndDevice` en `brainSettingsStore.ts`) usa **hardware real** del
    proceso Electron: el preload expone `window.noteflow.hardware`, leído de forma **síncrona** en
    carga del preload vía `ipcRenderer.sendSync('app:get-hardware')` (el handler en `main.ts` calcula
    `os.cpus()` + `os.totalmem()`). Debe venir del proceso principal porque el preload corre
    **sandboxed** (default de Electron 35) y ahí `node:os` no existe. La lógica pura vive en `src/lib/hardware.ts`
    (`isLowEndHardware`, testeada en `tests/lib/hardware.test.ts`): marca gama baja si RAM ≤ 4.5 GiB, o
    ≤ 4 núcleos lógicos, o clock base < 2.0 GHz (parseado del modelo `@ x.xxGHz`; NO se usa
    `cpus().speed` porque en Linux reporta la frecuencia actual fluctuante, no el clock base), o el
    modelo es un chip ULV de portátil (sufijo Intel U/Y o AMD serie U). Esto captura portátiles ULV
    tipo i5-8250U (8 hilos, ~7,7 GiB) que la vieja heurística `navigator` (`hardwareConcurrency`/
    `deviceMemory`) no detectaba. Si no hay `window.noteflow.hardware` (contexto sin bridge/tests), cae
    al fallback `navigator` anterior.
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
  una nota de perfil (creada por `notesStore` en el idioma del usuario). **Borrador persistente:** las
  respuestas del wizard viven en `aiChatStore.profileDraft` (no en `useState`) para sobrevivir al
  desmontaje de `ProfileFlow` al cambiar de pestaña (p. ej. ir a Settings a arreglar el proveedor tras un
  fallo y volver). Es **de sesión** (los bytes de los adjuntos viven en la caché del main, también de
  sesión); se limpia (`resetProfileDraft`) tras generar con éxito. **Tras generar:** la pestaña Profile
  muestra `ProfileSummary` (estado "Profile created" con enlace a la nota + "Start over") en vez del wizard
  vacío; `AiPanel` decide por `aiProfile.noteId`. **Regenerar** (Start over → Generate) **reusa la misma
  nota** (`existingNoteId`) en vez de crear un duplicado. **Privacidad/abstracción:**
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
- **Pendiente:** verificación manual en app real (necesita key/Ollama); monetización/nube (Fase 4,
  diseño en `.claude/context/monetization.md`).
