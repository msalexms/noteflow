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
2. Dashboard → **Authentication → Emails (Email Templates)** → plantilla **"Magic Link"**:
   por defecto envía un **enlace**, no un código. Editarla para que envíe el token OTP, p. ej.:

   ```html
   <h2>Your NoteFlow sign-in code</h2>
   <p>Enter this code in NoteFlow to sign in:</p>
   <h1>{{ .Token }}</h1>
   <p>This code expires in 1 hour. If you didn't request it, you can ignore this email.</p>
   ```

   La clave es usar `{{ .Token }}` (el código de 6 dígitos) en lugar de `{{ .ConfirmationURL }}`.
   La app llama a `POST /auth/v1/otp` con `create_user: true`, así que el registro y el login
   comparten flujo y plantilla.
3. (Recomendado, producción) **Authentication → SMTP**: configurar un SMTP propio — el email
   integrado de Supabase tiene un rate limit muy bajo y es solo para desarrollo.

## 4. Conectar la app

1. Dashboard → **Settings → Data API**: copiar la **Project URL** y la **anon (public) key**.
2. Pegarlas en `electron/cloudConfig.ts` (`SUPABASE_URL` sin slash final, `SUPABASE_ANON_KEY`).
3. `npm run build` y listo: el panel Settings → Account pasa de "not available in this build"
   al flujo real de sign-in.

> **Nota de seguridad:** la anon key es **pública por diseño** (mismo modelo que el client ID de
> GitHub que ya va embebido para el Device Flow del sync). No da acceso a nada por sí sola: la
> seguridad la dan las **RLS policies** (cada usuario solo lee sus filas) y los JWT de Auth.
> Lo que NUNCA debe salir del dashboard es la **service role key**.
