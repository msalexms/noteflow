# NoteFlow — GitHub Sync

### Interfaz `SyncProvider` (`electron/syncProvider.ts`) — fase 4.2, tramo 2

`main.ts` **no llama a `githubSync` en duro** en el flujo de escritura de notas: enruta por
`getActiveSyncProvider()`, que devuelve el backend activo — **NoteFlow Cloud si
`settings.cloudSync.enabled` (prioridad), GitHub en caso contrario**. Son **mutuamente
excluyentes**: esta función es la única fuente de verdad (el tick del autosync de GitHub se salta
si Cloud está habilitado), y la página Settings → Sync lo comunica visualmente (aviso "paused"
en la sección GitHub con Cloud activo — tramo 4, ver `monetization.md` § 4 "Settings UI").

Superficie (extraída de lo que `main.ts` consumía de `githubSync.ts`; ambos adapters son finos y
delegan 1:1 sin cambiar comportamiento): `isConnected()`, `schedulePush(relPath, content,
onStart?, onComplete?)`, `pushPathsNow(notesDir, relPaths)`, `scheduleDelete(relPath)`,
`scheduleDeleteDir(dir)`, `pullNotes(notesDir)` (mismo shape de resultado en ambos),
`retrySyncJournal(notesDir)`, `hasPendingRemoteMutations()`. Lo específico de cada backend
(Device Flow, migración remota v2, claves E2EE/unlock) queda FUERA de la interfaz — sus IPC
propios llaman a los módulos directamente.

**Botón de sync de la titlebar** (`TitleBar.tsx`): NO está cableado a GitHub. Consume
`sync:get-active-status` (helper `getActiveSyncStatus()` en `syncProvider.ts`, espejo de
`getActiveSyncProvider()`) → status normalizado y etiquetado con `backend` (`'github'|'cloud'|'none'`),
y su pull manual va por `sync:pull-active` (Cloud si `enabled`, GitHub si no). El botón se muestra
cuando CUALQUIER backend está `active` (antes solo con GitHub conectado → un usuario solo-Cloud se
quedaba sin sync manual), se suscribe a `sync:status-changed` **y** `cloud:status-changed`, y ramifica
el tooltip por backend (owner/repo en GitHub; "NoteFlow Cloud · última sync"/claves bloqueadas en Cloud).
El indicador "pushing" (`sync:push-state`) sigue siendo solo de GitHub; Cloud refresca vía su
status-changed. `sync:pull` (GitHub puro) se mantiene intacto para Settings → Sync.

**Cloud Sync** (`electron/cloudSync.ts`, mismo modelo y regla de conflicto que GitHub pero
contra Supabase con E2EE, tombstones en vez de borrado por ausencia, sin cola de mutaciones y
con pull incremental por `updated_at`): detalle completo en `monetization.md` § 4. Su journal
reutiliza las transiciones puras de `syncState.ts` en un fichero PROPIO
(`userData/cloud-sync-state.json`) — nunca el `sync-state.json` de GitHub.

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
  Cada push se apunta en el **journal** (abajo) al armar el timer y se da de baja al completar;
  un push fallido setea `syncError` y queda journaled para que `retrySyncJournal` lo reintente
  (antes se perdía hasta que el usuario reeditara).
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
  lleva paths de DIRECTORIOS. **Coste:** el pull NO hace un GET por nota — si el blob-sha del
  `note.md` en el tree coincide con el último reconciliado (sha cache, abajo) la carpeta se salta
  sin ninguna request; solo las carpetas con sha nuevo pagan el GET del ancla + comparación de
  `updated`. El **journal** (abajo) además guarda al pull de los agujeros de datos: se salta dirs
  remotos con `deleteDir` pendiente y ficheros con `delete` pendiente (no resucitar borrados que
  aún no aterrizaron), y la regla de borrado local se salta cualquier dir con `upsert` pendiente
  (su push no aterrizó; borrarlo sería pérdida de datos).
- **Metadata:** `METADATA_FILENAMES` = groups.json, **folders.json**, section-colors.json,
  **note-order.json**, templates.json (los dos en negrita se pusheaban pero NO se pulleaban — bug
  arreglado con el cambio de formato). `templates.json` (plantillas de nota) sigue el mismo patrón
  simple que note-order: push debounced + pull.
- **Autosync:** cada 5 min (`AUTO_SYNC_INTERVAL_MS`) mientras esté conectado: primero drena el
  journal (`retrySyncJournal`), luego pull (que se pospone si quedan mutaciones en vuelo).
- **Delete:** `scheduleDelete(relPath)` (sección suelta) y `scheduleDeleteDir(dir)` (lista el
  árbol y borra cada blob bajo `<dir>/`; usado por borrar nota y notas expiradas). Ambos se
  journalan antes de ejecutarse y en fallo setean `syncError` y QUEDAN en el journal para retry
  (sin tope de intentos: un borrado remoto perdido = nota que resucita en el siguiente pull).
- **Journal + sha cache (`electron/syncState.ts` + `userData/sync-state.json`):** estado LOCAL de
  durabilidad (deliberadamente fuera del dir de notas — no debe sincronizarse; se limpia en
  `disconnectGitHub()`; corrupto/ausente degrada a estado vacío, nunca bloquea el sync). Dos mapas:
  - **`ops` (journal de mutaciones remotas pendientes):** cada push debounced se apunta como
    `upsert` **al armar el timer** (sobrevive a cerrar la app durante el debounce) — keyed por
    relPath; `scheduleDelete`/`scheduleDeleteDir` como `delete`/`deleteDir` (este último descarta
    los ops de fichero bajo el dir). Baja al completar con éxito; en fallo queda (`attempts++`).
    `retrySyncJournal(notesDir)` lo drena: upserts releen el contenido ACTUAL de disco (si el
    fichero local ya no existe, se descarta la entrada — el borrado lo cubre su propia entrada),
    deletes se re-ejecutan; **no bumpea `lastSync`** (mismo motivo que `pushPathsNow`). Lo llama
    `main.ts` en cada tick del autosync ANTES de `pullNotes` y tras el pull inicial OK; gated por
    `initialPullStatus === 'ok'`. Semántica LWW conservada: si un dir con upsert pendiente viene
    MÁS NUEVO del remoto, el pull lo sobrescribe entero y el retry sube después lo que haya en disco.
  - **`shas` (cache de blobs reconciliados):** relPath del ancla (`<dir>/note.md`) o del metadata →
    blob-sha del tree ya reconciliado. Se escribe tras cada decisión del pull (tanto si pulleó como
    si ganó lo local) y permite el skip sin GET; se poda a los paths presentes en el tree.
    Los `METADATA_FILENAMES` usan el mismo cache (solo GET cuando el sha del tree difiere).
    La lógica de transiciones/decisiones es pura en `syncState.ts` (sin imports de Electron, patrón
    `entitlements.ts`) y está cubierta por `tests/electron/syncState.test.ts`.
- **⚠️ Serialización de mutaciones remotas (INVARIANTE — leer antes de tocar el sync):** la
  Contents API de GitHub **commitea de una en una por rama** (cada PUT/DELETE mueve el HEAD), así
  que dos escrituras/borrados **concurrentes** chocan con un `409/422` por SHA obsoleto. Por eso
  **TODA** mutación remota pasa por una **única cola** (`enqueueMutation` en `githubSync.ts`):
  `upsertRemoteFile`/`removeRemoteFile` son wrappers finos que encolan su trabajo real (`*Now`) y se
  ejecutan **estrictamente secuencialmente**. **Cualquier write/delete remoto nuevo DEBE ir por
  estos dos puntos** (nunca llamar a `githubRequest` con PUT/DELETE en paralelo ni saltarse la
  cola). Ambos **reintentan una vez** ante conflicto (re-fetch del SHA) y tratan `404` como "ya no
  está" (éxito); **nunca traguen un error de borrado en silencio** — si falla, registrar `syncError`
  Y dejarlo en el **journal** para retry (un borrado remoto perdido hace que la nota **reaparezca**
  en el siguiente pull). Además el
  auto-sync pull **se pospone** si `hasPendingRemoteMutations()` (no rehace una nota cuyo borrado
  remoto aún está en cola). Histórico: un borrado/edición múltiple (p. ej. batch en la group
  overview) disparaba N mutaciones concurrentes → 409s silenciosos → notas restauradas; de ahí la
  cola. Mantener este patrón al añadir operaciones que toquen el remoto (notas, grupos, carpetas,
  metadatos).
- **Repo:** se crea automáticamente con `private: true` + `auto_init: true` si no existe.
- **initialPullStatus** (`pending|ok|failed`) gatea pushes hasta que el primer pull tenga éxito.
  `flushPendingLocalChanges` re-encola la carpeta entera cuando `note.md updated > lastSync`.
- **Migración remota:** `migrateRemoteToV2IfNeeded(notesDir)` — ver "Migración v1 → v2".
