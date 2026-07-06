-- NoteFlow — Fase 4.0 (Billing)
-- Soporte para el webhook del Merchant of Record (Lemon Squeezy):
--   * índice único (provider, provider_ref) para upserts idempotentes — las
--     filas que escribe el webhook siempre llevan provider_ref (el id de
--     suscripción de LS), así que cada suscripción del proveedor mapea a UNA
--     fila nuestra.
--   * función apply_subscription_event(), invocada vía RPC exclusivamente por
--     el service role desde la Edge Function billing-webhook.

create unique index subscriptions_provider_ref_key
  on public.subscriptions (provider, provider_ref);

-- Aplica un evento de suscripción del proveedor de pagos de forma idempotente
-- y tolerante a eventos fuera de orden (Lemon Squeezy no garantiza el orden de
-- entrega de los webhooks):
--   * Si ya existe la fila (provider, provider_ref): UPDATE solo si el evento
--     es igual o más reciente que el último aplicado (p_event_at >= updated_at);
--     los eventos más viejos se descartan en silencio.
--   * Si no existe: INSERT solo si p_user_id no es null (sin user_id no se
--     puede atribuir la compra a nadie — el caller lo loguea y aquí es no-op).
create or replace function public.apply_subscription_event(
  p_user_id uuid,
  p_product text,
  p_status text,
  p_renews_at timestamptz,
  p_provider text,
  p_provider_ref text,
  p_event_at timestamptz
) returns void
language plpgsql
set search_path = public
as $$
begin
  update public.subscriptions
     set product = p_product,
         status = p_status,
         renews_at = p_renews_at,
         updated_at = p_event_at
   where provider = p_provider
     and provider_ref = p_provider_ref
     and p_event_at >= updated_at;

  if found then
    return;
  end if;

  -- Nothing updated: either the row does not exist yet, or an out-of-order
  -- (older) event hit an existing row. Insert only in the first case — the
  -- unique index turns the second one (and concurrent-insert races) into a
  -- no-op via ON CONFLICT.
  if p_user_id is null then
    return;
  end if;

  insert into public.subscriptions
    (user_id, product, status, renews_at, provider, provider_ref, updated_at)
  values
    (p_user_id, p_product, p_status, p_renews_at, p_provider, p_provider_ref, p_event_at)
  on conflict (provider, provider_ref) do nothing;
end;
$$;

-- Solo el service role (la Edge Function billing-webhook) puede invocarla.
-- PostgREST expone las funciones como RPC a cualquier rol con EXECUTE, así que
-- hay que revocar el grant implícito a PUBLIC (y por extensión anon/authenticated).
revoke execute on function public.apply_subscription_event(uuid, text, text, timestamptz, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_subscription_event(uuid, text, text, timestamptz, text, text, timestamptz)
  to service_role;
