# Web de NoteFlow (sitio Astro en `docs/`)

Sitio de marketing + documentación pública. **Proyecto Astro independiente** dentro del repo
(`docs/package.json` propio). URL: https://yagoid.github.io/noteflow/ · deploy automático con el
workflow `pages.yml` en cada push a `main` que toque `docs/**` (publica `docs/dist`, la carpeta no
se sirve en crudo).

**Objetivo de este fichero:** que un agente sepa **qué contenido hay publicado en la web y de qué
fuente de verdad bebe cada sección**, para actualizarla cuando cambie la app (o corregir
información errónea/desactualizada) sin tener que re-explorar el sitio.

```bash
cd docs
npm run dev      # http://localhost:4321/noteflow/
npm run build    # → docs/dist/ (10 páginas)
npm run check    # astro check (0 errores es lo esperado)
```

## Mapa del sitio (10 páginas, EN + espejo ES bajo /es/)

| Ruta | Qué es | Componente | Prosa i18n |
|---|---|---|---|
| `/` | Landing one-pager (hero, notes, showcase, brain, profile, download) | `src/components/Home.astro` | `src/i18n/en.ts` + `es.ts` |
| `/cli` | Doc completa del CLI | `src/components/docs/CliPage.astro` | `src/i18n/docs/cli.{en,es}.ts` + datos en `src/data/cli.ts` |
| `/ai` | Internals de la IA (proveedores, embeddings, RAG, perfil, agente) | `src/components/docs/AiPage.astro` | `src/i18n/docs/ai.{en,es}.ts` |
| `/features` | Detalles de producto (jerarquía, stickies, atajos, vistas, cifrado…) | `src/components/docs/FeaturesPage.astro` | `src/i18n/docs/features.{en,es}.ts` |
| `/pricing` | Precios: todo lo esencial gratis + planes gestionados opcionales (NoteFlow AI / NoteFlow Cloud) | `src/components/docs/PricingPage.astro` | `src/i18n/docs/pricing.{en,es}.ts` |

Extras servidos: `public/cli.html` (meta-refresh legacy → `/cli`, ver gotchas),
`public/mobile-privacy-policy.html`, `public/screenshots/`, `public/video/`, `public/brain/*.js`.

## Arquitectura (lo VIVO)

- **`src/layouts/Base.astro`** — head único: SEO (props `title/description/image/jsonLd/noindex` y
  **`path`** para los hreflang), fuentes (Inter cuerpo + JetBrains Mono técnico), anti-flash de tema
  (`localStorage['noteflow:web-theme']` + `data-theme` en `<html>`), carga de los web components del
  cerebro, GA.
- **`src/layouts/DocsShell.astro`** — shell de las 4 páginas de docs: `<nf-netbg>` de fondo, rail
  vertical de neuronas (home arriba; CLI cyan / AI purple / Features orange / Pricing pink, la
  activa "disparada";
  switch de idioma → espejo de la MISMA página + toggle de tema), header de página, grid contenido +
  TOC lateral con scroll-spy (en <1100px pasa a chips horizontales), footer slim, copy-to-clipboard.
  Props: `lang, page, title, description, kicker, h1, tagline, toc, accent`.
- **Estilos**: `src/styles/brain-site.css` = tokens del design system "The Brain" (`--bg --card
  --ink* --line* --detail --accent --purple --orange --cyan --pink --red --brain-*`; dark en
  `:root`, light en `[data-theme="light"]`) + `src/styles/docs.css` = layout/tablas/terminal/TOC de
  las páginas de docs. Los estilos propios de cada página van inline + `<style is:global>` en su
  componente (patrón Home.astro).
- **Fondo "cerebro tech"**: web components vanilla en `public/brain/` — `<nf-netbg>` (malla 2D
  canvas, reacciona a `data-theme`) y `<noteflow-brain>` (wireframe 3D three.js, solo en la home).
- **i18n**: `src/i18n/{en,es}.ts` (landing) y `src/i18n/docs/{common,cli,ai,features,pricing}.{en,es}.ts`
  (docs). Patrón: el `.en.ts` define la forma (`type X = typeof xEn`) y el `.es.ts` la satisface →
  TypeScript fuerza el sync de claves. Getters en
  `index.ts`/`common.ts`/`cli.ts`/`ai.ts`/`features.ts`/`pricing.ts`.
- **Componentes de docs**: `src/components/docs/` — `Term.astro` (marco terminal con typing),
  `StickyMock.astro` (sticky note en HTML/CSS con plegado a píldora), y las 4 `XPage.astro`.
  Wrappers finos en `src/pages/{x,es/x}.astro`.
- **LEGACY MUERTO (no usar, no imitar)**: `src/components/{Nav,Footer,ChatMock,BrainGlyph,Pillar,
  Terminal,ScreenshotFrame}.astro`, `ThemeToggle.tsx`, `src/brain/*.tsx`, `src/styles/{tokens,global}.css`,
  y los HTML de la raíz `docs/` (`index.html`, `style.css`, `main.js` — no se sirven).

## Reglas y gotchas

1. **Base path `/noteflow`**: TODO enlace/asset interno pasa por `href()`/`asset()`
   (`src/lib/url.ts`) o `getRelativeLocaleUrl` de `astro:i18n`. Nunca `href="/..."` a pelo.
2. **hreflang**: las páginas no-home deben pasar `path` a `Base` (vía DocsShell ya se hace) para que
   `/cli` ↔ `/es/cli` se declaren alternates mutuos.
3. **`redirects` de Astro NO aplica el `base` al destino** (y genera un *directorio* `x.html/`).
   El redirect legacy `/cli.html → /cli` es un meta-refresh manual en `docs/public/cli.html` con la
   URL hardcodeada — actualizarlo si se pasa a dominio propio.
4. **Dark/light**: todo color nuevo debe salir de las variables de `brain-site.css` (probar ambos
   temas). Animaciones siempre con `prefers-reduced-motion` respetado.
5. **UI de la web bilingüe completa**: cada string visible vive en el dict EN y el ES. Excepción
   deliberada: los **prompts literales** de `/ai` van verbatim en inglés en ambos idiomas (viven una
   sola vez en `ai.en.ts`; `ai.es.ts` los importa) — son los prompts reales del código y no se traducen.
6. El sitio se publica solo al pushear a `main`; no publicar a medias (el rail/footer de docs enlaza
   a las cuatro páginas entre sí).

## Inventario de contenido ↔ fuente de verdad (LO IMPORTANTE)

Cuando cambie algo en la app, este mapa dice qué tocar en la web. Editar siempre el par
`.en.ts` + `.es.ts` (el tipo obliga).

### Landing `/` (`src/i18n/{en,es}.ts`)
Features del mock de notas, chat mock, mockup de perfil, botones de descarga (Windows/Linux →
GitHub Releases), CTAs a `/cli`, `/ai` y `/features` (+ footer, que enlaza también a `/pricing`
**sin `data-nav`** — el script de sinapsis de la home no lo conoce). Vídeos/capturas por tema en
`public/video/` y `public/screenshots/`. Actualizar al cambiar UX visible o al hacer release con
features nuevas destacables.

### `/cli` — fuente de verdad: **`cli/noteflow-cli/SKILL.md`** (skill `noteflow-cli`)
Documenta el CLI **v1.8.0**. Anclas: `#install` `#notes-dir` `#format` `#commands` `#flags`
`#agents` `#caveats` `#troubleshooting`.
- Tabla de comandos/flags/ejemplos (27 comandos en 5 grupos): **`src/data/cli.ts`** (estructural,
  con `desc: {en,es}` inline por fila).
- Prosa (instalación, formato v2, avisos PowerShell/app-abierta, troubleshooting): `cli.{en,es}.ts`.
- **Si cambia el CLI** (`cli/noteflow.js` + su SKILL.md): reflejar comandos/flags nuevos en
  `data/cli.ts` y la prosa afectada. El badge de versión del hero también vive en el dict.

### `/ai` — fuente de verdad: **el código de `electron/ai/` + `electron/main.ts`** (y `.claude/context/ai.md`)
Anclas: `#providers` `#embeddings` `#relations` `#rag` `#profile` `#agent` `#privacy`.

| Sección | Documenta | Sincronizar si cambia |
|---|---|---|
| `#providers` | Los 9 presets LLM, baseUrl, capacidades (PDF solo Anthropic; sin imágenes DeepSeek/MiniMax/Moonshot), keys con safeStorage | `electron/ai/llm/presets.ts` |
| `#embeddings` | Modelo mpnet 768-d, Transformers.js+onnx, SQLite/sqlite-vec/FTS5, por sección, 2000 chars, debounce 2.5s, cifradas fuera | `electron/ai/aiWorker.ts`, `aiIndex.ts` |
| `#relations` | Anti-anisotropía + coseno; related minScore 0.03; grafo centroide 0.05 + top-6 mutual | `aiWorker.ts` (`relatedBySection`, `contentEdges`) |
| `#rag` | Búsqueda híbrida RRF k=60, top-6 hits + 3 vecinos, bloques 1500 chars, **system prompt del chat VERBATIM** | `electron/main.ts` (`CHAT_SYSTEM_BASE`, `buildChatContext`) |
| `#profile` | Cuestionario 4 secciones, Big Five/OCEAN, **prompt del profiler VERBATIM** | `src/components/AiPanel/profileQuestions.ts`, `main.ts` (`ai:profile-generate`) |
| `#agent` | Tabla de las 17 tools, 4 destructivas con confirmación, máx 12 pasos, no usa el CLI | `electron/ai/llm/tools.ts` (`TOOLS`, `DESTRUCTIVE_TOOLS`), `MAX_AGENT_STEPS` |
| `#privacy` | `aiHidden` fuera de índice/RAG/tools; doble interruptor embeddings vs LLM | `aiWorker.ts`, `tools.ts`, `buildChatContext` |

Los umbrales y prompts están publicados **literalmente** — cualquier cambio en esos valores del
código desactualiza la web. Los prompts se compararon byte a byte al publicarlos; mantener esa
fidelidad (viven en `ai.en.ts` como constantes exportadas).

### `/features` — fuente de verdad: **skill `noteflow-features`** (y el código que ella cita)
Anclas: `#organize` `#templates` `#sticky` `#links` `#shortcuts` `#views` `#temp` `#encryption`
`#ai-hidden` `#personalize`.

| Sección | Documenta | Sincronizar si cambia |
|---|---|---|
| `#organize` | Jerarquía grupos→carpetas→notas→secciones | skill (Grupos/Carpetas/Secciones) |
| `#templates` | Save as template, Settings→Templates, `templates.json` | skill (Plantillas) |
| `#sticky` | Mock CSS 300×300 plegable, Ctrl+S/Ctrl+G, startup de stickies | skill (Sticky notes) + `StickyMock.astro` |
| `#links` | Slash command, pills vivas/rotas, forma raw `[Name](noteflow://…)` | skill + `src/lib/sectionRelations.ts` |
| `#shortcuts` | Tabla completa de atajos (datos en `features.en.ts` como `combos`) | `src/components/Settings/ShortcutsPanel.tsx` |
| `#views` | Note/group overview, All content, Brain view | skill (Vistas) |
| `#temp` | Notas temporales 24h | skill |
| `#encryption` | AES-256-GCM + PBKDF2 310k, sin backdoor, CLI las ignora | skill / `noteUtils` |
| `#ai-hidden` | Toggle Hide from AI (enlaza a `/ai#privacy`) | skill |
| `#personalize` | **14 temas (11 dark + 3 light)** con swatches de valores reales, fuentes, ancho readable | `src/lib/themes.ts` (¡los swatches llevan colores literales!) |

### `/pricing` — fuente de verdad: **`.claude/context/monetization.md`** (§§ visión / 3 / 4)
Anclas: `#free` `#ai` `#cloud` `#compare` `#privacy`. Accent **pink**. Mensaje central: todo lo
esencial es gratis y lo seguirá siendo; los planes compran comodidad, no capacidad (ambas
capacidades se autogestionan gratis: IA con Ollama/key propia, nube con GitHub Sync).

| Sección | Documenta | Sincronizar si cambia |
|---|---|---|
| `#free` | Lo gratis (editor, Cerebro local, IA con key propia/Ollama, cifrado, GitHub Sync, CLI) + callout "los planes suman, no sustituyen" | monetization.md § visión |
| `#ai` | Plan NoteFlow AI: **modelos curados literales** (gpt-4o-mini, gpt-4.1-mini, claude-haiku-4.5, gemini-2.5-flash), **cuota 3M tokens/mes**, mensual/anual, alta vía Settings → Account → Subscribe (checkout Lemon Squeezy; sin cifras de precio a propósito) | monetization.md § 3 (`NOTEFLOW_AI_MODELS`, `AI_MONTHLY_TOKENS`) |
| `#cloud` | Plan NoteFlow Cloud marcado **"Coming soon"**: E2EE total, tiempo real; GitHub Sync sigue gratis | monetization.md § 4 (¡quitar el badge al lanzarse!) |
| `#compare` | Tabla gestionado vs autogestionado (IA, setup, sync, "todo lo demás gratis") | monetization.md §§ 3-4 |
| `#privacy` | RAG local, al proxy viaja lo mismo que con key propia, `aiHidden`/cifradas nunca salen, IA gestionada ≠ nube de notas | monetization.md § 3 "Privacidad" + `/ai#privacy` |

## Checklist al cerrar una feature de la app

1. ¿Es visible para el usuario? → skill `noteflow-features` (ya obligatorio) **y** revisar si toca
   alguna sección de `/features` o el mock de la landing.
2. ¿Toca el CLI? → SKILL.md del CLI **y** `/cli` (`data/cli.ts` + prosa + versión del hero).
3. ¿Toca IA (presets, tools, umbrales, prompts, cuestionario)? → `/ai` (tabla de arriba).
4. ¿Atajos o temas nuevos? → `/features#shortcuts` / `#personalize`.
5. Verificar: `cd docs && npm run build` + revisar la página en dark y light y en EN y ES.

## Añadir una página de docs nueva (patrón)

1. Dicts `src/i18n/docs/x.{en,es}.ts` + getter `x.ts` (forma = `typeof xEn`).
2. Componente `src/components/docs/XPage.astro` sobre `DocsShell` (elegir `accent`, definir `toc`).
3. Wrappers `src/pages/x.astro` + `src/pages/es/x.astro`.
4. Neurona en el rail y footer de `DocsShell.astro` + labels en `common.{en,es}.ts`.
5. Enlace desde la home si procede (footer/CTA, **sin `data-nav`** para no tocar el script de sinapsis).
