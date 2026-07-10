# Supabase — backend de la cuenta NoteFlow (Fase 4.0)

Instrucciones para el **operador** (el dueño del proyecto Supabase). El código cliente ya está
implementado (`electron/account.ts` + panel Account en Settings) y queda **inerte** hasta que
`electron/cloudConfig.ts` tenga la URL y la anon key reales.

## 1. Crear el proyecto

1. Entrar en [supabase.com](https://supabase.com) y crear un proyecto nuevo (plan Free vale para
   empezar; región europea recomendada).
2. Guardar la **database password** en un sitio seguro (no la necesita la app, solo el operador).

## 2. Correr la migración

Opción A — **SQL Editor** (dashboard):

1. Dashboard → SQL Editor → New query.
2. Pegar el contenido de `supabase/migrations/0001_foundation.sql` y ejecutar.

Opción B — **Supabase CLI**:

```bash
supabase link --project-ref <project-ref>
supabase db push   # aplica supabase/migrations/*.sql
```

## 3. Configurar Auth (email + OTP de 6 dígitos)

1. Dashboard → **Authentication → Sign In / Providers**: habilitar el provider **Email**.
   - "Confirm email" puede quedar en el default; el flujo OTP verifica el email por sí mismo.
2. **SMTP propio — OBLIGATORIO, no solo para producción.** Con el SMTP integrado de Supabase
   **no se pueden editar las plantillas de email** (ni asunto ni cuerpo) y la plantilla por
   defecto de "Magic Link" solo manda el enlace (`{{ .ConfirmationURL }}`), nunca el código de
   6 dígitos. Como el login de NoteFlow es **sin deep links** (el usuario teclea el código, no
   abre un enlace), sin SMTP propio el flujo de login **no funciona ni en desarrollo**.

   Opción rápida: **[Resend](https://resend.com)** (tier gratuito, sin dominio propio para
   probar):
   1. Dashboard de Resend → **API Keys** → crear una y copiarla.
   2. Dashboard de Supabase → Authentication → sección **SMTP Settings** ("Set up custom SMTP"):
      - Host: `smtp.resend.com`
      - Port: `465` (SSL) o `587` (TLS)
      - Username: `resend`
      - Password: la API key de Resend
      - Sender email: `onboarding@resend.dev` (válido para pruebas sin verificar dominio;
        en producción, verificar un dominio propio en Resend)
      - Sender name: `NoteFlow`
   3. Guardar.
3. Dashboard → **Authentication → Emails** → editar **DOS plantillas**: **"Confirm signup"** y
   **"Magic Link"**. Con "Confirm email" activado (el default), el primer OTP de una cuenta
   **nueva** sale por la plantilla "Confirm signup" — no por "Magic Link", que solo se usa para
   usuarios ya confirmados. Si solo se edita "Magic Link", los usuarios nuevos reciben el correo
   de confirmación con enlace en vez del código. Ahora que hay SMTP propio, el editor se
   desbloquea; poner en **ambas** el mismo cuerpo:

   ```html
   <h2>Your NoteFlow sign-in code</h2>
   <p>Enter this code in NoteFlow to sign in:</p>
   <h1>{{ .Token }}</h1>
   <p>This code expires in 1 hour. If you didn't request it, you can ignore this email.</p>
   ```

   La clave es usar `{{ .Token }}` (el código de 6 dígitos) en lugar de `{{ .ConfirmationURL }}`.
   La app llama a `POST /auth/v1/otp` con `create_user: true` y verifica con `type: 'email'`
   (acepta tanto el token de signup como el de login), así que el registro y el login comparten
   flujo y ambas plantillas deben mandar el código.

## 4. Conectar la app

1. Dashboard → **Settings → Data API**: copiar la **Project URL** y la **anon (public) key**.
2. Pegarlas en `electron/cloudConfig.ts` (`SUPABASE_URL` sin slash final, `SUPABASE_ANON_KEY`).
3. `npm run build` y listo: el panel Settings → Account pasa de "not available in this build"
   al flujo real de sign-in.

> **Nota de seguridad:** la anon key es **pública por diseño** (mismo modelo que el client ID de
> GitHub que ya va embebido para el Device Flow del sync). No da acceso a nada por sí sola: la
> seguridad la dan las **RLS policies** (cada usuario solo lee sus filas) y los JWT de Auth.
> Lo que NUNCA debe salir del dashboard es la **service role key**.

## 5. Lemon Squeezy (pagos)

Lemon Squeezy es el **Merchant of Record**: cobra, gestiona el IVA por país y notifica los cambios
de suscripción por webhook. La Edge Function `supabase/functions/billing-webhook` recibe esos
webhooks, verifica la firma HMAC y escribe en `public.subscriptions` vía la RPC
`apply_subscription_event` (migración 0002). Pasos del operador:

1. **Crear la store y los productos** en [lemonsqueezy.com](https://www.lemonsqueezy.com):
   un producto por plan (AI / Cloud / Bundle, según lo que se lance) con **variantes mensual y
   anual**. Anotar el **variant ID** de cada variante (visible en la URL o en la API de cada
   variante): harán falta para el variant map.

2. **Correr la migración 0002** (`supabase/migrations/0002_billing.sql`), igual que la 0001
   (SQL Editor o `supabase db push`). Crea el índice único `(provider, provider_ref)` y la función
   `apply_subscription_event` (solo invocable por el service role).

3. **Configurar los secretos** de la Edge Function:

   ```bash
   supabase secrets set LEMONSQUEEZY_WEBHOOK_SECRET=<signing-secret> \
     LEMONSQUEEZY_VARIANT_MAP=890123:ai,890124:cloud,890125:bundle
   ```

   El variant map mapea cada variant ID de LS a nuestro `product` (`ai` | `cloud` | `bundle`);
   deben entrar **todas** las variantes (mensual y anual). Un evento con una variante que no esté
   en el mapa se ignora (respuesta 200 + `console.warn` en los logs de la función).

4. **Desplegar la función** — el flag es imprescindible, porque el webhook de LS llega **sin JWT
   de Supabase** (su autenticación es la firma HMAC):

   ```bash
   supabase functions deploy billing-webhook --no-verify-jwt
   ```

5. **Dar de alta el webhook en LS**: dashboard → **Settings → Webhooks** → Add endpoint:
   - URL: `https://<project-ref>.supabase.co/functions/v1/billing-webhook`
   - Signing secret: el mismo valor que `LEMONSQUEEZY_WEBHOOK_SECRET`
   - Eventos: suscribir los `subscription_*` (`subscription_created`, `subscription_updated`,
     `subscription_cancelled`, `subscription_resumed`, `subscription_expired`,
     `subscription_paused`, `subscription_unpaused`). Los `subscription_payment_*` y `order_*`
     pueden suscribirse o no: la función los ignora (responde 200).

> **Correlación compra ↔ usuario:** la app abre el checkout con
> `checkout[custom][user_id]=<uuid del usuario de Supabase>` (handler `account:open-checkout`,
> implementado en la fase 4.1). Las compras SIN ese dato no se pueden atribuir a ninguna cuenta:
> el webhook las loguea (`console.warn`) y **no inserta** fila nueva (solo actualizaría una
> suscripción ya existente).

## 6. NoteFlow AI (proxy LLM)

La Edge Function `supabase/functions/ai-proxy` expone un endpoint OpenAI-compatible
(`POST .../ai-proxy/chat/completions` + `GET .../ai-proxy/models`) que valida la sesión de Supabase
del usuario, comprueba el entitlement `ai`/`bundle` y la cuota mensual de tokens, y reenvía a
**OpenRouter** con la única key del servidor. El consumo se registra en `usage_events` (migración
0003) leyendo el bloque `usage` que OpenRouter añade al final del stream. Pasos del operador:

1. **Correr la migración 0003** (`supabase/migrations/0003_ai_usage.sql`), igual que las
   anteriores (SQL Editor o `supabase db push`). Crea `usage_events` + la RPC `get_month_usage`
   (solo invocable por el service role).

2. **Crear una API key en [OpenRouter](https://openrouter.ai)** (con crédito o auto-topup) y
   configurar los secretos de la función:

   ```bash
   supabase secrets set OPENROUTER_API_KEY=<sk-or-...>
   # Opcionales (defaults en el código: 3.000.000 tokens/mes y la lista curada
   # de supabase/functions/ai-proxy/logic.ts):
   supabase secrets set AI_MONTHLY_TOKENS=3000000
   supabase secrets set AI_ALLOWED_MODELS=openai/gpt-4o-mini,google/gemini-2.5-flash
   ```

   > Si se cambia `AI_ALLOWED_MODELS`, mantener en sync `NOTEFLOW_AI_MODELS` en
   > `electron/ai/llm/presets.ts` (la lista de modelos sugeridos que ve el cliente).

3. **Desplegar la función** — esta SÍ con verificación de JWT (el default; a diferencia del
   webhook, aquí el caller es la app con el access token del usuario):

   ```bash
   supabase functions deploy ai-proxy
   ```

4. **Checkout de Lemon Squeezy:** copiar la URL de compra de la variante del producto AI
   (dashboard de LS → producto → Share) y pegarla en `LEMONSQUEEZY_CHECKOUT_URLS.ai` de
   `electron/cloudConfig.ts`. Mientras esté vacía, el botón "Subscribe to NoteFlow AI" de
   Settings → Account queda oculto (se muestra "Subscriptions are coming soon."). La app añade
   sola el parámetro `checkout[custom][user_id]` al abrirla.
