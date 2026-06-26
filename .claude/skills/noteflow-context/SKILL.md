---
name: noteflow-context
description: Contexto completo del proyecto NoteFlow — app de escritorio de notas rápidas para Windows/Linux/macOS. Úsala cuando el usuario quiera trabajar con este proyecto: añadir features, corregir bugs, hacer releases, entender la arquitectura, modificar el workflow de CI/CD o interactuar con el repositorio de GitHub.
---

# NoteFlow — Guía del proyecto

> Esta skill es un **índice**. El detalle vive en `reference/*.md` (ver la tabla de abajo): abre
> **solo el fichero del tema que estés tocando** en vez de cargar todo el contexto. Cada fichero
> es autocontenido.

> **Mantenimiento de las skills (LEER PRIMERO):** cuando se implemente una funcionalidad importante
> o se cambie la arquitectura, **actualizar las skills** al cerrar el trabajo: el **fichero
> `reference/*.md` correspondiente** de esta skill (ver tabla) y `noteflow-features` (UX/diseño/
> atajos). Si la feature toca el CLI, actualizar también `cli/noteflow-cli/SKILL.md`. Mantenerlas al
> día es lo que hace que la próxima sesión arranque con contexto correcto.
>
> **Idioma de la UI (REGLA para features nuevas):** todo el **texto visible de la aplicación va en
> inglés** (labels, botones, placeholders, tooltips, mensajes de error de UI). El contenido del
> usuario y las respuestas del LLM siguen el idioma del usuario; las skills/docs siguen en español.

## Mapa de contenidos (abre el fichero del tema que toques)

| Tema | Fichero | Cuándo abrirlo |
|---|---|---|
| Estructura de directorios · Arquitectura IPC (tabla de handlers/eventos) · modelo de almacenamiento (`settings.json`, dir de notas) | [reference/architecture.md](reference/architecture.md) | Tocar/añadir IPC, ubicar un archivo o componente, entender dónde vive cada dato |
| Formato v2 (carpeta por nota) · migración v1→v2 · cifrado de notas | [reference/note-format.md](reference/note-format.md) | Tocar el formato de nota, los parsers/serializadores (los 3 espejos), la migración o el cifrado |
| GitHub Sync (push/pull, cola de mutaciones remotas, invariantes) | [reference/sync.md](reference/sync.md) | Tocar la sincronización con GitHub |
| "El Cerebro": índice semántico local · vista cerebro · LLM/chat agéntico · segundo cerebro · secciones ocultas a la IA | [reference/ai.md](reference/ai.md) | Tocar embeddings, el grafo, el chat, las tools del agente o el perfil |
| Patrones y decisiones de arquitectura (perf sidebar/búsqueda, imports, overviews, hover preview, relaciones sección↔sección, sticky, alarmas, auto-update, soporte macOS, CLI, temas) | [reference/patterns.md](reference/patterns.md) | Entender una decisión de diseño o tocar uno de esos subsistemas |
| Proceso de release · electron-builder · CI/CD · artefactos · landing · tareas frecuentes | [reference/release.md](reference/release.md) | Hacer un release, tocar el build/CI o ejecutar tareas de mantenimiento |

> Reglas siempre-on (idioma UI, recompilar/commitear `dist-electron/`) están también en el
> `CLAUDE.md` de la raíz, que se carga en cada sesión sin depender de esta skill.

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
| Almacenamiento | Archivos `.md` en el dir de notas (ver `reference/architecture.md`) |
| Formato de notas | YAML frontmatter + cuerpo Markdown |

## Comandos de desarrollo

```bash
npm run dev            # Vite + Electron en paralelo (usa .electron-dev como user-data-dir)
npm run build          # tsc -b && vite build && tsc -p tsconfig.electron.json
npm run build:electron # solo compila electron/ → dist-electron/
npm run dist           # build + electron-builder (genera instaladores en release/)
npm run lint           # eslint
```
