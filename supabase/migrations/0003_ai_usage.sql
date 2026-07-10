-- NoteFlow — Fase 4.1 (NoteFlow AI)
-- Metering de tokens del proxy LLM (Edge Function ai-proxy):
--   * tabla usage_events: un evento por respuesta del upstream (OpenRouter),
--     escrita EXCLUSIVAMENTE por el service role desde la Edge Function.
--   * RPC get_month_usage: suma de tokens del mes en curso, usada por el proxy
--     para el check de cuota ANTES de reenviar cada petición.

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  tokens_in integer not null,
  tokens_out integer not null,
  at timestamptz not null default now()
);

-- La consulta caliente es "tokens de ESTE usuario desde principio de mes".
create index usage_events_user_id_at_idx on public.usage_events (user_id, at);

alter table public.usage_events enable row level security;

-- Única policy: cada usuario LEE su propio consumo (la UI podrá mostrarlo en el
-- futuro). No hay policies de escritura a propósito — solo el service role (que
-- salta RLS) inserta desde la Edge Function ai-proxy. Mismo criterio que 0001.
create policy "Users can read own usage events"
  on public.usage_events
  for select
  using (auth.uid() = user_id);

-- Tokens (entrada + salida) consumidos por el usuario en el mes natural en
-- curso. security definer para que corra con los privilegios del owner; solo el
-- service role puede invocarla (mismo patrón de permisos que
-- apply_subscription_event en 0002).
create or replace function public.get_month_usage(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(tokens_in + tokens_out), 0)::bigint
    from public.usage_events
   where user_id = p_user_id
     and at >= date_trunc('month', now());
$$;

revoke execute on function public.get_month_usage(uuid)
  from public, anon, authenticated;
grant execute on function public.get_month_usage(uuid)
  to service_role;
