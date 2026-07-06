# NoteFlow — Monetización (Fase 4): cuenta, IA gestionada, nube E2EE

> **Estado: Fase 4.0 IMPLEMENTADA** — cuenta NoteFlow en la app + lectura de entitlements +
> esquema SQL + panel Settings → Account (ver "Fase 4.0 — implementación" abajo). El **proyecto
> Supabase real ya está conectado** (`electron/cloudConfig.ts` lleva la URL y la anon key reales) y
> el **webhook de billing está implementado** (`supabase/functions/billing-webhook` + migración
> 0002). Pendiente del operador: crear los productos en Lemon Squeezy y desplegar la función
> (pasos en `supabase/README.md` § 5).
> Decisiones tomadas con el usuario (2026-07): backend **Supabase**, pagos por **Merchant of
> Record = Lemon Squeezy**, nube con **E2EE total**, IA gestionada con **OpenRouter** como único
> upstream. Las opciones gratuitas actuales (IA local/API propia, GitHub Sync) **se mantienen**.

## Visión de producto

Dos áreas de suscripción (mensual/anual), pensadas para el usuario que "no quiere comerse la cabeza":

1. **NoteFlow AI** — LLM gestionado por NoteFlow: sin Ollama, sin comprar API keys de terceros.
   Se suma a las opciones gratuitas existentes (local / key propia), no las sustituye.
2. **NoteFlow Cloud** — nube de notas superior al GitHub Sync gratuito: sync en tiempo real
   (push por websocket, no pull cada 5 min), sin fricción de push/pull, más rápido y fiable.
   Futuro no-foco: historial de versiones y compartir notas entre usuarios en tiempo real.

La decisión "un paquete vs dos planes" queda **abierta** — el esquema de entitlements soporta ambos.

## 1. Backend: Supabase (veredicto y caveats)

**Sí a Supabase** como backend único: Auth + Postgres/RLS + Realtime + Edge Functions + Storage en
un solo proyecto, y es Postgres debajo → portable/self-hosteable si un día hay que salir.
Cada pieza cubre una necesidad concreta:

| Necesidad | Pieza Supabase |
|---|---|
| Cuenta NoteFlow | Auth (email + OTP) |
| Entitlements, archivos de notas cifrados, metering de tokens | Postgres + RLS |
| Sync en tiempo real (lo que le falta al GitHub Sync) | Realtime |
| Proxy LLM con streaming SSE | Edge Functions (Deno) |
| Blobs grandes / adjuntos (futuro) | Storage |

**Caveats conocidos (revisar al implementar):**
- **Coste:** Pro ~25 $/mes cuando haya usuarios reales + egress. Las notas con **imágenes base64
  embebidas** engordan filas y egress → considerar cap de tamaño por archivo o mover blobs grandes
  a Storage.
- **Realtime:** `postgres_changes` escala regular con muchos suscriptores; si crece, migrar a
  canales **broadcast** por usuario (el cliente emite tras cada upsert).
- **Edge Functions:** wall-clock ~400 s y CPU baja — suficiente para el proxy (I/O-bound), pero
  chats muy largos podrían rozar el límite; si molesta, mover SOLO el proxy a Cloudflare Workers.
- **Tokens de Auth expiran ~1 h** → el preset LLM gestionado debe pedir un access token fresco por
  request (nunca guardar el JWT como si fuera una API key estática).

**Alternativas descartadas:** VPS propio + Node + Postgres (más control, demasiada operación para
un dev solo); Cloudflare Workers para todo (fragmenta la infra: auth y DB seguirían haciendo falta).

## 2. Cuenta NoteFlow + entitlements + pagos (MoR)

- **Auth:** Supabase Auth con **email + OTP de 6 dígitos** (sin deep links; misma UX de "código"
  que el Device Flow de GitHub ya establecido en la app). La sesión vive en el **proceso main**,
  espejo del patrón `githubSync`: refresh token cifrado con `safeStorage` en `settings.json`
  (sección `account`), **nunca cruza al renderer** — el renderer solo ve estado público
  (`{email, signedIn, entitlements}`).
- **Entitlements agnósticos al proveedor de pago:**
  `subscriptions(user_id, product 'ai'|'cloud'|'bundle', status, renews_at, provider, provider_ref)`
  poblada exclusivamente por los **webhooks del MoR** (Edge Function `billing-webhook`, valida
  firma). El cliente lee sus filas vía RLS (`user_id = auth.uid()`). Cambiar de proveedor de pago
  no toca el cliente.
- **Merchant of Record: Lemon Squeezy** (decidido 2026-07; ~5% + 0,50 por transacción). Razón:
  como vendedor particular/autónomo en España, el MoR es el vendedor legal y gestiona el **IVA por
  país de la UE** (con Stripe directo tocaría OSS/VIES y declarar IVA por país). El checkout se
  abre en el navegador (`app:open-url`) con `checkout[custom][user_id]=<uuid>` para correlar el
  webhook (lo hará la app en la fase 4.1).
- **Webhook de billing (implementado):** Edge Function `supabase/functions/billing-webhook`
  (Deno, cero dependencias) — verifica la firma HMAC-SHA256 de la cabecera `X-Signature` contra el
  body crudo (secret en `LEMONSQUEEZY_WEBHOOK_SECRET`; comparación constant-time vía
  `crypto.subtle.verify`), traduce el variant ID de LS a nuestro `product` con el env
  `LEMONSQUEEZY_VARIANT_MAP` (`"890123:ai,890124:cloud,..."`), mapea estados
  (`on_trial|active|cancelled → 'active'` — la suscripción cancelada sigue pagada hasta `ends_at`,
  coherente con el comentario de `electron/entitlements.ts`; `past_due|unpaid|paused →
  'past_due'`; `expired → 'expired'`) y aplica el evento con la RPC idempotente
  `apply_subscription_event` (migración 0002: upsert por índice único `(provider, provider_ref)` +
  guard `p_event_at >= updated_at` contra entregas fuera de orden; sin `user_id` en custom_data
  solo actualiza, nunca inserta). Eventos no procesables (variante desconocida, `data.type` ≠
  `subscriptions`, payload malformado) → 200 `{ignored}` para no entrar en el bucle de reintentos
  de LS. La lógica pura vive en `logic.ts` (agnóstica de Deno) y está testeada en
  `tests/supabase/billing-webhook.test.ts`. Deploy con `--no-verify-jwt` (LS no manda JWT).

## 3. NoteFlow AI — plan de IA gestionada

**Principio: el cliente ya sabe hablar con esto.** La capa LLM soporta proveedores
OpenAI-compatible con `baseUrl` propio (`electron/ai/llm/presets.ts`), así que el plan gestionado
es **un preset más**, no una implementación nueva.

- **Servidor — Edge Function `ai-proxy`** exponiendo `/chat/completions` + `/models`
  OpenAI-compatible: valida el JWT de Supabase → comprueba entitlement `ai` + cuota mensual →
  reenvía a **OpenRouter** (key secreta del servidor, una sola) con **passthrough del streaming
  SSE** → registra tokens del chunk final `usage` en `usage_events(user_id, model, tokens_in,
  tokens_out, at)`.
- **Upstream OpenRouter:** una key, cientos de modelos, cambiar el catálogo sin tocar infra
  (sobrecoste ~5%, asumido). Modelos **curados por plan** (baratos para el plan base; mejores si
  hay tier premium) — el proxy rechaza modelos fuera de la lista.
- **Cuotas:** presupuesto mensual por plan (tokens o coste estimado). Check previo al forward +
  registro posterior; cabeceras de "restante" en la respuesta para que la UI muestre el consumo.
- **Cliente:** preset `noteflow` en `presets.ts` (`impl: 'openai'`, `baseUrl` = URL del proxy,
  `needsKey: false`, `editableBaseUrl: false`, `suggestedModels` = lista curada). En
  `electron/ai/llm/index.ts`, la resolución de credencial para este preset obtiene un **access
  token fresco de la sesión de cuenta** en vez de leer `encryptedApiKey`. Capabilities: imágenes
  según los modelos curados; PDF no (sigue siendo anthropic-only). Todo lo demás — streaming,
  tool-calling agéntico, adjuntos, RAG — funciona sin cambios.
- **Privacidad (documentar en UI/landing):** el índice RAG sigue siendo 100% local; lo que viaja
  al proxy es lo mismo que viajaría a cualquier proveedor con key propia (pregunta + chunks
  recuperados). Las secciones `aiHidden` y las notas cifradas ya quedan fuera del índice y por
  tanto nunca salen. La IA gestionada NO pasa por la nube de notas (subsistemas independientes).

## 4. NoteFlow Cloud — nube de notas E2EE

**Decisión: E2EE total.** El servidor solo ve ciphertext; ni el operador puede leer las notas.
Es el argumento de privacidad del plan y encaja con el ADN local-first de la app.

### Jerarquía de claves
- **Master key (DEK)** aleatoria de 256 bits, generada en cliente al activar la nube.
- **KEK** derivada de una **passphrase** del usuario (PBKDF2-SHA256 con iteraciones altas —
  reutilizar primitivas de `src/lib/cryptoUtils.ts`, hoy usadas para el cifrado por nota) que
  **envuelve** la DEK.
- **Recovery code** aleatorio mostrado UNA vez, que también envuelve la DEK (segunda vía de
  acceso). Perder passphrase + recovery = **datos irrecuperables** — avisar explícitamente en UI.
- Las DEK envueltas se guardan en el servidor (tabla `user_keys`) — el servidor nunca ve la DEK.
- **Clave por nota desde el día 1**, envuelta por la master key: habilita compartir (re-envolver
  la clave de esa nota para el destinatario) y rotación sin recifrar todo el corpus.

### Modelo de datos
```
files(user_id, path_key, path_ct, content_ct, updated_at, deleted,
      PRIMARY KEY (user_id, path_key))
```
- `path_key = HMAC(clave derivada de la DEK, relPath)` — identificador opaco; no filtra
  títulos/slugs (el relPath actual contiene el título de la nota).
- `path_ct` = relPath cifrado (para reconstruir el árbol en un dispositivo nuevo).
- `content_ct` = contenido AES-256-GCM (IV aleatorio por escritura).
- `updated_at` **en claro** (solo filtra timing): lo pone el cliente desde el frontmatter y es la
  base de la resolución de conflictos con la **carpeta como unidad** (misma regla que el pull del
  GitHub Sync).

### Sync engine (`electron/cloudSync.ts`, futuro)
- El GitHub Sync ya es un modelo "archivo por ruta relativa" (`schedulePush(relPath, content)`,
  pull por carpeta, `scheduleDelete`/`scheduleDeleteDir`, `getSyncStatus`) → mapea 1:1 a la tabla
  `files`. Extraer una interfaz **`SyncProvider`** común y que `main.ts` enchufe GitHub o Cloud
  según settings. **Mutuamente excluyentes** (elegir uno en Settings → Sync).
- **Sin cola de mutaciones:** Postgres soporta upserts concurrentes — desaparece el invariante de
  serialización del GitHub Sync (la cola `enqueueMutation` es un workaround de la Contents API).
  Upserts directos con reintento simple.
- **Tiempo real:** suscripción Realtime a los cambios de `files` del usuario → aplicar en caliente
  (equivale a un pull dirigido a esas carpetas). Adiós al autosync de 5 min.

### Futuro (no-foco, solo dejar la puerta abierta)
- **Historial de versiones:** tabla `file_versions` (insert del cliente en cada push; blobs
  cifrados, retención N días/versiones). Con E2EE no hay diffs server-side — versiones opacas.
- **Compartir notas:** re-envolver la clave de la nota para otro usuario + RLS (por eso
  clave-por-nota desde el inicio).
- **Acceso web:** requeriría crypto client-side en el navegador; posible pero lejos del roadmap.

## 5. Roadmap por fases

| Fase | Contenido |
|---|---|
| **4.0 Fundación** | ✅ **Hecha** (cuenta en la app, AccountPanel, esquema `subscriptions` + RLS, proyecto Supabase real conectado, webhook `billing-webhook` de Lemon Squeezy). Pendiente del operador: productos/variantes en LS + deploy de la función |
| **4.1 IA gestionada** | Edge Function `ai-proxy` + preset `noteflow` + cuotas/metering + UI de suscripción y consumo |
| **4.2 Nube E2EE** | Jerarquía de claves + `cloudSync.ts` (interfaz `SyncProvider`) + Realtime + onboarding passphrase/recovery + coexistencia/migración desde GitHub Sync |
| **4.3 Futuro** | Historial de versiones, compartir notas, ¿acceso web? |

## 6. Fase 4.0 — implementación (parte cliente/repo)

**Sin dependencias nuevas:** nada de `@supabase/supabase-js` — GoTrue (Auth) y PostgREST son REST
puro vía `fetch` desde el proceso main.

- **`supabase/migrations/0001_foundation.sql`** — tabla `public.subscriptions` (`product`
  `'ai'|'cloud'|'bundle'`, `status` `'active'|'past_due'|'canceled'|'expired'`, `provider`,
  `provider_ref`, `renews_at`) + índice por `user_id` + RLS con **una única policy `select`**
  (`auth.uid() = user_id`). Sin policies de escritura: solo el service role (webhook del MoR,
  fase 4.1+) escribirá.
- **`supabase/README.md`** — pasos del operador: crear proyecto → correr migración → habilitar
  provider Email y editar la plantilla **"Magic Link"** para enviar `{{ .Token }}` (por defecto
  manda enlace, no código) → copiar URL + anon key a `cloudConfig.ts`.
- **`electron/cloudConfig.ts`** — `SUPABASE_URL` / `SUPABASE_ANON_KEY` (placeholders vacíos) +
  `isCloudConfigured()`. La anon key es pública por diseño (como el client ID de GitHub);
  la seguridad la da RLS.
- **`electron/account.ts`** — capa de sesión, espejo estructural de `githubSync.ts`:
  - Persistencia en `settings.json` sección `account` = `{email, userId, encryptedRefreshToken}`;
    el refresh token se cifra reutilizando `encryptSecret/decryptSecret` de
    `electron/ai/llm/secret.ts` (safeStorage + fallback base64). El **access token vive solo en
    memoria** con su expiry.
  - `requestOtp` (`POST /auth/v1/otp`, `create_user: true`), `verifyOtp`
    (`POST /auth/v1/verify`, `type:'email'`; guarda sesión + primer fetch de entitlements),
    `getAccessToken` (refresca si expira en <60 s vía `/auth/v1/token?grant_type=refresh_token`;
    **GoTrue rota el refresh token → se persiste siempre el nuevo**, con single-flight para evitar
    carreras; 400/401 = revocado → limpia sesión y notifica), `signOut` (logout best-effort +
    limpiar), `refreshEntitlements` (`GET /rest/v1/subscriptions` con RLS), `getAccountStatus`
    (estado público, **nunca** tokens), `onStatusChanged`, `initAccount` (al arrancar, si hay
    sesión: refresh de entitlements diferido 5 s, no bloquea el boot).
- **`electron/entitlements.ts`** — `computeEntitlements(rows)` pura: producto activo si hay fila
  con ese product (o `bundle`) y `status === 'active'`. Vive en `electron/` (no `src/lib/`) porque
  `tsconfig.electron.json` (`rootDir: 'electron'`) no puede importar de `src/` y el renderer solo
  ve los booleanos derivados. Testeada en `tests/electron/entitlements.test.ts`.
- **IPC** — handlers `account:get-status` / `account:request-otp` / `account:verify-otp` /
  `account:sign-out` / `account:refresh-entitlements`; evento `account:status-changed` (broadcast
  del status público a todas las ventanas, patrón `sync:status-changed`). Bridge en `preload.ts`
  (`getAccountStatus`, `accountRequestOtp`, `accountVerifyOtp`, `accountSignOut`,
  `accountRefreshEntitlements`, `onAccountStatusChanged`) y tipos `AccountStatus` /
  `AccountEntitlements` en `src/types/index.ts`.
- **UI** — `src/components/Settings/AccountPanel.tsx` (sección "Account" en `SettingsModal`, UI en
  inglés): no configurado → placeholder informativo; signed out → email → código de 6 dígitos;
  signed in → email + badges de plan + Refresh + Sign out + "Subscriptions are coming soon.".
