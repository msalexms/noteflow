-- NoteFlow — Fase 4.0 (Fundación)
-- Esquema inicial: entitlements de suscripción por usuario.
-- La tabla la escribe EXCLUSIVAMENTE el service role (webhook de billing, fase
-- futura); los clientes solo leen sus propias filas vía RLS.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('ai', 'cloud', 'bundle')),
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  renews_at timestamptz,
  provider text not null,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

-- Única policy: cada usuario LEE sus propias suscripciones. No hay policies de
-- insert/update/delete a propósito — solo el service role (que salta RLS) las
-- escribirá desde el webhook del Merchant of Record.
create policy "Users can read own subscriptions"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);
