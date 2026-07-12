# NoteFlow — Monetización (Fase 4): cuenta, IA gestionada, nube E2EE

> **Estado: Fases 4.0 y 4.1 DESPLEGADAS Y OPERATIVAS** — no solo implementadas en código: producto
> real en Lemon Squeezy (variantes mensual/anual), Edge Functions desplegadas (`billing-webhook` +
> `ai-proxy`), webhook dado de alta, migraciones 0001-0003 corridas, y el flujo probado
> **end-to-end** (alta de cuenta, checkout, entitlement aplicada, chat vía el preset `noteflow`)
> — en **modo test** de Lemon Squeezy. **Único pendiente del operador: el paso a live mode**
> cuando LS apruebe la verificación de la store (detalle en § 3, "Pendiente del operador"). Cuenta NoteFlow en la app + entitlements + esquema SQL + panel Settings → Account
> (ver "Fase 4.0 — implementación" abajo) y la **IA gestionada**: `usage_events` + `get_month_usage`
> + preset `noteflow` en el cliente + botón de suscripción en Settings → Account + auto-activación
> del preset al suscribirse + sección dedicada en `LlmConfigView` (ver § 3, "implementación"). El
> **proyecto Supabase real está conectado** (`electron/cloudConfig.ts`).
> Decisiones tomadas con el usuario (2026-07): backend **Supabase**, pagos por **Merchant of
> Record = Lemon Squeezy**, nube con **cifrado dual managed/e2ee** (modelo Obsidian: managed por
> defecto, E2EE estricto opt-in — decisión revisada, antes "E2EE total"; ver § 4), IA gestionada
> con **OpenRouter** como único upstream. Las opciones gratuitas actuales (IA local/API propia,
> GitHub Sync) **se mantienen**.

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
  abre en el navegador vía el IPC `account:open-checkout` (main construye la URL con
  `checkout[custom][user_id]=<uuid>` — la correlación del webhook — y la abre con
  `shell.openExternal`; el userId nunca cruza al renderer). Implementado en la fase 4.1.
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

## 3. NoteFlow AI — IA gestionada (IMPLEMENTADA, fase 4.1)

**Principio: el cliente ya sabe hablar con esto.** La capa LLM soporta proveedores
OpenAI-compatible con `baseUrl` propio (`electron/ai/llm/presets.ts`), así que el plan gestionado
es **un preset más**, no una implementación nueva.

- **Servidor — Edge Function `supabase/functions/ai-proxy`** (Deno, cero dependencias; lógica pura
  en `logic.ts`, testeada en `tests/supabase/ai-proxy.test.ts`) exponiendo `POST
  .../ai-proxy/chat/completions` + `GET .../ai-proxy/models` OpenAI-compatible. Pipeline por
  request: resuelve el access token del caller a `user_id` vía `/auth/v1/user` (401 si inválido) →
  entitlement `ai`/`bundle` activo consultando `subscriptions` con el service role (403 con error
  OpenAI-shaped si no) → cuota mensual vía RPC `get_month_usage` (429 si superada; cabeceras
  `X-NoteFlow-Tokens-Used`/`X-NoteFlow-Tokens-Limit` en las respuestas) → allowlist de modelos
  (400 si fuera) → forward a **OpenRouter** con la key del servidor inyectando `usage:
  {include: true}` (extensión que añade el bloque `usage` al último chunk SSE) y **eliminando del
  body los campos de enrutado/coste de OpenRouter** (`models`, `route`, `provider`, `plugins` —
  la allowlist solo valida `model` y esos campos permitirían ejecutar modelos caros fuera de la
  lista o comprar features extra con la key del operador; ver `buildUpstreamBody`). El stream se
  devuelve en **passthrough** mientras un `tee()` lo escanea (`createSseUsageScanner`) y al acabar
  inserta la fila en `usage_events` (migración 0003: tabla + RPC `get_month_usage`, solo service
  role escribe/invoca; **migración 0007** añade la columna `quota_tokens` — ver "Cuota ponderada")
  — registro **best-effort**, un fallo no rompe la respuesta. Se despliega **con verify JWT**
  (default; a diferencia del webhook). Env: `OPENROUTER_API_KEY` (secreto), `AI_MONTHLY_TOKENS`
  (default 3M, ahora en **tokens ponderados**) y `AI_ALLOWED_MODELS` (default: lista curada en
  `logic.ts`).
- **Cuota ponderada por modelo (migración 0007):** el catálogo mezcla modelos baratos y
  "avanzados" (más caros), así que la cuota mensual ya no cuenta tokens reales sino **tokens
  ponderados**. Cada modelo tiene un multiplicador (`MODEL_QUOTA_MULTIPLIERS` en
  `ai-proxy/logic.ts`: solo los ≠×1; lo que no esté es ×1) y lo que descuenta de la cuota es
  `computeQuotaTokens = round((tokens_in+tokens_out) * multiplicador)`. Hoy: **estándar ×1**,
  **avanzados ×6**. `tokens_in`/`tokens_out` siguen guardándose sin ponderar (coste real del
  operador); lo ponderado va a la columna nueva `usage_events.quota_tokens`, que es lo que
  `get_month_usage` suma (0007 la redefine + backfill de filas históricas = tokens reales, todas
  eran ×1). El multiplicador se refleja en el cliente (`NOTEFLOW_AI_MODEL_META` en `presets.ts`)
  para etiquetar el coste en el selector de modelos — **mantener en sync** con el mapa del proxy.
- **Endpoint `GET .../ai-proxy/usage`:** devuelve `{used, limit}` (tokens ponderados del mes +
  cuota) tras resolver el token a `user_id`, **sin gate de entitlement** (ver el consumo es
  inocuo y sigue siendo útil tras caducar la suscripción). Lo consume el IPC `ai:llm-usage`
  (main pide un access token fresco; devuelve `null` ante cualquier fallo — la UI solo oculta la
  barra) que alimenta la barra de consumo de la card premium en `LlmConfigView`.
- **Upstream OpenRouter:** una key, cientos de modelos, cambiar el catálogo sin tocar infra
  (sobrecoste ~5%, asumido). Lista curada actual (todos tool-calling; **visión en todos salvo los
  dos DeepSeek**, text-only) — **estándar ×1:** `openai/gpt-4o-mini`, `openai/gpt-4.1-mini`,
  `anthropic/claude-haiku-4.5`, `google/gemini-2.5-flash`, `deepseek/deepseek-v4-flash`,
  `deepseek/deepseek-v4-pro`, `minimax/minimax-m3`; **avanzados ×6:** `anthropic/claude-sonnet-5`,
  `openai/gpt-5.2`, `google/gemini-3.5-flash`. **Duplicada a propósito** en
  `DEFAULT_ALLOWED_MODELS` (`ai-proxy/logic.ts`) y `NOTEFLOW_AI_MODELS` (`presets.ts`): mantener
  en sync. La visión por-modelo la refina `providerCapabilities(preset, activeModel)` para el
  preset `noteflow` (los DeepSeek → `images:false`).
- **Cliente:** preset `noteflow` **primero** en `presets.ts` (`impl: 'openai'`, `baseUrl` =
  `AI_PROXY_URL` de `cloudConfig.ts`, `needsKey: false`, `editableBaseUrl: false`).
  ⚠️ `presetOf()` con id desconocido cae **explícitamente en `anthropic`** (ya no en `PRESETS[0]`)
  y `DEFAULT_LLM_CONFIG.active` sigue siendo `'anthropic'` — usuarios existentes no cambian.
  La credencial es un **access token fresco** por request: `resolveConfigAsync()` en
  `llm/index.ts` (llama a `account.getAccessToken()`; lanza error accionable sin sesión) — main
  la usa en chat/list-models/test/profile-generate; `resolveConfig` síncrona queda para el resto.
  `toPublic().configured` para este preset exige sesión + entitlement `ai`, y
  `notConfiguredMessage()` da el motivo exacto ("sign in" vs "requires subscription").
  Capabilities: imágenes sí (modelos curados con visión); PDF no (anthropic-only).
- **UI:** el preset **NoteFlow AI ya no aparece en el `<select>` de proveedores** de
  `LlmConfigView` (se filtra explícitamente por id) — tiene su propia **card "premium"** (acento
  de marca, `border-accent/50 bg-accent/15`) por encima de la lista normal, visible solo si
  `account.entitlements.ai` está activa **o** si ya es el proveedor activo (caso de suscripción
  perdida: sigue viendo la card para entender qué pasa y cambiar de proveedor desde el `<select>`).
  La card tiene un botón "Use NoteFlow AI" (`changeProvider('noteflow')`) cuando no es el activo, o
  un check "Active" cuando sí lo es; el aviso ámbar de sesión/suscripción faltante
  (`noteflowSignIn`/`noteflowNeedsSubscription`) vive ahora dentro de esa card, no en la principal.
  `LlmConfigView` refresca la config al cambiar el estado de cuenta (`onAccountStatusChanged`).
  En `AccountPanel`, si hay sesión sin entitlement `ai` y `LEMONSQUEEZY_CHECKOUT_URLS.ai` no está
  vacía, botón "Subscribe to NoteFlow AI" → IPC `account:open-checkout` (main construye la URL con
  `checkout%5Bcustom%5D%5Buser_id%5D=<uuid>` y la abre con `shell.openExternal`; el userId
  **no cruza al renderer**). URL vacía = botón oculto ("Subscriptions are coming soon.").
- **Auto-activación al suscribirse:** `electron/main.ts` (junto a `account.onStatusChanged`)
  detecta la transición real `entitlements.ai` `false→true` **dentro de la misma sesión de
  cuenta del proceso en curso** y cambia `settings.aiLlm.active` a `'noteflow'` automáticamente
  (si no lo era ya) antes de emitir `account:status-changed`, para que el renderer recargue ya
  con el proveedor correcto.
  **Matiz importante:** `entitlements` no se persiste (arranca en `NO_ENTITLEMENTS` en cada boot;
  ver "implementación" abajo) — para no forzar el cambio en cada arranque de un usuario ya
  suscrito, se fija una **baseline por identidad** (`aiEntitlementBaseline` + `aiEntitlementIdentity`
  = el email de la sesión, o `null` en signed-out) en la PRIMERA observación de cada identidad
  (boot con sesión persistida, justo tras `verifyOtp`, o tras un `signOut`) sin disparar nada;
  solo una transición posterior **para la misma identidad** en el mismo proceso (p. ej. "Subscribe"
  en el navegador → volver → "Refresh" en Settings → Account) dispara el auto-switch. **La
  identidad se re-arma en cada cambio de `signedIn`/email** — necesario porque la UI permite
  sign-out + sign-in sin reiniciar la app: sin este reset, una cuenta B que YA tenía la
  entitlement antes de este proceso (y se loguea después de que la cuenta A, sin entitlement,
  cierre sesión) heredaría la baseline `false` de A y se auto-switchearía indebidamente al
  reflejar por primera vez su propia entitlement `true`. Nunca se auto-switchea al revés (perder
  la entitlement no cambia de proveedor).
- **Pendiente del operador (cuota ponderada):** correr la **migración 0007** (`supabase db push`)
  y **redesplegar `ai-proxy`** (`supabase functions deploy ai-proxy`) para que el nuevo catálogo,
  los multiplicadores y el endpoint `/usage` entren en vigor. Sin redeploy, el proxy sigue
  sirviendo el catálogo viejo y `get_month_usage` (si 0007 no se corrió) sumaría una columna
  inexistente.
- **Pendiente del operador (billing):** el **paso a live mode de Lemon Squeezy** (la store está en
  verificación; el circuito actual corre sobre el producto de **test mode**). Al aprobarse:
  recrear producto + variantes en live (los variant IDs **cambian**) → actualizar el secret
  `LEMONSQUEEZY_VARIANT_MAP` → dar de alta el webhook en live (mismo endpoint y signing secret) →
  cambiar la URL de checkout en `cloudConfig.ts` + `npm run build`. Todo lo demás está: 0003
  corrida, secrets puestos, `ai-proxy` desplegado, flujo probado end-to-end en test (ver
  `supabase/README.md` §§ 5-6 para repetir el proceso en otro proyecto).
- **Privacidad (documentar en UI/landing):** el índice RAG sigue siendo 100% local; lo que viaja
  al proxy es lo mismo que viajaría a cualquier proveedor con key propia (pregunta + chunks
  recuperados). Las secciones `aiHidden` y las notas cifradas ya quedan fuera del índice y por
  tanto nunca salen. La IA gestionada NO pasa por la nube de notas (subsistemas independientes).

## 4. NoteFlow Cloud — nube de notas cifrada (managed | e2ee)

**Decisión (2026-07, revisada): modelo Obsidian Sync — dos modos de cifrado a elegir.** El modo
**estándar "managed"** es el DEFAULT (cero secretos que guardar; el operador custodia la clave y
técnicamente podría leer las notas — se comunica con honestidad en la UI) y el modo **privado
"e2ee"** es opt-in (E2EE estricto con passphrase + recovery: el servidor solo ve ciphertext, ni
el operador puede leer). La decisión original "E2EE total" se relajó porque obligar a todo
usuario a custodiar una passphrase es hostil para el usuario medio; el E2EE queda como feature
diferencial de privacidad, no como peaje.

> **Estado: tramos 1, 2, 3 y 4 implementados + modo dual managed/e2ee.** Tramo 1 (fundación):
> migración `supabase/migrations/0004_cloud.sql` (`user_keys` + `files` + RLS) y
> `electron/cloudCrypto.ts` (capa criptográfica pura, testeada en
> `tests/electron/cloudCrypto.test.ts`). Tramo 2 (motor de sync): `electron/cloudKeys.ts`
> (sesión de claves), `electron/cloudSync.ts` + `electron/cloudSyncLogic.ts` (motor, lógica pura
> testeada en `tests/electron/cloudSync.test.ts`), interfaz `SyncProvider`
> (`electron/syncProvider.ts`) y los IPC `cloud:*`. Tramo 3 (Realtime): migración
> `0006_cloud_realtime.sql` + `electron/cloudRealtime.ts`/`cloudRealtimeLogic.ts` (ver
> "Tiempo real" abajo). Tramo 4 (UI): onboarding con elección de modo
> + panel en Settings → Sync + enforcement visual de la exclusión mutua con GitHub Sync (ver
> "Settings UI" abajo). Modo dual: migración `0005_cloud_managed.sql` + Edge Function
> `cloud-keys` + rama managed en `cloudKeys.ts` (ver "Modos de cifrado" abajo).
> **Migración 0006 aplicada al proyecto real (2026-07-12)** y smoke E2E verificado: edición
> local → push → evento `postgres_changes` → pull reactivo en segundos (vs. tick de 5 min).
> De paso se saneó el tracking remoto de migraciones (`supabase migration repair` de 0001-0005,
> que se habían aplicado por SQL Editor): a partir de ahora `supabase db push` funciona directo.
> ⚠️ Para probar Cloud sin producto en LS existe una **suscripción manual de pruebas** en
> `subscriptions` (`provider='manual'`, product `cloud`, cuenta del operador) — **borrarla
> cuando exista el producto Cloud real** (`delete from public.subscriptions where provider = 'manual'`).

### Modos de cifrado (managed | e2ee)

- **`managed` (estándar, DEFAULT):** la DEK se genera igual en el cliente, pero se deposita en
  el servidor envuelta por la **KEK del operador** (secret `CLOUD_MANAGED_KEK`, 32 bytes base64,
  solo conocida por la Edge Function `supabase/functions/cloud-keys`; lógica pura en `logic.ts`
  testeada en `tests/supabase/cloud-keys.test.ts`). El usuario no guarda NINGÚN secreto: con
  sesión iniciada el unlock es silencioso y automático. Trade-off honesto (copy de la UI): las
  notas van cifradas en tránsito y en reposo, pero NoteFlow **técnicamente podría** leerlas.
  - `POST cloud-keys/setup` `{dek}` → envuelve e inserta la fila `user_keys` con `mode='managed'`
    (409 si ya hay fila, mismo contrato que el setup e2ee). `POST cloud-keys/unlock` → devuelve
    `{dek}` al dueño de la sesión (404 sin fila; 409 si la fila es e2ee). **Sin gating por
    entitlement** (las claves siempre se pueden crear/leer, espejo de la RLS de `user_keys`).
    Se despliega CON verify JWT (default).
  - **Auto-unlock** (`autoUnlockManaged`, single-flight, nunca lanza): se intenta en el boot,
    al pasar a signed-in, desde el tick del autosync y desde la UI (IPC `cloud:auto-unlock`,
    polling de 10 s del panel mientras esté `locked`+managed). **Requisito duro: un usuario
    managed con sesión iniciada jamás ve una pantalla de unlock** (offline → `locked` con
    reintento silencioso). Cache local de la DEK: con `safeStorage` si está disponible; si no,
    simplemente NO se cachea (managed puede re-pedir la DEK al servidor en cada boot).
- **`e2ee` (privado, opt-in):** el flujo original passphrase + recovery code (secciones
  siguientes). El servidor nunca ve la DEK; perder passphrase + recovery = datos irrecuperables.
- **Esquema (migración `0005_cloud_managed.sql`):** columnas de passphrase/recovery de
  `user_keys` pasan a NULLABLE + `mode text not null default 'e2ee'` (default e2ee para que las
  filas preexistentes queden correctas sin backfill) + `dek_managed_ct` (DEK envuelta por la KEK
  del operador, mismo formato de blob sellado) + CHECK `user_keys_mode_coherent` (managed exige
  `dek_managed_ct`; e2ee exige el juego completo passphrase+recovery). RLS sin cambios;
  `dek_managed_ct` lo escribe solo el service role **por convención** (un write directo del
  cliente es inocuo: no conoce la KEK del operador).
- **Upgrade managed → e2ee, ONE-WAY** (`upgradeCloudKeysToE2ee`, IPC `cloud:upgrade-e2ee`, botón
  "Switch to private mode" del panel): requiere `unlocked`; envuelve la DEK vigente con la nueva
  passphrase + recovery code nuevo y hace PATCH de la fila (`mode='e2ee'`, `dek_managed_ct=NULL`)
  — lo permite la RLS de ownership. La **DEK no cambia** (no se recifra el corpus): las notas ya
  subidas pudieron ser técnicamente accesibles durante el modo managed — se avisa en la UI, no se
  resuelve (rotar la DEK cambiaría todos los `path_key` HMAC → re-upload completo, fuera de
  alcance). **No hay downgrade** e2ee → managed (debilitaría el cifrado en silencio).
- El estado público (`CloudSyncStatus`) lleva `keysMode: 'managed' | 'e2ee' | null` (null = sin
  fila o aún desconocido); persiste en `settings.cloudSync.keysMode` como cache de arranque.

### Jerarquía de claves (implementada en `electron/cloudCrypto.ts`)
- **Master key (DEK)** aleatoria de 256 bits, generada en cliente al activar la nube.
- **KEK** derivada de una **passphrase** del usuario (PBKDF2-SHA256, 310.000 iteraciones por
  defecto — mismos parámetros que `src/lib/cryptoUtils.ts`, el cifrado por nota; módulo propio
  en `electron/` porque `tsconfig.electron.json` no puede importar de `src/`) que **envuelve**
  la DEK.
- **Recovery code** aleatorio mostrado UNA vez, que también envuelve la DEK (segunda vía de
  acceso). Formato: 6 grupos de 5 chars (`XXXXX-XXXXX-...`), alfabeto de 32 chars sin ambiguos
  (sin 0/O/1/I) → 150 bits de entropía; el input del usuario se normaliza (mayúsculas, sin
  separadores). Perder passphrase + recovery = **datos irrecuperables** — avisar explícitamente
  en UI.
- Las DEK envueltas se guardan en el servidor (tabla `user_keys` de la migración 0004: una fila
  por usuario con `dek_pass_ct`/`pass_salt`/`pass_iterations` + `dek_recovery_ct`/`recovery_salt`/
  `recovery_iterations`) — el servidor nunca ve la DEK. RLS: solo ownership (select/insert/
  update/delete con `auth.uid() = user_id`); las claves deben poder crearse/leerse siempre,
  también sin suscripción activa.
- **Clave por nota desde el día 1**, envuelta por la master key: habilita compartir (re-envolver
  la clave de esa nota para el destinatario) y rotación sin recifrar todo el corpus.
- **Formato de blob sellado** (todas las columnas `*_ct`): `base64url(iv de 12 bytes || AES-256-
  GCM ciphertext+tag)` — IV aleatorio por operación, viaja con el ciphertext.

### Modelo de datos (migración `0004_cloud.sql`)
```
files(user_id, path_key, path_ct, content_ct, key_ct, updated_at, deleted,
      PRIMARY KEY (user_id, path_key))
+ índice (user_id, updated_at) para el pull incremental
```
- `path_key = HMAC-SHA256(subclave de la DEK, relPath)` en base64url — identificador opaco y
  determinista; no filtra títulos/slugs (el relPath actual contiene el título de la nota). La
  subclave HMAC se deriva de la DEK con HKDF (info `'noteflow-cloud-path'`) para no reutilizar
  la DEK cruda en dos usos.
- `path_ct` = relPath cifrado con la clave de la nota (para reconstruir el árbol en un
  dispositivo nuevo).
- `content_ct` = contenido AES-256-GCM (IV aleatorio por escritura).
- `key_ct` = **clave de la nota envuelta por la DEK, duplicada en cada fila**: las filas de una
  misma carpeta de nota comparten la misma clave de nota, pero cada fila lleva su propia copia
  envuelta — la tabla queda auto-contenida (una fila basta para descifrarse) y permite
  re-envolver por nota para compartir/rotar en el futuro.
- `updated_at` **en claro** (solo filtra timing): lo pone el cliente desde el frontmatter y es la
  base de la resolución de conflictos con la **carpeta como unidad** (misma regla que el pull del
  GitHub Sync).
- **RLS con gating por entitlement:** `select` y `delete` solo piden ownership (un usuario cuya
  suscripción caduca sigue pudiendo bajar y borrar sus datos), pero `insert` y `update` exigen
  además fila en `subscriptions` con product `cloud`/`bundle` y `status = 'active'`. Ojo: el
  tombstone (`deleted = true` vía update) también queda gateado — sin suscripción, propagar
  borrados es vía `DELETE` físico.

### Sesión de claves (`electron/cloudKeys.ts`, tramo 2 — implementada)
- `setupCloudKeys(passphrase)`: genera DEK + recovery code, envuelve la DEK con ambas KEKs, sube
  la fila `user_keys` (rechaza si ya existe una — rotación de claves será un flujo explícito
  futuro) y **devuelve el recovery code UNA vez** (jamás se persiste ni se loguea).
- `unlockCloudKeys(secret)`: baja `user_keys` e intenta desenvolver **como passphrase primero**;
  si falla y el input tiene la forma exacta de un recovery code (30 chars normalizados,
  `looksLikeRecoveryCode` en `cloudCrypto.ts` — validado ANTES de derivar, para dar error claro),
  lo intenta como recovery. `lockCloudKeys()` descarta la DEK; estado
  `unlocked | locked | no-keys` (`no-keys` = confirmado que la cuenta no tiene fila `user_keys`).
- **La DEK vive SOLO en memoria del main** — nunca cruza al renderer ni toca disco en claro.
  **Cache de conveniencia (decisión):** la DEK se persiste cifrada con `safeStorage` en
  `settings.cloudSync.encryptedDek` para no pedir la passphrase en cada arranque
  (`initCloudKeys()` la restaura en el boot) — **SOLO si `safeStorage.isEncryptionAvailable()`**;
  jamás con el fallback base64 que se usa para tokens (una master key en base64 en disco anularía
  el E2EE). `lockCloudKeys()` borra también la cache.
- Helper `supabaseRest()` exportado (PostgREST con token fresco por request vía
  `account.getAccessToken()`) — lo reutiliza `cloudSync.ts`.

### Sync engine (`electron/cloudSync.ts` + lógica pura en `cloudSyncLogic.ts`, tramo 2 — implementado)
- Mismo modelo "archivo por ruta relativa" y **misma regla de conflicto** que el GitHub Sync
  (la carpeta de nota es la unidad; decide el `updated:` del `note.md`). `main.ts` enruta por la
  interfaz **`SyncProvider`** (`electron/syncProvider.ts`, ver `sync.md`); **mutuamente
  excluyentes**: si `cloudSync.enabled`, Cloud tiene prioridad y el loop de GitHub se salta
  (enforcement en Settings UI = tramo 4).
- **Sin cola de mutaciones:** Postgres soporta upserts concurrentes — el invariante de
  serialización del GitHub Sync es un workaround de la Contents API que aquí no aplica. Upserts
  directos (`POST /rest/v1/files?on_conflict=user_id,path_key` +
  `Prefer: resolution=merge-duplicates`) con **un** reintento ante error de red/5xx.
- **`updated_at` por fila (decisión):** `note.md` → su propio `updated:` del frontmatter; los
  `.md` de sección → el `updated:` del **ancla de su carpeta** (leído de disco al pushear — así
  una edición viaja como grupo coherente en la ventana incremental de otros dispositivos); los
  json de metadatos de raíz → momento de escritura. Fallback: momento de escritura.
- **Clave de nota por carpeta:** cache en memoria `dir → noteKey`, sembrada por los pulls y
  poblada bajo demanda (GET del `key_ct` del ancla remota y unwrap; si la nota es nueva, clave
  fresca). Los metadatos de raíz usan clave propia por fila.
- **Deletes = tombstones (decisión):** `PATCH deleted=true, content_ct=''` (el `path_ct`/`key_ct`
  se conservan) para que otros dispositivos se enteren en su pull incremental — **no hay borrado
  por ausencia** (el pull incremental no ve filas "que faltan"). El borrado local aplica la regla
  de seguridad de siempre (`updated <= lastSync`). Sin entitlement, RLS bloquea el UPDATE →
  fallback a `DELETE` físico (la fila desaparece sin notificar a otros dispositivos — asumido:
  sin suscripción tampoco pueden pushear).
- **Pull incremental:** `GET files?updated_at=gt.<pullCursor>` (índice de la 0004), paginado
  (PostgREST capa a 1000 filas). **Dos marcas (decisión):** `pullCursor` = watermark del máximo
  `updated_at` remoto reconciliado (filtro incremental — los timestamps los ponen los clientes
  desde el frontmatter, usar "ahora" saltaría filas de otros dispositivos con reloj/timestamps
  más viejos) y `lastSync` = hora de pared del último pull (regla de borrado + UI). El primer
  pull (sin cursor) filtra `deleted=eq.false`. Las rutas descifradas se sanean
  (`isSafeCloudRelPath`) antes de tocar disco.
- **Journal (decisión):** reutiliza las transiciones puras de `electron/syncState.ts` pero
  persiste en su PROPIO `userData/cloud-sync-state.json` (los dos backends no deben reproducirse
  ops mutuamente); el sha-cache no aplica (el pull incremental ya evita trabajo). Pushes con
  claves bloqueadas o offline quedan journaled y drenan tras unlock/reconexión
  (`retrySyncJournal`, mismo contrato que GitHub). Un 403 de RLS (suscripción caducada) se mapea
  a `syncError` accionable y **pausa** el drain de escrituras mientras la entitlement local
  también diga "no cloud" (sin bucle de reintentos).
- Gate de push hasta el primer pull OK (`initialPullStatus`, como GitHub) +
  `flushPendingLocalChanges`: en la PRIMERA sincronización (sin `lastSync` previo) esto sube el
  corpus local entero, metadatos incluidos.
- `disableCloudSync()` conserva `lastSync`/`pullCursor`/journal (re-habilitar retoma incremental
  y los deletes pendientes no se pierden); las claves no se tocan (lock es acción aparte).
- **Tiempo real (tramo 3, implementado):** `electron/cloudRealtime.ts` abre un **WebSocket puro**
  (el `WebSocket` global de Node 22 — sin `@supabase/supabase-js` ni `ws`) contra Supabase
  Realtime (protocolo Phoenix, vsn=1.0.0) y se une a un canal con `postgres_changes` sobre
  `public.files` filtrado `user_id=eq.<uid>` (migración `0006_cloud_realtime.sql` añade la tabla
  a la publicación `supabase_realtime`; sin `replica identity full` — `user_id` está en la PK).
  **El payload del evento NO se aplica en caliente** (es ciphertext): es solo una **señal** que
  `main.ts` debouncea (1,5 s — un push ajeno llega como ráfaga de filas) y convierte en un ciclo
  de sync normal (`runCloudSyncCycle`, single-flight con marca dirty: auto-unlock managed →
  `retrySyncJournal` → skip si hay mutaciones en vuelo → `pullNotes`). Detalles: heartbeat cada
  25 s (ack perdido = reconectar), token JWT fresco en cada reconexión + push `access_token`
  cada 45 min (expiran ~1 h), backoff exponencial con jitter (1 s → cap 60 s, reset al unirse),
  silencioso offline. Lógica pura (frames/clasificación/backoff) en `cloudRealtimeLogic.ts`,
  testeada en `tests/electron/cloudRealtime.test.ts`. **Ciclo de vida:** corre solo con Cloud
  enabled + sesión + claves unlocked — `syncCloudRealtimeState()` en `main.ts` reconcilia en
  cada transición (choke points: `emitCloudStatusChanged` y `handleAccountStatusChanged`; el
  sign-out lo para). El loop periódico queda como **red de seguridad** cada 5 min
  (`CLOUD_AUTO_SYNC_INTERVAL_MS`: cubre WS caído y drena el journal offline). El estado público
  expone `realtimeConnected` (informativo, aún sin UI).

### Settings UI (tramo 4 — implementado)
- **Ubicación:** la página **Settings → Sync** contiene DOS secciones —
  `src/components/Settings/CloudPanel.tsx` (NoteFlow Cloud, arriba) y la sección GitHub debajo
  (mismo `SyncPanel.tsx`, cuerpo extraído a un componente interno `GitHubSyncSection`). Textos
  vía i18n `t.settings.cloud.*` (+ `t.settings.sync.githubTitle`/`pausedByCloud`).
- **El panel renderiza según `keysState` + cuenta:** sin sesión → "sign in en Settings → Account";
  `no-keys` → formulario de passphrase (input + confirmación, mínimo 8 chars) → `cloudSetup` →
  el **recovery code se muestra UNA vez** en un bloque ámbar que oculta el resto del panel hasta
  pulsar "I have saved my recovery code" (vive solo en estado local del componente, con botón
  Copy y aviso rojo de irrecuperabilidad); `locked` → un único input acepta passphrase O recovery
  (el backend distingue) → `cloudUnlock`; `unlocked` → badge enabled/disabled + Last sync +
  `syncError` (rojo, accionable) + botones Enable/Disable, Sync now (`cloudPull`, resultado tipo
  GitHub) y Lock.
- **Gating (decisión):** solo **Enable sync** exige la entitlement `cloud` — sin ella, mensaje
  "requires subscription" + botón "Subscribe to NoteFlow Cloud" si
  `LEMONSQUEEZY_CHECKOUT_URLS.cloud` no está vacía (hoy LO ESTÁ — no existe el producto en LS;
  el botón queda oculto y se muestra "Subscriptions are coming soon"). Setup/unlock/pull/disable
  NO se gatean (RLS solo bloquea escrituras; un suscriptor caducado puede bajar sus datos). El
  IPC `account:open-checkout` acepta ahora `'ai' | 'cloud'` y `AccountStatus` expone
  `cloudCheckoutConfigured` junto a `aiCheckoutConfigured`.
- **Exclusión mutua (visual):** con Cloud enabled, la sección GitHub muestra un aviso ámbar
  "paused while NoteFlow Cloud is enabled" (la config de GitHub se conserva); a la inversa, con
  GitHub conectado y Cloud desbloqueado pero no habilitado, aviso de que activar Cloud pausará
  GitHub. El routing real sigue siendo `syncProvider.ts` — la UI solo lo comunica.
- **Reactividad:** `CloudPanel` se suscribe a `onCloudStatusChanged` + `onAccountStatusChanged`;
  la sección GitHub a `onCloudStatusChanged` (para el aviso de pausa).

### Futuro (no-foco, solo dejar la puerta abierta)
- **Historial de versiones:** tabla `file_versions` (insert del cliente en cada push; blobs
  cifrados, retención N días/versiones). Con E2EE no hay diffs server-side — versiones opacas.
- **Compartir notas:** re-envolver la clave de la nota para otro usuario + RLS (por eso
  clave-por-nota desde el inicio).
- **Acceso web:** requeriría crypto client-side en el navegador; posible pero lejos del roadmap.

## 5. Roadmap por fases

| Fase | Contenido |
|---|---|
| **4.0 Fundación** | ✅ **Desplegada y operativa** (cuenta en la app, AccountPanel, esquema `subscriptions` + RLS, proyecto Supabase real conectado, webhook `billing-webhook` de Lemon Squeezy con productos/variantes reales dados de alta) |
| **4.1 IA gestionada** | ✅ **Desplegada y operativa** (Edge Function `ai-proxy` en producción + migración 0003 + preset `noteflow` + cuotas/metering + botón de suscripción + auto-activación del preset al suscribirse + card dedicada en `LlmConfigView` — ver § 3). Probada end-to-end. **Ampliación (código listo, pendiente de correr 0007 + redeploy):** catálogo con modelos avanzados + chinos, **cuota ponderada** (`quota_tokens`, multiplicadores ×1/×6), endpoint `/usage` + **barra de consumo en la UI** (la card premium ya la muestra vía IPC `ai:llm-usage`) |
| **4.2 Nube cifrada** | 🔨 **En curso — tramos 1, 2, 3 y 4 hechos + modo dual managed/e2ee:** fundación criptográfica (`cloudCrypto.ts` + tests) + esquema de servidor (migraciones 0004-0006) + **motor de sync** (`cloudKeys.ts`, `cloudSync.ts`/`cloudSyncLogic.ts` con tests, interfaz `SyncProvider`, IPC `cloud:*`) + **Realtime** (`cloudRealtime.ts`/`cloudRealtimeLogic.ts` con tests: push por WS + loop de seguridad 5 min) + **modos managed/e2ee** (Edge Function `cloud-keys`, default managed sin secretos, E2EE opt-in, upgrade one-way) + **Settings UI** (`CloudPanel.tsx`: onboarding con elección de modo, unlock, enable/disable/pull/lock, switch a modo privado, enforcement visual de la exclusión con GitHub Sync). **Desplegado (2026-07-12):** migraciones 0004-0006 aplicadas en el proyecto real, secret `CLOUD_MANAGED_KEK` puesto, Edge Function `cloud-keys` ACTIVE (verify JWT) y **smoke E2E del realtime verificado** (edición → evento → pull reactivo en segundos). Pendiente del operador: crear el producto Cloud en Lemon Squeezy (checkout URL vacía → botón Subscribe oculto; mientras tanto hay una suscripción manual de pruebas, ver § 4) |
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
  provider Email + SMTP propio y editar **DOS plantillas** — **"Confirm signup"** (usuarios
  nuevos) y **"Magic Link"** (existentes) — para enviar `{{ .Token }}` (por defecto mandan
  enlace, no código; con solo "Magic Link" editada, los usuarios nuevos reciben el enlace de
  confirmación en vez del código) → copiar URL + anon key a `cloudConfig.ts`.
- **`electron/cloudConfig.ts`** — `SUPABASE_URL` / `SUPABASE_ANON_KEY` (ya con los valores del
  proyecto real) + `isCloudConfigured()`. La anon key es pública por diseño (como el client ID de
  GitHub); la seguridad la da RLS.
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
- **UI** — `src/components/Settings/AccountPanel.tsx` (sección "Account" en `SettingsModal`,
  textos vía i18n `t.settings.account.*`): no configurado → placeholder informativo; signed out →
  email → código de 6 dígitos; signed in → email + badges de plan + Refresh + Sign out + botón
  "Subscribe to NoteFlow AI" (si hay sesión sin entitlement `ai` y `LEMONSQUEEZY_CHECKOUT_URLS.ai`
  no está vacía; con la URL vacía se muestra "Subscriptions are coming soon.").
