-- NoteFlow — Fase 4.2 (NoteFlow Cloud, tramo 1)
-- Esquema de la nube de notas E2EE. El servidor solo ve ciphertext: todo el
-- material criptográfico llega ya cifrado desde el cliente (electron/cloudCrypto.ts)
-- como text base64url — mismo formato que el bloque `encryption` del formato de nota.
--
-- A diferencia de subscriptions/usage_events (solo lectura para el cliente),
-- aquí el cliente ESCRIBE directamente vía PostgREST + RLS: hay policies de
-- insert/update/delete además de select.

-- Jerarquía de claves por usuario: la DEK (master key de 256 bits, generada en
-- cliente) se guarda envuelta dos veces — por la KEK derivada de la passphrase
-- (PBKDF2-SHA256) y por la KEK derivada del recovery code. El servidor nunca ve
-- la DEK en claro; perder passphrase + recovery code = datos irrecuperables.
create table public.user_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- DEK envuelta por la KEK de la passphrase (blob sellado AES-256-GCM: iv||ct en base64url)
  dek_pass_ct text not null,
  pass_salt text not null,
  pass_iterations integer not null default 310000,
  -- DEK envuelta por la KEK del recovery code (mismo formato de blob)
  dek_recovery_ct text not null,
  recovery_salt text not null,
  recovery_iterations integer not null default 310000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_keys enable row level security;

-- user_keys: basta ownership en las cuatro operaciones — el material de claves
-- debe poder crearse/leerse SIEMPRE (también con la suscripción caducada, para
-- poder descifrar lo ya subido).
create policy "Users can read own keys"
  on public.user_keys
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own keys"
  on public.user_keys
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own keys"
  on public.user_keys
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own keys"
  on public.user_keys
  for delete
  using (auth.uid() = user_id);

-- Archivos cifrados, un blob opaco por archivo del dir de notas:
--   * path_key    = HMAC-SHA256(subclave HKDF de la DEK, relPath) en base64url —
--                   identificador opaco y determinista; no filtra títulos/slugs.
--   * path_ct     = relPath cifrado con la clave de la nota (para reconstruir el
--                   árbol en un dispositivo nuevo).
--   * content_ct  = contenido cifrado AES-256-GCM (IV aleatorio por escritura).
--   * key_ct      = clave de la nota envuelta por la DEK. Clave-por-nota desde el
--                   día 1 (habilita compartir/rotar sin recifrar todo); las filas
--                   de una misma carpeta de nota comparten la misma clave de nota,
--                   duplicada envuelta en cada fila — la tabla queda auto-contenida
--                   y se puede re-envolver por nota en el futuro.
--   * updated_at  = en claro A PROPÓSITO (solo filtra timing): lo pone el cliente
--                   desde el frontmatter y es la base de la resolución de
--                   conflictos y del pull incremental.
--   * deleted     = tombstone (soft delete vía update) para propagar borrados
--                   entre dispositivos; el DELETE físico queda para limpieza.
create table public.files (
  user_id uuid not null references auth.users(id) on delete cascade,
  path_key text not null,
  path_ct text not null,
  content_ct text not null,
  key_ct text not null,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  primary key (user_id, path_key)
);

-- La consulta caliente del pull incremental es "archivos de ESTE usuario
-- cambiados desde el último pull".
create index files_user_id_updated_at_idx on public.files (user_id, updated_at);

alter table public.files enable row level security;

-- files: lectura y borrado solo con ownership — un usuario cuya suscripción
-- caduca puede seguir BAJANDO y BORRANDO sus datos (nunca rehén de sus notas)...
create policy "Users can read own files"
  on public.files
  for select
  using (auth.uid() = user_id);

create policy "Users can delete own files"
  on public.files
  for delete
  using (auth.uid() = user_id);

-- ...pero la ESCRITURA (insert/update) exige además entitlement cloud activa.
-- Nota: el tombstone (update deleted=true) también queda gateado — sin
-- suscripción, propagar borrados es vía DELETE físico.
create policy "Subscribed users can insert own files"
  on public.files
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.subscriptions s
       where s.user_id = auth.uid()
         and s.product in ('cloud', 'bundle')
         and s.status = 'active'
    )
  );

create policy "Subscribed users can update own files"
  on public.files
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.subscriptions s
       where s.user_id = auth.uid()
         and s.product in ('cloud', 'bundle')
         and s.status = 'active'
    )
  );
