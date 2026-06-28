---
name: noteflow-features
description: Funcionalidades, diseño de UI y experiencia de usuario de NoteFlow. Úsala cuando el usuario quiera discutir, mejorar o diseñar features de la app, entender cómo funciona desde la perspectiva del usuario, o planear nuevas capacidades de producto.
---

# NoteFlow — Funcionalidades y Diseño

> **Mantenimiento:** al implementar una feature importante, actualizar esta skill **y** la
> documentación de `.claude/context/` (arquitectura/IPC/release — ver el mapa en `CLAUDE.md`). Si
> toca el CLI, también `cli/noteflow-cli/SKILL.md`. La fuente de verdad de los atajos es
> `src/components/Settings/ShortcutsPanel.tsx`.
>
> **Teclas en macOS:** los atajos se documentan con `Ctrl` (Windows/Linux); en macOS `Ctrl` = **⌘
> (Cmd)** — los handlers aceptan `ctrlKey||metaKey`. Excepción: navegar secciones usa el **Control
> literal (⌃)** porque `Cmd+Tab` es el conmutador del sistema. El renderer resuelve las etiquetas con
> `src/lib/platform.ts` (`modKey`/`controlKey`/`keyLabel`, leyendo `window.noteflow.platform`).
>
> **Idioma de la UI:** todo el texto visible de la app va **en inglés** (labels, botones, placeholders,
> tooltips, errores de UI). El contenido del usuario y las respuestas del LLM van en el idioma del usuario.

## ¿Qué es NoteFlow?

App de escritorio de notas rápidas para Windows/Linux/macOS, orientada a developers. Dark-first, sin
fricciones, accesible desde el system tray en cualquier momento con `Ctrl+Shift+Space`. Notas en
archivos `.md` locales, con sync privado opcional a GitHub y un CLI companion para headless/IA.

---

## Estructura visual de la app

```
┌─ TitleBar (32px) ──────────────────────────────────────────────────┐
│  NOTEFLOW  [🧠 brain] [⬇ update] [☁ sync]        [⚙ settings] [─ □ ×] │
├─ Sidebar (180–480px, redimensionable) ──┬─ Editor area ─────────────┤
│  [🔍 Search...        ] [⮜]            │  [Tabs sección] [⚙]        │
│  [▦ All content]                        │  Título de nota            │
│  ─ Tags ─────────────────────           │  19/03/2026 · 21:00        │
│  [tag1] [tag2] [tag3] ...               │  ──────────────────────── │
│  [+ New note]  [+ New group]            │                            │
│  ─────────────────────────────          │  Contenido (editor)        │
│  favorites                              │                            │
│    NOTEFLOW               20:31 ⭐      │   (Ctrl+Click una nota →   │
│  ─────────────────────────────          │    se abre en paralelo)    │
│  ▼ WORK (grupo)                         │                            │
│    ▼ 📁 Backend (carpeta)               │                            │
│      NOTEFLOW             20:31         │                            │
│         [Urgent][Features]              │                            │
│    Meeting                14:30 ⏱       │                            │
│  ▶ PERSONAL (grupo, colapsado)          │                            │
│  ─ Sin grupo ──────────────────         │                            │
│    Project: Neural Netw…  19/03         │                            │
│  ─────────────────────────────          │                            │
│  ⊞ Show archived       3 notes         │                            │
└─────────────────────────────────────────┴────────────────────────────┘
```

Iconos del TitleBar:
- **⬇ update**: aparece solo si hay una versión nueva; descarga e instala in-app (muestra el %
  de descarga y luego un spinner "Installing…").
- **☁ sync**: estado de GitHub Sync (conectado verde / subiendo girando / error ámbar / off).
- **⚙ settings**: abre la **ventana de Ajustes** (overlay tipo app de settings) con nav izquierda
  + panel derecho. Secciones: **Appearance** (tema/fuente/acento/headings/escala), **Editor**
  (fuente/tamaño/ancho), **Templates** (plantillas de nota), **Startup** (autostart + stickies),
  **Sync** (GitHub), **Data** (export/import + carpeta de notas), **AI**, **Keyboard shortcuts** y
  **About** (versión + updates + repo). Sustituye al antiguo menú desplegable y al botón de paleta (Appearance está
  ahora dentro). Tamaño fijo proporcional a la ventana de la app.
- Controles de ventana: minimizar / maximizar / cerrar (cerrar = ocultar al tray).

---

## Gestión de notas

### Crear
- `Ctrl+N` → nota nueva instantánea.
- `Ctrl+Shift+N` → **nota temporal** (se autoelimina en 24h).
- Botón `+ New note` en el sidebar. **Click derecho** sobre él → "Temporary note (24h)".
- Desde el tray (menú o `New Note`).

### Organizar
- **Favorites** → aparece en la sección "favorites" al top del sidebar (etiqueta pequeña + notas planas). La nota también sigue visible en su grupo si tiene uno. Toggle desde el menú contextual o el botón ⭐ en la toolbar del editor.
- **Drag-to-reorder** → las notas se pueden arrastrar dentro de su contexto (favorites, grupo, carpeta o sin grupo) para fijar un orden manual. El orden persiste en `note-order.json` (sincronizado con GitHub). Una línea indicadora muestra dónde se insertará la nota al soltar.
- **Drag-to-move (entre grupos/carpetas)** → arrastrar una nota y soltarla sobre **otro grupo** (cabecera o cuerpo) la reasigna a la raíz de ese grupo; soltarla sobre una **carpeta** la mueve a esa carpeta. El destino se resalta con un borde/tinte del color del grupo mientras se arrastra. Reordenar dentro del mismo contexto y mover a otro distinto conviven en el mismo gesto (la cabecera de un grupo colapsado también es zona de drop). Equivale a `updateNote({ group, folder })`; sin IPC nuevo.
- **Archive** → se oculta de la lista principal (toggle "Show archived" en footer).
- **Duplicate** → copia completa con todas sus secciones.
- **Open alongside** → abre la nota en paralelo (vista dividida) junto a la actual.
- **Asignar a grupo / carpeta** → drag & drop o menú contextual.
- **Delete** → con confirmación modal.

### Propiedades de una nota
- Título editable (auto-save). Título por defecto: `DD/MM/YYYY`.
- Tags: extraídos automáticamente del contenido con `#nombre`.
- Timestamps: `created` y `updated` automáticos.
- Estado: favorited, archived, encrypted, temporary (`expiresAt`).
- Ubicación: `group` (opcional) y `folder` (opcional, dentro del grupo).

---

## Notas temporales

- Se crean con `Ctrl+Shift+N` o desde el click-derecho en `+ New note`.
- Llevan `expiresAt` en el frontmatter (24h desde su creación).
- El proceso principal comprueba cada minuto y **borra automáticamente** las vencidas (también
  del repositorio remoto si hay sync).
- En el sidebar se distinguen por un icono de reloj (⏱) junto a la hora.

---

## Vista en paralelo (split)

- `Ctrl+Click` sobre una nota, o "Open alongside" en el menú contextual, abre una **segunda nota
  lado a lado** en el área del editor.
- Permite comparar o trabajar con dos notas a la vez sin abrir ventanas sticky.

---

## Grupos y carpetas

Jerarquía de organización de un solo nivel de anidación: **grupo → carpeta → nota**.

### Grupos
- **Crear**: botón `+ New group` (nombre + color).
- **Renombrar / Eliminar / Color / View group / Archive**: menú contextual en la cabecera del grupo.
- **Colapsar / Expandir**: click en la cabecera (estado persiste entre sesiones).
- **Ver grupo (group overview)**: click en **el nombre** del grupo (hover sutil sobre el texto), o
  "View group" en el menú contextual. Click en el resto de la cabecera = colapsar/expandir.
- **Archivar grupo**: menú contextual → "Archive group". Oculta el grupo **y todas sus notas** de
  la lista (las notas conservan su propio estado `archived`). Se revela con el mismo toggle
  **"Show archived"** del footer: los grupos archivados aparecen atenuados y al final. Para
  recuperarlo: "Unarchive group" (en el menú contextual del grupo atenuado, o el botón "Archived"
  de la cabecera de la group overview).
- **Asignar nota**: drag & drop, o menú contextual → "Add to group".
- Cada grupo tiene un color que tiñe los dots/carpetas de sus notas.
- Las notas sin grupo aparecen al final, en "Sin grupo".

### Carpetas (subcarpetas dentro de un grupo)
- **Crear**: desde el submenú "Move to folder" → "+ New folder…", o en la cabecera del grupo.
- **Mover nota a carpeta**: menú contextual de la nota → "Move to folder" (submenú con las
  carpetas del grupo). "Group root" la saca de la carpeta sin sacarla del grupo.
- **Renombrar / Eliminar**: menú contextual de la cabecera de carpeta. Al borrar una carpeta sus
  notas vuelven a la raíz del grupo.
- **Colapsar / Expandir**: independiente de los grupos (estado persistido).

> Grupos y carpetas se guardan en `groups.json` / `folders.json` dentro del dir de notas y **se
> sincronizan con GitHub** (no en `settings.json`).

---

## Vista de grupo (group overview)

Vista amplia que **sustituye el área del editor** para ver de un vistazo todo el contenido de un
grupo. El sidebar permanece visible como contexto. Pensada para ubicar notas y entender la
distribución de un grupo cuando hay muchas notas/carpetas.

**Cómo entrar:** click en el **nombre** del grupo en el sidebar (hover sutil sobre el texto), o
click derecho en la cabecera del grupo → **"View group"**.

**Cómo salir:** click en una nota (abre esa nota en el editor), `Esc`, o el botón `✕` de la
cabecera. Seleccionar cualquier nota —también desde el sidebar— cierra la vista.

**Disposición** (estética mono-minimalista, acento fino del color del grupo):
- Cabecera: punto de color + nombre + contadores (`N notas · M carpetas`) + acciones.
- Una **banda por carpeta** (con su contador), una banda **"No folder"** para las notas sueltas
  del grupo, y una banda **"Archived"** al final con las notas archivadas del grupo.
- Dentro de cada banda, las notas en **cuadrícula responsiva** de tarjetas.

**Tarjeta de nota:** título + **secciones** (mismos tags de sección que el sidebar, clicables → te
llevan directamente a esa sección de la nota) + fecha de actualización (`dd/MM/yyyy · HH:mm`).
Acento del color del grupo a la izquierda.

**Acciones:**
- **Abrir nota** → click en la tarjeta (abre la primera sección); click en un tag de sección abre
  esa sección concreta.
- **Reorganizar** → arrastrar una tarjeta a otra banda mueve la nota de carpeta (la banda
  "Archived" no es zona de drop).
- **Crear** → botones "New note" / "New folder" en la cabecera.
- **Ancho de tarjeta** → slider discreto en la cabecera (atenuado, se realza al hover); ensanchar
  las tarjetas revela más secciones a la vez. El valor se persiste en `localStorage`.
- Solo se listan notas **no archivadas** en las bandas de carpetas/"No folder"; las archivadas van
  a su banda propia.

**Selección múltiple (acciones por lotes):** marca varias notas a la vez para operar sobre todas.
- **Marcar** → cada tarjeta muestra una **checkbox** (esquina sup-der) al pasar el ratón; click en
  ella la selecciona/deselecciona. Con una selección activa, un **click normal en la tarjeta**
  alterna su marca (en vez de abrir la nota); **Ctrl/Cmd+click** alterna siempre (e inicia la
  selección). Las tarjetas seleccionadas se resaltan (anillo). Funciona en todas las bandas,
  incluida "Archived".
- **Barra de acciones** flotante (abajo, centrada, sticky al hacer scroll) cuando hay ≥1 marcada:
  contador "N selected" + **Favorite/Unfavorite**, **Archive/Unarchive** (ambos como toggle: si
  todas ya lo tienen, lo quitan; si no, lo ponen), **Move to group** (cualquier grupo o "No group"),
  **Move to folder** (carpetas del grupo actual o "Group root"), **Delete** (con confirmación; "N
  notes will be permanently deleted") y **✕** para limpiar la selección.
- `Esc` limpia la selección si hay alguna; si no, cierra la group overview.

---

## Vista de nota (note overview)

Vista amplia que **sustituye el área del editor** para ver de un vistazo **todas las secciones de
una nota**, cada una como una **mini-representación del editor** al abrir esa sección. El sidebar
permanece visible como contexto. Pensada para saltar rápido a una sección concreta o repasar la
estructura de una nota con muchas secciones. Es una de las tres vistas full-area mutuamente
excluyentes (grupo / nota / cerebro): abrir una cierra las otras, y seleccionar cualquier nota
vuelve al editor.

**Cómo entrar:**
- Botón **⊞** (icono de cuadrícula) en la toolbar del editor, justo **al lado de la estrella de
  favoritos**.
- **Click derecho** sobre la nota en el sidebar → **"Note overview"**.

**Cómo salir:** `Esc`, el botón `✕` de la cabecera, o click en una tarjeta de sección (abre esa
sección en el editor).

**Disposición** (misma estética mono-minimalista que la group overview):
- Cabecera: candado si está cifrada + **título de la nota editable inline** (click o lápiz al hacer
  hover → input; commit en blur/Enter, `Esc` revierte; no editable si está bloqueada) + estrella de
  favorito (toggle) + contador (`N sections · fecha`) + botón **"Add section"** + botón **borrar nota**
  (papelera roja, con confirmación) + `✕`.
- Cuadrícula de **tarjetas de ancho fijo**, una por sección.

**Tarjeta de sección** — replica lo que verías al pinchar esa sección (de las pestañas hacia abajo):
- Etiqueta superior con el **nombre de la sección** y su color (identifica la tarjeta) + icono
  rich/raw.
- **Título de la nota + fecha de creación**.
- Una **barra-toolbar representativa** (oscura, sin iconos — solo evoca la toolbar del editor).
- **Unas pocas líneas** del contenido de la sección, renderizadas igual que en el editor pero
  diminutas (vía `zoom`) y recortadas con un fade inferior. Las secciones vacías muestran "Empty
  section".

**Acciones:**
- **Abrir sección** → click en la tarjeta (te lleva directo a esa sección en el editor).
- **Add section** → crea una sección nueva y **navega al editor en ella** para escribir.
- **Renombrar la nota** → click en el título de la cabecera (o el lápiz al hacer hover).
- **Borrar la nota** → botón de papelera en la cabecera (con confirmación).
- **Favorito** → toggle de la estrella en la cabecera.
- **Selección múltiple de secciones** (igual que en la group overview): un **checkbox** aparece en la
  esquina superior derecha de cada tarjeta al hacer hover; **click** en el checkbox lo marca,
  **Ctrl/Cmd-click** sobre la tarjeta togglea, **Shift-click** selecciona el rango. Con ≥1 marcada
  aparece una **barra de acciones flotante** anclada abajo: **Hide from AI / Show to AI** (oculta o
  vuelve a indexar las secciones para la IA; solo en notas no cifradas), **Delete** (borra las
  seleccionadas con confirmación — deshabilitado si están todas marcadas, para no dejar la nota
  vacía) y **Clear**. `Esc` limpia la selección antes de cerrar la vista.
- Notas **cifradas y bloqueadas** muestran un estado "encrypted" (sin previews) hasta desbloquear
  en el editor.

---

## Vista "All content" (índice global)

Vista a pantalla completa (sustituye el editor; el sidebar sigue visible) que muestra **todo el
contenido** del usuario de un vistazo, a modo de índice. Hermana de la vista de grupo y la de nota.

**Cómo entrar:** botón **"View all content"** (icono de cuadrícula) en la cabecera del sidebar, justo
debajo de "+ New note".

**Disposición** (misma estética que la vista de grupo: cabecera fija + área scroll + tarjetas en grid):
- **Favorites** — las notas marcadas como favoritas, como tarjetas de nota (mismas que la vista de grupo:
  título + tags de sección clicables + fecha).
- **Groups** — cada grupo como un **tile compacto** (barra de color + icono de carpeta tintado + nombre +
  nº de notas). Los tiles son **desplegables en acordeón**: click en un tile lo **expande inline** (chevron
  que gira) y abre, a lo ancho de la rejilla, un panel con sus notas sueltas y sus carpetas (cabecera de
  carpeta colapsable + notas dentro), igual que el sidebar. Para abrir la group overview completa del grupo
  está el botón **"Open group view"** (icono de maximizar) que aparece al pasar el ratón por el tile. La
  expansión es **local a esta vista y arranca colapsada** (no se recuerda entre sesiones). Pueden expandirse
  varios grupos a la vez.
- **Notes** — las notas sueltas (sin grupo), como tarjetas de nota.
- Si no hay nada, un **empty state** centrado.

**Búsqueda:** input en la cabecera (placeholder "Search...", local a esta vista — no afecta al filtro del
sidebar). Filtra favoritos y notas sueltas; un grupo se muestra si su nombre coincide o si contiene alguna
nota que coincida. Con una búsqueda activa, los grupos (y sus carpetas) se **despliegan automáticamente** y
solo muestran dentro las notas que coinciden, para revelar los resultados. Acepta el filtro `#sección` igual
que la búsqueda del sidebar.

**Filtro de fecha/calendario:** toolbar fija justo debajo de la cabecera (botones segmentados
`All/Today/Week/Month` + toggle de **calendario** desplegable con marcadores de actividad por día). Vive
**aquí** (antes estaba en el sidebar). Filtra por `updated` (o, con un día elegido, por creadas/modificadas
ese día) y se combina con la búsqueda; afecta a las tres bandas (Favorites, Groups y su contenido, Notes).
Ver "Filtros por fecha" más abajo.

**Volver (back inteligente):** si entras a un grupo o a una nota **desde** esta vista, el botón cerrar/`Esc`
de esa group/note overview te devuelve a "All content" (no al editor). Cerrar "All content" con la X o `Esc`
vuelve al editor. Seleccionar cualquier nota (aquí o en el sidebar) también vuelve al editor.

---

## Secciones dentro de una nota

Cada nota puede tener múltiples secciones independientes, como tabs:

```
[Note ×] [Tasks ×] [Questions ×] [+]                    [⊞] [⭐] [⋯]
```

(`⊞` = note overview · `⭐` = favorito · `⋯` = menú de sección: raw/editor, copiar,
**guardar como plantilla**, sticky, **ocultar a la IA**, archivar, cifrar, borrar nota)

- **Agregar**: `Ctrl+T` o botón `+`.
- **Renombrar**: doble-click en el tab → Enter para guardar, Esc para cancelar.
- **Reordenar**: drag & drop los tabs.
- **Eliminar**: `Ctrl+W` o botón `×` (no se puede si es la única sección).
- **Navegar**: `Ctrl+Tab` / `Ctrl+Shift+Tab` (siguiente / anterior).
- **Sticky**: botón `⧉` abre la sección en ventana flotante.
- **Color de sección**: desde el menú contextual de la nota se puede asignar un color a una
  sección por su nombre (se aplica a los tags de sección en el sidebar; "Auto" vuelve al color
  por nombre). Se guarda en `section-colors.json` (sincronizado).
- **Ocultar a la IA** (`Hide from AI`): marca una sección como invisible para la IA. Una sección
  oculta **nunca** se indexa ni aparece en el chat, en "Related notes", en el grafo del cerebro ni en
  las tools del agente — la IA actúa como si no existiera (el resto de la app la trata con normalidad).
  Disponible en el **menú `⋯` del editor** (sección activa) y en el **click derecho sobre un tag de
  sección** (sidebar, vista de grupo y tarjetas de la vista de nota). Las secciones ocultas muestran
  un icono `EyeOff` (pestaña del editor, tags del sidebar, badge en la vista de nota); `Show to AI` lo
  revierte (re-indexa la sección). Útil para datos sensibles o ruido que no quieres que el modelo use.

Las secciones aparecen como pequeños tags en la tarjeta de la nota y son clickeables para
navegar directamente a esa sección.

> **Dos menús contextuales (mismo componente `NoteContextMenu`, distinto contenido según el
> objetivo):** el click derecho **sobre la nota** (en zona sin sección) muestra las acciones de
> nivel-nota (favorito, archivar, abrir en paralelo, duplicar, mover a grupo/carpeta, etc.); el click
> derecho **sobre un tag de sección** muestra solo lo propio de la sección (color de sección, ocultar
> a la IA, abrir como sticky) más unas pocas comunes (note overview, borrar nota). El componente
> distingue por el campo `sectionId` del request (`null` = nota).

---

## Previsualización de sección al hover

Cualquier elemento que **navega a una sección concreta** muestra, al pasar el ratón, una
**tarjeta flotante con una previsualización** de esa sección — la misma mini-representación del
editor que usa la [vista de nota](#vista-de-nota-note-overview) (etiqueta de sección + título +
fecha + unas líneas del contenido renderizado, recortadas con fade). Permite ojear el contenido
sin navegar.

**Dónde aparece:**
- **Sidebar** → tags de sección de cada nota.
- **Vista de grupo** → tags de sección en las tarjetas.
- **Editor** → pestañas de sección (excepto la sección activa, que ya estás viendo).
- **Paneles de IA** (Related / Chat) → resultados que apuntan a una sección.

**Comportamiento:**
- Aparece tras un breve retardo (~380 ms) para no parpadear al barrer varias pestañas.
- **Posición:** en sidebar/grupos/editor cuelga con su esquina superior izquierda **junto al
  cursor** (hacia abajo-derecha), para no tapar el contenido a la derecha del ratón; en los
  paneles de IA sale al lado del elemento. Se voltea/recoloca si no cabe en pantalla.
- Se cierra al **quitar el ratón** o con **cualquier click**.
- Secciones **vacías** muestran "Empty section"; secciones de notas **cifradas y bloqueadas** no
  se previsualizan (no hay contenido en memoria).

> En la **vista cerebro** la interacción es distinta (click en vez de hover): ver esa sección.

---

## Editor de contenido

### Dos modos de edición (por sección)

**WYSIWYG** (visual, por defecto) — edición tipo Word/Notion con toolbar.
**Raw Markdown** (texto puro) — textarea plana con markdown.

- Alternar con `Ctrl+M` (o el icono Eye/Edit en la toolbar).
- Undo/Redo con `Ctrl+Z` / `Ctrl+Y`.

### Formatos soportados
| Elemento | Markdown | Atajo |
|---|---|---|
| Negrita | `**texto**` | Ctrl+B |
| Cursiva | `*texto*` | Ctrl+I |
| Subrayado | — | Ctrl+U |
| Tachado | `~~texto~~` | — |
| Resaltado | `==texto==` | Toolbar |
| Código inline | `` `code` `` | Ctrl+E |
| Bloque de código | ` ```lang ` | Ctrl+Shift+B |
| Heading H1–H3 | `#`, `##`, `###` | Toolbar |
| Lista viñetas | `- item` | Toolbar |
| Lista numerada | `1. item` | Toolbar |
| Lista de tareas | `- [ ] tarea` | Toolbar |
| Cita / Blockquote | `> texto` | Toolbar |
| Tabla | — | Toolbar (menú contextual para filas/columnas) |
| Link | `[texto](url)` | Toolbar |
| Imagen | `![alt](src)` | Drag & drop / Paste |
| Separador | `---` | — |

### Tareas con deadline, alarma e importancia
Los items de lista de tareas (`- [ ]`) tienen soporte extendido:
- **Deadline**: fecha límite (se muestra junto al checkbox).
- **Alarm**: notificación nativa del sistema en ese momento (el proceso principal la dispara,
  funciona aunque la ventana esté oculta; incluye las ya vencidas al registrar).
- **Importancia/prioridad**: grado Low / Medium / High. Se elige en un picker y queda visible
  como un **punto de color** sin texto (Low → verde, Medium → amarillo, High → rojo), para que
  ocupe poco. Persiste en markdown con el marcador ` 🔺{level}` (low|medium|high), tras `📅`/`⏰`.
- Al hacer hover sobre el task item aparecen **dos triggers** a la derecha del texto: un icono de
  **calendario** para el deadline/alarma y un icono de **bandera** para la importancia. Cada uno
  abre su propio picker; los valores asignados quedan visibles de forma permanente.

### Tablas
- Insertables desde la toolbar (3×3 con cabecera por defecto).
- Toolbar contextual y menú de clic derecho para añadir/eliminar filas y columnas,
  y alinear la columna (izquierda/centro/derecha — persiste vía `:---:` en markdown).
- El clic derecho mueve el cursor a la celda pulsada, así las acciones actúan donde clicas.
- **Cabecera obligatoria:** no se puede borrar la fila de cabecera ni insertar una fila
  por encima de ella (las pipe-tables de markdown exigen cabecera). Las celdas de cabecera
  vacías muestran el placeholder "Column".
- **Sin redimensionado de columnas:** las tablas ocupan el ancho disponible con columnas
  equitativas. El ancho de columna NO se puede guardar en markdown portable, así que no se
  ofrece resize (evita el affordance que se reseteaba al recargar la nota).
- **Pegar markdown con tabla:** en el editor visual (WYSIWYG), pegar texto que contenga una
  tabla markdown (`| a | b |` + fila separadora `|---|---|`) la convierte en tabla real
  (antes se pegaba como texto literal). El modo Raw Markdown muestra siempre el fuente tal
  cual — para verla renderizada hay que cambiar al modo visual.

### Imágenes
- Drag & drop o paste desde el portapapeles.
- Redimensionables arrastrando los bordes.
- Se guardan como base64 inline en el `.md`.

### Bloques de código
- Botón de copiar integrado en cada bloque.
- Syntax highlighting con Lowlight.

### Relacionar secciones (slash command `/`)
- Mientras escribes en el editor **rich**, teclea `/` → aparece un **menú de comandos** con
  **"Link section"**. Al elegirlo se abre un **buscador** de todas las secciones (de cualquier nota
  o grupo); filtra por nombre de sección o título de nota. Al elegir una, se inserta una **pill**
  (chip con icono de enlace + nombre de la sección) en el punto donde estabas escribiendo.
- **Click** en la pill → navega a la sección destino (misma nota u otra). **Hover** → muestra el
  mismo preview del contenido que en el resto de la app. La pill muestra el nombre **en vivo** (si
  renombras la sección destino, se actualiza); si la sección destino se borra, la pill queda en
  estado **"roto"** (atenuada, tachada, sin navegar).
- Estas relaciones también aparecen como **aristas en la Vista Cerebro**, conectando las dos
  secciones — y **funcionan aunque la IA/embeddings esté desactivada** (no dependen del modelo).
- La relación se guarda **dentro del texto** de la sección (es un enlace markdown), así que
  sincroniza, sobrevive export/import y en **modo raw** se ve como `[Nombre](noteflow://…)`. El
  slash command solo está en modo rich; el buscador excluye notas cifradas/archivadas/temporales.

### Búsqueda dentro de la nota
- `Ctrl+F` (con el editor enfocado) → barra de "Find in note" que resalta coincidencias.
- Funciona en ambos modos (WYSIWYG y raw).

### Tamaño de fuente
- `Ctrl++` aumentar · `Ctrl+-` disminuir · `Ctrl+0` reset.
- También desde Settings → Editor (fuente y tamaño).

### Ancho del contenido (Full / Readable)
- Settings → Editor → **Width**: alterna entre `Full` (por defecto, el contenido ocupa todo el
  ancho del área del editor) y `Readable` (columna de lectura centrada de ~72 caracteres, estilo
  Obsidian/iA Writer).
- En modo `Readable` se centran los bloques de texto (párrafos, headings, listas, citas,
  separadores) **y los bloques de código**; solo **tablas e imágenes rompen la columna** y siguen
  a ancho completo. El ancho de columna se deriva del tamaño de fuente base del cuerpo (no del de
  cada elemento), así los headings comparten la misma columna. Aplica a ambos modos (WYSIWYG y
  raw); no afecta a los stickies.
- Preferencia local persistida en `localStorage` (`noteflow-readable-width`), en
  `editorSettingsStore` junto a fuente/tamaño. No se sincroniza.

---

## Local AI — "Related notes" (Fase 1 de "El Cerebro")

Primera pieza del plan "El Cerebro" (segundo cerebro consultable). Un **índice semántico local**
indexa cada **sección** de cada nota como un embedding y muestra, para la **sección activa**, las
secciones más afines de otras notas (y hermanas de la misma nota) en un panel **"Related notes"**
al pie del editor. **100% local y offline** — nada sale de la máquina; el índice es un artefacto
derivado reconstruible desde los `.md`.

- **Activación:** flag `settings.ai.enabled` (default **off**). La **UI definitiva de activación
  está en la vista cerebro** (ver abajo): con la IA off el cerebro muestra solo la estructura y un
  CTA "Activar IA local"; al activar descarga un modelo pequeño (~una vez) e indexa con barra de
  progreso. Queda además un toggle **"Local AI"** en el menú de ajustes del TitleBar.
- **Panel Related:** al cambiar de sección/nota, el panel actualiza las relacionadas; click en un
  resultado navega a esa sección. Las notas **cifradas se omiten** (no entran al índice).
- **Reindexar:** botón "Reindex all notes" en el mismo menú (muestra progreso); el índice también
  se mantiene al día solo al guardar (incremental, debounce).
- Roadmap: este índice alimenta la **vista cerebro** (Fase 2 ✅) y el **chat RAG** (Fase 3 ✅, ver
  "Panel de IA" más abajo). Un índice, tres consumidores. Detalle técnico en `.claude/context/ai.md`.

---

## La Vista Cerebro (Fase 2 de "El Cerebro")

Modo visual conmutable: el **botón "Cerebro"** (icono de cerebro) en el TitleBar abre la vista. Desde
la Fase 3 la ventana se **parte en dos mitades redimensionables**: a la izquierda el **panel de IA**
(sustituye al sidebar, que se oculta) y a la derecha el **grafo** del cerebro; el divisor central se
arrastra y su posición se recuerda. Volver = botón Cerebro otra vez, tecla de cierre, o click en
cualquier nota. Es **aditivo** — la lista de siempre sigue siendo el modo principal.

- **Nodos:** grupos, carpetas y notas. Cada grupo es una región con **su color**; carpetas y notas
  heredan el color de su grupo (las notas sueltas son neutras). No aparecen notas archivadas,
  cifradas ni temporales.
- **Dos capas de conexiones:**
  - **Estructura** (líneas sólidas): la jerarquía `grupo → carpeta → nota` que tú creas.
  - **Contenido** (líneas tenues): notas que **hablan de lo mismo** según la IA, aunque estén en
    grupos distintos. Salen del índice semántico (necesita la IA activada).
- **Interacción:** navegación libre estilo Obsidian — arrastrar el lienzo (pan), **rueda para zoom**,
  arrastrar un nodo para recolocarlo. **Hover/seleccionar** una nota **resalta sus conexiones de
  contenido** y atenúa el resto. **Click en un nodo de nota/sección** ancla junto a él una
  **ventanita de previsualización clicable** (misma tarjeta que el resto de la app); al **pulsar
  dentro de la ventanita** se navega a esa sección en el editor. Se cierra con click fuera o `Esc`.
  Click en un grupo abre su group overview. Los nombres de las notas aparecen al acercar el zoom.
- **Toggle "Contenido":** botón en la barra superior para mostrar/ocultar la capa de contenido y
  dejar solo la estructura.
- **Sin IA:** el cerebro funciona igualmente mostrando solo la estructura + el CTA de activación.
- **Iluminación por chat:** cuando el chat responde, las notas que usó **se encienden** en el grafo
  (halo brillante que parpadea en 3D / glow en 2D) — no se llenan de etiquetas, solo brillan.

---

## Panel de IA — chat + segundo cerebro (Fase 3 de "El Cerebro")

La mitad izquierda de la vista cerebro. Toda su UI está **en inglés**. Pestañas:

- **Chat:** conversación con un LLM que responde **usando tus notas como contexto** (RAG). Streaming
  token a token, botón de **parar**, y **citas** clicables debajo de la respuesta (abren la nota en su
  sección) que además **iluminan** esas notas en el cerebro. Arriba: **historial** de chats (crear,
  abrir, borrar — se guardan localmente), botón **nuevo chat**, y un **selector de modelo** para elegir
  con qué modelo se hace la siguiente pregunta. Si no hay proveedor configurado, muestra un CTA a Ajustes.
  - **Adjuntar archivos (📎):** junto al campo de escribir hay un botón de clip para mandar **imágenes,
    PDFs y .txt/.md** con tu pregunta — lo que el **modelo activo** admita (Anthropic: PDF+imágenes+texto;
    OpenAI-compatibles: imágenes+texto; .txt/.md siempre). Los archivos elegidos aparecen como **chips
    removibles** sobre el campo y quedan pegados al mensaje al enviarlo; puedes mandar solo adjuntos sin
    texto. La IA **lee los documentos directamente** (la app no extrae texto): el .txt/.md se incrusta en
    el mensaje y el PDF/imagen va nativo al proveedor. Los adjuntos siguen disponibles para **preguntas de
    seguimiento** en la misma conversación. (Privacidad: los bytes nunca salen del proceso principal.)
  - **Modo agente (acciones):** además de responder, el chat puede **actuar sobre la app**: crear,
    editar, organizar (mover a grupo/carpeta, renombrar, fijar/archivar) y borrar notas, secciones,
    grupos y carpetas. No hay interruptor — **las acciones están siempre disponibles** y el modelo
    decide actuar solo cuando se lo pides; si solo preguntas, solo responde. Cada acción se muestra
    **inline** en la respuesta (⟳ en curso → ✓ hecho / ✗ error) con un resumen ("Created note…",
    "Moved to group…"), y los cambios aparecen al instante en el sidebar/editor sin recargar. Las
    **acciones destructivas** (borrar nota/sección/grupo/carpeta) **piden confirmación**: aparece una
    tarjeta **Confirm / Cancel** y nada se borra hasta que confirmas. Las notas **cifradas** se pueden
    listar pero el agente no lee ni edita su contenido. (Implementación: tool-calling nativo, no el CLI.)
- **Related:** las "Related notes" por sección (lo que antes estaba al pie del cerebro), eligiendo
  cualquier nota/sección como origen. Necesita la IA local (embeddings) activada.
- **Profile:** cuestionario del **segundo cerebro** — aparece automáticamente la primera vez que
  entras al cerebro (si hay proveedor y no se completó). Pensado para **cualquier persona** (no solo
  perfiles técnicos) y para **mínimo esfuerzo**, organizado en **secciones**: *Professional* (a qué
  te dedicas, herramientas, en qué te enfocas), *Personal*, *Your style* y *Working with the AI*
  (**cómo quieres que te hable la IA** — el chip que más ajusta sus respuestas). **Filosofía:
  preguntar de forma indirecta en vez de pedirte que te auto-analices** (escribir tu personalidad
  cansa y sesga). Así, la mayor parte de la señal sale de **favoritos de baja fricción** (canciones/
  artistas, películas/series, libros, un viaje soñado) y de **binarias tipo "esto o lo otro"**
  (¿fin de semana planeado o improvisado?, ¿recargas a solas o con gente?…) diseñadas sobre el
  **Big Five**: la IA deduce rasgos a partir de lo que esas preferencias *representan*, como
  **pistas probabilísticas** (no verdades absolutas). Se mantienen también unos chips directos de
  auto-descripción (enfoque híbrido). Además puedes **adjuntar archivos** (un CV en PDF, imágenes,
  .txt/.md — lo que el proveedor activo sepa leer de forma nativa; Anthropic admite PDF e imágenes,
  los OpenAI-compatibles solo imágenes) y **pegar enlaces** (LinkedIn, portfolio, GitHub, web…),
  cuyo contenido la app descarga y resume. Al pulsar **Generate profile**, la IA no solo reformatea:
  **infiere, abstrae y organiza** todo (respuestas + documentos + enlaces) en una nota de perfil en
  markdown, en tu idioma, editable como cualquier nota. **Discreción:** el perfil describe quién
  eres en **rasgos abstractos**, no por los títulos exactos que diste; los favoritos literales
  quedan en una sección final de baja relevancia y la IA tiene **prohibido sacarlos a colación** en
  conversaciones que no vienen a cuento (te recomienda directo, sin "como te gusta tal película…").
  La app nunca procesa los documentos: se los pasa directamente al modelo.
- **⚙ Settings (proveedor):** elige proveedor (Anthropic/Claude, OpenAI, DeepSeek, MiniMax, Moonshot,
  OpenRouter, Ollama local, o Custom OpenAI-compatible), pega tu **API key** (BYO; gratis y privado),
  ajusta Base URL y modelo, y prueba la conexión. **Cada proveedor recuerda su propia key/modelo** —
  cambiar de proveedor no las mezcla. Las claves se guardan cifradas y nunca salen de tu máquina.

> **Dos interruptores independientes:** la **IA local** (embeddings, se activa en el cerebro) da
> contexto RAG y conexiones de contenido; el **proveedor LLM** (Ajustes) da el chat. El chat funciona
> sin la IA local, pero entonces responde **sin contexto de tus notas**.

---

## Búsqueda y filtros

### Búsqueda global (sidebar)
- `Ctrl+Shift+F` → enfoca el input de búsqueda del sidebar.
- Busca en tiempo real en: títulos, contenido y tags.
- Case-insensitive, sin acentos.

> Nota: `Ctrl+F` está reservado para "Find in note" (búsqueda dentro del editor).

### Command palette
- `Ctrl+P` → abre la paleta de comandos: buscar notas y ejecutar acciones rápidas (nueva nota,
  abrir carpeta de notas, etc.). Navegación con ↑↓, Enter para seleccionar, Esc para cerrar.
- **Comandos de IA / Cerebro:** la paleta incluye accesos directos a la vista cerebro y al panel
  de IA: **Open Brain** (grafo 3D), **Chat with AI** (abre el cerebro en la pestaña Chat),
  **Find related notes** (pestaña Related), **AI profile** (segundo cerebro) y **AI provider
  settings** (configurar modelo/clave). Todos abren la brain view y enrutan el `AiPanel` a la
  pestaña pedida.
- **Ask AI a question…** es un sub-modo inline (como "Create group"): escribes la pregunta en la
  propia paleta y Enter abre el cerebro + chat y la envía directamente (en un chat nuevo). Si no
  hay proveedor LLM configurado, la pregunta queda en cola y se envía en cuanto configuras uno.

### Filtros por fecha (en la vista "All content")
```
[All] [Today] [Week] [Month]   +   [📅 calendario]
```
- **Ubicación:** este filtro vive en la **vista "All content"** (toolbar fija bajo la cabecera), no
  en el sidebar. El sidebar ya **no** tiene filtro de fecha (solo búsqueda, tags y archived).
- Botones rápidos por fecha de modificación (`updated`).
- El icono de calendario despliega un mes navegable para filtrar por un **día concreto** (marca
  los días con actividad: punto verde = creadas, punto neutro = modificadas; elegir día filtra notas
  creadas o modificadas ese día). Estado `filterDate` en el store + estado local del día/mes/expandido.
- Se **combina** con la búsqueda local de la vista y afecta a Favorites, Groups (y su contenido) y Notes.

### Filtros por tags
- Click en un tag del sidebar → filtra notas con ese tag. Click de nuevo → limpia.

### Notas archivadas
- Ocultas por defecto. Toggle `Show archived` en el footer. El mismo toggle revela también los
  **grupos archivados** (atenuados, al final de la lista).

### Orden de la lista
- **Sección favorites** (top del sidebar): notas marcadas como favoritas, en orden manual (drag-to-reorder).
- **Resto**: por última modificación (más reciente arriba), o en el orden manual si se ha arrastrado alguna nota.
- Las notas favoritas **también aparecen en su grupo/carpeta** normal (no se ocultan de ahí).

---

## Temas visuales

14 temas, accesibles desde **Settings → Appearance** (⚙ del TitleBar). Default: **NoteFlow Dark**.

| Modo | Temas |
|---|---|
| Dark | Tokyo Night, Midnight Blue, Carbon, VS Code Dark, Dracula, True Godot, GruvBox Dark, Obsidian, Emerald Forest, Synthwave |
| Light | Arctic Day, Parchment |

Persisten entre sesiones (`settings.json`). Definidos en `src/lib/themes.ts` como sets de CSS vars.

---

## Tags

- Se definen con `#nombre` en el contenido de cualquier sección.
- Colores asignados automáticamente por nombre (8 colores consistentes).
- Aparecen en: sidebar (sección Tags), tarjeta de nota, header del editor.
- Click en un tag del sidebar → filtra todas las notas con ese tag.

---

## Encriptación de notas

Desde el menú contextual (right-click en nota):
- **Encrypt note** → modal con contraseña.
- **Unlock note** → pide contraseña para acceder (desbloqueo solo durante la sesión).
- **Lock note** → vuelve a bloquear una nota desbloqueada.
- **Remove encryption** → elimina el cifrado permanentemente.

Las notas bloqueadas no muestran contenido hasta desbloquear.
Algoritmo: **AES-256-GCM + PBKDF2** (310.000 iteraciones, SHA-256). Sin master key ni backdoor.
El CLI ignora las notas cifradas.

---

## Menú contextual (right-click en nota del sidebar)

```
  ⭐ Add to favorites / Remove from favorites
  📦 Archive / Unarchive
  🔒 Encrypt note   (o: Unlock / Lock / Remove encryption)
  ▥ Open alongside        ← abre en paralelo (split)
  📋 Duplicate note
  ⊞ Note overview         ← abre la vista de nota (todas sus secciones)
  ─────────────
  🎨 Section color         ← solo si el click fue sobre un tag de sección
  ─────────────
  📁 Move to folder ▸  /  Remove from group     (si está en un grupo)
  📁 Add to group ▸                              (si no tiene grupo)
  ─────────────
  🗑 Delete note   ← rojo
```

---

## Ventana sticky (nota flotante)

Botón `⧉` en la toolbar del editor (o `Ctrl+S` para la sección actual, `Ctrl+G` para todas):
- Siempre encima (`alwaysOnTop`). Tamaño 300×300px, redimensionable (mín. 200×200).
- Frameless con barra de título propia y esquinas redondeadas.
- Modo WYSIWYG o Raw, igual que el editor principal.
- Cambios sincronizados con la ventana principal en tiempo real.
- Se pueden abrir varias a la vez.
- **Plegar/desplegar** (fold/unfold) desde su barra de título: se contrae a una píldora animada
  en la esquina de la pantalla (las píldoras se apilan).

---

## System tray

La app vive en el system tray. Al cerrar con `×` se oculta (no termina).

**Click en icono** → muestra/oculta la ventana.
**Right-click** → menú:
```
  Open NoteFlow
  New Note
  ─────────────
  Open notes folder
  ─────────────
  Quit
```

**Atajo global del sistema** (funciona aunque la ventana esté oculta):
- `Ctrl+Shift+Space` → muestra/oculta NoteFlow.

---

## Plantillas de nota (Note Templates)

Notas reutilizables con título + secciones predefinidas. Se guardan en `templates.json` (en el dir
de notas, **se sincroniza** con GitHub como el resto de metadatos).

- **Crear una plantilla:** menú `⋯` del editor → **Save as template**. Captura el título y las
  secciones de la nota actual; un pequeño modal pide el nombre (default = título de la nota o
  `Untitled template`). Oculto si la nota está **cifrada y bloqueada** (sin sesión desbloqueada).
- **Usar una plantilla:** Settings → **Templates** lista las plantillas guardadas. Cada una tiene
  **New note** (crea una nota a partir de la plantilla — regenera ids de sección frescos, navega a la
  nota y cierra Ajustes), **rename** (botón ✎ o doble-click sobre el nombre) y **delete** (con
  confirmación). Si la plantilla no tiene secciones, la nota nace con una sección `Notes` vacía.
- Estado vacío: mensaje invitando a usar el menú `⋯` → Save as template.

---

## Startup settings

Settings → "Startup settings...":
- **Launch on system startup**: NoteFlow arranca al iniciar sesión (oculto en el tray).
- **Open as sticky at startup**: selecciona qué secciones se abren como sticky al arrancar (solo
  si el autostart está activo; las notas cifradas no aparecen).

---

## Auto-actualización (in-app)

- Al detectar una versión nueva en GitHub, aparece el icono ⬇ en el TitleBar (y un aviso en
  Settings).
- Al pulsarlo, NoteFlow descarga el instalador (el botón muestra el % y, al terminar, un spinner
  "Installing…") y se actualiza **sin popups del SO ni cerrar/reabrir a mano**:
  - Windows: muestra la **barra de progreso nativa del instalador**, se cierra sola y se reabre ya
    actualizada — **sin el popup "cierra la aplicación" ni UAC** (instalador NSIS lanzado con
    `--updated`, que omite ese prompt; ver detalle técnico en `.claude/context/release.md`).
  - Linux (deb/pacman): pide la contraseña de root (diálogo del sistema — inevitable al instalar a
    nivel de sistema) y se relanza.
  - Linux (AppImage): se reemplaza a sí misma en su ubicación y se relanza.
- En Windows, la instalación queda cubierta por la barra de progreso nativa de NSIS. En Linux el
  feedback durante la instalación es el propio diálogo de root (deb/pacman) o es casi instantáneo
  (AppImage). Dentro de la app, el botón del TitleBar muestra `%` de descarga → spinner
  "Installing…" hasta que la ventana se cierra.
- Descargas restringidas a hosts oficiales de GitHub (allowlist de seguridad).

---

## GitHub Sync

Settings → GitHub Sync.

### Conectar
1. Introduce el nombre del repositorio privado donde se guardarán las notas.
2. **Device Flow OAuth** — aparece un código de verificación.
3. El usuario visita `github.com/login/device`, introduce el código y autoriza.
4. La app detecta la autorización y conecta.

### Comportamiento tras conectar
- **Al arrancar**: pull automático (solo sobreescribe si el remoto es más nuevo).
- **Cada 5 min**: pull automático en segundo plano.
- **Al guardar**: push automático con debounce (~3s). El icono ☁ indica cuándo está subiendo.
- **Al borrar**: el archivo se elimina también del repo remoto.
- Se sincronizan notas + `groups.json` + `folders.json` + `section-colors.json`.
- El repositorio se crea como **privado** automáticamente si no existe.

### Panel de sync
- Estado (conectado / subiendo / error), cuenta y repo vinculados.
- "Pull now" para sync manual · "Disconnect" para desconectar.

### Privacidad
- Repo siempre **privado**. Token cifrado con el SO (`safeStorage`), nunca sale de la máquina.
- Sin servidor intermedio — comunicación directa con la API de GitHub. Sin telemetría.

---

## Exportar / Importar notas

Settings → Export / Import.

**Exportar**:
- `.noteflow` (JSON con todas las notas).
- También `.md` / `.txt` (una nota → archivo; varias → carpeta destino).

**Importar**: la pestaña Import abre primero un **selector de origen con tutorial in-app** (textos
en inglés) — cada fuente explica dónde está su botón de exportar y en qué formato:
- **NoteFlow file** → `.noteflow` / `.json`, o `.md` / `.txt` sueltos.
- **Markdown folder** → elige una carpeta de `.md`/`.txt` (p.ej. un vault de Obsidian); las
  **subcarpetas se mapean a grupos/folders**, y se conservan frontmatter YAML y `#tags`.
- **Notion** → export **HTML** (`.zip`) con *Include subpages* + *Create folders for subpages*.
- **Google Keep** → export de **Google Takeout** (`.zip`).

Tras elegir, muestra la misma **preview** con resolución de conflictos (los imports externos llevan
ids/dirs frescos → sin conflicto, y muestran el grupo/folder destino):
- **Skip** → mantiene la versión existente.
- **Overwrite** → reemplaza con la importada.
- **Keep both** → renombra y guarda ambas.

Detalles de los imports externos: el contenido entra en **rich-text** (no raw); las notas **sin
contenido se omiten** (las filas de BD / páginas título-solo de Notion no ensucian); subcarpetas →
grupos (1er nivel) + folders (anidados, aplanados a 2 niveles); imágenes y `.csv` de Notion no se
importan (v1). Implementación en `.claude/context/patterns.md` (importadores + IPC).

---

## CLI companion (`noteflow` en terminal)

Script Node.js standalone (`cli/noteflow.js`) que opera directamente sobre los `.md`, sin
necesidad de tener la app abierta. Útil en headless/RPi y para agentes de IA.

Comandos principales: `add`, `new`, `list`, `get`, `delete`, `rename`, `sections`, `favorite` (alias `pin`),
`archive`, `groups`, `group create/delete`, `login`, `logout`, `push`, `pull`/`update`,
`status`, `self-update`. Los comandos de lectura aceptan `--json`.

> Referencia completa: skill `noteflow-cli` (y `cli/noteflow-cli/SKILL.md`).

---

## Atajos de teclado completos

Fuente de verdad: `src/components/KeyboardShortcutsModal.tsx`.

### App
| Atajo | Acción |
|---|---|
| `Ctrl+Shift+Space` | Mostrar/ocultar app (global del sistema) |
| `Ctrl+N` | Nueva nota |
| `Ctrl+Shift+N` | Nueva nota temporal (24h) |
| `Ctrl+P` | Command palette |
| `Ctrl+Shift+F` | Buscar en todas las notas (sidebar) |
| `Ctrl+'` | Toggle sidebar |
| `Ctrl+Click` | Abrir nota en paralelo |

### Secciones
| Atajo | Acción |
|---|---|
| `Ctrl+T` | Nueva sección |
| `Ctrl+W` | Eliminar sección |
| `Ctrl+Tab` | Siguiente sección |
| `Ctrl+Shift+Tab` | Sección anterior |
| `Delete` | Borrar nota seleccionada (cuando no se edita) |

### Sticky notes
| Atajo | Acción |
|---|---|
| `Ctrl+S` | Abrir sección actual como sticky |
| `Ctrl+G` | Abrir todas las secciones como sticky |

### Editor
| Atajo | Acción |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Negrita / Cursiva / Subrayado |
| `Ctrl+E` | Código inline |
| `Ctrl+Shift+B` | Bloque de código |
| `Ctrl+F` | Buscar dentro de la nota |
| `Ctrl+M` | Alternar modo Markdown / rich-text |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Fuente: aumentar / disminuir / reset |

---

## Persistencia y almacenamiento

- Notas como `.md` en `~/noteflow-notes/` (Windows) / `~/.local/share/noteflow-notes/` (Linux).
- Junto a ellas: `groups.json`, `folders.json`, `section-colors.json`, `note-order.json` (todo sincronizable).
- Auto-save con debounce tras cada cambio.
- Formato: YAML frontmatter + Markdown (el cuerpo = contenido de la primera sección).
- Carpeta configurable desde Settings → "Choose notes directory".
- Ajustes locales (tema, autostart, estado de UI, token de sync) en `settings.json` del userData.
