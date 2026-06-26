# NoteFlow — GitHub Sync

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
