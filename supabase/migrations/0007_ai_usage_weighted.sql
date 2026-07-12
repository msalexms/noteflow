-- NoteFlow — Fase 4.1 (NoteFlow AI): cuota ponderada por modelo
-- El catálogo pasa a incluir modelos "avanzados" más caros. La cuota mensual ya
-- no se mide en tokens reales sino en tokens PONDERADOS: cada modelo tiene un
-- multiplicador (×1 estándar, ×6 avanzados — mapa MODEL_QUOTA_MULTIPLIERS en
-- supabase/functions/ai-proxy/logic.ts) y lo que descuenta de la cuota es
-- round((tokens_in + tokens_out) * multiplicador).
--   * tokens_in / tokens_out NO se tocan: siguen siendo los tokens reales del
--     upstream (contabilidad de costes del operador).
--   * quota_tokens: la nueva columna ponderada, calculada por la Edge Function
--     ai-proxy al insertar cada evento.
--   * get_month_usage pasa a sumar quota_tokens — el check de cuota del proxy
--     y el endpoint GET /usage no cambian de contrato (siguen viendo un bigint).

alter table public.usage_events
  add column quota_tokens bigint not null default 0;

-- Backfill: todas las filas históricas son de modelos ×1 (el catálogo previo a
-- esta migración no tenía modelos avanzados), así que ponderado = real.
update public.usage_events
   set quota_tokens = tokens_in + tokens_out;

-- Tokens PONDERADOS consumidos por el usuario en el mes natural en curso.
-- Misma definición que en 0003 salvo la columna sumada. security definer para
-- que corra con los privilegios del owner; solo el service role puede invocarla
-- (mismo patrón de permisos que apply_subscription_event en 0002).
create or replace function public.get_month_usage(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quota_tokens), 0)::bigint
    from public.usage_events
   where user_id = p_user_id
     and at >= date_trunc('month', now());
$$;

revoke execute on function public.get_month_usage(uuid)
  from public, anon, authenticated;
grant execute on function public.get_month_usage(uuid)
  to service_role;
