---
name: noteflow-features
description: Funcionalidades, diseño de UI y experiencia de usuario de NoteFlow. Úsala cuando el usuario quiera discutir, mejorar o diseñar features de la app, entender cómo funciona desde la perspectiva del usuario, o planear nuevas capacidades de producto.
---

# NoteFlow — Funcionalidades y Diseño

> **Mantenimiento:** al implementar una feature importante, actualizar esta skill **y**
> `noteflow-context` (arquitectura/IPC/release). Si toca el CLI, también `cli/noteflow-cli/SKILL.md`.
> La fuente de verdad de los atajos es `src/components/KeyboardShortcutsModal.tsx`.
>
> **Idioma de la UI:** todo el texto visible de la app va **en inglés** (labels, botones, placeholders,
> tooltips, errores de UI). El contenido del usuario y las respuestas del LLM van en el idioma del usuario.

## ¿Qué es NoteFlow?

App de escritorio de notas rápidas para Windows/Linux, orientada a developers. Dark-first, sin
fricciones, accesible desde el system tray en cualquier momento con `Ctrl+Shift+Space`. Notas en
archivos `.md` locales, con sync privado opcional a GitHub y un CLI companion para headless/IA.

---

## Estructura visual de la app

```
┌─ TitleBar (32px) ──────────────────────────────────────────────────┐
│  NOTEFLOW    [⬇ update] [☁ sync]            [⚙ settings] [🎨] [─ □ ×] │
├─ Sidebar (180–480px, redimensionable) ──┬─ Editor area ─────────────┤
│  [🔍 Search...        ] [📅]            │  [Tabs sección] [⚙]        │
│  [All] [Today] [Week] [Month]           │  Título de nota            │
│  (📅 → calendario para elegir día)      │  tags de nota              │
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
- **⚙ settings**: menú (atajos, fuente del editor, GitHub Sync, export/import, startup, update,
  elegir carpeta de notas).
- **🎨 themes**: selector de tema (12 temas).
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
- Cabecera: candado si está cifrada + título de la nota + estrella de favorito (toggle) + contador
  (`N sections · fecha`) + botón **"Add section"** + `✕`.
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
- **Favorito** → toggle de la estrella en la cabecera.
- Notas **cifradas y bloqueadas** muestran un estado "encrypted" (sin previews) hasta desbloquear
  en el editor.

---

## Secciones dentro de una nota

Cada nota puede tener múltiples secciones independientes, como tabs:

```
[Note ×] [Tasks ×] [Questions ×] [+]                    [⊞] [⭐] [⋯]
```

(`⊞` = note overview · `⭐` = favorito · `⋯` = menú de sección: raw/editor, copiar, sticky,
archivar, cifrar, borrar nota)

- **Agregar**: `Ctrl+T` o botón `+`.
- **Renombrar**: doble-click en el tab → Enter para guardar, Esc para cancelar.
- **Reordenar**: drag & drop los tabs.
- **Eliminar**: `Ctrl+W` o botón `×` (no se puede si es la única sección).
- **Navegar**: `Ctrl+Tab` / `Ctrl+Shift+Tab` (siguiente / anterior).
- **Sticky**: botón `⧉` abre la sección en ventana flotante.
- **Color de sección**: desde el menú contextual de la nota se puede asignar un color a una
  sección por su nombre (se aplica a los tags de sección en el sidebar; "Auto" vuelve al color
  por nombre). Se guarda en `section-colors.json` (sincronizado).

Las secciones aparecen como pequeños tags en la tarjeta de la nota y son clickeables para
navegar directamente a esa sección.

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
| Código inline | `` `code` `` | Ctrl+E |
| Bloque de código | ` ```lang ` | Ctrl+Shift+B |
| Heading H1–H3 | `#`, `##`, `###` | Toolbar |
| Lista viñetas | `- item` | Toolbar |
| Lista numerada | `1. item` | Toolbar |
| Lista de tareas | `- [ ] tarea` | Toolbar |
| Tabla | — | Toolbar (menú contextual para filas/columnas) |
| Link | `[texto](url)` | Toolbar |
| Imagen | `![alt](src)` | Drag & drop / Paste |
| Separador | `---` | — |

### Tareas con deadline y alarma
Los items de lista de tareas (`- [ ]`) tienen soporte extendido:
- **Deadline**: fecha límite (se muestra junto al checkbox).
- **Alarm**: notificación nativa del sistema en ese momento (el proceso principal la dispara,
  funciona aunque la ventana esté oculta; incluye las ya vencidas al registrar).
- Se accede desde el icono de reloj al hacer hover sobre el task item.

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
  "Panel de IA" más abajo). Un índice, tres consumidores. Detalle técnico en la skill `noteflow-context`.

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
- **Profile:** cuestionario inicial del **segundo cerebro** — aparece automáticamente la primera vez
  que entras al cerebro (si hay proveedor y no se completó). Respondes unas preguntas fijas y la IA
  **genera una nota de perfil** en markdown, en tu idioma, editable como cualquier nota.
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

### Filtros por fecha
```
[All] [Today] [Week] [Month]   +   [📅 calendario]
```
- Botones rápidos por fecha de modificación.
- El icono de calendario despliega un mes navegable para filtrar por un **día concreto** (marca
  los días con actividad).

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

12 temas, accesibles desde el icono de paleta en el TitleBar. Default: **Carbon**.

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
    `--updated`, que omite ese prompt; ver detalle técnico en `noteflow-context`).
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

**Importar**: `.noteflow` / `.json`, o `.md` / `.txt` sueltos. Muestra preview con resolución de
conflictos:
- **Skip** → mantiene la versión existente.
- **Overwrite** → reemplaza con la importada.
- **Keep both** → renombra y guarda ambas.

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
