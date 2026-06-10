---
name: noteflow-context
description: Contexto completo del proyecto NoteFlow — app de escritorio de notas rápidas para Windows/Linux. Úsala cuando el usuario quiera trabajar con este proyecto: añadir features, corregir bugs, hacer releases, entender la arquitectura, modificar el workflow de CI/CD o interactuar con el repositorio de GitHub.
---

# NoteFlow — Guía del proyecto

> **Mantenimiento de las skills (LEER PRIMERO):** Cuando se implemente una funcionalidad
> importante o se cambie la arquitectura, **actualizar las dos skills** al cerrar el trabajo:
> esta (`noteflow-context`, arquitectura/IPC/release) y `noteflow-features` (UX/diseño/atajos).
> Si la feature toca el CLI, actualizar también `cli/noteflow-cli/SKILL.md`. Mantenerlas al
> día es lo que hace que la próxima sesión arranque con contexto correcto.

## Repositorio y proyectos relacionados

- **GitHub:** https://github.com/yagoid/noteflow
- **Rama principal:** `main`
- **Directorio local:** raíz del repo clonado (la ruta absoluta varía por máquina).
- **Versión actual:** ver `package.json` (`version`). Convención `vX.Y.Z`.
- **Licencia:** `GPL-3.0-or-later` (GNU General Public License v3.0 — copyleft estándar). Antes fue
  MIT y luego `FSL-1.1-Apache-2.0`. El `package.json` lleva el campo `license` y el
  `PKGBUILD` usa `GPL-3.0-or-later`.
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
│   ├── githubSync.ts    # Sync con GitHub (Device Flow OAuth, push/pull, cifrado token)
│   └── ai/              # Índice semántico local ("El Cerebro" Fase 1)
│       ├── protocol.ts  #   Tipos de mensajes worker↔main + constantes (modelo, schema)
│       ├── aiIndex.ts   #   Lifecycle del worker en el main (fork/respawn, debounce, API)
│       └── aiWorker.ts  #   utilityProcess: embeddings (Transformers.js) + SQLite index
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
│   │   └── aiStore.ts                # Estado de la IA (enabled, related, progreso) vía IPC ai:*
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── Editor.tsx               # Instancia TipTap, conversión md↔html
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
│   │   ├── Brain/                       # Vista cerebro ("El Cerebro" Fase 2 — grafo de notas)
│   │   │   ├── BrainView.tsx            #   Orquestador full-screen + toolbar + CTA de activación IA
│   │   │   ├── BrainCanvas.tsx          #   <canvas> 2D: dibujo, pan/zoom/drag, hover, click→navega
│   │   │   ├── useBrainGraph.ts         #   Modelo: nodos (grupo/carpeta/nota) + 2 capas de aristas
│   │   │   ├── useForceLayout.ts        #   Simulación d3-force (estructura firme + contenido débil)
│   │   │   └── brainColors.ts           #   Resuelve CSS vars del tema → RGB para el canvas
│   │   ├── NoteCard/                    # Tarjeta de nota en sidebar
│   │   ├── TitleBar.tsx                 # Barra de título personalizada (frameless)
│   │   ├── TitleBarMenu.tsx            # Menú desplegable del titlebar
│   │   ├── CommandPalette/             # Paleta de comandos
│   │   ├── KeyboardShortcutsModal.tsx  # Modal con lista de atajos
│   │   ├── StartupSettingsModal.tsx    # Modal: autostart + stickies al arrancar
│   │   ├── ConfirmModal.tsx            # Modal de confirmación genérico
│   │   ├── EncryptionModal.tsx         # Modal cifrar/descifrar notas
│   │   ├── ExportImportModal.tsx       # Modal exportar/importar notas
│   │   ├── GitHubSyncModal.tsx         # UI conectar/desconectar GitHub, status, pull
│   │   └── StickyApp.tsx               # Ventana sticky flotante (fold/unfold)
│   ├── lib/
│   │   ├── noteUtils.ts          # parseNote, serializeNote, extractTags, default title…
│   │   ├── cryptoUtils.ts        # Cifrado AES-256-GCM + PBKDF2 (WebCrypto)
│   │   ├── alarmUtils.ts         # Recolección de alarmas/deadlines para programarlas
│   │   ├── searchUtils.ts        # Helpers de búsqueda (normalización, matching)
│   │   ├── tagColors.ts          # getTagColor — color por nombre de tag (8 colores)
│   │   └── themes.ts             # Definición de los 12 temas (CSS vars)
│   └── types/
│       └── index.ts             # Tipos TS + declaración global window.noteflow
├── dist-electron/         # Output compilado de electron/ (COMMITEADO — incluir en commits)
├── docs/                  # Landing page (GitHub Pages, servida desde /docs en main) — solo HTML/assets
├── public/                # Iconos, assets estáticos
├── release/               # Output de electron-builder (gitignored)
├── PKGBUILD               # Build manual/AUR del paquete Arch (electron del sistema, NOTEFLOW_NATIVE)
└── .github/workflows/
    └── release.yml        # CI/CD: build matrix (win+linux) + release al pushear un tag
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
| `fs:read-all-notes` | handle | Lee TODAS las notas en una sola llamada (batch, con reintentos) |
| `fs:list-notes` | handle | Lista metadatos de archivos `.md` |
| `fs:read-note` | handle | Lee un archivo concreto (path saneado) |
| `fs:write-note` | handle | Escribe nota + broadcast + schedulePush a GitHub |
| `fs:delete-note` | handle | Borra nota + broadcast + scheduleDelete en GitHub |
| `fs:rename-note` | handle | Renombra archivo |
| `fs:notes-dir` | handle | Devuelve ruta del dir de notas |
| `app:open-notes-folder` | handle | Abre la carpeta en el explorador |
| `app:choose-notes-dir` | handle | Diálogo para elegir carpeta |
| `app:get-login-item` / `app:set-login-item` | handle | Autostart al login (gestiona `.desktop` propio en Linux) |
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
| `ai:search` | handle | Búsqueda semántica híbrida (vector + FTS5, RRF). Sin UI aún — para Fase 3 (RAG) |
| `ai:graph` | handle | Aristas de contenido nota-a-nota (centroides por nota + coseno) para la vista cerebro (Fase 2) |
| `ai:reindex-all` | handle | Reindexa TODAS las secciones en background (lotes de 16) con progreso |

**Eventos main → renderer** (suscripción vía `window.noteflow.on*`):
`new-note`, `notes-updated` (filePath?, senderId?), `update:download-progress` (percent),
`update:installing` (fase de instalación, post-descarga),
`sync-auth-complete`, `sync:push-state` (`'pushing'|'idle'`), `sync:status-changed`,
`ai:reindex-progress` (`{done,total}`), `ai:index-state` (estado del índice).

### Modelo de almacenamiento

**Notas y datos sincronizables** viven en el dir de notas (todo se sube a GitHub si hay sync):

| Plataforma | Ruta |
|---|---|
| Windows | `~/noteflow-notes/` |
| Linux | `~/.local/share/noteflow-notes/` (XDG; migración automática desde `~/noteflow-notes` y `~/scratch-notes`) |

Contenido del dir de notas:
- `*.md` — una nota por archivo.
- `groups.json` — definición de grupos (`{id,name,color,order,archived?}`; `archived?` oculta el
  grupo y sus notas salvo con "Show archived").
- `folders.json` — definición de carpetas (subcarpetas de grupos).
- `section-colors.json` — mapa `nombreSección(normalizado) → color CSS var`.
- `note-order.json` — orden manual de notas por contexto (`Record<contextKey, string[]>`); contextKey: `'ungrouped'`, `'group:<id>'`, `'folder:<id>'`, `'favorites'`. Gestionado desde `groupsStore` (`noteOrder`, `setContextNoteOrder`).

> El dir es configurable desde Settings → "Choose notes directory".

**Ajustes locales (NO se sincronizan)** en `settings.json`:
- **Windows:** `%APPDATA%\noteflow\settings.json`
- **Linux:** `~/.config/noteflow/settings.json`
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
  }
}
```

> **Importante:** grupos/carpetas/colores de sección NO están en `settings.json` — están en
> archivos JSON dentro del dir de notas para poder sincronizarse entre dispositivos.

## Formato de archivos de nota

El cuerpo tras el frontmatter es **el contenido de la primera sección** (legible en editores
externos). El resto de secciones viven solo en el frontmatter. Fuente de verdad:
`src/lib/noteUtils.ts` (`parseNote` / `serializeNote`).

```markdown
---
id: abc12345
title: "Mi nota"
tags: [javascript, react]
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-02T00:00:00.000Z
group: grp001        # opcional — id de NoteGroup
folder: fld001       # opcional — id de NoteFolder (requiere group)
expiresAt: 2026-01-03T00:00:00.000Z   # opcional — nota temporal (autoborrado)
sections:
  - id: sec001
    name: Note
    content: |
      Contenido de la primera sección
    isRawMode: true   # true = markdown/raw, false/ausente = rich text (TipTap HTML)
  - id: sec002
    name: Tasks
    content: |
      - [ ] tarea pendiente
archived: true    # solo presente si true
favorited: true   # solo presente si true
---
Contenido de la primera sección
```

Notas **cifradas** no llevan `sections` legibles; en su lugar:
```yaml
encryption:
  alg: aes-256-gcm+pbkdf2
  salt: <base64url>
  iv: <base64url>
  ciphertext: <base64url>
  iterations: 310000   # omitido si es el default
  hashAlg: SHA-256     # omitido si es el default
```

- Título por defecto de una nota nueva: `DD/MM/YYYY`.
- Sección por defecto: una sola llamada `Note` en modo raw.
- Tags se extraen del contenido con `#nombre` (`extractTags`).

## Patrones y decisiones de arquitectura

### Carga de notas en batch
`loadNotes()` usa `fs:read-all-notes` (un solo IPC, con reintentos ante FS no listo en Windows
al despertar/arrancar). Crítico para el tiempo de arranque con muchas notas.

### Vista de grupo (group overview)
`notesStore` tiene `groupViewId: string | null` + `setGroupView(id)`. Cuando no es `null`,
`App.tsx` renderiza `GroupOverview` en lugar del editor/paneles (sidebar y TitleBar siguen
montados). `setActiveNote()` limpia `groupViewId` (seleccionar cualquier nota cierra la vista y
devuelve el editor). El componente reutiliza `useSidebarGroups` y `updateNote({group,folder})`
para reorganizar por drag&drop. La navegación a una sección concreta usa `pendingInitialSectionId`
+ un `noteflow:request-section` diferido con `setTimeout(0)` (el editor monta tras cerrar la vista;
bajo StrictMode el efecto de montaje consume el `pending` dos veces, de ahí el re-aviso por evento).
El ancho de tarjeta se guarda en `localStorage` (`noteflow:group-view-card-width`). Sin IPC nuevo.

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
- **Push:** `schedulePush(filePath, content, onStart?, onEnd?)` — debounce ~3s por archivo;
  llamado desde `fs:write-note`, `groups:set`, `folders:set`, `section-colors:set`, `note-order:set`. Los
  callbacks alimentan `pendingPushFiles` → evento `sync:push-state` (indicador de subida).
- **Pull:** `pullNotes(notesDir)` — compara `updated:` del frontmatter; solo sobreescribe si el
  remoto es más nuevo. Devuelve `{ pulled, deleted, updatedFiles, hadDeletions, hadMetadataChanges }`.
  Se ejecuta al arrancar (bloqueante hasta 10s en modo startup) y vía `sync:pull`.
- **Autosync:** pull cada 5 min (`AUTO_SYNC_INTERVAL_MS`) mientras esté conectado.
- **Delete:** `scheduleDelete(filePath)` — cancela push pendiente y elimina en GitHub.
- **Repo:** se crea automáticamente con `private: true` + `auto_init: true` si no existe.
- **initialPullStatus** (`pending|ok|failed`) gatea pushes hasta que el primer pull tenga éxito,
  para no sobreescribir el remoto con datos locales obsoletos.

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
`app:download-and-install` descarga el artefacto con una **allowlist estricta de hosts**
(github.com + objects/release-assets de githubusercontent.com) y de extensiones (`.exe`, `.deb`,
`.AppImage`, `.pkg.tar.zst`), emite `update:download-progress` durante la descarga y
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

> **Pendiente de verificar** en build empaquetado real (Win silent + AppImage in-place): probado
> de momento solo a nivel de compilación/typecheck.

`NOTEFLOW_NATIVE=1` (lo setea el wrapper
del PKGBUILD) hace que la app trate la instalación nativa de Arch como `isPackaged` para rutas de
iconos y modo no-dev.

### Cifrado de notas (`src/lib/cryptoUtils.ts`)
AES-256-GCM + PBKDF2 (310.000 iteraciones por defecto, SHA-256) vía WebCrypto. La nota cifrada
guarda solo el bloque `encryption`; sin contraseña no hay secciones legibles. Sin master key ni
backdoor.

### Índice semántico local — "El Cerebro" Fases 1-2 (`electron/ai/`, `src/components/Brain/`)
Subsistema de IA **100% local/offline** que indexa cada **sección** de cada nota como un
**embedding** (vector). El índice es un **artefacto derivado y reconstruible** desde los `.md` (si
se borra, se regenera). Plan maestro "El Cerebro": Fase 1 (índice + panel "Related notes", hecha)
→ **Fase 2 (vista cerebro/grafo, hecha)** → Fase 3 (chat RAG) → Fase 4 (nube/monetización).
**Principio: un índice, tres consumidores** (related ✅, grafo ✅, chat). Plan de Fase 2:
`C:\Users\yagoi\.claude\plans\vamos-a-planificar-la-peaceful-manatee.md`.

- **3 procesos:** renderer (`aiStore` + `RelatedNotesPanel`) → main (`aiIndex`, lifecycle +
  debounce + progreso) → **`utilityProcess`** (`aiWorker`, no bloquea el main).
- **Worker (`aiWorker.ts`):** embeddings con **Transformers.js** (`@huggingface/transformers`,
  runtime `onnxruntime-node` nativo, cuantización q8→fp32 fallback) + índice **SQLite**
  (`better-sqlite3`) con vectores (`sqlite-vec`, tabla `vec0`) y texto (`FTS5`). **Las notas
  cifradas se omiten** (no entra texto plano al índice).
- **DB:** `userData/ai-index/index.db` (en dev `userData` = `.electron-dev/`). **Fuera del dir de
  notas** → NO se sincroniza a GitHub. Tablas: `notes`, `chunks`, `vec_chunks` (vec0),
  `fts_chunks` (FTS5), `meta` (modelId/dim/schemaVersion). Dimensión **dinámica** (detectada del
  modelo); cambiar `settings.ai.modelId` o el schema dispara **reindex automático**.
- **Modelo por defecto:** `Xenova/paraphrase-multilingual-mpnet-base-v2` (768-d), elegido por
  benchmark sobre las notas reales (ES+EN+código). Se descarga en el primer uso a
  `userData/ai-models`. Alternativa rápida: `paraphrase-multilingual-MiniLM-L12-v2` (384-d).
- **Indexado incremental:** enganchado a `fs:write-note` (`aiIndex.scheduleIndex`, debounce 2.5s)
  y `fs:delete-note` (`removeFromIndex`); hash por sección para no re-embeber lo que no cambió.
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
  `setActiveNote` lo cierra). Render `d3-force` (layout) + `<canvas>` 2D propio (pan/zoom/drag/hover,
  click en nota → `openSection` con el baile `pendingInitialSectionId`+`noteflow:request-section`).
  Dos capas de aristas: estructura sólida (color de grupo) + contenido tenue (resaltada al
  seleccionar/hover, con toggle). Excluye notas archivadas/cifradas/temporales. Smoke headless:
  `scripts/ai-graph-smoke.cjs`.
- **Activación:** flag `settings.ai.enabled` (default `false`). **UI definitiva de activación: el
  overlay/CTA dentro de la vista cerebro** (con IA off el cerebro muestra solo estructura; activar
  desde ahí descarga el modelo + reindexa con barra de progreso). Queda además el toggle temporal
  "Local AI" en el menú del TitleBar. Arranque del worker diferido ~4s tras el boot (`primeSettings`).
- **Deps nativas (IMPRESCINDIBLE):** `better-sqlite3` + `onnxruntime-node` + `sqlite-vec` son
  binarios nativos. `package.json` lleva **`"postinstall": "electron-builder install-app-deps"`**
  (recompila para el ABI de Electron tras cada `npm install`) y entradas en **`build.asarUnpack`**.
  Si el worker sale con "exited before init (code 1)": `npx @electron/rebuild -f -o better-sqlite3`.
- **Deps de la Fase 2:** `d3-force` (+ `@types/d3-force`) — JS puro, sin binario nativo (no toca
  `asarUnpack` ni el `postinstall`).
- **Scripts (`scripts/`):** `ai-smoke.cjs` (test e2e headless related/search), `ai-graph-smoke.cjs`
  (test del grafo: clusters por contenido), `ai-inspect.cjs` (inspecciona la DB real), `ai-bench.cjs`
  (benchmark de modelos → `scripts/bench-out/REPORT.md`). Ejecutar con
  `unset ELECTRON_RUN_AS_NODE; npx electron scripts/ai-smoke.cjs`.
- **Pendiente:** probar el **build empaquetado** (`npm run dist`) en Win/Linux — validar que
  `asarUnpack` y la descarga del modelo funcionan en el instalado (NO verificado aún). Fase 2:
  **detalle progresivo** (expandir secciones como sub-nodos al seleccionar/zoom) está **diferido**
  (los labels de notas ya aparecen al hacer zoom).

### CLI companion (`cli/noteflow.js`)
Node.js standalone (sin deps de Electron) que opera directamente sobre los `.md`. Comandos:
`add`, `new`, `list`, `get`, `delete`, `rename`, `sections`, `favorite` (alias `pin`), `archive`, `groups`,
`group create/delete`, `login`, `logout`, `push`, `pull`/`update`, `status`, `self-update`.
Detalle completo en `cli/noteflow-cli/SKILL.md` (y skill `noteflow-cli`).

## Temas

12 temas en `src/lib/themes.ts` (cada uno = set de CSS vars). Default: `carbon`.
Dark: Tokyo Night, Midnight Blue, Carbon, VS Code Dark, Dracula, True Godot, GruvBox Dark,
Obsidian, Emerald Forest, Synthwave. Light: Arctic Day, Parchment. El tema se persiste en
`settings.json` (`theme`) y se lee de forma síncrona al arrancar (`settings:get-theme`).

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

> Al hacer push a `main` puede aparecer `Bypassed rule violations for refs/heads/main: Changes
> must be made through a pull request`. Es una protección de rama bypasseable por el propietario;
> el push se completa igualmente.

### Qué hace el workflow (`.github/workflows/release.yml`)

Se dispara con tags `v*`. Dos jobs:

1. **build** (matrix `windows-latest` + `ubuntu-latest`):
   - checkout → setup Node 20 → `npm ci`
   - deriva y valida la versión del tag (`vX.Y.Z` → `APP_VERSION`)
   - sincroniza `package.json` (`npm pkg set version=...`) y verifica que coincida
   - `npm run dist` (electron-builder)
   - sube artefactos por plataforma (`release-win`, `release-linux`)
2. **release** (ubuntu, tras build): descarga ambos artefactos y crea el GitHub Release con
   `generate_release_notes: true`, publicando:
   - Windows: `*.exe`, `*.exe.blockmap`, `latest.yml`
   - Linux: `*.deb`, `*.AppImage`, `*.pkg.tar.zst`, `latest-linux.yml`

> Los `.blockmap` / `latest*.yml` son metadatos de electron-builder (canal de updates); aunque
> el auto-update in-app actual descarga el instalador a mano, conviene seguir publicándolos.

### Artefactos

- **Windows:** `NoteFlow-X.Y.Z-Setup.exe` (NSIS) — añade `resources\cli` al PATH del usuario.
- **Linux (Debian/Ubuntu/Mint):** `noteflow_X.Y.Z_amd64.deb` — setuid del sandbox + symlink
  `noteflow` en `/usr/local/bin`.
- **Linux (Arch/CachyOS/Manjaro):** `noteflow-X.Y.Z-x86_64.pkg.tar.zst` (target `pacman` de
  electron-builder). Hay además un `PKGBUILD` en la raíz para build manual/AUR (usa `electron` del
  sistema y `NOTEFLOW_NATIVE=1`); licencia `GPL-3.0-or-later`.
- **Linux (universal):** `NoteFlow-X.Y.Z-x86_64.AppImage` — funciona en cualquier distro.
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
